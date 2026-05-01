package service

import (
	"context"
	"fmt"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// VendorLedgerService manages vendor payable balance adjustments and history.
type VendorLedgerService interface {
	// List returns entries across all vendors with optional filters.
	List(ctx context.Context, f dto.GlobalVendorLedgerFilter) ([]dto.VendorLedgerResponse, *response.Meta, error)
	ListByVendor(ctx context.Context, vendorID string, f dto.VendorLedgerFilter) ([]dto.VendorLedgerResponse, *response.Meta, error)
	RecordPayment(ctx context.Context, vendorID, staffName string, req dto.RecordVendorPaymentRequest) (*dto.VendorLedgerResponse, error)
	RecordAdjustment(ctx context.Context, vendorID, staffName string, req dto.RecordVendorAdjustmentRequest) (*dto.VendorLedgerResponse, error)
	// RecordPurchase is called internally by the purchase service when a purchase
	// is marked as received. Creates a debit entry for the total cost.
	RecordPurchase(ctx context.Context, vendorID, vendorName, purchaseID, reference, staffName string, amount float64) error
}

type vendorLedgerService struct {
	ledgerRepo  repository.VendorLedgerRepository
	vendorRepo  repository.VendorRepository
}

// NewVendorLedgerService constructs a VendorLedgerService with required repositories.
func NewVendorLedgerService(
	ledgerRepo repository.VendorLedgerRepository,
	vendorRepo repository.VendorRepository,
) VendorLedgerService {
	return &vendorLedgerService{
		ledgerRepo: ledgerRepo,
		vendorRepo: vendorRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func toVendorLedgerResponse(e *models.VendorLedger) *dto.VendorLedgerResponse {
	resp := &dto.VendorLedgerResponse{
		ID:           e.ID.Hex(),
		VendorID:     e.VendorID.Hex(),
		VendorName:   e.VendorName,
		Type:         string(e.Type),
		Amount:       e.Amount,
		BalanceAfter: e.BalanceAfter,
		Reference:    e.Reference,
		Notes:        e.Notes,
		CreatedBy:    e.CreatedBy,
		CreatedAt:    e.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if e.PurchaseID != nil {
		resp.PurchaseID = e.PurchaseID.Hex()
	}
	return resp
}

// ── List (global) ─────────────────────────────────────────────────────────────

// List returns paginated ledger entries across all vendors.
// Supports optional filters: vendor_id, type, from_date, to_date (DD-MM-YYYY).
func (s *vendorLedgerService) List(ctx context.Context, f dto.GlobalVendorLedgerFilter) ([]dto.VendorLedgerResponse, *response.Meta, error) {
	var vendorOID primitive.ObjectID // zero = no filter
	if f.VendorID != "" {
		oid, err := primitive.ObjectIDFromHex(f.VendorID)
		if err != nil {
			return nil, nil, apperror.BadRequest("invalid vendor_id")
		}
		vendorOID = oid
	}

	var from, to *time.Time
	if f.FromDate != "" {
		t, err := time.ParseInLocation(dateLayout, f.FromDate, time.UTC)
		if err != nil {
			return nil, nil, apperror.BadRequest("from_date must be DD-MM-YYYY")
		}
		from = &t
	}
	if f.ToDate != "" {
		t, err := time.ParseInLocation(dateLayout, f.ToDate, time.UTC)
		if err != nil {
			return nil, nil, apperror.BadRequest("to_date must be DD-MM-YYYY")
		}
		// Include the full end day.
		end := t.Add(24*time.Hour - time.Second)
		to = &end
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}

	entries, total, err := s.ledgerRepo.List(ctx, vendorOID, f.Type, from, to, f.Search, pg)
	if err != nil {
		return nil, nil, err
	}

	meta := pagination.ToMeta(pg, total)
	out := make([]dto.VendorLedgerResponse, 0, len(entries))
	for i := range entries {
		out = append(out, *toVendorLedgerResponse(&entries[i]))
	}
	return out, meta, nil
}

// ── ListByVendor ──────────────────────────────────────────────────────────────

// ListByVendor returns paginated ledger history for a single vendor, newest
// first. Optionally filtered by entry type.
func (s *vendorLedgerService) ListByVendor(
	ctx context.Context,
	vendorID string,
	f dto.VendorLedgerFilter,
) ([]dto.VendorLedgerResponse, *response.Meta, error) {
	oid, err := primitive.ObjectIDFromHex(vendorID)
	if err != nil {
		return nil, nil, apperror.BadRequest(fmt.Sprintf("invalid vendor_id: %s", vendorID))
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}

	entries, total, err := s.ledgerRepo.ListByVendor(ctx, oid, f.Type, pg)
	if err != nil {
		return nil, nil, err
	}

	meta := pagination.ToMeta(pg, total)
	out := make([]dto.VendorLedgerResponse, 0, len(entries))
	for i := range entries {
		out = append(out, *toVendorLedgerResponse(&entries[i]))
	}
	return out, meta, nil
}

// ── RecordPayment ─────────────────────────────────────────────────────────────

// RecordPayment records a cash payment made to a vendor, reducing the payable
// balance. Amount must be positive; the service stores it as a negative delta.
//
// Order of operations (safe without a replica-set transaction):
//  1. Insert the ledger entry — the canonical source of truth.
//  2. Decrement the vendor payable balance.
//  3. If step 2 fails, delete the ledger entry and return an error.
func (s *vendorLedgerService) RecordPayment(
	ctx context.Context,
	vendorID, staffName string,
	req dto.RecordVendorPaymentRequest,
) (*dto.VendorLedgerResponse, error) {
	if req.Amount <= 0 {
		return nil, apperror.BadRequest("payment amount must be positive")
	}

	oid, err := primitive.ObjectIDFromHex(vendorID)
	if err != nil {
		return nil, apperror.BadRequest("invalid vendor_id")
	}

	vendor, err := s.vendorRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("vendor not found")
	}

	// Payment reduces what the business owes — delta is negative.
	delta := -req.Amount
	newBalance := vendor.PayableBalance + delta

	// Step 1: Insert ledger entry first — it is the source of truth.
	entry := &models.VendorLedger{
		VendorID:     oid,
		VendorName:   vendor.Name,
		Type:         models.VendorLedgerEntryPayment,
		Amount:       delta,
		BalanceAfter: newBalance,
		Notes:        req.Notes,
		CreatedBy:    staffName,
		CreatedAt:    time.Now().UTC(),
	}

	// Optionally link to a specific purchase for traceability.
	if req.PurchaseID != "" {
		purchaseOID, err := primitive.ObjectIDFromHex(req.PurchaseID)
		if err == nil {
			entry.PurchaseID = &purchaseOID
		}
	}

	if err := s.ledgerRepo.Create(ctx, entry); err != nil {
		return nil, fmt.Errorf("failed to record vendor ledger entry: %w", err)
	}

	// Step 2: Update the running balance on the vendor document.
	if err := s.vendorRepo.IncrementPayable(ctx, oid, delta); err != nil {
		// Compensating action: remove the ledger entry we just created so
		// financial records stay consistent.
		_ = s.ledgerRepo.Delete(ctx, entry.ID)
		return nil, fmt.Errorf("failed to update payable balance; ledger entry rolled back: %w", err)
	}

	return toVendorLedgerResponse(entry), nil
}

// ── RecordAdjustment ──────────────────────────────────────────────────────────

// RecordAdjustment applies an admin-initiated manual correction to the payable balance.
// Amount can be positive (more owed) or negative (credit / discount from vendor).
// Notes are required for audit trail purposes.
//
// Same safe ordering as RecordPayment: ledger first, balance second.
func (s *vendorLedgerService) RecordAdjustment(
	ctx context.Context,
	vendorID, staffName string,
	req dto.RecordVendorAdjustmentRequest,
) (*dto.VendorLedgerResponse, error) {
	oid, err := primitive.ObjectIDFromHex(vendorID)
	if err != nil {
		return nil, apperror.BadRequest("invalid vendor_id")
	}

	vendor, err := s.vendorRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("vendor not found")
	}

	newBalance := vendor.PayableBalance + req.Amount

	// Step 1: Insert ledger entry first.
	entry := &models.VendorLedger{
		VendorID:     oid,
		VendorName:   vendor.Name,
		Type:         models.VendorLedgerEntryAdjustment,
		Amount:       req.Amount,
		BalanceAfter: newBalance,
		Notes:        req.Notes,
		CreatedBy:    staffName,
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.ledgerRepo.Create(ctx, entry); err != nil {
		return nil, fmt.Errorf("failed to record vendor ledger entry: %w", err)
	}

	// Step 2: Update the running balance — roll back ledger entry on failure.
	if err := s.vendorRepo.IncrementPayable(ctx, oid, req.Amount); err != nil {
		_ = s.ledgerRepo.Delete(ctx, entry.ID)
		return nil, fmt.Errorf("failed to update payable balance; ledger entry rolled back: %w", err)
	}

	return toVendorLedgerResponse(entry), nil
}

// ── RecordPurchase ────────────────────────────────────────────────────────────

// RecordPurchase is called by the purchase service when a purchase is received.
// It creates a debit entry (positive amount = business owes vendor more).
//
// Same safe ordering: ledger entry first, then balance increment.
func (s *vendorLedgerService) RecordPurchase(
	ctx context.Context,
	vendorID, vendorName, purchaseID, reference, staffName string,
	amount float64,
) error {
	oid, err := primitive.ObjectIDFromHex(vendorID)
	if err != nil {
		return fmt.Errorf("invalid vendor_id: %w", err)
	}

	vendor, err := s.vendorRepo.FindByID(ctx, oid)
	if err != nil {
		return fmt.Errorf("vendor not found: %w", err)
	}

	newBalance := vendor.PayableBalance + amount

	entry := &models.VendorLedger{
		VendorID:     oid,
		VendorName:   vendorName,
		Type:         models.VendorLedgerEntryPurchase,
		Amount:       amount,
		BalanceAfter: newBalance,
		Reference:    reference,
		Notes:        fmt.Sprintf("Purchase received: %s", reference),
		CreatedBy:    staffName,
		CreatedAt:    time.Now().UTC(),
	}

	if purchaseID != "" {
		if pid, err := primitive.ObjectIDFromHex(purchaseID); err == nil {
			entry.PurchaseID = &pid
		}
	}

	if err := s.ledgerRepo.Create(ctx, entry); err != nil {
		return fmt.Errorf("failed to record purchase ledger entry: %w", err)
	}

	if err := s.vendorRepo.IncrementPayable(ctx, oid, amount); err != nil {
		_ = s.ledgerRepo.Delete(ctx, entry.ID)
		return fmt.Errorf("failed to update payable balance; ledger entry rolled back: %w", err)
	}

	return nil
}
