package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// DeviceStatus is the lifecycle state of a physical handset.
type DeviceStatus string

const (
	DeviceStatusAvailable DeviceStatus = "available"
	DeviceStatusSold      DeviceStatus = "sold"
	DeviceStatusRepair    DeviceStatus = "repair"
	DeviceStatusReturned  DeviceStatus = "returned"
	DeviceStatusDefective DeviceStatus = "defective"

	// DeviceStatusInStock is the legacy value stored in MongoDB by the old seed
	// script. New code always writes "available"; this constant exists so that
	// NormalizeStatus and the transition map can handle old documents gracefully.
	DeviceStatusInStock DeviceStatus = "in_stock"
)

// AllDeviceStatuses is used for validator oneof tags.
var AllDeviceStatuses = []string{
	string(DeviceStatusAvailable),
	string(DeviceStatusSold),
	string(DeviceStatusRepair),
	string(DeviceStatusReturned),
	string(DeviceStatusDefective),
}

// validTransitions defines the allowed status state machine.
// Key = current status; Value = set of statuses it may transition to.
//
//	available / in_stock → sold, repair, defective
//	sold                 → returned
//	repair               → available, defective
//	returned             → available, defective
//	defective            → repair
var validTransitions = map[DeviceStatus]map[DeviceStatus]bool{
	DeviceStatusAvailable: {
		DeviceStatusSold:      true,
		DeviceStatusRepair:    true,
		DeviceStatusDefective: true,
	},
	// Legacy "in_stock" value: same allowed transitions as "available".
	DeviceStatusInStock: {
		DeviceStatusSold:      true,
		DeviceStatusRepair:    true,
		DeviceStatusDefective: true,
		DeviceStatusAvailable: true, // allow migration transition in_stock → available
	},
	DeviceStatusSold: {
		DeviceStatusReturned: true,
	},
	DeviceStatusRepair: {
		DeviceStatusAvailable: true,
		DeviceStatusDefective: true,
	},
	DeviceStatusReturned: {
		DeviceStatusAvailable: true,
		DeviceStatusDefective: true,
	},
	DeviceStatusDefective: {
		DeviceStatusRepair: true,
	},
}

// NormalizeStatus maps the legacy "in_stock" value to "available" so that
// business-logic comparisons always work against the canonical status set.
func NormalizeStatus(s DeviceStatus) DeviceStatus {
	if s == DeviceStatusInStock {
		return DeviceStatusAvailable
	}
	return s
}

// CanTransition reports whether moving from `from` to `to` is allowed.
// It normalises the `from` value so legacy "in_stock" documents work correctly.
func CanTransition(from, to DeviceStatus) bool {
	return validTransitions[from][to]
}

// DeviceCondition describes the physical condition at intake.
type DeviceCondition string

const (
	ConditionNew         DeviceCondition = "new"
	ConditionUsed        DeviceCondition = "used"
	ConditionRefurbished DeviceCondition = "refurbished"
)

// Device represents a single physical handset unit tracked by IMEI.
//
// IMEI1 is mandatory and unique across the collection.
// IMEI2 is optional (dual-SIM devices).
// ProductName and BrandName are denormalized from the linked Product/Brand
// so list queries never need a $lookup.
type Device struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"        json:"id"`
	ProductID     primitive.ObjectID `bson:"product_id"           json:"product_id"`
	ProductName   string             `bson:"product_name"         json:"product_name"`   // denormalized
	BrandName     string             `bson:"brand_name"           json:"brand_name"`      // denormalized
	IMEI1         string             `bson:"imei1"                json:"imei1"`
	IMEI2         string             `bson:"imei2,omitempty"      json:"imei2,omitempty"`
	Status        DeviceStatus       `bson:"status"               json:"status"`
	Condition     DeviceCondition    `bson:"condition"            json:"condition"`
	Color         string             `bson:"color,omitempty"      json:"color,omitempty"`
	Storage       string             `bson:"storage,omitempty"    json:"storage,omitempty"`    // e.g. "128GB", "256GB"
	PurchasePrice float64            `bson:"purchase_price"       json:"purchase_price"`  // cost price
	SellingPrice  float64            `bson:"selling_price"        json:"selling_price"`   // suggested retail price
	Notes         string             `bson:"notes,omitempty"      json:"notes,omitempty"`
	CreatedAt     time.Time          `bson:"created_at"           json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at"           json:"updated_at"`
}
