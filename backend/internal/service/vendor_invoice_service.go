package service

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	"aman-agency/backend/platform/ocr"

	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// VendorInvoiceService handles invoice upload, OCR processing, and retrieval.
type VendorInvoiceService interface {
	Upload(ctx context.Context, staffEmail, fileName string, src io.Reader, size int64, mimeType string, mode ocr.OCRMode) (*dto.VendorInvoiceResponse, error)
	GetByID(ctx context.Context, id string) (*dto.VendorInvoiceResponse, error)
	List(ctx context.Context, f dto.VendorInvoiceFilter) ([]dto.VendorInvoiceResponse, *response.Meta, error)
	Delete(ctx context.Context, id string) error
	AvailableEngines() map[string]string
	// CreatePurchaseFromInvoice converts a completed invoice into a purchase record.
	// It calls PurchaseService.Create and then links the invoice to the new purchase.
	CreatePurchaseFromInvoice(ctx context.Context, invoiceID string, req dto.CreatePurchaseFromInvoiceRequest) (*dto.PurchaseResponse, error)
	// LinkPurchase writes purchaseID onto the invoice document.
	// Used by the manual purchase wizard after creating a purchase from a reference photo.
	LinkPurchase(ctx context.Context, invoiceID, purchaseID string) error
	// ViewFile reads the stored invoice file from disk and returns (bytes, mimeType).
	ViewFile(ctx context.Context, id string) ([]byte, string, error)
}

type vendorInvoiceService struct {
	repo        repository.VendorInvoiceRepository
	ocrManager  *ocr.Manager
	storagePath string
	purchaseSvc PurchaseService
}

// NewVendorInvoiceService constructs a VendorInvoiceService.
// ocrManager may be nil — uploads still work but extraction is skipped.
// purchaseSvc is used by CreatePurchaseFromInvoice; pass nil to disable that endpoint.
func NewVendorInvoiceService(
	repo repository.VendorInvoiceRepository,
	ocrManager *ocr.Manager,
	storagePath string,
	purchaseSvc PurchaseService,
) VendorInvoiceService {
	return &vendorInvoiceService{
		repo:        repo,
		ocrManager:  ocrManager,
		storagePath: storagePath,
		purchaseSvc: purchaseSvc,
	}
}

// Upload saves the file to disk, creates a VendorInvoice document with status=pending,
// then runs OCR asynchronously in a background goroutine.
func (s *vendorInvoiceService) Upload(
	ctx context.Context,
	staffEmail, fileName string,
	src io.Reader,
	size int64,
	mimeType string,
	mode ocr.OCRMode,
) (*dto.VendorInvoiceResponse, error) {

	// Read file bytes (needed for both storage and OCR)
	fileBytes, err := io.ReadAll(src)
	if err != nil {
		return nil, apperror.Internal(fmt.Errorf("read upload: %w", err))
	}

	// Detect MIME type from content if not provided
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = detectMime(fileBytes)
	}

	// Validate file type
	if !allowedInvoiceMime(mimeType) {
		return nil, apperror.BadRequest(fmt.Sprintf("unsupported file type %q — upload PDF, JPEG, or PNG", mimeType))
	}

	// Build storage path: storage/invoices/<YYYY-MM>/<id>.<ext>
	ext := mimeToExt(mimeType)
	storedName := fmt.Sprintf("%s%s", primitive.NewObjectID().Hex(), ext)
	monthDir := filepath.Join(s.storagePath, "invoices", time.Now().UTC().Format("2006-01"))
	if err := os.MkdirAll(monthDir, 0755); err != nil {
		return nil, apperror.Internal(fmt.Errorf("create storage dir: %w", err))
	}
	storedPath := filepath.Join(monthDir, storedName)
	if err := os.WriteFile(storedPath, fileBytes, 0644); err != nil {
		return nil, apperror.Internal(fmt.Errorf("write file: %w", err))
	}

	// Create DB record (status: pending)
	inv := &models.VendorInvoice{
		OriginalName:  fileName,
		StoredPath:    storedPath,
		MimeType:      mimeType,
		FileSizeBytes: size,
		Status:        models.InvoiceStatusPending,
		UploadedBy:    staffEmail,
	}
	if err := s.repo.Create(ctx, inv); err != nil {
		return nil, apperror.Internal(fmt.Errorf("create invoice record: %w", err))
	}

	// Run OCR in background (ocrManager is always set — TesseractEngine is always enabled)
	if s.ocrManager != nil {
		go s.runOCR(inv.ID, fileBytes, mimeType, mode)
	} else {
		// Defensive fallback: should not happen — Tesseract is always registered.
		_ = s.repo.UpdateProcessingResult(
			context.Background(), inv.ID, nil, nil, nil,
			models.InvoiceStatusFailed,
			"OCR engine not initialised — please restart the backend",
		)
	}

	resp := s.toVendorInvoiceResponse(*inv)
	return &resp, nil
}

// runOCR is executed in a goroutine. It calls the OCR manager and writes
// the result back to MongoDB.
func (s *vendorInvoiceService) runOCR(
	invoiceID primitive.ObjectID,
	fileBytes []byte,
	mimeType string,
	mode ocr.OCRMode,
) {
	bgCtx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Mark as processing
	_ = s.repo.UpdateProcessingResult(bgCtx, invoiceID, nil, nil, nil, models.InvoiceStatusProcessing, "")

	pr, err := s.ocrManager.Process(bgCtx, mode, fileBytes, mimeType)

	if err != nil {
		log.Error().Err(err).Str("invoice_id", invoiceID.Hex()).Msg("OCR extraction failed")
		_ = s.repo.UpdateProcessingResult(
			bgCtx, invoiceID, nil, nil, nil,
			models.InvoiceStatusFailed,
			err.Error(),
		)
		return
	}

	metrics := ocr.ToOCRMetrics(pr, mode)

	// Determine final status
	status := models.InvoiceStatusDone
	if pr.Extraction.LowConfidenceCount > 0 {
		status = models.InvoiceStatusNeedsReview
	}

	if err := s.repo.UpdateProcessingResult(
		bgCtx, invoiceID,
		pr.Extraction,
		metrics,
		pr.Comparison,
		status,
		"",
	); err != nil {
		log.Error().Err(err).Str("invoice_id", invoiceID.Hex()).Msg("failed to save OCR result")
	}
}

// GetByID returns a single invoice response.
func (s *vendorInvoiceService) GetByID(ctx context.Context, id string) (*dto.VendorInvoiceResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid invoice ID")
	}
	inv, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	resp := s.toVendorInvoiceResponse(*inv)
	return &resp, nil
}

// List returns a paginated list of invoices.
func (s *vendorInvoiceService) List(ctx context.Context, f dto.VendorInvoiceFilter) ([]dto.VendorInvoiceResponse, *response.Meta, error) {
	invs, meta, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}
	out := make([]dto.VendorInvoiceResponse, len(invs))
	for i, inv := range invs {
		out[i] = s.toVendorInvoiceResponse(inv)
	}
	return out, meta, nil
}

// Delete removes an invoice record.
func (s *vendorInvoiceService) Delete(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return apperror.BadRequest("invalid invoice ID")
	}
	return s.repo.Delete(ctx, oid)
}

// LinkPurchase writes purchaseID onto the invoice so it can be found from a purchase.
func (s *vendorInvoiceService) LinkPurchase(ctx context.Context, invoiceID, purchaseID string) error {
	invOID, err := primitive.ObjectIDFromHex(invoiceID)
	if err != nil {
		return apperror.BadRequest("invalid invoice ID")
	}
	purOID, err := primitive.ObjectIDFromHex(purchaseID)
	if err != nil {
		return apperror.BadRequest("invalid purchase ID")
	}
	return s.repo.SetPurchaseID(ctx, invOID, purOID)
}

// ViewFile reads the stored invoice file from disk and returns its bytes and MIME type.
func (s *vendorInvoiceService) ViewFile(ctx context.Context, id string) ([]byte, string, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, "", apperror.BadRequest("invalid invoice ID")
	}
	inv, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, "", err
	}
	data, err := os.ReadFile(inv.StoredPath)
	if err != nil {
		return nil, "", apperror.Internal(fmt.Errorf("read invoice file: %w", err))
	}
	mimeType := inv.MimeType
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	return data, mimeType, nil
}

// AvailableEngines returns the set of OCR engines configured on this server.
func (s *vendorInvoiceService) AvailableEngines() map[string]string {
	if s.ocrManager == nil {
		return map[string]string{}
	}
	return s.ocrManager.AvailableEngines()
}

// CreatePurchaseFromInvoice converts a completed vendor invoice into a purchase record.
// It validates the invoice status, delegates to PurchaseService.Create, and then
// writes the resulting purchase_id back onto the invoice document.
func (s *vendorInvoiceService) CreatePurchaseFromInvoice(
	ctx context.Context,
	invoiceID string,
	req dto.CreatePurchaseFromInvoiceRequest,
) (*dto.PurchaseResponse, error) {
	if s.purchaseSvc == nil {
		return nil, apperror.Internal(fmt.Errorf("purchase service not configured"))
	}

	oid, err := primitive.ObjectIDFromHex(invoiceID)
	if err != nil {
		return nil, apperror.BadRequest("invalid invoice ID")
	}

	inv, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}

	// Only allow conversion once OCR has completed successfully
	if inv.Status == models.InvoiceStatusPending || inv.Status == models.InvoiceStatusProcessing {
		return nil, apperror.Conflict("invoice OCR is still in progress — wait for it to finish before creating a purchase")
	}
	if inv.Status == models.InvoiceStatusFailed {
		return nil, apperror.Conflict("invoice OCR failed — re-upload or fix the invoice before creating a purchase")
	}

	// Idempotency: prevent double-conversion
	if inv.PurchaseID != nil {
		return nil, apperror.Conflict("this invoice has already been converted to a purchase (" + inv.PurchaseID.Hex() + ")")
	}

	// Map invoice items → purchase items (same shape, validated separately)
	purchaseItems := make([]dto.PurchaseItemRequest, len(req.Items))
	for i, it := range req.Items {
		purchaseItems[i] = dto.PurchaseItemRequest{
			ProductID:     it.ProductID,
			IMEI1:         it.IMEI1,
			IMEI2:         it.IMEI2,
			Condition:     it.Condition,
			Color:         it.Color,
			Storage:       it.Storage,
			PurchasePrice: it.PurchasePrice,
			SellingPrice:  it.SellingPrice,
		}
	}

	purchaseReq := dto.CreatePurchaseRequest{
		VendorID:    req.VendorID,
		Items:       purchaseItems,
		Notes:       req.Notes,
		PurchasedAt: req.PurchasedAt,
	}

	purchase, err := s.purchaseSvc.Create(ctx, purchaseReq)
	if err != nil {
		return nil, err
	}

	// Link the invoice to the new purchase (best-effort — don't fail the request if this fails)
	purchaseOID, parseErr := primitive.ObjectIDFromHex(purchase.ID)
	if parseErr == nil {
		if linkErr := s.repo.SetPurchaseID(ctx, oid, purchaseOID); linkErr != nil {
			log.Warn().Err(linkErr).Str("invoice_id", invoiceID).Str("purchase_id", purchase.ID).
				Msg("failed to link invoice to purchase — data is still consistent")
		}
	}

	return purchase, nil
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

func (s *vendorInvoiceService) toVendorInvoiceResponse(inv models.VendorInvoice) dto.VendorInvoiceResponse {
	r := dto.VendorInvoiceResponse{
		ID:              inv.ID.Hex(),
		OriginalName:    inv.OriginalName,
		MimeType:        inv.MimeType,
		FileSizeBytes:   inv.FileSizeBytes,
		Status:          string(inv.Status),
		ProcessingError: inv.ProcessingError,
		UploadedBy:      inv.UploadedBy,
		CreatedAt:       inv.CreatedAt.Format(time.RFC3339),
		UpdatedAt:       inv.UpdatedAt.Format(time.RFC3339),
		Extraction:      dto.ToExtractionResponse(inv.Extraction),
		OCRMetrics:      dto.ToOCRMetricsResponse(inv.OCRMetrics),
		OCRComparison:   dto.ToOCRComparisonResponse(inv.OCRComparison),
	}
	if inv.VendorID != nil {
		s := inv.VendorID.Hex()
		r.VendorID = &s
	}
	if inv.PurchaseID != nil {
		s := inv.PurchaseID.Hex()
		r.PurchaseID = &s
	}
	return r
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func detectMime(b []byte) string {
	if len(b) >= 4 {
		// PDF magic: %PDF
		if b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46 {
			return "application/pdf"
		}
		// JPEG magic: FF D8 FF
		if b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF {
			return "image/jpeg"
		}
		// PNG magic: 89 50 4E 47
		if b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 {
			return "image/png"
		}
	}
	return http.DetectContentType(b)
}

func allowedInvoiceMime(m string) bool {
	m = strings.ToLower(m)
	return strings.Contains(m, "pdf") ||
		strings.Contains(m, "jpeg") ||
		strings.Contains(m, "jpg") ||
		strings.Contains(m, "png")
}

func mimeToExt(mimeType string) string {
	exts, _ := mime.ExtensionsByType(mimeType)
	if len(exts) > 0 {
		return exts[0]
	}
	switch {
	case strings.Contains(mimeType, "pdf"):
		return ".pdf"
	case strings.Contains(mimeType, "png"):
		return ".png"
	default:
		return ".jpg"
	}
}
