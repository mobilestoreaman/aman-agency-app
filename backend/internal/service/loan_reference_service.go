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

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// LoanReferenceService manages consumer EMI loan records linked to customers.
type LoanReferenceService interface {
	Create(ctx context.Context, staffName string, req dto.CreateLoanReferenceRequest) (*dto.LoanReferenceResponse, error)
	GetByID(ctx context.Context, id string) (*dto.LoanReferenceResponse, error)
	List(ctx context.Context, f dto.LoanReferenceFilter) ([]*dto.LoanReferenceResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateLoanReferenceRequest) (*dto.LoanReferenceResponse, error)
	ChangeStatus(ctx context.Context, id string, req dto.ChangeLoanReferenceStatusRequest) (*dto.LoanReferenceResponse, error)
	Delete(ctx context.Context, id string) error
}

type loanReferenceService struct {
	loanRefRepo  repository.LoanReferenceRepository
	customerRepo repository.CustomerRepository
	saleRepo     repository.SaleRepository // optional — used when sale_id is provided
}

// NewLoanReferenceService constructs a LoanReferenceService.
// customerRepo is required for denormalising customer name.
// saleRepo is used to resolve sale details when sale_id is provided.
func NewLoanReferenceService(
	loanRefRepo repository.LoanReferenceRepository,
	customerRepo repository.CustomerRepository,
	saleRepo repository.SaleRepository,
) LoanReferenceService {
	return &loanReferenceService{
		loanRefRepo:  loanRefRepo,
		customerRepo: customerRepo,
		saleRepo:     saleRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func toLoanRefResponse(r *models.LoanReference) *dto.LoanReferenceResponse {
	resp := &dto.LoanReferenceResponse{
		ID:                r.ID.Hex(),
		CustomerID:        r.CustomerID.Hex(),
		CustomerName:      r.CustomerName,
		Provider:          r.Provider,
		LoanAccountNumber: r.LoanAccountNumber,
		LoanAmount:        r.LoanAmount,
		EMIAmount:         r.EMIAmount,
		TenureMonths:      r.TenureMonths,
		Status:            string(r.Status),
		Notes:             r.Notes,
		CreatedBy:         r.CreatedBy,
		CreatedAt:         r.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:         r.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if r.SaleID != nil {
		resp.SaleID = r.SaleID.Hex()
	}
	if r.InvoiceNumber != "" {
		resp.InvoiceNumber = r.InvoiceNumber
	}
	if r.DisbursedDate != nil {
		resp.DisbursedDate = r.DisbursedDate.Format("2006-01-02T15:04:05Z")
	}
	return resp
}

func parseLoanRefOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid loan reference id: %s", id))
	}
	return oid, nil
}

// parseDisbursedDate parses a DD-MM-YYYY string in IST. Returns nil when empty.
func parseDisbursedDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.ParseInLocation("02-01-2006", s, ist)
	if err != nil {
		return nil, apperror.BadRequest(
			fmt.Sprintf("disbursed_date: use DD-MM-YYYY, got %q", s))
	}
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, ist).UTC()
	return &d, nil
}

// ── Create ────────────────────────────────────────────────────────────────────

// Create records a new EMI loan. CustomerID is resolved to denormalise the
// customer name. If SaleID is provided the sale is resolved for InvoiceNumber.
func (s *loanReferenceService) Create(ctx context.Context, staffName string, req dto.CreateLoanReferenceRequest) (*dto.LoanReferenceResponse, error) {
	customerOID, err := parseObjectID(req.CustomerID, "customer")
	if err != nil {
		return nil, err
	}
	customer, err := s.customerRepo.FindByID(ctx, customerOID)
	if err != nil {
		return nil, apperror.NotFound("customer not found")
	}

	disbursed, err := parseDisbursedDate(req.DisbursedDate)
	if err != nil {
		return nil, err
	}

	ref := &models.LoanReference{
		CustomerID:        customerOID,
		CustomerName:      customer.Name,
		Provider:          req.Provider,
		LoanAccountNumber: req.LoanAccountNumber,
		LoanAmount:        req.LoanAmount,
		EMIAmount:         req.EMIAmount,
		TenureMonths:      req.TenureMonths,
		DisbursedDate:     disbursed,
		Status:            models.LoanReferenceStatusActive,
		Notes:             req.Notes,
		CreatedBy:         staffName,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}

	// Optional: link to a sale and denormalise invoice number.
	if req.SaleID != "" {
		saleOID, err := parseObjectID(req.SaleID, "sale")
		if err != nil {
			return nil, err
		}
		sale, err := s.saleRepo.FindByID(ctx, saleOID)
		if err != nil {
			return nil, apperror.NotFound("sale not found")
		}
		ref.SaleID = &saleOID
		ref.InvoiceNumber = sale.InvoiceNumber
	}

	if err := s.loanRefRepo.Create(ctx, ref); err != nil {
		return nil, err
	}
	return toLoanRefResponse(ref), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *loanReferenceService) GetByID(ctx context.Context, id string) (*dto.LoanReferenceResponse, error) {
	oid, err := parseLoanRefOID(id)
	if err != nil {
		return nil, err
	}
	ref, err := s.loanRefRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("loan reference not found")
	}
	return toLoanRefResponse(ref), nil
}

func (s *loanReferenceService) List(ctx context.Context, f dto.LoanReferenceFilter) ([]*dto.LoanReferenceResponse, *response.Meta, error) {
	refs, total, err := s.loanRefRepo.List(ctx, f)
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

	out := make([]*dto.LoanReferenceResponse, 0, len(refs))
	for _, r := range refs {
		out = append(out, toLoanRefResponse(r))
	}
	return out, meta, nil
}

// ── Update ────────────────────────────────────────────────────────────────────

// Update patches mutable loan fields. Only non-zero values are applied.
func (s *loanReferenceService) Update(ctx context.Context, id string, req dto.UpdateLoanReferenceRequest) (*dto.LoanReferenceResponse, error) {
	oid, err := parseLoanRefOID(id)
	if err != nil {
		return nil, err
	}

	fields := bson.M{}
	if req.Provider != "" {
		fields["provider"] = req.Provider
	}
	if req.LoanAccountNumber != "" {
		fields["loan_account_number"] = req.LoanAccountNumber
	}
	if req.LoanAmount > 0 {
		fields["loan_amount"] = req.LoanAmount
	}
	if req.EMIAmount > 0 {
		fields["emi_amount"] = req.EMIAmount
	}
	if req.TenureMonths > 0 {
		fields["tenure_months"] = req.TenureMonths
	}
	if req.DisbursedDate != "" {
		disbursed, err := parseDisbursedDate(req.DisbursedDate)
		if err != nil {
			return nil, err
		}
		fields["disbursed_date"] = disbursed
	}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}
	if len(fields) == 0 {
		return s.GetByID(ctx, id)
	}

	updated, err := s.loanRefRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, apperror.NotFound("loan reference not found")
	}
	return toLoanRefResponse(updated), nil
}

// ── ChangeStatus ──────────────────────────────────────────────────────────────

// ChangeStatus transitions the loan lifecycle: active → closed | overdue.
func (s *loanReferenceService) ChangeStatus(ctx context.Context, id string, req dto.ChangeLoanReferenceStatusRequest) (*dto.LoanReferenceResponse, error) {
	oid, err := parseLoanRefOID(id)
	if err != nil {
		return nil, err
	}

	fields := bson.M{"status": req.Status}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}

	updated, err := s.loanRefRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, apperror.NotFound("loan reference not found")
	}
	return toLoanRefResponse(updated), nil
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (s *loanReferenceService) Delete(ctx context.Context, id string) error {
	oid, err := parseLoanRefOID(id)
	if err != nil {
		return err
	}
	if err := s.loanRefRepo.Delete(ctx, oid); err != nil {
		return apperror.NotFound("loan reference not found")
	}
	return nil
}
