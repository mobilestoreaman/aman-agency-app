package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// DefaultStoreID is the fixed singleton key stored in the store_id field.
// There is exactly one Settings document per deployment.
const DefaultStoreID = "default"

// Settings holds store-wide configuration. It is a singleton document
// (store_id == DefaultStoreID) updated via FindOneAndUpdate with upsert.
// Fields here are consumed by other services:
//   - LowStockThreshold  → NotificationService fires low_stock alerts
//   - CreditCeiling      → NotificationService fires credit_due alerts
//   - DefaultTaxPct      → BillService uses as the default tax rate
//   - Currency           → displayed on bills and reports
type Settings struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	StoreID     string             `bson:"store_id"      json:"store_id"`      // always "default"
	StoreName   string             `bson:"store_name"    json:"store_name"`
	StoreTagline string            `bson:"store_tagline,omitempty" json:"store_tagline,omitempty"`
	StoreAddress string            `bson:"store_address,omitempty" json:"store_address,omitempty"`
	StorePhone  string             `bson:"store_phone,omitempty"  json:"store_phone,omitempty"`
	StoreEmail  string             `bson:"store_email,omitempty"  json:"store_email,omitempty"`

	// Financial
	Currency      string  `bson:"currency"        json:"currency"`          // e.g. "PKR"
	DefaultTaxPct float64 `bson:"default_tax_pct" json:"default_tax_pct"`   // e.g. 0.17 = 17% GST

	// Alert thresholds (used by notification hooks)
	LowStockThreshold int     `bson:"low_stock_threshold" json:"low_stock_threshold"` // units; 0 = disabled
	CreditCeiling     float64 `bson:"credit_ceiling"      json:"credit_ceiling"`      // PKR; 0 = disabled

	// Document customisation
	BillHeaderText  string `bson:"bill_header_text,omitempty"  json:"bill_header_text,omitempty"`
	BillFooterText  string `bson:"bill_footer_text,omitempty"  json:"bill_footer_text,omitempty"`
	ReceiptFooter   string `bson:"receipt_footer,omitempty"    json:"receipt_footer,omitempty"`

	// Store logo stored as a base64-encoded data URL (e.g. "data:image/png;base64,...").
	// Empty string means no logo — all callers must treat empty as "not set".
	LogoBase64 string `bson:"logo_base64,omitempty" json:"logo_base64,omitempty"`

	UpdatedBy string    `bson:"updated_by" json:"updated_by"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}
