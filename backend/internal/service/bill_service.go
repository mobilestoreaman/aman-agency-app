package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// BillService manages formal billing documents generated from completed sales.
type BillService interface {
	Create(ctx context.Context, staffName string, req dto.CreateBillRequest) (*dto.BillResponse, error)
	GetByID(ctx context.Context, id string) (*dto.BillResponse, error)
	// GetModel returns the raw Bill model (used by invoice renderer & WhatsApp sender).
	GetModel(ctx context.Context, id string) (*models.Bill, error)
	GetBySaleID(ctx context.Context, saleID string) (*dto.BillResponse, error)
	List(ctx context.Context, f dto.BillFilter) ([]*dto.BillResponse, *response.Meta, error)
	// Issue transitions a draft bill to issued, stamping issued_at.
	Issue(ctx context.Context, id string) (*dto.BillResponse, error)
	// Void cancels a bill (admin only — enforced at the route layer).
	// notes is stored on the bill for audit purposes.
	Void(ctx context.Context, id string, notes string) (*dto.BillResponse, error)
}

type billService struct {
	billRepo repository.BillRepository
	saleRepo repository.SaleRepository
}

// NewBillService constructs a BillService.
// saleRepo is required to resolve sale details when generating a bill.
func NewBillService(
	billRepo repository.BillRepository,
	saleRepo repository.SaleRepository,
) BillService {
	return &billService{
		billRepo: billRepo,
		saleRepo: saleRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parseBillOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid bill id: %s", id))
	}
	return oid, nil
}

func toBillItemResponse(item models.BillItem) dto.BillItemResponse {
	return dto.BillItemResponse{
		DeviceID:      item.DeviceID.Hex(),
		ProductName:   item.ProductName,
		BrandName:     item.BrandName,
		IMEI1:         item.IMEI1,
		IMEI2:         item.IMEI2,
		UnitPrice:     item.UnitPrice,
		PurchasePrice: item.PurchasePrice,
	}
}

func toBillResponse(b *models.Bill) *dto.BillResponse {
	items := make([]dto.BillItemResponse, 0, len(b.Items))
	for _, item := range b.Items {
		items = append(items, toBillItemResponse(item))
	}

	resp := &dto.BillResponse{
		ID:            b.ID.Hex(),
		BillNumber:    b.BillNumber,
		SaleID:        b.SaleID.Hex(),
		CustomerID:    b.CustomerID.Hex(),
		CustomerName:  b.CustomerName,
		CustomerPhone: b.CustomerPhone,
		Items:         items,
		Subtotal:      b.Subtotal,
		Discount:      b.Discount,
		DiscountPct:   b.DiscountPct,
		Tax:           b.Tax,
		TaxPct:        b.TaxPct,
		TotalAmount:   b.TotalAmount,
		AmountPaid:    b.AmountPaid,
		Balance:       b.Balance,
		Status:        string(b.Status),
		Notes:         b.Notes,
		CreatedBy:     b.CreatedBy,
		CreatedAt:     b.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:     b.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if b.IssuedAt != nil {
		resp.IssuedAt = b.IssuedAt.Format("2006-01-02T15:04:05Z")
	}
	if b.VoidedAt != nil {
		resp.VoidedAt = b.VoidedAt.Format("2006-01-02T15:04:05Z")
	}
	return resp
}

// ── Create ────────────────────────────────────────────────────────────────────

// Create generates a formal billing document from an existing completed sale.
//
// Business rules:
//   - The sale must exist and must not be cancelled.
//   - Only one bill may exist per sale (unique index on sale_id). A second
//     attempt returns 409.
//   - Discount is applied as a flat PKR deduction from the subtotal.
//   - Tax is calculated on the post-discount amount.
//   - AmountPaid and Balance are taken directly from the sale.
func (s *billService) Create(ctx context.Context, staffName string, req dto.CreateBillRequest) (*dto.BillResponse, error) {
	saleOID, err := parseObjectID(req.SaleID, "sale")
	if err != nil {
		return nil, err
	}

	sale, err := s.saleRepo.FindByID(ctx, saleOID)
	if err != nil {
		return nil, apperror.NotFound("sale not found")
	}
	if sale.Status == models.SaleStatusCancelled {
		return nil, apperror.Conflict("cannot generate a bill for a cancelled sale")
	}

	// Reject if a bill already exists for this sale.
	if existing, err := s.billRepo.FindBySaleID(ctx, saleOID); err == nil && existing != nil {
		return nil, apperror.Conflict(fmt.Sprintf("bill %s already exists for this sale", existing.BillNumber))
	}

	// Validate and pre-check custom bill suffix uniqueness.
	suffix := strings.TrimSpace(req.CustomBillSuffix)
	if suffix != "" {
		// Generate the prospective bill number using a nil ID (the suffix is the
		// only variable part — the date prefix is fixed for the current day).
		prospective := models.GenerateBillNumber(primitive.NilObjectID, suffix)
		exists, err := s.billRepo.ExistsByBillNumber(ctx, prospective)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, apperror.Conflict(fmt.Sprintf(
				"bill number %s is already taken — choose a different number or leave blank to auto-generate",
				prospective,
			))
		}
	}

	// Copy line items from sale — bills are self-contained documents.
	items := make([]models.BillItem, 0, len(sale.Items))
	for _, si := range sale.Items {
		items = append(items, models.BillItem{
			DeviceID:      si.DeviceID,
			ProductName:   si.ProductName,
			BrandName:     si.BrandName,
			IMEI1:         si.IMEI1,
			IMEI2:         si.IMEI2,
			UnitPrice:     si.SalePrice,
			PurchasePrice: si.PurchasePrice,
		})
	}

	// Financial calculations.
	subtotal := sale.TotalAmount
	discount := req.Discount
	if discount < 0 {
		discount = 0
	}
	// Cap discount at subtotal — a discount greater than the item total makes
	// no financial sense and would produce a negative taxable amount.
	if discount > subtotal {
		discount = subtotal
	}
	taxable := subtotal - discount
	if taxable < 0 {
		taxable = 0
	}
	tax := taxable * req.TaxPct
	totalAmount := taxable + tax
	balance := totalAmount - sale.AmountPaid
	if balance < 0 {
		balance = 0
	}

	// Compute discount % for display purposes.
	discountPct := req.DiscountPct
	if discountPct == 0 && subtotal > 0 && discount > 0 {
		discountPct = (discount / subtotal) * 100
	}

	bill := &models.Bill{
		SaleID:        saleOID,
		CustomerID:    sale.CustomerID,
		CustomerName:  sale.CustomerName,
		CustomerPhone: sale.CustomerPhone,
		Items:         items,
		Subtotal:      subtotal,
		Discount:      discount,
		DiscountPct:   discountPct,
		Tax:           tax,
		TaxPct:        req.TaxPct,
		TotalAmount:   totalAmount,
		AmountPaid:    sale.AmountPaid,
		Balance:       balance,
		Status:        models.BillStatusDraft,
		Notes:         req.Notes,
		CreatedBy:     staffName,
	}

	if err := s.billRepo.Create(ctx, bill); err != nil {
		return nil, err
	}

	// Generate the bill number after the ID is assigned (ID is the auto-suffix
	// source when no custom suffix was provided).
	bill.BillNumber = models.GenerateBillNumber(bill.ID, suffix)

	// For custom suffixes: double-check uniqueness one more time to handle the
	// rare race condition where two requests used the same suffix simultaneously.
	if suffix != "" {
		exists, checkErr := s.billRepo.ExistsByBillNumber(ctx, bill.BillNumber)
		if checkErr == nil && exists {
			// Roll back — delete the just-created bill (no number yet) and return 409.
			_ = s.billRepo.Delete(ctx, bill.ID)
			return nil, apperror.Conflict(fmt.Sprintf(
				"bill number %s was just taken by another request — please try a different number",
				bill.BillNumber,
			))
		}
	}

	fields := bson.M{"invoice_number": bill.BillNumber}
	updated, err := s.billRepo.Update(ctx, bill.ID, fields)
	if err != nil {
		// Bill was created but number update failed — return with the generated number.
		return toBillResponse(bill), nil
	}
	return toBillResponse(updated), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *billService) GetByID(ctx context.Context, id string) (*dto.BillResponse, error) {
	oid, err := parseBillOID(id)
	if err != nil {
		return nil, err
	}
	bill, err := s.billRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("bill not found")
	}
	return toBillResponse(bill), nil
}

func (s *billService) GetModel(ctx context.Context, id string) (*models.Bill, error) {
	oid, err := parseBillOID(id)
	if err != nil {
		return nil, err
	}
	bill, err := s.billRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("bill not found")
	}
	return bill, nil
}

func (s *billService) GetBySaleID(ctx context.Context, saleID string) (*dto.BillResponse, error) {
	oid, err := parseObjectID(saleID, "sale")
	if err != nil {
		return nil, err
	}
	bill, err := s.billRepo.FindBySaleID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("no bill found for this sale")
	}
	return toBillResponse(bill), nil
}

func (s *billService) List(ctx context.Context, f dto.BillFilter) ([]*dto.BillResponse, *response.Meta, error) {
	bills, total, err := s.billRepo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}
	meta := pagination.ToMeta(pg, total)

	out := make([]*dto.BillResponse, 0, len(bills))
	for _, b := range bills {
		out = append(out, toBillResponse(b))
	}
	return out, meta, nil
}

// ── Issue ─────────────────────────────────────────────────────────────────────

// Issue transitions a draft bill to issued and stamps issued_at.
// Already-issued and voided bills return 409.
func (s *billService) Issue(ctx context.Context, id string) (*dto.BillResponse, error) {
	oid, err := parseBillOID(id)
	if err != nil {
		return nil, err
	}

	bill, err := s.billRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("bill not found")
	}
	if bill.Status != models.BillStatusDraft {
		return nil, apperror.Conflict(fmt.Sprintf("bill is already %s", bill.Status))
	}

	now := time.Now().UTC()
	updated, err := s.billRepo.Update(ctx, oid, bson.M{
		"status":    models.BillStatusIssued,
		"issued_at": now,
	})
	if err != nil {
		return nil, err
	}
	return toBillResponse(updated), nil
}

// ── Void ──────────────────────────────────────────────────────────────────────

// Void cancels a bill (admin only). Draft and issued bills can be voided.
// Already-voided bills return 409. notes is stored for the audit trail.
func (s *billService) Void(ctx context.Context, id string, notes string) (*dto.BillResponse, error) {
	oid, err := parseBillOID(id)
	if err != nil {
		return nil, err
	}

	bill, err := s.billRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("bill not found")
	}
	if bill.Status == models.BillStatusVoided {
		return nil, apperror.Conflict("bill is already voided")
	}

	now := time.Now().UTC()
	fields := bson.M{
		"status":    models.BillStatusVoided,
		"voided_at": now,
	}
	if notes != "" {
		fields["notes"] = notes
	}
	updated, err := s.billRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, err
	}
	return toBillResponse(updated), nil
}
