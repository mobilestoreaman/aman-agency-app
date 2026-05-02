package dto

// SaleItemRequest is one line in a sale — one device being sold.
type SaleItemRequest struct {
	DeviceID  string  `json:"device_id"  validate:"required,objectid"`
	SalePrice float64 `json:"sale_price" validate:"required,gt=0,max=10000000"`
}

// CreateSaleRequest is the body for POST /api/v1/sales.
type CreateSaleRequest struct {
	CustomerID  string            `json:"customer_id"   validate:"required,objectid"`
	Items       []SaleItemRequest `json:"items"         validate:"required,min=1,max=100,dive"`
	AmountPaid  float64           `json:"amount_paid"   validate:"min=0,max=10000000"`
	PaymentMode string            `json:"payment_mode"  validate:"omitempty,oneof=cash upi card bank_transfer credit"`
	Notes       string            `json:"notes"         validate:"omitempty,max=500"`
	SoldAt      string            `json:"sold_at"       validate:"omitempty"` // ISO 8601; defaults to now
}

// CancelSaleRequest optionally carries a cancellation note.
type CancelSaleRequest struct {
	Notes string `json:"notes" validate:"omitempty,max=500"`
}

// SaleItemResponse is one line in a sale response.
type SaleItemResponse struct {
	DeviceID      string  `json:"device_id"`
	ProductName   string  `json:"product_name"`
	BrandName     string  `json:"brand_name"`
	IMEI1         string  `json:"imei1"`
	IMEI2         string  `json:"imei2,omitempty"`
	SalePrice     float64 `json:"sale_price"`
	PurchasePrice float64 `json:"purchase_price"` // exposed so UI can show margin
}

// SaleResponse is the JSON shape returned on every sale endpoint.
type SaleResponse struct {
	ID            string             `json:"id"`
	InvoiceNumber string             `json:"invoice_number"`
	CustomerID    string             `json:"customer_id"`
	CustomerName  string             `json:"customer_name"`
	CustomerPhone string             `json:"customer_phone"`
	StaffID       string             `json:"staff_id"`
	StaffName     string             `json:"staff_name"`
	Items         []SaleItemResponse `json:"items"`
	TotalAmount   float64            `json:"total_amount"`
	AmountPaid    float64            `json:"amount_paid"`
	Balance       float64            `json:"balance"`
	PaymentMode   string             `json:"payment_mode,omitempty"`
	Status        string             `json:"status"`
	Notes         string             `json:"notes,omitempty"`
	SoldAt        string             `json:"sold_at"`
	CancelledAt   string             `json:"cancelled_at,omitempty"`
	CreatedAt     string             `json:"created_at"`
	UpdatedAt     string             `json:"updated_at"`
}

// SaleFilter holds query-string parameters for listing sales.
type SaleFilter struct {
	CustomerID string
	StaffID    string
	Status     string
	Search     string // regex on invoice_number or customer_name
	FromDate   string // DD-MM-YYYY IST — inclusive lower bound on sold_at
	ToDate     string // DD-MM-YYYY IST — inclusive upper bound on sold_at
	Page       int
	Limit      int
}
