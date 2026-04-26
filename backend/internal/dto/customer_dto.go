package dto

// CreateCustomerRequest is the body for POST /api/v1/customers.
type CreateCustomerRequest struct {
	Name    string `json:"name"    validate:"required,min=2,max=100"`
	Phone   string `json:"phone"   validate:"required,e164"`
	Address string `json:"address" validate:"omitempty,max=300"`
	Notes   string `json:"notes"   validate:"omitempty,max=500"`
}

// UpdateCustomerRequest is the body for PUT /api/v1/customers/:id.
type UpdateCustomerRequest struct {
	Name    string `json:"name"    validate:"omitempty,min=2,max=100"`
	Phone   string `json:"phone"   validate:"omitempty,e164"`
	Address string `json:"address" validate:"omitempty,max=300"`
	Notes   string `json:"notes"   validate:"omitempty,max=500"`
}

// CustomerResponse is the JSON shape returned on every customer endpoint.
type CustomerResponse struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Phone         string  `json:"phone"`
	Address       string  `json:"address,omitempty"`
	CreditBalance float64 `json:"credit_balance"`
	Notes         string  `json:"notes,omitempty"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

// CustomerFilter holds query-string parameters for listing customers.
type CustomerFilter struct {
	Search       string // name or phone prefix
	CreditFilter string // "with_balance" | "no_balance" | "" (all)
	Page         int
	Limit        int
}
