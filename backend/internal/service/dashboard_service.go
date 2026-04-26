package service

import (
	"context"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/repository"
)

// DashboardService assembles the PWA home-screen payload from multiple
// concurrent repository calls. Settings are loaded once and used to drive
// threshold-based sub-queries (low stock, credit ceiling).
type DashboardService interface {
	Get(ctx context.Context) (*dto.DashboardResponse, error)
}

type dashboardService struct {
	repo         repository.DashboardRepository
	settingsRepo repository.SettingsRepository
}

// NewDashboardService constructs a DashboardService.
func NewDashboardService(repo repository.DashboardRepository, settingsRepo repository.SettingsRepository) DashboardService {
	return &dashboardService{repo: repo, settingsRepo: settingsRepo}
}

// Get fetches all dashboard data concurrently and assembles the response.
// Non-critical sub-queries (notifications, borrow-lends, expenses) silently
// zero-out on error so that a single slow collection never blocks the whole screen.
func (s *dashboardService) Get(ctx context.Context) (*dto.DashboardResponse, error) {
	// Load settings synchronously — needed for threshold params.
	settings, err := s.settingsRepo.Get(ctx)
	if err != nil {
		return nil, err
	}
	lowStockThreshold := settings.LowStockThreshold

	// Compute IST time boundaries.
	now := time.Now().In(ist)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, ist)
	dayEnd := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, ist)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, ist)
	monthEnd := time.Date(now.Year(), now.Month()+1, 0, 23, 59, 59, 0, ist) // last day of month

	// ── Concurrent sub-queries ──────────────────────────────────────
	var (
		todaySales          *dto.TodaySalesSummary
		stock               *dto.StockDashboardSummary
		totalCredit         float64
		activeBL, overdueBL int64
		unreadNotifs        int64
		monthExp            float64
		recentSales         []dto.RecentSaleEntry
		lowStockAlerts      []dto.LowStockAlert

		wg sync.WaitGroup
	)

	wg.Add(8)

	go func() {
		defer wg.Done()
		if v, err := s.repo.TodaySales(ctx, dayStart, dayEnd); err == nil {
			todaySales = v
		}
	}()

	go func() {
		defer wg.Done()
		if v, err := s.repo.StockSummary(ctx); err == nil {
			stock = v
		}
	}()

	go func() {
		defer wg.Done()
		if v, err := s.repo.TotalCreditOutstanding(ctx); err == nil {
			totalCredit = v
		}
	}()

	go func() {
		defer wg.Done()
		if a, o, err := s.repo.BorrowLendCounts(ctx); err == nil {
			activeBL = a
			overdueBL = o
		}
	}()

	go func() {
		defer wg.Done()
		if v, err := s.repo.UnreadNotificationCount(ctx); err == nil {
			unreadNotifs = v
		}
	}()

	go func() {
		defer wg.Done()
		if v, err := s.repo.MonthExpenses(ctx, monthStart, monthEnd); err == nil {
			monthExp = v
		}
	}()

	go func() {
		defer wg.Done()
		if v, err := s.repo.RecentSales(ctx, 5); err == nil {
			recentSales = v
		}
	}()

	go func() {
		defer wg.Done()
		if v, err := s.repo.LowStockAlerts(ctx, lowStockThreshold); err == nil {
			lowStockAlerts = v
		}
	}()

	wg.Wait()

	// Apply zero defaults if any sub-query silently failed.
	if todaySales == nil {
		todaySales = &dto.TodaySalesSummary{}
	}
	if stock == nil {
		stock = &dto.StockDashboardSummary{}
	}
	if recentSales == nil {
		recentSales = []dto.RecentSaleEntry{}
	}
	if lowStockAlerts == nil {
		lowStockAlerts = []dto.LowStockAlert{}
	}

	return &dto.DashboardResponse{
		GeneratedAt:            now,
		TodaySales:             *todaySales,
		Stock:                  *stock,
		TotalCreditOutstanding: totalCredit,
		ActiveBorrowLends:      activeBL,
		OverdueBorrowLends:     overdueBL,
		UnreadNotifications:    unreadNotifs,
		MonthExpenses:          monthExp,
		RecentSales:            recentSales,
		LowStockAlerts:         lowStockAlerts,
	}, nil
}
