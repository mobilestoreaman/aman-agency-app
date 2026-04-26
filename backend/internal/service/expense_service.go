package service

import (
	"context"
	"fmt"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ExpenseService manages operational expense records.
type ExpenseService interface {
	Create(ctx context.Context, staffEmail string, req dto.CreateExpenseRequest) (*dto.ExpenseResponse, error)
	GetByID(ctx context.Context, id string) (*dto.ExpenseResponse, error)
	List(ctx context.Context, f dto.ExpenseFilter) ([]dto.ExpenseResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateExpenseRequest) (*dto.ExpenseResponse, error)
	Delete(ctx context.Context, id string) error
	Summary(ctx context.Context, f dto.ReportDateFilter) (*dto.ExpenseSummaryResponse, error)
}

type expenseService struct {
	repo repository.ExpenseRepository
}

// NewExpenseService constructs an ExpenseService.
func NewExpenseService(repo repository.ExpenseRepository) ExpenseService {
	return &expenseService{repo: repo}
}

// ─── IST timezone (reuse package-level ist from report_service.go) ────────────
// Both files are in the same package so `ist` is accessible directly.

// ─── date parsing helper ─────────────────────────────────────────────────────

// parseExpenseDate parses a DD-MM-YYYY string in IST and returns the start of
// that calendar day (00:00:00 IST) — stored as UTC in MongoDB.
func parseExpenseDate(s string) (time.Time, error) {
	t, err := time.ParseInLocation("02-01-2006", s, ist)
	if err != nil {
		return time.Time{}, apperror.BadRequest(
			fmt.Sprintf("invalid date: use DD-MM-YYYY IST, got %q", s))
	}
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, ist), nil
}

// ─── Create ───────────────────────────────────────────────────────────────────

func (s *expenseService) Create(ctx context.Context, staffEmail string, req dto.CreateExpenseRequest) (*dto.ExpenseResponse, error) {
	date, err := parseExpenseDate(req.Date)
	if err != nil {
		return nil, err
	}

	e := models.Expense{
		Category:    models.ExpenseCategory(req.Category),
		Amount:      req.Amount,
		Description: req.Description,
		Date:        date,
		ReceiptRef:  req.ReceiptRef,
		Notes:       req.Notes,
		CreatedBy:   staffEmail,
	}

	if err := s.repo.Create(ctx, &e); err != nil {
		return nil, err
	}
	resp := toExpenseResponse(e)
	return &resp, nil
}

// ─── GetByID ─────────────────────────────────────────────────────────────────

func (s *expenseService) GetByID(ctx context.Context, id string) (*dto.ExpenseResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid expense id")
	}
	e, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	resp := toExpenseResponse(*e)
	return &resp, nil
}

// ─── List ─────────────────────────────────────────────────────────────────────

func (s *expenseService) List(ctx context.Context, f dto.ExpenseFilter) ([]dto.ExpenseResponse, *response.Meta, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		// If both are blank, skip the date filter entirely.
		if f.From == "" && f.To == "" {
			from = time.Time{}
			to = time.Time{}
			err = nil
		} else {
			return nil, nil, err
		}
	}

	items, meta, err := s.repo.List(ctx, f, from, to)
	if err != nil {
		return nil, nil, err
	}

	resp := make([]dto.ExpenseResponse, 0, len(items))
	for _, e := range items {
		resp = append(resp, toExpenseResponse(e))
	}
	return resp, meta, nil
}

// ─── Update ───────────────────────────────────────────────────────────────────

func (s *expenseService) Update(ctx context.Context, id string, req dto.UpdateExpenseRequest) (*dto.ExpenseResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid expense id")
	}

	fields := bson.M{}
	if req.Category != "" {
		fields["category"] = req.Category
	}
	if req.Amount > 0 {
		fields["amount"] = req.Amount
	}
	if req.Description != "" {
		fields["description"] = req.Description
	}
	if req.Date != "" {
		date, err := parseExpenseDate(req.Date)
		if err != nil {
			return nil, err
		}
		fields["date"] = date
	}
	if req.ReceiptRef != "" {
		fields["receipt_ref"] = req.ReceiptRef
	}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}

	if len(fields) == 0 {
		return s.GetByID(ctx, id)
	}

	e, err := s.repo.Update(ctx, oid, fields)
	if err != nil {
		return nil, err
	}
	resp := toExpenseResponse(*e)
	return &resp, nil
}

// ─── Delete ───────────────────────────────────────────────────────────────────

func (s *expenseService) Delete(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return apperror.BadRequest("invalid expense id")
	}
	return s.repo.Delete(ctx, oid)
}

// ─── Summary ─────────────────────────────────────────────────────────────────

func (s *expenseService) Summary(ctx context.Context, f dto.ReportDateFilter) (*dto.ExpenseSummaryResponse, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}
	return s.repo.Aggregate(ctx, from, to)
}

// ─── mapping helper ───────────────────────────────────────────────────────────

func toExpenseResponse(e models.Expense) dto.ExpenseResponse {
	return dto.ExpenseResponse{
		ID:          e.ID.Hex(),
		Category:    string(e.Category),
		Amount:      e.Amount,
		Description: e.Description,
		Date:        e.Date,
		ReceiptRef:  e.ReceiptRef,
		Notes:       e.Notes,
		CreatedBy:   e.CreatedBy,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}
}
