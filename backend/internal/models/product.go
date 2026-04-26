package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// BarcodeType identifies the symbology of a product's barcode.
// The frontend scanner uses this to prioritise which format to try first,
// reducing scan latency on known catalogue entries.
type BarcodeType string

const (
	BarcodeEAN13   BarcodeType = "EAN-13"   // standard retail barcode (13 digits)
	BarcodeUPCA    BarcodeType = "UPC-A"    // US retail barcode (12 digits)
	BarcodeCode128 BarcodeType = "CODE-128" // high-density alphanumeric
	BarcodeCode39  BarcodeType = "CODE-39"  // alphanumeric, common in logistics
	BarcodeQR      BarcodeType = "QR"       // 2-D matrix (box/accessory QR codes)
	BarcodeAuto    BarcodeType = "AUTO"     // scanner detected type automatically
)

// ValidBarcodeTypes is used by the validator `oneof` tag.
var ValidBarcodeTypes = []string{
	string(BarcodeEAN13), string(BarcodeUPCA),
	string(BarcodeCode128), string(BarcodeCode39),
	string(BarcodeQR), string(BarcodeAuto),
}

// Variant describes the RAM / storage configuration of a product SKU.
type Variant struct {
	RAM     string `bson:"ram"     json:"ram"`     // e.g. "8GB"
	Storage string `bson:"storage" json:"storage"` // e.g. "128GB"
}

// Accessories records which in-box items are present with a device.
type Accessories struct {
	HasCharger   bool `bson:"has_charger"   json:"has_charger"`
	HasEarphones bool `bson:"has_earphones" json:"has_earphones"`
	HasCable     bool `bson:"has_cable"     json:"has_cable"`
	HasBox       bool `bson:"has_box"       json:"has_box"`
}

// Product is a catalogue entry representing one SKU (brand + model + variant + colour).
// Multiple Device records (each with a unique IMEI) point to the same Product.
//
// BrandName is denormalized here so list queries never need a $lookup.
type Product struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	BrandID     primitive.ObjectID `bson:"brand_id"      json:"brand_id"`
	BrandName   string             `bson:"brand_name"    json:"brand_name"` // denormalized
	ModelName   string             `bson:"model_name"    json:"model_name"`
	Variant     Variant            `bson:"variant"       json:"variant"`
	Color       string             `bson:"color"         json:"color"`
	ScreenSize  string             `bson:"screen_size"   json:"screen_size,omitempty"`
	Barcode     string             `bson:"barcode"       json:"barcode"`              // unique index
	BarcodeType BarcodeType        `bson:"barcode_type"  json:"barcode_type"`          // symbology hint
	Accessories Accessories        `bson:"accessories"   json:"accessories"`
	Images      []string           `bson:"images,omitempty" json:"images,omitempty"` // up to 3 product photo URLs
	CreatedAt   time.Time          `bson:"created_at"    json:"created_at"`
	UpdatedAt   time.Time          `bson:"updated_at"    json:"updated_at"`
}

// DisplayName returns a human-readable label for the product.
// Example: "Samsung Galaxy S24 Ultra 12GB/256GB Phantom Black"
func (p *Product) DisplayName() string {
	s := p.BrandName + " " + p.ModelName
	if p.Variant.RAM != "" || p.Variant.Storage != "" {
		s += " " + p.Variant.RAM + "/" + p.Variant.Storage
	}
	if p.Color != "" {
		s += " " + p.Color
	}
	return s
}
