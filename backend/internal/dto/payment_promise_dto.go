package dto

// CreatePaymentPromiseRequest is the body for POST /api/v1/payment-promises.
type CreatePaymentPromiseRequest struct {
	CustomerID     string  `json:"customer_id"      validate:"required,objectid"`
	SaleID         string  `json:"sale_id"          validate:"omitempty,objectid"`
	AmountPromised float64 `json:"amount_promised"  validate:"required,gt=0,max=10000000"`
	// PromisedDate must be in YYYY-MM-DD format.
	PromisedDate string `json:"promised_date" validate:"required"`
	Notes        string `json:"notes"         validate:"omitempty,max=500"`
}

// ReschedulePromiseRequest is the body for PATCH /api/v1/payment-promises/:id/reschedule.
type ReschedulePromiseRequest struct {
	// NewDate must be in YYYY-MM-DD format and must be in the future.
	NewDate        string  `json:"new_date"         validate:"required"`
	AmountPromised float64 `json:"amount_promised"  validate:"omitempty,gt=0,max=10000000"`
	Notes          string  `json:"notes"            validate:"omitempty,max=500"`
}

// PaymentPromiseFilter holds query-string parameters for listing promises.
type PaymentPromiseFilter struct {
	CustomerID string `query:"customer_id"`
	Status     string `query:"status"`    // pending|paid|rescheduled|broken
	Search     string `query:"search"`    // regex on customer_name, invoice_number
	FromDate   string `query:"from_date"` // YYYY-MM-DD
	ToDate     string `query:"to_date"`   // YYYY-MM-DD
	Page       int    `query:"page"`
	Limit      int    `query:"limit"`
}

// BulkMarkPaidRequest marks multiple promises as paid in one call.
type BulkMarkPaidRequest struct {
	IDs []string `json:"ids" validate:"required,min=1,max=50,dive,len=24"`
}

// BulkMarkPaidResponse summarises the bulk operation result.
type BulkMarkPaidResponse struct {
	Updated int64    `json:"updated"`
	Failed  []string `json:"failed,omitempty"`
}

// PaymentPromiseResponse is the JSON shape returned on every payment-promise endpoint.
type PaymentPromiseResponse struct {
	ID             string  `json:"id"`
	CustomerID     string  `json:"customer_id"`
	CustomerName   string  `json:"customer_name"`
	CustomerPhone  string  `json:"customer_phone"`
	SaleID         string  `json:"sale_id,omitempty"`
	InvoiceNumber  string  `json:"invoice_number,omitempty"`
	AmountPromised float64 `json:"amount_promised"`
	PromisedDate   string  `json:"promised_date"`
	Status         string  `json:"status"`
	Notes          string  `json:"notes,omitempty"`
	Notified       bool    `json:"notified"`
	IsOverdue      bool    `json:"is_overdue"` // computed: status=pending and date < today
	CreatedBy      string  `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}
