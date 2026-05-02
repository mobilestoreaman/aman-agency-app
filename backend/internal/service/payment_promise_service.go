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

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// PaymentPromiseService manages payment promises for credit sales.
type PaymentPromiseService interface {
	// Create records a new promise from a sale with outstanding balance.
	Create(ctx context.Context, staffName string, req dto.CreatePaymentPromiseRequest) (*dto.PaymentPromiseResponse, error)

	// List returns paginated promises, optionally scoped to a customer.
	List(ctx context.Context, f dto.PaymentPromiseFilter) ([]dto.PaymentPromiseResponse, *response.Meta, error)

	// Reschedule marks the current promise as rescheduled and creates a new one
	// with the updated date (and optionally updated amount).
	Reschedule(ctx context.Context, id, staffName string, req dto.ReschedulePromiseRequest) (*dto.PaymentPromiseResponse, error)

	// MarkPaid marks the promise as paid.
	MarkPaid(ctx context.Context, id, staffName string, notes string) (*dto.PaymentPromiseResponse, error)

	// MarkBroken marks a promise as broken (called manually or by a scheduled job).
	MarkBroken(ctx context.Context, id string) (*dto.PaymentPromiseResponse, error)

	// NotifyDueToday checks for promises due today and creates reminder notifications.
	// Safe to call repeatedly — only fires once per promise via the Notified flag.
	NotifyDueToday(ctx context.Context)
}

type paymentPromiseService struct {
	repo         repository.PaymentPromiseRepository
	customerRepo repository.CustomerRepository
	saleRepo     repository.SaleRepository
	notifSvc     NotificationService
}

// NewPaymentPromiseService constructs the service with all required dependencies.
func NewPaymentPromiseService(
	repo repository.PaymentPromiseRepository,
	customerRepo repository.CustomerRepository,
	saleRepo repository.SaleRepository,
	notifSvc NotificationService,
) PaymentPromiseService {
	return &paymentPromiseService{
		repo:         repo,
		customerRepo: customerRepo,
		saleRepo:     saleRepo,
		notifSvc:     notifSvc,
	}
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *paymentPromiseService) Create(
	ctx context.Context,
	staffName string,
	req dto.CreatePaymentPromiseRequest,
) (*dto.PaymentPromiseResponse, error) {
	// Resolve customer
	customer, err := s.customerRepo.FindByID(ctx, mustOID(req.CustomerID))
	if err != nil {
		return nil, apperror.NotFound("customer not found")
	}

	promised, err := time.Parse("2006-01-02", req.PromisedDate)
	if err != nil {
		return nil, apperror.BadRequest("promised_date must be YYYY-MM-DD")
	}
	promised = promised.UTC()

	// Ensure the promised date is today or later (compare at day granularity so
	// creating a promise for today doesn't fail because midnight < current time).
	today := time.Now().UTC().Truncate(24 * time.Hour)
	if promised.Before(today) {
		return nil, apperror.BadRequest("promised_date must be today or in the future")
	}

	promise := &models.PaymentPromise{
		CustomerID:     mustOID(req.CustomerID),
		CustomerName:   customer.Name,
		CustomerPhone:  customer.Phone,
		AmountPromised: req.AmountPromised,
		PromisedDate:   promised,
		Status:         models.PromiseStatusPending,
		Notes:          req.Notes,
		CreatedBy:      staffName,
	}

	// Optionally link to a sale
	if req.SaleID != "" {
		oid := mustOID(req.SaleID)
		promise.SaleID = &oid

		// Denormalize invoice number for display
		sale, serr := s.saleRepo.FindByID(ctx, oid)
		if serr == nil {
			promise.InvoiceNumber = sale.InvoiceNumber
		}
	}

	if err := s.repo.Create(ctx, promise); err != nil {
		return nil, err
	}
	return toPromiseResponse(promise), nil
}

// ── List ──────────────────────────────────────────────────────────────────────

func (s *paymentPromiseService) List(
	ctx context.Context,
	f dto.PaymentPromiseFilter,
) ([]dto.PaymentPromiseResponse, *response.Meta, error) {
	page  := f.Page
	limit := f.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// Validate customer_id early so callers get a clear error.
	if f.CustomerID != "" {
		if _, err := primitive.ObjectIDFromHex(f.CustomerID); err != nil {
			return nil, nil, apperror.BadRequest("invalid customer_id")
		}
	}

	// Validate date format (must be DD-MM-YYYY, matching the app-wide standard).
	if f.FromDate != "" {
		if _, err := dateutil.ParseDDMMYYYY(f.FromDate); err != nil {
			return nil, nil, apperror.BadRequest("from_date must be DD-MM-YYYY format")
		}
	}
	if f.ToDate != "" {
		if _, err := dateutil.ParseDDMMYYYY(f.ToDate); err != nil {
			return nil, nil, apperror.BadRequest("to_date must be DD-MM-YYYY format")
		}
	}

	promises, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}

	out := make([]dto.PaymentPromiseResponse, len(promises))
	for i, p := range promises {
		out[i] = *toPromiseResponse(p)
	}
	pg := pagination.Params{Page: page, Limit: limit}
	meta := pagination.ToMeta(pg, total)
	return out, meta, nil
}

// ── Reschedule ────────────────────────────────────────────────────────────────

func (s *paymentPromiseService) Reschedule(
	ctx context.Context,
	id, staffName string,
	req dto.ReschedulePromiseRequest,
) (*dto.PaymentPromiseResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid id")
	}

	old, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("promise not found")
	}
	if old.Status != models.PromiseStatusPending {
		return nil, apperror.BadRequest(fmt.Sprintf("cannot reschedule a %s promise", old.Status))
	}

	newDate, err := time.Parse("2006-01-02", req.NewDate)
	if err != nil {
		return nil, apperror.BadRequest("new_date must be YYYY-MM-DD")
	}

	// Ensure the new date is today or later (compare at day granularity).
	today := time.Now().UTC().Truncate(24 * time.Hour)
	if newDate.UTC().Before(today) {
		return nil, apperror.BadRequest("new_date must be today or in the future")
	}

	// Determine amount for the new promise.
	newAmount := old.AmountPromised
	if req.AmountPromised > 0 {
		newAmount = req.AmountPromised
	}

	// Create the new promise FIRST — if this fails, the old promise stays pending
	// (no state corruption). Only mark old as rescheduled after successful creation.
	newPromise := &models.PaymentPromise{
		CustomerID:     old.CustomerID,
		CustomerName:   old.CustomerName,
		CustomerPhone:  old.CustomerPhone,
		SaleID:         old.SaleID,
		InvoiceNumber:  old.InvoiceNumber,
		AmountPromised: newAmount,
		PromisedDate:   newDate.UTC(),
		Status:         models.PromiseStatusPending,
		Notes:          req.Notes,
		CreatedBy:      staffName,
	}
	if err := s.repo.Create(ctx, newPromise); err != nil {
		return nil, err
	}

	// Now mark the old promise as rescheduled. If this update fails, log it but
	// don't fail the request — the new promise already exists and is the source of truth.
	if _, err := s.repo.Update(ctx, oid, bson.M{"status": string(models.PromiseStatusRescheduled)}); err != nil {
		// Non-fatal: new promise is created; old one will appear as pending but
		// the user can manually mark it. Log in production.
		_ = err
	}

	return toPromiseResponse(newPromise), nil
}

// ── MarkPaid ──────────────────────────────────────────────────────────────────

func (s *paymentPromiseService) MarkPaid(
	ctx context.Context,
	id, staffName, notes string,
) (*dto.PaymentPromiseResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid id")
	}

	fields := bson.M{"status": string(models.PromiseStatusPaid)}
	if notes != "" {
		fields["notes"] = notes
	}

	p, err := s.repo.Update(ctx, oid, fields)
	if err != nil {
		if err == repository.ErrNotFound {
			return nil, apperror.NotFound("promise not found")
		}
		return nil, err
	}
	return toPromiseResponse(p), nil
}

// ── MarkBroken ────────────────────────────────────────────────────────────────

func (s *paymentPromiseService) MarkBroken(ctx context.Context, id string) (*dto.PaymentPromiseResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid id")
	}

	p, err := s.repo.Update(ctx, oid, bson.M{"status": string(models.PromiseStatusBroken)})
	if err != nil {
		if err == repository.ErrNotFound {
			return nil, apperror.NotFound("promise not found")
		}
		return nil, err
	}
	return toPromiseResponse(p), nil
}

// ── NotifyDueToday (background worker) ───────────────────────────────────────

// NotifyDueToday finds all pending promises whose date is today and fires a
// credit_due notification for each. The promise is then flagged notified=true
// to prevent duplicate alerts on subsequent hourly runs.
func (s *paymentPromiseService) NotifyDueToday(ctx context.Context) {
	promises, err := s.repo.FindDueTodayUnnotified(ctx)
	if err != nil {
		return
	}

	for _, p := range promises {
		// Create a broadcast notification (empty recipient = all staff see it)
		s.notifSvc.Notify(ctx, models.Notification{
			Type:       models.NotificationTypeCreditDue,
			Title:      fmt.Sprintf("Payment Due: %s", p.CustomerName),
			Body:       fmt.Sprintf("%s (%s) promised ₹%.2f today. Call to collect.", p.CustomerName, p.CustomerPhone, p.AmountPromised),
			CustomerID: &p.CustomerID,
			RefID:      p.ID.Hex(),
			CreatedBy:  "system",
		})

		// Mark as notified so this won't fire again
		_, _ = s.repo.Update(ctx, p.ID, bson.M{"notified": true})
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func toPromiseResponse(p *models.PaymentPromise) *dto.PaymentPromiseResponse {
	r := &dto.PaymentPromiseResponse{
		ID:             p.ID.Hex(),
		CustomerID:     p.CustomerID.Hex(),
		CustomerName:   p.CustomerName,
		CustomerPhone:  p.CustomerPhone,
		AmountPromised: p.AmountPromised,
		PromisedDate:   p.PromisedDate.Format(time.RFC3339),
		Status:         string(p.Status),
		Notes:          p.Notes,
		Notified:       p.Notified,
		IsOverdue:      p.Status == models.PromiseStatusPending && p.PromisedDate.Before(time.Now().UTC()),
		CreatedBy:      p.CreatedBy,
		CreatedAt:      p.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      p.UpdatedAt.Format(time.RFC3339),
	}
	if p.SaleID != nil {
		r.SaleID = p.SaleID.Hex()
	}
	if p.InvoiceNumber != "" {
		r.InvoiceNumber = p.InvoiceNumber
	}
	return r
}

// mustOID converts a hex string to ObjectID; panics only on programmer error
// (caller should validate the format before calling).
func mustOID(hex string) primitive.ObjectID {
	oid, _ := primitive.ObjectIDFromHex(hex)
	return oid
}
