package dto

// ─── Search ───────────────────────────────────────────────────────────────────

// SearchFilter holds the query string and optional type scope.
type SearchFilter struct {
	Q     string `query:"q"`     // required; minimum 2 characters enforced in service
	Types string `query:"types"` // comma-separated subset: customers,products,devices,sales (default: all)
	Limit int    `query:"limit"` // max results per bucket (default 5, max 20)
}

// CustomerSearchResult is a compact customer hit.
type CustomerSearchResult struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
	Email string `json:"email,omitempty"`
}

// ProductSearchResult is a compact product hit.
type ProductSearchResult struct {
	ID        string `json:"id"`
	ModelName string `json:"model_name"`
	BrandName string `json:"brand_name"`
	Barcode   string `json:"barcode,omitempty"`
}

// DeviceSearchResult is a compact device hit (IMEI lookup).
type DeviceSearchResult struct {
	ID          string `json:"id"`
	ProductName string `json:"product_name"`
	BrandName   string `json:"brand_name"`
	IMEI1       string `json:"imei1"`
	IMEI2       string `json:"imei2,omitempty"`
	Status      string `json:"status"`
}

// SaleSearchResult is a compact sale hit (invoice number lookup).
type SaleSearchResult struct {
	ID            string  `json:"id"`
	InvoiceNumber string  `json:"invoice_number"`
	CustomerName  string  `json:"customer_name"`
	TotalAmount   float64 `json:"total_amount"`
	Status        string  `json:"status"`
}

// SearchResponse buckets results by entity type. A nil slice means the type
// was not queried (excluded via the `types` filter).
type SearchResponse struct {
	Query     string                 `json:"query"`
	Customers []CustomerSearchResult `json:"customers,omitempty"`
	Products  []ProductSearchResult  `json:"products,omitempty"`
	Devices   []DeviceSearchResult   `json:"devices,omitempty"`
	Sales     []SaleSearchResult     `json:"sales,omitempty"`
}
