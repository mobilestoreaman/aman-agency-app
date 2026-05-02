package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Vendor represents a supplier from whom devices are purchased.
type Vendor struct {
	ID             primitive.ObjectID `bson:"_id,omitempty"      json:"id"`
	Name           string             `bson:"name"               json:"name"`
	Phone          string             `bson:"phone"              json:"phone"`
	Address        string             `bson:"address,omitempty"  json:"address,omitempty"`
	Notes          string             `bson:"notes,omitempty"    json:"notes,omitempty"`
	// PayableBalance tracks the running total of what the business owes this
	// vendor. Positive = business owes vendor; zero or negative = overpaid.
	PayableBalance float64            `bson:"payable_balance"    json:"payable_balance"`
	// HasLedger is a one-way flag that is set true the first time any ledger
	// entry (purchase, opening balance, adjustment, or payment) is recorded for
	// this vendor. It never resets. Used to gate the "Set opening balance" action
	// — that action is only valid before any financial history exists.
	HasLedger      bool               `bson:"has_ledger"         json:"has_ledger"`
	CreatedAt      time.Time          `bson:"created_at"         json:"created_at"`
	UpdatedAt      time.Time          `bson:"updated_at"         json:"updated_at"`
}
