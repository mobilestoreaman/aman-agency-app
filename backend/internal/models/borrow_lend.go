package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// BorrowLendType distinguishes the direction of the transaction from the store's
// perspective.
type BorrowLendType string

const (
	// BorrowLendTypeBorrow means the store has borrowed a device from an external
	// party (e.g. a vendor demo unit or a customer's device for repair evaluation).
	BorrowLendTypeBorrow BorrowLendType = "borrow"

	// BorrowLendTypeLend means the store has lent one of its own devices to an
	// external party (e.g. a loaner handset while a customer's device is being
	// repaired, or a trial unit given to a potential buyer).
	BorrowLendTypeLend BorrowLendType = "lend"
)

// BorrowLendStatus tracks the lifecycle of the borrow/lend transaction.
type BorrowLendStatus string

const (
	BorrowLendStatusActive   BorrowLendStatus = "active"   // device is currently out
	BorrowLendStatusReturned BorrowLendStatus = "returned" // device has been returned
	BorrowLendStatusOverdue  BorrowLendStatus = "overdue"  // past the expected return date
)

// BorrowLend records a single borrow or lend transaction involving a physical
// handset. The DeviceID optionally links to an inventory Device document;
// DeviceDesc is always stored so the record remains self-contained even when
// the device is later sold or removed.
//
// PartyName / PartyPhone identify the external party (vendor, customer, or
// any individual). CustomerID optionally links to a Customer document and its
// CustomerName is denormalised for fast display.
//
// ResolutionType / SettlementAmount record how a returned entry was closed:
// "device" means the physical device was returned; "payment" means the party
// paid a settlement amount instead of returning the device.
type BorrowLend struct {
	ID               primitive.ObjectID  `bson:"_id,omitempty"             json:"id"`
	Type             BorrowLendType      `bson:"type"                      json:"type"`
	DeviceID         *primitive.ObjectID `bson:"device_id,omitempty"       json:"device_id,omitempty"`
	DeviceDesc       string              `bson:"device_desc"               json:"device_desc"`   // e.g. "Samsung Galaxy S21 – IMEI: 352099001761481"
	PartyName        string              `bson:"party_name"                json:"party_name"`
	PartyPhone       string              `bson:"party_phone"               json:"party_phone"`
	CustomerID       *primitive.ObjectID `bson:"customer_id,omitempty"     json:"customer_id,omitempty"`
	CustomerName     string              `bson:"customer_name,omitempty"   json:"customer_name,omitempty"` // denormalised
	BorrowedAt       time.Time           `bson:"borrowed_at"               json:"borrowed_at"`
	DueAt            *time.Time          `bson:"due_at,omitempty"          json:"due_at,omitempty"`
	ReturnedAt       *time.Time          `bson:"returned_at,omitempty"     json:"returned_at,omitempty"`
	ResolutionType   string              `bson:"resolution_type,omitempty" json:"resolution_type,omitempty"` // "device" | "payment"
	SettlementAmount float64             `bson:"settlement_amount,omitempty" json:"settlement_amount,omitempty"`
	Status           BorrowLendStatus    `bson:"status"                    json:"status"`
	Notes            string              `bson:"notes,omitempty"           json:"notes,omitempty"`
	CreatedBy        string              `bson:"created_by"                json:"created_by"`
	CreatedAt        time.Time           `bson:"created_at"                json:"created_at"`
	UpdatedAt        time.Time           `bson:"updated_at"                json:"updated_at"`
}
