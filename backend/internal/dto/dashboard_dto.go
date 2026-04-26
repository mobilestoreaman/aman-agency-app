package dto

import "time"

// ─── Dashboard ────────────────────────────────────────────────────────────────

// TodaySalesSummary holds today's revenue snapshot in IST.
type TodaySalesSummary struct {
	Count       int64   `json:"count"`
	Revenue     float64 `json:"revenue"`      // sum of total_amount
	Collected   float64 `json:"collected"`    // sum of amount_paid
	Outstanding float64 `json:"outstanding"`  // sum of balance
}

// StockDashboardSummary holds device inventory counts by status.
type StockDashboardSummary struct {
	TotalUnits     int64 `json:"total_units"`
	Available      int64 `json:"available"`
	Sold           int64 `json:"sold"`
	Reserved       int64 `json:"reserved"`
	UnderRepair    int64 `json:"under_repair"`
}

// LowStockAlert identifies a product whose available unit count is below threshold.
type LowStockAlert struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	BrandName   string `json:"brand_name"`
	Available   int64  `json:"available"`
	Threshold   int    `json:"threshold"`
}

// RecentSaleEntry is a compact sale row for the dashboard feed.
type RecentSaleEntry struct {
	SaleID        string    `json:"sale_id"`
	InvoiceNumber string    `json:"invoice_number"`
	CustomerName  string    `json:"customer_name"`
	TotalAmount   float64   `json:"total_amount"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

// DashboardResponse is the single payload returned by GET /dashboard.
// All counts are computed concurrently in the service layer.
type DashboardResponse struct {
	GeneratedAt         time.Time             `json:"generated_at"`          // IST
	TodaySales          TodaySalesSummary     `json:"today_sales"`
	Stock               StockDashboardSummary `json:"stock"`
	TotalCreditOutstanding float64            `json:"total_credit_outstanding"`
	ActiveBorrowLends   int64                 `json:"active_borrow_lends"`
	OverdueBorrowLends  int64                 `json:"overdue_borrow_lends"`
	UnreadNotifications int64                 `json:"unread_notifications"`
	MonthExpenses       float64               `json:"month_expenses"`        // current calendar month in IST
	RecentSales         []RecentSaleEntry     `json:"recent_sales"`          // last 5
	LowStockAlerts      []LowStockAlert       `json:"low_stock_alerts"`      // empty when threshold == 0
}
