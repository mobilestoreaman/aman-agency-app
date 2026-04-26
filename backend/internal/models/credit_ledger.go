package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// LedgerEntryType classifies a credit ledger transaction.
type LedgerEntryType string

const (
	// LedgerEntrySale is auto-created when a sale has a positive balance (customer credit).
	LedgerEntrySale LedgerEntryType = "sale"
	// LedgerEntryPayment records cash received from a customer against their balance.
	LedgerEntryPayment LedgerEntryType = "payment"
	// LedgerEntryAdjustment is an admin-initiated manual correction.
	LedgerEntryAdjustment LedgerEntryType = "adjustment"
	// LedgerEntryCancellation is auto-created when a credited sale is cancelled,
	// reversing the original debit.
	LedgerEntryCancellation LedgerEntryType = "cancellation"
)

// CreditLedger records a single debit or credit against a customer's running balance.
//
// Sign convention:
//   - Amount > 0 → debit   (customer owes more)
//   - Amount < 0 → credit  (balance reduced — e.g. payment received or reversal)
//
// BalanceAfter is a snapshot of the customer's credit_balance immediately
// after this entry was applied, providing an audit trail.
type CreditLedger struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty"       json:"id"`
	CustomerID   primitive.ObjectID  `bson:"customer_id"         json:"customer_id"`
	CustomerName string              `bson:"customer_name"       json:"customer_name"`
	Type         LedgerEntryType     `bson:"type"                json:"type"`
	Amount       float64             `bson:"amount"              json:"amount"`
	BalanceAfter float64             `bson:"balance_after"       json:"balance_after"`
	Reference    string              `bson:"reference,omitempty" json:"reference,omitempty"` // invoice number or free-text
	SaleID       *primitive.ObjectID `bson:"sale_id,omitempty"   json:"sale_id,omitempty"`
	Notes        string              `bson:"notes,omitempty"     json:"notes,omitempty"`
	CreatedBy    string              `bson:"created_by"          json:"created_by"` // staff email
	CreatedAt    time.Time           `bson:"created_at"          json:"created_at"`
}
