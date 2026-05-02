package dto

// CreateVendorRequest is the body for POST /api/v1/vendors.
type CreateVendorRequest struct {
	Name    string `json:"name"    validate:"required,min=2,max=100"`
	Phone   string `json:"phone"   validate:"required,e164"`
	Address string `json:"address" validate:"omitempty,max=300"`
	Notes   string `json:"notes"   validate:"omitempty,max=500"`
}

// UpdateVendorRequest is the body for PUT /api/v1/vendors/:id.
type UpdateVendorRequest struct {
	Name    string `json:"name"    validate:"omitempty,min=2,max=100"`
	Phone   string `json:"phone"   validate:"omitempty,e164"`
	Address string `json:"address" validate:"omitempty,max=300"`
	Notes   string `json:"notes"   validate:"omitempty,max=500"`
}

// VendorResponse is the JSON shape returned on every vendor endpoint.
type VendorResponse struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Phone          string  `json:"phone"`
	Address        string  `json:"address,omitempty"`
	Notes          string  `json:"notes,omitempty"`
	// PayableBalance is the running total the business owes this vendor.
	// Positive = business owes vendor; zero or negative = overpaid.
	PayableBalance float64 `json:"payable_balance"`
	// HasLedger is true once any ledger entry has ever been recorded for this
	// vendor. The frontend uses this to gate the "Set opening balance" button —
	// that action is only available before any financial history exists.
	HasLedger      bool    `json:"has_ledger"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

// VendorFilter holds query parameters for listing vendors.
type VendorFilter struct {
	Search string // case-insensitive regex on name or phone
	Page   int
	Limit  int
}
