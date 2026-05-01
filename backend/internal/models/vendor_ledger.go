package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// VendorLedgerEntryType classifies a vendor payable ledger transaction.
type VendorLedgerEntryType string

const (
	// VendorLedgerEntryPurchase is auto-created when a purchase is received,
	// recording the liability (business owes vendor the purchase cost).
	VendorLedgerEntryPurchase VendorLedgerEntryType = "purchase"
	// VendorLedgerEntryPayment records a cash payment made to a vendor,
	// reducing the outstanding payable balance.
	VendorLedgerEntryPayment VendorLedgerEntryType = "payment"
	// VendorLedgerEntryAdjustment is an admin-initiated manual correction.
	VendorLedgerEntryAdjustment VendorLedgerEntryType = "adjustment"
	// VendorLedgerEntryReversal is auto-created when a received purchase is
	// cancelled, reversing the original purchase liability entry.
	VendorLedgerEntryReversal VendorLedgerEntryType = "reversal"
)

// VendorLedger records a single debit or credit against a vendor's running
// payable balance (what the business owes the vendor).
//
// Sign convention (mirrors CreditLedger but from the payables perspective):
//   - Amount > 0 → debit   (business owes vendor more — e.g. a purchase received)
//   - Amount < 0 → credit  (balance reduced — e.g. payment made or reversal)
//
// BalanceAfter is a snapshot of the vendor's payable_balance immediately
// after this entry was applied, providing an audit trail.
type VendorLedger struct {
	ID          primitive.ObjectID    `bson:"_id,omitempty"        json:"id"`
	VendorID    primitive.ObjectID    `bson:"vendor_id"            json:"vendor_id"`
	VendorName  string                `bson:"vendor_name"          json:"vendor_name"`
	Type        VendorLedgerEntryType `bson:"type"                 json:"type"`
	Amount      float64               `bson:"amount"               json:"amount"`
	BalanceAfter float64              `bson:"balance_after"        json:"balance_after"`
	Reference   string                `bson:"reference,omitempty"  json:"reference,omitempty"` // purchase number or free-text
	PurchaseID  *primitive.ObjectID   `bson:"purchase_id,omitempty" json:"purchase_id,omitempty"`
	Notes       string                `bson:"notes,omitempty"      json:"notes,omitempty"`
	CreatedBy   string                `bson:"created_by"           json:"created_by"` // staff email
	CreatedAt   time.Time             `bson:"created_at"           json:"created_at"`
}
