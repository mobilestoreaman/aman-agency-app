package dto

// CreateBillRequest generates a formal billing document from an existing sale.
//
// Discount is a flat PKR deduction applied to the sale subtotal.
// DiscountPct is stored as metadata only (informational).
// TaxPct is the fractional tax rate, e.g. 0.17 for 17 % GST.
//
// The bill's TotalAmount = (Subtotal − Discount) + (Subtotal − Discount) × TaxPct.
// If both Discount and TaxPct are zero, TotalAmount equals the sale's TotalAmount.
type CreateBillRequest struct {
	SaleID string `json:"sale_id" validate:"required"`
	// CustomBillSuffix is an optional numeric suffix supplied by staff.
	// When set, the bill number becomes BILL-DD-MM-YYYY-<CustomBillSuffix>.
	// Allowed: digits only, 1–8 characters. Empty string → auto-generate.
	CustomBillSuffix string  `json:"custom_bill_suffix" validate:"omitempty,max=8,numeric"`
	Discount         float64 `json:"discount"           validate:"min=0,max=10000000"` // flat INR off
	DiscountPct      float64 `json:"discount_pct"       validate:"min=0,max=100"`       // stored as metadata, 0–100%
	TaxPct           float64 `json:"tax_pct"            validate:"min=0,max=100"`       // e.g. 0.17 for 17%
	Notes            string  `json:"notes"              validate:"omitempty,max=500"`
}

// VoidBillRequest carries an optional reason for voiding a bill (audit trail).
type VoidBillRequest struct {
	Notes string `json:"notes" validate:"omitempty,max=500"`
}

// BillFilter controls the GET /bills list query.
type BillFilter struct {
	CustomerID    string `query:"customer_id"`
	SaleID        string `query:"sale_id"`
	Status        string `query:"status"`         // draft|issued|voided
	Search        string `query:"search"`         // regex on bill_number, customer_name, customer_phone
	CustomerPhone string `query:"customer_phone"` // partial phone match
	FromDate      string `query:"from_date"`      // DD-MM-YYYY filter on created_at
	ToDate        string `query:"to_date"`        // DD-MM-YYYY filter on created_at
	Page          int    `query:"page"`
	Limit         int    `query:"limit"`
}

// BillItemResponse is a single line item on the bill.
type BillItemResponse struct {
	DeviceID      string  `json:"device_id"`
	ProductName   string  `json:"product_name"`
	BrandName     string  `json:"brand_name"`
	IMEI1         string  `json:"imei1"`
	IMEI2         string  `json:"imei2,omitempty"`
	UnitPrice     float64 `json:"unit_price"`
	PurchasePrice float64 `json:"purchase_price"`
}

// BillResponse is the full API representation of a Bill document.
type BillResponse struct {
	ID            string             `json:"id"`
	BillNumber    string             `json:"bill_number"`
	SaleID        string             `json:"sale_id"`
	CustomerID    string             `json:"customer_id"`
	CustomerName  string             `json:"customer_name"`
	CustomerPhone string             `json:"customer_phone"`
	Items         []BillItemResponse `json:"items"`
	Subtotal      float64            `json:"subtotal"`
	Discount      float64            `json:"discount"`
	DiscountPct   float64            `json:"discount_pct"`
	Tax           float64            `json:"tax"`
	TaxPct        float64            `json:"tax_pct"`
	TotalAmount   float64            `json:"total_amount"`
	AmountPaid    float64            `json:"amount_paid"`
	Balance       float64            `json:"balance"`
	Status        string             `json:"status"`
	Notes         string             `json:"notes,omitempty"`
	IssuedAt      string             `json:"issued_at,omitempty"`
	VoidedAt      string             `json:"voided_at,omitempty"`
	CreatedBy     string             `json:"created_by"`
	CreatedAt     string             `json:"created_at"`
	UpdatedAt     string             `json:"updated_at"`
}
