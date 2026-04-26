package dto

// ── Brand ─────────────────────────────────────────────────────────────────────

// CreateBrandRequest is the body of POST /api/v1/brands
type CreateBrandRequest struct {
	Name    string `json:"name"     validate:"required,min=1,max=100"`
	LogoURL string `json:"logo_url" validate:"omitempty,url"`
}

// UpdateBrandRequest is the body of PUT /api/v1/brands/:id
type UpdateBrandRequest struct {
	Name    string `json:"name"     validate:"omitempty,min=1,max=100"`
	LogoURL string `json:"logo_url" validate:"omitempty,url"`
}

// BrandResponse is the shape returned for individual brand reads.
// Identical to the model — kept as a separate type so API shape is
// decoupled from persistence schema if they diverge in future.
type BrandResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	LogoURL   string `json:"logo_url,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}
