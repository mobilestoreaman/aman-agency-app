package dto

// RecordPaymentRequest records a cash payment received from a customer.
// Amount must be positive; the service stores it as a negative ledger entry.
// Max 10,000,000 to prevent data-entry errors and potential abuse.
// SaleID is optional: when provided the payment is linked to a specific sale invoice.
type RecordPaymentRequest struct {
	Amount float64 `json:"amount"   validate:"required,gt=0,max=10000000"`
	Notes  string  `json:"notes"    validate:"omitempty,max=500"`
	SaleID string  `json:"sale_id"  validate:"omitempty,len=24"`
}

// RecordAdjustmentRequest is an admin-only manual balance correction.
//   - Amount > 0 → increases the balance (customer owes more)
//   - Amount < 0 → reduces the balance (credit / discount)
//
// Notes are required to enforce an audit trail.
// Absolute value bounded at 10,000,000 to prevent accidental large corrections.
type RecordAdjustmentRequest struct {
	Amount float64 `json:"amount" validate:"required,min=-10000000,max=10000000"`
	Notes  string  `json:"notes"  validate:"required,max=500"`
}

// CreditLedgerFilter controls the GET /customers/:id/ledger query.
type CreditLedgerFilter struct {
	Type  string `query:"type"`  // optional: sale|payment|adjustment|cancellation
	Page  int    `query:"page"`
	Limit int    `query:"limit"`
}

// GlobalCreditLedgerFilter controls the GET /credit-ledger global listing.
type GlobalCreditLedgerFilter struct {
	CustomerID string `query:"customer_id"` // optional ObjectID hex
	Type       string `query:"type"`        // optional: sale|payment|adjustment|cancellation
	FromDate   string `query:"from_date"`   // optional DD-MM-YYYY
	ToDate     string `query:"to_date"`     // optional DD-MM-YYYY
	Search     string `query:"search"`      // regex on customer_name or reference
	Page       int    `query:"page"`
	Limit      int    `query:"limit"`
}

// CreditLedgerResponse is the API representation of a single ledger entry.
type CreditLedgerResponse struct {
	ID           string  `json:"id"`
	CustomerID   string  `json:"customer_id"`
	CustomerName string  `json:"customer_name"`
	Type         string  `json:"type"`
	Amount       float64 `json:"amount"`
	BalanceAfter float64 `json:"balance_after"`
	Reference    string  `json:"reference,omitempty"`
	SaleID       string  `json:"sale_id,omitempty"`
	Notes        string  `json:"notes,omitempty"`
	CreatedBy    string  `json:"created_by"`
	CreatedAt    string  `json:"created_at"`
}
