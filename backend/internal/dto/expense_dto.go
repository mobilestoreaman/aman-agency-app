package dto

import "time"

// ─── Request DTOs ─────────────────────────────────────────────────────────────

// CreateExpenseRequest is the payload for recording a new expense.
type CreateExpenseRequest struct {
	Category    string  `json:"category"    validate:"required,oneof=rent salary utilities maintenance marketing miscellaneous"`
	Amount      float64 `json:"amount"      validate:"required,gt=0,max=10000000"`
	Description string  `json:"description" validate:"required"`
	Date        string  `json:"date"        validate:"required"` // DD-MM-YYYY IST
	ReceiptRef  string  `json:"receipt_ref"`
	Notes       string  `json:"notes"`
}

// UpdateExpenseRequest allows partial edits. Fields left empty/zero are ignored.
type UpdateExpenseRequest struct {
	Category    string  `json:"category"    validate:"omitempty,oneof=rent salary utilities maintenance marketing miscellaneous"`
	Amount      float64 `json:"amount"      validate:"omitempty,gt=0"`
	Description string  `json:"description"`
	Date        string  `json:"date"` // DD-MM-YYYY IST, empty = no change
	ReceiptRef  string  `json:"receipt_ref"`
	Notes       string  `json:"notes"`
}

// ─── Filter ───────────────────────────────────────────────────────────────────

// ExpenseFilter controls list queries.
type ExpenseFilter struct {
	Category string `query:"category"`
	From     string `query:"from"`  // DD-MM-YYYY IST
	To       string `query:"to"`    // DD-MM-YYYY IST
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
}

// ─── Response DTO ─────────────────────────────────────────────────────────────

// ExpenseResponse is the external representation of an Expense document.
type ExpenseResponse struct {
	ID          string    `json:"id"`
	Category    string    `json:"category"`
	Amount      float64   `json:"amount"`
	Description string    `json:"description"`
	Date        time.Time `json:"date"`
	ReceiptRef  string    `json:"receipt_ref,omitempty"`
	Notes       string    `json:"notes,omitempty"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ─── Report sub-types ─────────────────────────────────────────────────────────

// ExpenseCategoryBreakdown is one row in the expense summary report.
type ExpenseCategoryBreakdown struct {
	Category string  `json:"category"`
	Amount   float64 `json:"amount"`
	Count    int64   `json:"count"`
}

// ExpenseSummaryResponse aggregates expenses over a date range.
type ExpenseSummaryResponse struct {
	From        time.Time                  `json:"from"`
	To          time.Time                  `json:"to"`
	TotalAmount float64                    `json:"total_amount"`
	TotalCount  int64                      `json:"total_count"`
	ByCategory  []ExpenseCategoryBreakdown `json:"by_category"`
}
