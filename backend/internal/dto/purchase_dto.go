package dto

// PurchaseItemRequest describes a single device line in a purchase order.
type PurchaseItemRequest struct {
	ProductID     string  `json:"product_id"     validate:"required,objectid"`
	IMEI1         string  `json:"imei1"          validate:"required,len=15"`
	IMEI2         string  `json:"imei2"          validate:"omitempty,len=15"`
	Condition     string  `json:"condition"      validate:"required,oneof=new used refurbished"`
	Color         string  `json:"color"          validate:"omitempty,max=50"`
	Storage       string  `json:"storage"        validate:"omitempty,max=20"`
	PurchasePrice float64 `json:"purchase_price" validate:"required,gt=0,max=10000000"`
	SellingPrice  float64 `json:"selling_price"  validate:"omitempty,gt=0,max=10000000"`
}

// CreatePurchaseRequest is the body for POST /api/v1/purchases.
type CreatePurchaseRequest struct {
	VendorID    string                `json:"vendor_id"    validate:"required,objectid"`
	Items       []PurchaseItemRequest `json:"items"        validate:"required,min=1,max=100,dive"`
	Notes       string                `json:"notes"        validate:"omitempty,max=500"`
	PurchasedAt string                `json:"purchased_at" validate:"omitempty"` // ISO 8601; defaults to now
}

// UpdatePurchaseRequest is the body for PUT /api/v1/purchases/:id.
// Only pending purchases may be updated.
type UpdatePurchaseRequest struct {
	VendorID    string                `json:"vendor_id"    validate:"omitempty,objectid"`
	Items       []PurchaseItemRequest `json:"items"        validate:"omitempty,min=1,max=100,dive"`
	Notes       string                `json:"notes"        validate:"omitempty,max=500"`
	PurchasedAt string                `json:"purchased_at" validate:"omitempty"` // ISO 8601
}

// ReceivePurchaseRequest optionally carries a note for the receive event.
type ReceivePurchaseRequest struct {
	Notes string `json:"notes" validate:"omitempty,max=500"`
}

// PurchaseItemResponse is one line in a purchase response.
type PurchaseItemResponse struct {
	ProductID     string  `json:"product_id"`
	ProductName   string  `json:"product_name"`
	BrandName     string  `json:"brand_name"`
	IMEI1         string  `json:"imei1"`
	IMEI2         string  `json:"imei2,omitempty"`
	Condition     string  `json:"condition"`
	Color         string  `json:"color,omitempty"`
	Storage       string  `json:"storage,omitempty"`
	PurchasePrice float64 `json:"purchase_price"`
	SellingPrice  float64 `json:"selling_price,omitempty"`
	DeviceID      string  `json:"device_id,omitempty"` // populated after receive
}

// PurchaseResponse is the JSON shape returned on every purchase endpoint.
type PurchaseResponse struct {
	ID          string                 `json:"id"`
	VendorID    string                 `json:"vendor_id"`
	VendorName  string                 `json:"vendor_name"`
	Items       []PurchaseItemResponse `json:"items"`
	Status      string                 `json:"status"`
	TotalCost   float64                `json:"total_cost"`
	Notes       string                 `json:"notes,omitempty"`
	PurchasedAt string                 `json:"purchased_at"`
	ReceivedAt  string                 `json:"received_at,omitempty"`
	CreatedAt   string                 `json:"created_at"`
	UpdatedAt   string                 `json:"updated_at"`
}

// PurchaseFilter holds query-string parameters for listing purchases.
type PurchaseFilter struct {
	VendorID string
	Status   string
	Search   string // regex on vendor_name
	FromDate string // DD-MM-YYYY IST — inclusive lower bound on purchased_at
	ToDate   string // DD-MM-YYYY IST — inclusive upper bound on purchased_at
	Page     int
	Limit    int
}
