package dto

// CreateDeviceRequest is the body for POST /api/v1/devices.
type CreateDeviceRequest struct {
	ProductID     string  `json:"product_id"     validate:"required,objectid"`
	IMEI1         string  `json:"imei1"          validate:"required,min=14,max=16"`
	IMEI2         string  `json:"imei2"          validate:"omitempty,min=14,max=16"`
	Condition     string  `json:"condition"      validate:"omitempty,oneof=new used refurbished"`
	Color         string  `json:"color"          validate:"omitempty,max=50"`
	Storage       string  `json:"storage"        validate:"omitempty,max=20"`
	PurchasePrice float64 `json:"purchase_price" validate:"required,min=0,max=10000000"`
	SellingPrice  float64 `json:"selling_price"  validate:"required,min=0,max=10000000"`
	Notes         string  `json:"notes"          validate:"omitempty,max=500"`
}

// UpdateDeviceRequest is the body for PUT /api/v1/devices/:id.
// All fields are optional — only non-zero values are applied.
type UpdateDeviceRequest struct {
	ProductID     string  `json:"product_id"     validate:"omitempty,objectid"`
	IMEI1         string  `json:"imei1"          validate:"omitempty,min=14,max=16"`
	IMEI2         string  `json:"imei2"          validate:"omitempty,min=14,max=16"`
	Condition     string  `json:"condition"      validate:"omitempty,oneof=new used refurbished"`
	Color         string  `json:"color"          validate:"omitempty,max=50"`
	Storage       string  `json:"storage"        validate:"omitempty,max=20"`
	PurchasePrice float64 `json:"purchase_price" validate:"omitempty,min=0,max=10000000"`
	SellingPrice  float64 `json:"selling_price"  validate:"omitempty,min=0,max=10000000"`
	Notes         string  `json:"notes"          validate:"omitempty,max=500"`
}

// ChangeStatusRequest is the body for PATCH /api/v1/devices/:id/status.
type ChangeStatusRequest struct {
	Status string `json:"status" validate:"required,oneof=available sold repair returned defective"`
	Notes  string `json:"notes"  validate:"omitempty,max=500"`
}

// DeviceResponse is the JSON shape returned on every device endpoint.
type DeviceResponse struct {
	ID            string  `json:"id"`
	ProductID     string  `json:"product_id"`
	ProductName   string  `json:"product_name"`
	BrandName     string  `json:"brand_name"`
	IMEI1         string  `json:"imei1"`
	IMEI2         string  `json:"imei2,omitempty"`
	Status        string  `json:"status"`
	Condition     string  `json:"condition"`
	Color         string  `json:"color,omitempty"`
	Storage       string  `json:"storage,omitempty"`
	PurchasePrice float64 `json:"purchase_price"`
	SellingPrice  float64 `json:"selling_price"`
	Notes         string  `json:"notes,omitempty"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

// DeviceFilter holds query-string parameters for listing devices.
type DeviceFilter struct {
	ProductID          string
	Status             string
	Condition          string
	Search             string // IMEI prefix or product name substring
	Page               int
	Limit              int
	SortAvailableFirst bool // when true, sort available devices first then by created_at desc
}

// ── Stock summary ─────────────────────────────────────────────────────────────

// ProductStockRow is one product's row in the stock summary.
type ProductStockRow struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	BrandName   string `json:"brand_name"`
	InStock     int64  `json:"in_stock"`
	Sold        int64  `json:"sold"`
	Repair      int64  `json:"repair"`
	Returned    int64  `json:"returned"`
	Defective   int64  `json:"defective"`
	Total       int64  `json:"total"`
}

// StockSummaryResponse wraps the full stock aggregation result.
type StockSummaryResponse struct {
	Rows         []ProductStockRow `json:"rows"`
	TotalInStock int64             `json:"total_in_stock"`
	TotalUnits   int64             `json:"total_units"`
}
