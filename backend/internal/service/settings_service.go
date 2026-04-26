package service

import (
	"context"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
)

// SettingsService manages the singleton store configuration document.
type SettingsService interface {
	// Get returns the current settings, auto-creating defaults on first boot.
	Get(ctx context.Context) (*dto.SettingsResponse, error)

	// Update applies the non-zero fields from the request and returns the
	// updated settings. Admin only — enforced at the route level.
	Update(ctx context.Context, staffEmail string, req dto.UpdateSettingsRequest) (*dto.SettingsResponse, error)

	// SetLogo stores a base64-encoded data URL as the store logo.
	// logoBase64 must be a valid data URL (e.g. "data:image/png;base64,...").
	// Admin only — enforced at the route level.
	SetLogo(ctx context.Context, staffEmail string, logoBase64 string) (*dto.SettingsResponse, error)

	// RemoveLogo clears the store logo. Admin only — enforced at the route level.
	RemoveLogo(ctx context.Context, staffEmail string) (*dto.SettingsResponse, error)
}

type settingsService struct {
	repo repository.SettingsRepository
}

// NewSettingsService constructs a SettingsService.
func NewSettingsService(repo repository.SettingsRepository) SettingsService {
	return &settingsService{repo: repo}
}

// ─── Get ─────────────────────────────────────────────────────────────────────

func (s *settingsService) Get(ctx context.Context) (*dto.SettingsResponse, error) {
	settings, err := s.repo.Get(ctx)
	if err != nil {
		return nil, err
	}
	resp := toSettingsResponse(settings)
	return &resp, nil
}

// ─── Update ───────────────────────────────────────────────────────────────────

// Update builds a $set map containing only the fields the caller provided.
// String fields are applied when non-empty so a missing field is a no-op.
// Numeric fields are applied unconditionally — pass the full desired value.
func (s *settingsService) Update(ctx context.Context, staffEmail string, req dto.UpdateSettingsRequest) (*dto.SettingsResponse, error) {
	fields := bson.M{"updated_by": staffEmail}

	if req.StoreName != "" {
		fields["store_name"] = req.StoreName
	}
	if req.StoreTagline != "" {
		fields["store_tagline"] = req.StoreTagline
	}
	if req.StoreAddress != "" {
		fields["store_address"] = req.StoreAddress
	}
	if req.StorePhone != "" {
		fields["store_phone"] = req.StorePhone
	}
	if req.StoreEmail != "" {
		fields["store_email"] = req.StoreEmail
	}
	if req.Currency != "" {
		fields["currency"] = req.Currency
	}
	if req.BillHeaderText != "" {
		fields["bill_header_text"] = req.BillHeaderText
	}
	if req.BillFooterText != "" {
		fields["bill_footer_text"] = req.BillFooterText
	}
	if req.ReceiptFooter != "" {
		fields["receipt_footer"] = req.ReceiptFooter
	}

	// Numeric fields always written — allows zeroing out a threshold.
	fields["default_tax_pct"]     = req.DefaultTaxPct
	fields["low_stock_threshold"] = req.LowStockThreshold
	fields["credit_ceiling"]      = req.CreditCeiling

	settings, err := s.repo.Upsert(ctx, fields)
	if err != nil {
		return nil, err
	}
	resp := toSettingsResponse(settings)
	return &resp, nil
}

// ─── SetLogo ──────────────────────────────────────────────────────────────────

// SetLogo persists a base64-encoded logo data URL to the settings document.
func (s *settingsService) SetLogo(ctx context.Context, staffEmail string, logoBase64 string) (*dto.SettingsResponse, error) {
	settings, err := s.repo.Upsert(ctx, bson.M{
		"logo_base64": logoBase64,
		"updated_by":  staffEmail,
	})
	if err != nil {
		return nil, err
	}
	resp := toSettingsResponse(settings)
	return &resp, nil
}

// ─── RemoveLogo ───────────────────────────────────────────────────────────────

// RemoveLogo clears the logo_base64 field. The $set of an empty string followed
// by the omitempty BSON tag means the field will be stored as "" and will be
// treated as "not set" by all consumers.
func (s *settingsService) RemoveLogo(ctx context.Context, staffEmail string) (*dto.SettingsResponse, error) {
	settings, err := s.repo.Upsert(ctx, bson.M{
		"logo_base64": "",
		"updated_by":  staffEmail,
	})
	if err != nil {
		return nil, err
	}
	resp := toSettingsResponse(settings)
	return &resp, nil
}

// ─── mapping helper ───────────────────────────────────────────────────────────

func toSettingsResponse(s *models.Settings) dto.SettingsResponse {
	return dto.SettingsResponse{
		ID:                s.ID.Hex(),
		StoreID:           s.StoreID,
		StoreName:         s.StoreName,
		StoreTagline:      s.StoreTagline,
		StoreAddress:      s.StoreAddress,
		StorePhone:        s.StorePhone,
		StoreEmail:        s.StoreEmail,
		Currency:          s.Currency,
		DefaultTaxPct:     s.DefaultTaxPct,
		LowStockThreshold: s.LowStockThreshold,
		CreditCeiling:     s.CreditCeiling,
		BillHeaderText:    s.BillHeaderText,
		BillFooterText:    s.BillFooterText,
		ReceiptFooter:     s.ReceiptFooter,
		LogoBase64:        s.LogoBase64,
		UpdatedBy:         s.UpdatedBy,
		CreatedAt:         s.CreatedAt,
		UpdatedAt:         s.UpdatedAt,
	}
}
