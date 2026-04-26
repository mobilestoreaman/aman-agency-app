package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// ReportController handles read-only analytics endpoints.
// All routes are admin-only; no mutations are performed.
type ReportController struct {
	svc service.ReportService
}

// NewReportController constructs a ReportController.
func NewReportController(svc service.ReportService) *ReportController {
	return &ReportController{svc: svc}
}

// RevenueSummary godoc
// @Summary      Revenue summary
// @Description  Aggregates completed sales within a date range: count, total revenue, collected, outstanding, avg sale value and cancelled count.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Param        from  query  string  false  "Start date YYYY-MM-DD (default: 30 days ago)"
// @Param        to    query  string  false  "End date YYYY-MM-DD   (default: today)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/revenue [get]
func (ctrl *ReportController) RevenueSummary(c *fiber.Ctx) error {
	var f dto.ReportDateFilter
	if err := c.QueryParser(&f); err != nil {
		return fiber.ErrBadRequest
	}
	data, err := ctrl.svc.RevenueSummary(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// StockValuation godoc
// @Summary      Stock valuation
// @Description  Returns unit counts, total purchase cost and potential revenue per device status across the entire inventory.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/stock-valuation [get]
func (ctrl *ReportController) StockValuation(c *fiber.Ctx) error {
	data, err := ctrl.svc.StockValuation(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// CreditSummary godoc
// @Summary      Credit balance summary
// @Description  Returns total outstanding credit across all customers, plus the top 10 debtors by balance.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/credit-summary [get]
func (ctrl *ReportController) CreditSummary(c *fiber.Ctx) error {
	data, err := ctrl.svc.CreditSummary(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// SalesByPeriod godoc
// @Summary      Sales breakdown by period
// @Description  Groups non-cancelled sales by daily, weekly, or monthly buckets within a date range.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Param        from      query  string  false  "Start date YYYY-MM-DD (default: 30 days ago)"
// @Param        to        query  string  false  "End date YYYY-MM-DD   (default: today)"
// @Param        group_by  query  string  false  "Grouping: daily | weekly | monthly (default: daily)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/sales-by-period [get]
func (ctrl *ReportController) SalesByPeriod(c *fiber.Ctx) error {
	var f dto.SalesByPeriodFilter
	if err := c.QueryParser(&f); err != nil {
		return fiber.ErrBadRequest
	}
	data, err := ctrl.svc.SalesByPeriod(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// ProfitLoss godoc
// @Summary      Profit & Loss report
// @Description  Aggregates revenue, COGS, expenses and profit metrics across a date range, with optional period grouping.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Param        from      query  string  false  "Start date DD-MM-YYYY (default: 30 days ago)"
// @Param        to        query  string  false  "End date DD-MM-YYYY   (default: today)"
// @Param        group_by  query  string  false  "Grouping: daily | weekly | monthly (default: daily)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/profit-loss [get]
func (ctrl *ReportController) ProfitLoss(c *fiber.Ctx) error {
	var f dto.SalesByPeriodFilter
	if err := c.QueryParser(&f); err != nil {
		return fiber.ErrBadRequest
	}
	data, err := ctrl.svc.ProfitLoss(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// ProductPerformance godoc
// @Summary      Product performance report
// @Description  Aggregates sales metrics by product and brand within a date range. Top products by revenue, limited to 50.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Param        from  query  string  false  "Start date DD-MM-YYYY (default: 30 days ago)"
// @Param        to    query  string  false  "End date DD-MM-YYYY   (default: today)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/product-performance [get]
func (ctrl *ReportController) ProductPerformance(c *fiber.Ctx) error {
	var f dto.ReportDateFilter
	if err := c.QueryParser(&f); err != nil {
		return fiber.ErrBadRequest
	}
	data, err := ctrl.svc.ProductPerformance(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// CustomerInsights godoc
// @Summary      Customer insights report
// @Description  Aggregates purchase metrics by customer within a date range, including credit balance and risk analysis. Top customers by spending, limited to 50.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Param        from  query  string  false  "Start date DD-MM-YYYY (default: 30 days ago)"
// @Param        to    query  string  false  "End date DD-MM-YYYY   (default: today)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/customer-insights [get]
func (ctrl *ReportController) CustomerInsights(c *fiber.Ctx) error {
	var f dto.ReportDateFilter
	if err := c.QueryParser(&f); err != nil {
		return fiber.ErrBadRequest
	}
	data, err := ctrl.svc.CustomerInsights(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// InventoryHealth godoc
// @Summary      Inventory health snapshot
// @Description  Returns current inventory status: units by age bucket (fresh, aging, slow, dead) and slowest-moving 10 items.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/inventory-health [get]
func (ctrl *ReportController) InventoryHealth(c *fiber.Ctx) error {
	data, err := ctrl.svc.InventoryHealth(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// CashFlow godoc
// @Summary      Cash flow report
// @Description  Aggregates money in (sales collected) and money out (purchases received, expenses) across a date range, with optional period grouping.
// @Tags         Reports
// @Produce      json
// @Security     BearerAuth
// @Param        from      query  string  false  "Start date DD-MM-YYYY (default: 30 days ago)"
// @Param        to        query  string  false  "End date DD-MM-YYYY   (default: today)"
// @Param        group_by  query  string  false  "Grouping: daily | weekly | monthly (default: daily)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /reports/cash-flow [get]
func (ctrl *ReportController) CashFlow(c *fiber.Ctx) error {
	var f dto.SalesByPeriodFilter
	if err := c.QueryParser(&f); err != nil {
		return fiber.ErrBadRequest
	}
	data, err := ctrl.svc.CashFlow(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}
