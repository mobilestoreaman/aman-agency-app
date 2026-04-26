package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Customer represents a retail buyer. Phone is the unique natural key
// so walk-in repeat customers can be identified by number alone.
//
// CreditBalance tracks outstanding unpaid amounts from credit sales.
// A positive value means the customer still owes money.
// A zero or negative value means they are fully settled or in credit.
type Customer struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"     json:"id"`
	Name          string             `bson:"name"              json:"name"`
	Phone         string             `bson:"phone"             json:"phone"`
	Address       string             `bson:"address,omitempty" json:"address,omitempty"`
	CreditBalance float64            `bson:"credit_balance"    json:"credit_balance"` // PKR owed
	Notes         string             `bson:"notes,omitempty"   json:"notes,omitempty"`
	CreatedAt     time.Time          `bson:"created_at"        json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at"        json:"updated_at"`
}
