package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// PromiseStatus tracks the lifecycle of a payment promise.
type PromiseStatus string

const (
	// PromiseStatusPending — promise is active and the date has not passed.
	PromiseStatusPending PromiseStatus = "pending"

	// PromiseStatusPaid — the customer settled the promised amount.
	PromiseStatusPaid PromiseStatus = "paid"

	// PromiseStatusRescheduled — customer asked to move the date; a new promise replaces this one.
	PromiseStatusRescheduled PromiseStatus = "rescheduled"

	// PromiseStatusBroken — promise date passed without payment or rescheduling.
	PromiseStatusBroken PromiseStatus = "broken"
)

// PaymentPromise records a customer's commitment to pay on a specific date.
// Created when a sale has an outstanding balance, or when a prior promise is rescheduled.
type PaymentPromise struct {
	ID             primitive.ObjectID  `bson:"_id,omitempty"            json:"id"`
	CustomerID     primitive.ObjectID  `bson:"customer_id"              json:"customer_id"`
	CustomerName   string              `bson:"customer_name"            json:"customer_name"`
	CustomerPhone  string              `bson:"customer_phone"           json:"customer_phone"`
	SaleID         *primitive.ObjectID `bson:"sale_id,omitempty"        json:"sale_id,omitempty"`
	InvoiceNumber  string              `bson:"invoice_number,omitempty" json:"invoice_number,omitempty"`
	AmountPromised float64             `bson:"amount_promised"          json:"amount_promised"`
	PromisedDate   time.Time           `bson:"promised_date"            json:"promised_date"`
	Status         PromiseStatus       `bson:"status"                   json:"status"`
	Notes          string              `bson:"notes,omitempty"          json:"notes,omitempty"`
	// Notified is set to true once the due-date reminder notification has been created,
	// preventing duplicate notifications on subsequent worker runs.
	Notified  bool      `bson:"notified"   json:"notified"`
	CreatedBy string    `bson:"created_by" json:"created_by"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}
