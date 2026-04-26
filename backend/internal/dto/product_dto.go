package dto

// ── Product ───────────────────────────────────────────────────────────────────

// VariantRequest is the RAM/storage spec embedded in create/update requests.
type VariantRequest struct {
	RAM     string `json:"ram"     validate:"required,min=1,max=20"`
	Storage string `json:"storage" validate:"required,min=1,max=20"`
}

// AccessoriesRequest captures which box accessories are included.
// All fields optional (default false).
type AccessoriesRequest struct {
	HasCharger   bool `json:"has_charger"`
	HasEarphones bool `json:"has_earphones"`
	HasCable     bool `json:"has_cable"`
	HasBox       bool `json:"has_box"`
}

// CreateProductRequest is the body of POST /api/v1/products
type CreateProductRequest struct {
	BrandID     string             `json:"brand_id"    validate:"required,objectid"`
	ModelName   string             `json:"model_name"  validate:"required,min=1,max=200"`
	Variant     VariantRequest     `json:"variant"     validate:"required"`
	Color       string             `json:"color"       validate:"required,min=1,max=50"`
	ScreenSize  string             `json:"screen_size" validate:"omitempty,max=20"`
	Barcode     string             `json:"barcode"     validate:"required,min=1,max=100"`
	BarcodeType string             `json:"barcode_type" validate:"omitempty,oneof=EAN-13 UPC-A CODE-128 CODE-39 QR AUTO"`
	Accessories AccessoriesRequest `json:"accessories"`
	Images      []string           `json:"images"      validate:"omitempty,max=3"`
}

// UpdateProductRequest is the body of PUT /api/v1/products/:id
// All fields optional — only non-zero values trigger an update.
// Images: if provided (even as []), replaces the stored image list.
type UpdateProductRequest struct {
	BrandID     string              `json:"brand_id"     validate:"omitempty,objectid"`
	ModelName   string              `json:"model_name"   validate:"omitempty,min=1,max=200"`
	Variant     *VariantRequest     `json:"variant"      validate:"omitempty"`
	Color       string              `json:"color"        validate:"omitempty,min=1,max=50"`
	ScreenSize  string              `json:"screen_size"  validate:"omitempty,max=20"`
	Barcode     string              `json:"barcode"      validate:"omitempty,min=1,max=100"`
	BarcodeType string              `json:"barcode_type" validate:"omitempty,oneof=EAN-13 UPC-A CODE-128 CODE-39 QR AUTO"`
	Accessories *AccessoriesRequest `json:"accessories"  validate:"omitempty"`
	Images      *[]string           `json:"images"       validate:"omitempty,max=3"`
}

// ProductFilter carries query-string filters for the product list endpoint.
type ProductFilter struct {
	BrandID string // raw hex string from ?brand_id=
	Search  string // ?search= matches model_name and barcode (case-insensitive regex)
}

// ProductResponse is the full product shape returned to clients.
type ProductResponse struct {
	ID          string             `json:"id"`
	BrandID     string             `json:"brand_id"`
	BrandName   string             `json:"brand_name"`
	ModelName   string             `json:"model_name"`
	DisplayName string             `json:"display_name"`
	Variant     VariantRequest     `json:"variant"`
	Color       string             `json:"color"`
	ScreenSize  string             `json:"screen_size,omitempty"`
	Barcode     string             `json:"barcode"`
	BarcodeType string             `json:"barcode_type"` // e.g. "EAN-13", "QR", "AUTO"
	Accessories AccessoriesRequest `json:"accessories"`
	Images      []string           `json:"images,omitempty"` // up to 3 product photo URLs
	CreatedAt   string             `json:"created_at"`
	UpdatedAt   string             `json:"updated_at"`
}

// BarcodeNotFoundResponse is returned when a barcode scan finds no product.
// The client uses create_suggested=true to know it should show a creation form
// pre-filled with the scanned barcode.
type BarcodeNotFoundResponse struct {
	Found           bool   `json:"found"`
	Barcode         string `json:"barcode"`
	CreateSuggested bool   `json:"create_suggested"`
	Message         string `json:"message"`
}
