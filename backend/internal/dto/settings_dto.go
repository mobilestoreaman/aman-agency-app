package dto

import "time"

// UpdateSettingsRequest carries the fields a caller may change.
// Every field is optional (omitempty on JSON tags); only non-zero values are
// applied in the $set update so partial PATCH-style updates are supported via
// a single PUT endpoint.
type UpdateSettingsRequest struct {
	StoreName    string `json:"store_name"`
	StoreTagline string `json:"store_tagline"`
	StoreAddress string `json:"store_address"`
	StorePhone   string `json:"store_phone"`
	StoreEmail   string `json:"store_email"`

	Currency      string  `json:"currency"`
	DefaultTaxPct float64 `json:"default_tax_pct" validate:"min=0,max=1"` // fraction, e.g. 0.17

	LowStockThreshold int     `json:"low_stock_threshold" validate:"min=0"`
	CreditCeiling     float64 `json:"credit_ceiling"      validate:"min=0"`

	BillHeaderText string `json:"bill_header_text"  validate:"omitempty,max=500"`
	BillFooterText string `json:"bill_footer_text"  validate:"omitempty,max=500"`
	ReceiptFooter  string `json:"receipt_footer"    validate:"omitempty,max=500"`
	// LogoBase64 is intentionally excluded from the general update request.
	// Use the dedicated POST /settings/logo and DELETE /settings/logo endpoints.
}

// SettingsResponse is the external representation of the Settings document.
type SettingsResponse struct {
	ID          string `json:"id"`
	StoreID     string `json:"store_id"`
	StoreName   string `json:"store_name"`
	StoreTagline string `json:"store_tagline,omitempty"`
	StoreAddress string `json:"store_address,omitempty"`
	StorePhone  string `json:"store_phone,omitempty"`
	StoreEmail  string `json:"store_email,omitempty"`

	Currency      string  `json:"currency"`
	DefaultTaxPct float64 `json:"default_tax_pct"`

	LowStockThreshold int     `json:"low_stock_threshold"`
	CreditCeiling     float64 `json:"credit_ceiling"`

	BillHeaderText string `json:"bill_header_text,omitempty"`
	BillFooterText string `json:"bill_footer_text,omitempty"`
	ReceiptFooter  string `json:"receipt_footer,omitempty"`

	// LogoBase64 is a data URL string ("data:image/...;base64,...").
	// Omitted from JSON when no logo is configured.
	LogoBase64 string `json:"logo_base64,omitempty"`

	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
