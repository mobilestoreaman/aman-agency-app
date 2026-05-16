package dto

import "time"

// DailyClosingResponse is the end-of-day cash summary.
type DailyClosingResponse struct {
	Date           string  `json:"date"`            // "02 Jan 2006"
	CashReceived   float64 `json:"cash_received"`   // sum of amount_paid on today's non-cancelled sales
	CreditIssued   float64 `json:"credit_issued"`   // sum of balance on today's non-cancelled sales
	ExpensesPaid   float64 `json:"expenses_paid"`   // today's expenses total
	NetCash        float64 `json:"net_cash"`         // cash_received - expenses_paid
	TotalSales     int64   `json:"total_sales"`
	CancelledSales int64   `json:"cancelled_sales"`
}

// StaffPerformanceResponse is the self-performance view for authenticated staff.
type StaffPerformanceResponse struct {
	StaffID           string  `json:"staff_id"`
	StaffName         string  `json:"staff_name"`
	TodaySales        int64   `json:"today_sales"`
	TodayRevenue      float64 `json:"today_revenue"`
	WeekSales         int64   `json:"week_sales"`
	WeekRevenue       float64 `json:"week_revenue"`
	MonthSales        int64   `json:"month_sales"`
	MonthRevenue      float64 `json:"month_revenue"`
	CustomersWithDues int64   `json:"customers_with_dues"`
	TotalDuesAmount   float64 `json:"total_dues_amount"`
}

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
