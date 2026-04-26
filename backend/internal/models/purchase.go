package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// PurchaseStatus tracks the lifecycle of a purchase order.
type PurchaseStatus string

const (
	PurchaseStatusPending   PurchaseStatus = "pending"
	PurchaseStatusReceived  PurchaseStatus = "received"
	PurchaseStatusCancelled PurchaseStatus = "cancelled"
)

// PurchaseItem is one line in a purchase order — a single physical device unit
// to be received into inventory.
//
// DeviceID is nil until the purchase is received; at that point a Device
// document is created and the ID is stored back here for traceability.
type PurchaseItem struct {
	ProductID     primitive.ObjectID  `bson:"product_id"           json:"product_id"`
	ProductName   string              `bson:"product_name"         json:"product_name"`   // denormalized
	BrandName     string              `bson:"brand_name"           json:"brand_name"`      // denormalized
	IMEI1         string              `bson:"imei1"                json:"imei1"`
	IMEI2         string              `bson:"imei2,omitempty"      json:"imei2,omitempty"`
	Condition     DeviceCondition     `bson:"condition"            json:"condition"`
	Color         string              `bson:"color,omitempty"      json:"color,omitempty"`
	PurchasePrice float64             `bson:"purchase_price"       json:"purchase_price"`  // cost price (PKR)
	SellingPrice  float64             `bson:"selling_price"        json:"selling_price"`   // intended retail price
	Storage       string              `bson:"storage,omitempty"    json:"storage,omitempty"`
	DeviceID      *primitive.ObjectID `bson:"device_id,omitempty"  json:"device_id,omitempty"` // set on receive
}

// Purchase represents a purchase order from a vendor containing one or more
// device units. On receipt, each item is materialised as a Device document
// in the inventory.
//
// TotalCost is denormalized (sum of item purchase prices) so list views never
// need to re-sum embedded arrays.
type Purchase struct {
	ID          primitive.ObjectID `bson:"_id,omitempty"        json:"id"`
	VendorID    primitive.ObjectID `bson:"vendor_id"            json:"vendor_id"`
	VendorName  string             `bson:"vendor_name"          json:"vendor_name"`  // denormalized
	Items       []PurchaseItem     `bson:"items"                json:"items"`
	Status      PurchaseStatus     `bson:"status"               json:"status"`
	TotalCost   float64            `bson:"total_cost"           json:"total_cost"`   // denormalized sum
	Notes       string             `bson:"notes,omitempty"      json:"notes,omitempty"`
	PurchasedAt time.Time          `bson:"purchased_at"         json:"purchased_at"`
	ReceivedAt  *time.Time         `bson:"received_at,omitempty" json:"received_at,omitempty"`
	CreatedAt   time.Time          `bson:"created_at"           json:"created_at"`
	UpdatedAt   time.Time          `bson:"updated_at"           json:"updated_at"`
}
