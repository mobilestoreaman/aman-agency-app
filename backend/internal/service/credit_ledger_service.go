package service

import (
	"context"
	"fmt"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/dateutil"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// CreditLedgerService manages customer credit balance adjustments and history.
type CreditLedgerService interface {
	// List returns entries across all customers with optional filters.
	List(ctx context.Context, f dto.GlobalCreditLedgerFilter) ([]dto.CreditLedgerResponse, *response.Meta, error)
	ListByCustomer(ctx context.Context, customerID string, f dto.CreditLedgerFilter) ([]dto.CreditLedgerResponse, *response.Meta, error)
	RecordPayment(ctx context.Context, customerID, staffName string, req dto.RecordPaymentRequest) (*dto.CreditLedgerResponse, error)
	RecordAdjustment(ctx context.Context, customerID, staffName string, req dto.RecordAdjustmentRequest) (*dto.CreditLedgerResponse, error)
}

type creditLedgerService struct {
	ledgerRepo   repository.CreditLedgerRepository
	customerRepo repository.CustomerRepository
	saleRepo     repository.SaleRepository
}

// NewCreditLedgerService constructs a CreditLedgerService with required repositories.
func NewCreditLedgerService(
	ledgerRepo repository.CreditLedgerRepository,
	customerRepo repository.CustomerRepository,
	saleRepo repository.SaleRepository,
) CreditLedgerService {
	return &creditLedgerService{
		ledgerRepo:   ledgerRepo,
		customerRepo: customerRepo,
		saleRepo:     saleRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func toLedgerResponse(e *models.CreditLedger) *dto.CreditLedgerResponse {
	resp := &dto.CreditLedgerResponse{
		ID:           e.ID.Hex(),
		CustomerID:   e.CustomerID.Hex(),
		CustomerName: e.CustomerName,
		Type:         string(e.Type),
		Amount:       e.Amount,
		BalanceAfter: e.BalanceAfter,
		Reference:    e.Reference,
		Notes:        e.Notes,
		CreatedBy:    e.CreatedBy,
		CreatedAt:    e.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if e.SaleID != nil {
		resp.SaleID = e.SaleID.Hex()
	}
	return resp
}

// ── List (global) ─────────────────────────────────────────────────────────────

// List returns paginated ledger entries across all customers.
// Supports optional filters: customer_id, type, from_date, to_date (DD-MM-YYYY).
func (s *creditLedgerService) List(ctx context.Context, f dto.GlobalCreditLedgerFilter) ([]dto.CreditLedgerResponse, *response.Meta, error) {
	var customerOID primitive.ObjectID // zero = no filter
	if f.CustomerID != "" {
		oid, err := primitive.ObjectIDFromHex(f.CustomerID)
		if err != nil {
			return nil, nil, apperror.BadRequest("invalid customer_id")
		}
		customerOID = oid
	}

	var from, to *time.Time
	if f.FromDate != "" {
		t, err := dateutil.ParseDDMMYYYY(f.FromDate)
		if err != nil {
			return nil, nil, apperror.BadRequest("from_date must be DD-MM-YYYY")
		}
		from = &t
	}
	if f.ToDate != "" {
		t, err := dateutil.ParseDDMMYYYY(f.ToDate)
		if err != nil {
			return nil, nil, apperror.BadRequest("to_date must be DD-MM-YYYY")
		}
		// Include the full end day (end of IST calendar day).
		end := dateutil.EndOfDay(t)
		to = &end
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}

	entries, total, err := s.ledgerRepo.List(ctx, customerOID, f.Type, from, to, f.Search, pg)
	if err != nil {
		return nil, nil, err
	}

	meta := pagination.ToMeta(pg, total)
	out := make([]dto.CreditLedgerResponse, 0, len(entries))
	for i := range entries {
		out = append(out, *toLedgerResponse(&entries[i]))
	}
	return out, meta, nil
}

// ── ListByCustomer ────────────────────────────────────────────────────────────

// ListByCustomer returns paginated ledger history for a single customer, newest
// first. Optionally filtered by entry type.
func (s *creditLedgerService) ListByCustomer(
	ctx context.Context,
	customerID string,
	f dto.CreditLedgerFilter,
) ([]dto.CreditLedgerResponse, *response.Meta, error) {
	oid, err := primitive.ObjectIDFromHex(customerID)
	if err != nil {
		return nil, nil, apperror.BadRequest(fmt.Sprintf("invalid customer_id: %s", customerID))
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}

	entries, total, err := s.ledgerRepo.ListByCustomer(ctx, oid, f.Type, pg)
	if err != nil {
		return nil, nil, err
	}

	meta := pagination.ToMeta(pg, total)
	out := make([]dto.CreditLedgerResponse, 0, len(entries))
	for i := range entries {
		out = append(out, *toLedgerResponse(&entries[i]))
	}
	return out, meta, nil
}

// ── RecordPayment ─────────────────────────────────────────────────────────────

// RecordPayment records a cash payment from a customer, reducing their credit
// balance. Amount must be positive; the service stores it as a negative delta.
//
// Order of operations (safe without a replica-set transaction):
//  1. Insert the ledger entry — the canonical source of truth.
//  2. Decrement the customer balance.
//  3. If step 2 fails, delete the ledger entry and return an error.
//
// This ensures the ledger is never missing a record for a balance change.
func (s *creditLedgerService) RecordPayment(
	ctx context.Context,
	customerID, staffName string,
	req dto.RecordPaymentRequest,
) (*dto.CreditLedgerResponse, error) {
	if req.Amount <= 0 {
		return nil, apperror.BadRequest("payment amount must be positive")
	}

	oid, err := primitive.ObjectIDFromHex(customerID)
	if err != nil {
		return nil, apperror.BadRequest("invalid customer_id")
	}

	customer, err := s.customerRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("customer not found")
	}

	// Guard: refuse payment if there is nothing owed.
	if customer.CreditBalance <= 0 {
		return nil, apperror.BadRequest("customer has no outstanding balance to pay")
	}
	// Guard: refuse if the payment would exceed the outstanding balance.
	if req.Amount > customer.CreditBalance {
		return nil, apperror.BadRequest(
			fmt.Sprintf("payment amount (%.2f) exceeds outstanding balance (%.2f)", req.Amount, customer.CreditBalance),
		)
	}

	// Payment reduces what the customer owes — delta is negative.
	delta := -req.Amount
	newBalance := customer.CreditBalance + delta

	// Step 1: Insert ledger entry first — it is the source of truth.
	entry := &models.CreditLedger{
		CustomerID:   oid,
		CustomerName: customer.Name,
		Type:         models.LedgerEntryPayment,
		Amount:       delta,
		BalanceAfter: newBalance,
		Notes:        req.Notes,
		CreatedBy:    staffName,
		CreatedAt:    time.Now().UTC(),
	}

	// Optionally link to a specific sale invoice for traceability.
	if req.SaleID != "" {
		saleOID, err := primitive.ObjectIDFromHex(req.SaleID)
		if err == nil {
			sale, err := s.saleRepo.FindByID(ctx, saleOID)
			if err == nil {
				entry.SaleID = &saleOID
				entry.Reference = sale.InvoiceNumber
			}
		}
	}
	if err := s.ledgerRepo.Create(ctx, entry); err != nil {
		return nil, fmt.Errorf("failed to record ledger entry: %w", err)
	}

	// Step 2: Update the running balance on the customer document.
	if err := s.customerRepo.IncrementCredit(ctx, oid, delta); err != nil {
		// Compensating action: remove the ledger entry we just created so
		// financial records stay consistent.
		_ = s.ledgerRepo.Delete(ctx, entry.ID)
		return nil, fmt.Errorf("failed to update credit balance; ledger entry rolled back: %w", err)
	}

	return toLedgerResponse(entry), nil
}

// ── RecordAdjustment ──────────────────────────────────────────────────────────

// RecordAdjustment applies an admin-initiated manual correction to the balance.
// Amount can be positive (charge) or negative (credit). Notes are required for
// audit trail purposes.
//
// Same safe ordering as RecordPayment: ledger first, balance second.
func (s *creditLedgerService) RecordAdjustment(
	ctx context.Context,
	customerID, staffName string,
	req dto.RecordAdjustmentRequest,
) (*dto.CreditLedgerResponse, error) {
	oid, err := primitive.ObjectIDFromHex(customerID)
	if err != nil {
		return nil, apperror.BadRequest("invalid customer_id")
	}

	customer, err := s.customerRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("customer not found")
	}

	newBalance := customer.CreditBalance + req.Amount

	// Step 1: Insert ledger entry first.
	entry := &models.CreditLedger{
		CustomerID:   oid,
		CustomerName: customer.Name,
		Type:         models.LedgerEntryAdjustment,
		Amount:       req.Amount,
		BalanceAfter: newBalance,
		Notes:        req.Notes,
		CreatedBy:    staffName,
		CreatedAt:    time.Now().UTC(),
	}
	if err := s.ledgerRepo.Create(ctx, entry); err != nil {
		return nil, fmt.Errorf("failed to record ledger entry: %w", err)
	}

	// Step 2: Update the running balance — roll back ledger entry on failure.
	if err := s.customerRepo.IncrementCredit(ctx, oid, req.Amount); err != nil {
		_ = s.ledgerRepo.Delete(ctx, entry.ID)
		return nil, fmt.Errorf("failed to update credit balance; ledger entry rolled back: %w", err)
	}

	return toLedgerResponse(entry), nil
}
