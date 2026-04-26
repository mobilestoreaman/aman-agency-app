package dto

import "time"

// ─── Shared filter ───────────────────────────────────────────────────────────

// ReportDateFilter holds optional from/to query parameters (YYYY-MM-DD).
// Both default to the trailing 30 days when omitted.
type ReportDateFilter struct {
	From string `query:"from"` // YYYY-MM-DD inclusive lower bound
	To   string `query:"to"`   // YYYY-MM-DD inclusive upper bound
}

// ─── Revenue summary ─────────────────────────────────────────────────────────

// RevenueSummaryResponse aggregates completed sales in a date range.
type RevenueSummaryResponse struct {
	From             time.Time `json:"from"`
	To               time.Time `json:"to"`
	TotalSales       int64     `json:"total_sales"`        // non-cancelled
	TotalRevenue     float64   `json:"total_revenue"`      // sum of total_amount
	TotalCollected   float64   `json:"total_collected"`    // sum of amount_paid
	TotalOutstanding float64   `json:"total_outstanding"`  // sum of balance
	AvgSaleValue     float64   `json:"avg_sale_value"`
	CancelledCount   int64     `json:"cancelled_count"`
}

// ─── Stock valuation ─────────────────────────────────────────────────────────

// StockStatusBreakdown holds per-status unit counts.
type StockStatusBreakdown struct {
	Status string `json:"status"`
	Count  int64  `json:"count"`
}

// StockValuationResponse aggregates device inventory across all statuses.
type StockValuationResponse struct {
	TotalUnits            int64                  `json:"total_units"`
	AvailableUnits        int64                  `json:"available_units"`
	SoldUnits             int64                  `json:"sold_units"`
	TotalPurchaseCost     float64                `json:"total_purchase_cost"`
	TotalPotentialRevenue float64                `json:"total_potential_revenue"` // sum of sale_price for available
	EstimatedProfit       float64                `json:"estimated_profit"`        // potential_revenue - purchase_cost of available
	ByStatus              []StockStatusBreakdown `json:"by_status"`
}

// ─── Credit summary ───────────────────────────────────────────────────────────

// DebtorEntry represents a single customer with outstanding credit.
type DebtorEntry struct {
	CustomerID   string  `json:"customer_id"`
	CustomerName string  `json:"customer_name"`
	Phone        string  `json:"phone"`
	Balance      float64 `json:"balance"`
}

// CreditSummaryResponse aggregates outstanding credit balances.
type CreditSummaryResponse struct {
	TotalCustomers       int64         `json:"total_customers"`
	CustomersWithBalance int64         `json:"customers_with_balance"`
	TotalOutstanding     float64       `json:"total_outstanding_credit"`
	TopDebtors           []DebtorEntry `json:"top_debtors"` // top 10 by balance desc
}

// ─── Sales by period ─────────────────────────────────────────────────────────

// SalesByPeriodFilter extends date filter with a grouping period.
type SalesByPeriodFilter struct {
	ReportDateFilter
	GroupBy string `query:"group_by"` // "daily" | "weekly" | "monthly" (default "daily")
}

// SalesByPeriodEntry holds aggregated data for one time bucket.
type SalesByPeriodEntry struct {
	Period    string  `json:"period"`     // formatted label, e.g. "2024-01" for monthly
	SaleCount int64   `json:"sale_count"` // non-cancelled sales
	Revenue   float64 `json:"revenue"`
	Collected float64 `json:"collected"`
}

// ─── Profit & Loss (P&L) Report ──────────────────────────────────────────

// PLPeriodEntry holds aggregated P&L data for one time bucket.
type PLPeriodEntry struct {
	Period      string  `json:"period"`
	Revenue     float64 `json:"revenue"`
	COGS        float64 `json:"cogs"`
	GrossProfit float64 `json:"gross_profit"`
	Expenses    float64 `json:"expenses"`
	NetProfit   float64 `json:"net_profit"`
}

// ProfitLossResponse aggregates revenue, COGS, expenses and profit metrics.
type ProfitLossResponse struct {
	From           time.Time       `json:"from"`
	To             time.Time       `json:"to"`
	Revenue        float64         `json:"revenue"`          // sum of sale total_amount (non-cancelled)
	COGS           float64         `json:"cogs"`             // sum of items[].purchase_price from non-cancelled sales
	GrossProfit    float64         `json:"gross_profit"`     // revenue - cogs
	Expenses       float64         `json:"expenses"`         // sum of expenses.amount in range
	NetProfit      float64         `json:"net_profit"`       // gross_profit - expenses
	GrossMarginPct float64         `json:"gross_margin_pct"` // gross_profit/revenue*100
	NetMarginPct   float64         `json:"net_margin_pct"`   // net_profit/revenue*100
	ByPeriod       []PLPeriodEntry `json:"by_period"`
}

// ─── Product Performance ─────────────────────────────────────────────────

// ProductPerformanceEntry holds aggregated metrics for a product line.
type ProductPerformanceEntry struct {
	BrandName        string  `json:"brand_name"`
	ProductName      string  `json:"product_name"`
	UnitsSold        int64   `json:"units_sold"`
	TotalRevenue     float64 `json:"total_revenue"`
	TotalCOGS        float64 `json:"total_cogs"`
	GrossProfit      float64 `json:"gross_profit"`
	MarginPct        float64 `json:"margin_pct"`
	AvgSalePrice     float64 `json:"avg_sale_price"`
	AvgPurchasePrice float64 `json:"avg_purchase_price"`
}

// ─── Customer Insights ───────────────────────────────────────────────────

// CustomerInsightEntry holds aggregated customer metrics.
type CustomerInsightEntry struct {
	CustomerID     string     `json:"customer_id"`
	CustomerName   string     `json:"customer_name"`
	Phone          string     `json:"phone"`
	TotalPurchases int64      `json:"total_purchases"`
	TotalSpent     float64    `json:"total_spent"`
	TotalPaid      float64    `json:"total_paid"`
	AvgTicket      float64    `json:"avg_ticket"`
	CreditBalance  float64    `json:"credit_balance"`
	CreditRiskPct  float64    `json:"credit_risk_pct"`  // balance/total_spent*100, capped at 100
	LastPurchaseAt *time.Time `json:"last_purchase_at,omitempty"`
}

// ─── Inventory Health ────────────────────────────────────────────────────

// BrandInventoryEntry holds per-brand inventory metrics.
type BrandInventoryEntry struct {
	BrandName      string  `json:"brand_name"`
	UnitsAvailable int64   `json:"units_available"`
	CapitalLocked  float64 `json:"capital_locked"`
	AvgDaysInStock float64 `json:"avg_days_in_stock"`
}

// SlowDeviceEntry represents a device that is aging in inventory.
type SlowDeviceEntry struct {
	DeviceID      string  `json:"device_id"`
	ProductName   string  `json:"product_name"`
	BrandName     string  `json:"brand_name"`
	IMEI          string  `json:"imei"`
	DaysInStock   int64   `json:"days_in_stock"`
	PurchasePrice float64 `json:"purchase_price"`
}

// InventoryHealthResponse aggregates device inventory metrics.
type InventoryHealthResponse struct {
	TotalAvailable int64                  `json:"total_available"`
	CapitalLocked  float64                `json:"capital_locked"`   // sum of purchase_price
	Fresh          int64                  `json:"fresh"`            // <=30 days
	Aging          int64                  `json:"aging"`            // 31-60 days
	Slow           int64                  `json:"slow"`             // 61-90 days
	Dead           int64                  `json:"dead"`             // >90 days
	ByBrand        []BrandInventoryEntry  `json:"by_brand"`
	Slowest        []SlowDeviceEntry      `json:"slowest"`          // top 10 longest in stock
}

// ─── Cash Flow ───────────────────────────────────────────────────────────

// CashFlowEntry holds cash flow data for one period.
type CashFlowEntry struct {
	Period        string  `json:"period"`
	MoneyIn       float64 `json:"money_in"`       // sales collected
	PurchaseCost  float64 `json:"purchase_cost"`  // received purchase orders
	ExpenseCost   float64 `json:"expense_cost"`   // expenses
	MoneyOut      float64 `json:"money_out"`      // purchase_cost + expense_cost
	NetCashFlow   float64 `json:"net_cash_flow"`  // money_in - money_out
}
