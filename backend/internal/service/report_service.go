package service

import (
	"context"
	"fmt"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
)

// ReportService exposes read-only analytics endpoints for the Aman Agency store.
// All methods are admin-only; no data is mutated.
type ReportService interface {
	RevenueSummary(ctx context.Context, f dto.ReportDateFilter) (*dto.RevenueSummaryResponse, error)
	StockValuation(ctx context.Context) (*dto.StockValuationResponse, error)
	CreditSummary(ctx context.Context) (*dto.CreditSummaryResponse, error)
	SalesByPeriod(ctx context.Context, f dto.SalesByPeriodFilter) ([]dto.SalesByPeriodEntry, error)
	ProfitLoss(ctx context.Context, f dto.SalesByPeriodFilter) (*dto.ProfitLossResponse, error)
	ProductPerformance(ctx context.Context, f dto.ReportDateFilter) ([]dto.ProductPerformanceEntry, error)
	CustomerInsights(ctx context.Context, f dto.ReportDateFilter) ([]dto.CustomerInsightEntry, error)
	InventoryHealth(ctx context.Context) (*dto.InventoryHealthResponse, error)
	CashFlow(ctx context.Context, f dto.SalesByPeriodFilter) ([]dto.CashFlowEntry, error)
}

type reportService struct {
	repo repository.ReportRepository
}

// NewReportService creates a ReportService backed by the given repository.
func NewReportService(repo repository.ReportRepository) ReportService {
	return &reportService{repo: repo}
}

// ─── timezone ────────────────────────────────────────────────────────────────

// ist is Asia/Kolkata (UTC+5:30). All "current date" calculations and date
// input parsing use this timezone so that midnight boundaries align with IST.
var ist = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		loc = time.FixedZone("IST", 5*60*60+30*60)
	}
	return loc
}()

// ─── helpers ─────────────────────────────────────────────────────────────────

// defaultDateRange returns (30 days ago 00:00 IST, today 23:59:59 IST) when
// both from and to are omitted.
func defaultDateRange() (time.Time, time.Time) {
	now := time.Now().In(ist)
	to := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, ist)
	from := time.Date(now.Year(), now.Month(), now.Day()-29, 0, 0, 0, 0, ist)
	return from, to
}

// parseDateRange parses from/to as DD-MM-YYYY in IST, substituting defaults
// when blank. Returns an error if either value is present but malformed.
// The returned times are in IST so MongoDB comparisons align with IST midnight.
func parseDateRange(fromStr, toStr string) (time.Time, time.Time, error) {
	const layout = "02-01-2006" // DD-MM-YYYY

	defaultFrom, defaultTo := defaultDateRange()

	var from, to time.Time
	var err error

	if fromStr == "" {
		from = defaultFrom
	} else {
		from, err = time.ParseInLocation(layout, fromStr, ist)
		if err != nil {
			return time.Time{}, time.Time{}, apperror.BadRequest(
				fmt.Sprintf("invalid 'from' date: use DD-MM-YYYY, got %q", fromStr))
		}
		// Normalise to start-of-day IST
		from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, ist)
	}

	if toStr == "" {
		to = defaultTo
	} else {
		t, err2 := time.ParseInLocation(layout, toStr, ist)
		if err2 != nil {
			return time.Time{}, time.Time{}, apperror.BadRequest(
				fmt.Sprintf("invalid 'to' date: use DD-MM-YYYY, got %q", toStr))
		}
		// Include the whole day — end-of-day IST
		to = time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, ist)
	}

	if from.After(to) {
		return time.Time{}, time.Time{}, apperror.BadRequest("'from' must not be after 'to'")
	}

	return from, to, nil
}

// ─── RevenueSummary ───────────────────────────────────────────────────────────

func (s *reportService) RevenueSummary(ctx context.Context, f dto.ReportDateFilter) (*dto.RevenueSummaryResponse, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}
	return s.repo.RevenueSummary(ctx, from, to)
}

// ─── StockValuation ───────────────────────────────────────────────────────────

func (s *reportService) StockValuation(ctx context.Context) (*dto.StockValuationResponse, error) {
	return s.repo.StockValuation(ctx)
}

// ─── CreditSummary ────────────────────────────────────────────────────────────

func (s *reportService) CreditSummary(ctx context.Context) (*dto.CreditSummaryResponse, error) {
	return s.repo.CreditSummary(ctx)
}

// ─── SalesByPeriod ────────────────────────────────────────────────────────────

func (s *reportService) SalesByPeriod(ctx context.Context, f dto.SalesByPeriodFilter) ([]dto.SalesByPeriodEntry, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}

	groupBy := f.GroupBy
	switch groupBy {
	case "daily", "weekly", "monthly":
		// valid
	case "":
		groupBy = "daily"
	default:
		return nil, apperror.BadRequest("'group_by' must be one of: daily, weekly, monthly")
	}

	return s.repo.SalesByPeriod(ctx, from, to, groupBy)
}

// ─── ProfitLoss ───────────────────────────────────────────────────────────────

func (s *reportService) ProfitLoss(ctx context.Context, f dto.SalesByPeriodFilter) (*dto.ProfitLossResponse, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}

	groupBy := f.GroupBy
	switch groupBy {
	case "daily", "weekly", "monthly":
		// valid
	case "":
		groupBy = "daily"
	default:
		return nil, apperror.BadRequest("'group_by' must be one of: daily, weekly, monthly")
	}

	return s.repo.ProfitLoss(ctx, from, to, groupBy)
}

// ─── ProductPerformance ───────────────────────────────────────────────────────

func (s *reportService) ProductPerformance(ctx context.Context, f dto.ReportDateFilter) ([]dto.ProductPerformanceEntry, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}
	return s.repo.ProductPerformance(ctx, from, to)
}

// ─── CustomerInsights ──────────────────────────────────────────────────────────

func (s *reportService) CustomerInsights(ctx context.Context, f dto.ReportDateFilter) ([]dto.CustomerInsightEntry, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}
	return s.repo.CustomerInsights(ctx, from, to)
}

// ─── InventoryHealth ──────────────────────────────────────────────────────────

func (s *reportService) InventoryHealth(ctx context.Context) (*dto.InventoryHealthResponse, error) {
	return s.repo.InventoryHealth(ctx)
}

// ─── CashFlow ──────────────────────────────────────────────────────────────────

func (s *reportService) CashFlow(ctx context.Context, f dto.SalesByPeriodFilter) ([]dto.CashFlowEntry, error) {
	from, to, err := parseDateRange(f.From, f.To)
	if err != nil {
		return nil, err
	}

	groupBy := f.GroupBy
	switch groupBy {
	case "daily", "weekly", "monthly":
		// valid
	case "":
		groupBy = "daily"
	default:
		return nil, apperror.BadRequest("'group_by' must be one of: daily, weekly, monthly")
	}

	return s.repo.CashFlow(ctx, from, to, groupBy)
}
