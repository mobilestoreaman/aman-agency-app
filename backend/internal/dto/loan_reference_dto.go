package dto

// CreateLoanReferenceRequest records a new consumer EMI loan for a customer.
// CustomerID is required. SaleID is optional — if provided the server resolves
// and denormalises the invoice number.
type CreateLoanReferenceRequest struct {
	CustomerID        string  `json:"customer_id"         validate:"required"`
	SaleID            string  `json:"sale_id"`             // optional ObjectID
	Provider          string  `json:"provider"            validate:"required,oneof=bajaj hdfc icici axis idfc tvs_credit other"`
	LoanAccountNumber string  `json:"loan_account_number" validate:"required"`
	LoanAmount        float64 `json:"loan_amount"         validate:"required,gt=0,max=10000000"`
	EMIAmount         float64 `json:"emi_amount"          validate:"omitempty,gt=0,max=1000000"`
	TenureMonths      int     `json:"tenure_months"       validate:"omitempty,gt=0,max=360"`
	DisbursedDate     string  `json:"disbursed_date"      validate:"omitempty,ddmmyyyy"` // DD-MM-YYYY IST, optional
	Notes             string  `json:"notes"`
}

// UpdateLoanReferenceRequest allows updating mutable loan details.
// All fields are optional; only non-zero values overwrite the existing document.
type UpdateLoanReferenceRequest struct {
	Provider          string  `json:"provider"            validate:"omitempty,oneof=bajaj hdfc icici axis idfc tvs_credit other"`
	LoanAccountNumber string  `json:"loan_account_number"`
	LoanAmount        float64 `json:"loan_amount"         validate:"omitempty,gt=0,max=10000000"`
	EMIAmount         float64 `json:"emi_amount"          validate:"omitempty,gt=0,max=1000000"`
	TenureMonths      int     `json:"tenure_months"       validate:"omitempty,gt=0,max=360"`
	DisbursedDate     string  `json:"disbursed_date"      validate:"omitempty,ddmmyyyy"` // DD-MM-YYYY IST, optional
	Notes             string  `json:"notes"`
}

// ChangeLoanReferenceStatusRequest transitions the loan lifecycle status.
type ChangeLoanReferenceStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=active closed overdue"`
	Notes  string `json:"notes"`
}

// LoanReferenceFilter controls the GET /loan-references list query.
type LoanReferenceFilter struct {
	CustomerID string `query:"customer_id"`
	SaleID     string `query:"sale_id"`
	Provider   string `query:"provider"`  // bajaj|hdfc|icici|axis|idfc|tvs_credit|other
	Status     string `query:"status"`    // active|closed|overdue
	Search     string `query:"search"`    // regex on customer_name or loan_account_number
	Page       int    `query:"page"`
	Limit      int    `query:"limit"`
}

// LoanReferenceResponse is the API representation of a LoanReference document.
type LoanReferenceResponse struct {
	ID                string  `json:"id"`
	CustomerID        string  `json:"customer_id"`
	CustomerName      string  `json:"customer_name"`
	SaleID            string  `json:"sale_id,omitempty"`
	InvoiceNumber     string  `json:"invoice_number,omitempty"`
	Provider          string  `json:"provider"`
	LoanAccountNumber string  `json:"loan_account_number"`
	LoanAmount        float64 `json:"loan_amount"`
	EMIAmount         float64 `json:"emi_amount,omitempty"`
	TenureMonths      int     `json:"tenure_months,omitempty"`
	DisbursedDate     string  `json:"disbursed_date,omitempty"` // DD-MM-YYYY IST
	Status            string  `json:"status"`
	Notes             string  `json:"notes,omitempty"`
	CreatedBy         string  `json:"created_by"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}
