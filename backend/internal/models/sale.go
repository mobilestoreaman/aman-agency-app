package models

import (
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// istLocation is Asia/Kolkata (IST, UTC+5:30) used for all date formatting.
var istLocation = mustLoadLocation("Asia/Kolkata")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		// Fall back to a fixed +05:30 offset if the timezone DB is unavailable
		loc = time.FixedZone("IST", 5*60*60+30*60)
	}
	return loc
}

// SaleStatus tracks the lifecycle of a sale invoice.
type SaleStatus string

const (
	SaleStatusCompleted  SaleStatus = "completed"
	SaleStatusCancelled  SaleStatus = "cancelled"
)

// SaleItem is one line in a sale invoice — a single physical device sold.
//
// PurchasePrice is copied from the Device at the time of sale to lock in COGS.
// Margin = SalePrice - PurchasePrice per line.
type SaleItem struct {
	DeviceID      primitive.ObjectID `bson:"device_id"          json:"device_id"`
	ProductName   string             `bson:"product_name"       json:"product_name"`  // denormalized
	BrandName     string             `bson:"brand_name"         json:"brand_name"`     // denormalized
	IMEI1         string             `bson:"imei1"              json:"imei1"`
	IMEI2         string             `bson:"imei2,omitempty"    json:"imei2,omitempty"`
	SalePrice     float64            `bson:"sale_price"         json:"sale_price"`
	PurchasePrice float64            `bson:"purchase_price"     json:"purchase_price"` // locked COGS
}

// PaymentMode identifies how a sale was paid.
type PaymentMode string

const (
	PaymentModeCash         PaymentMode = "cash"
	PaymentModeUPI          PaymentMode = "upi"
	PaymentModeCard         PaymentMode = "card"
	PaymentModeBankTransfer PaymentMode = "bank_transfer"
	PaymentModeCredit       PaymentMode = "credit" // no upfront payment / full balance
	PaymentModeEMI          PaymentMode = "emi"    // financed through a third-party NBFC/bank
)

// Sale represents a completed or cancelled retail transaction.
//
// Balance = TotalAmount - AmountPaid.
//   - Balance > 0  → customer still owes money (credit sale / partial payment)
//   - Balance = 0  → fully paid
//   - Balance < 0  → overpaid (rare, handled via credit note)
//
// InvoiceNumber is unique and human-readable: INV-YYYYMMDD-{oid_prefix}.
type Sale struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"          json:"id"`
	InvoiceNumber string             `bson:"invoice_number"         json:"invoice_number"`
	CustomerID    primitive.ObjectID `bson:"customer_id"            json:"customer_id"`
	CustomerName  string             `bson:"customer_name"          json:"customer_name"`  // denormalized
	CustomerPhone string             `bson:"customer_phone"         json:"customer_phone"` // denormalized
	StaffID       primitive.ObjectID `bson:"staff_id"               json:"staff_id"`
	StaffName     string             `bson:"staff_name"             json:"staff_name"`     // denormalized
	Items         []SaleItem         `bson:"items"                  json:"items"`
	TotalAmount   float64            `bson:"total_amount"           json:"total_amount"`  // sum of sale prices
	AmountPaid    float64            `bson:"amount_paid"            json:"amount_paid"`
	Balance       float64            `bson:"balance"                json:"balance"`       // total_amount - amount_paid
	PaymentMode         PaymentMode `bson:"payment_mode,omitempty"          json:"payment_mode,omitempty"`
	// FinanceProvider and FinanceCompanyName are set only when PaymentMode == "emi".
	// FinanceProvider is the canonical slug (bajaj|tata_capital|…|other).
	// FinanceCompanyName holds the free-text name when FinanceProvider == "other".
	FinanceProvider     string      `bson:"finance_provider,omitempty"      json:"finance_provider,omitempty"`
	FinanceCompanyName  string      `bson:"finance_company_name,omitempty"  json:"finance_company_name,omitempty"`
	Status              SaleStatus  `bson:"status"                          json:"status"`
	Notes         string             `bson:"notes,omitempty"        json:"notes,omitempty"`
	SoldAt        time.Time          `bson:"sold_at"                json:"sold_at"`
	CancelledAt   *time.Time         `bson:"cancelled_at,omitempty" json:"cancelled_at,omitempty"`
	CreatedAt     time.Time          `bson:"created_at"             json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at"             json:"updated_at"`
}

// GenerateInvoiceNumber creates a human-readable invoice number from the
// sale's ObjectID and the current date in IST (Asia/Kolkata).
// Format: INV-DD-MM-YYYY-XXXXXX  (last 6 hex chars of the ObjectID)
func GenerateInvoiceNumber(id primitive.ObjectID) string {
	hex := id.Hex()
	suffix := hex[len(hex)-6:]
	return fmt.Sprintf("INV-%s-%s", time.Now().In(istLocation).Format("02-01-2006"), suffix)
}
