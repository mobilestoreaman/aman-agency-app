package models

import (
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// BillStatus tracks the lifecycle of a formal billing document.
type BillStatus string

const (
	// BillStatusDraft is the initial state — the bill exists but has not been
	// presented to the customer yet.
	BillStatusDraft BillStatus = "draft"
	// BillStatusIssued means the bill has been finalised and handed to the customer.
	BillStatusIssued BillStatus = "issued"
	// BillStatusVoided means the bill has been cancelled (admin only).
	BillStatusVoided BillStatus = "voided"
)

// BillItem is one line on the bill, copied from the originating SaleItem.
// All fields are denormalised so the bill remains accurate even if the device
// or product records are later modified.
type BillItem struct {
	DeviceID      primitive.ObjectID `bson:"device_id"      json:"device_id"`
	ProductName   string             `bson:"product_name"   json:"product_name"`
	BrandName     string             `bson:"brand_name"     json:"brand_name"`
	IMEI1         string             `bson:"imei1"          json:"imei1"`
	IMEI2         string             `bson:"imei2,omitempty" json:"imei2,omitempty"`
	UnitPrice     float64            `bson:"unit_price"     json:"unit_price"`     // agreed sale price
	PurchasePrice float64            `bson:"purchase_price" json:"purchase_price"` // COGS (internal)
}

// Bill is a formal billing document generated from a completed Sale.
// There is at most one Bill per Sale (enforced by unique index on sale_id).
//
// Financial flow:
//
//	Subtotal    = Σ item.UnitPrice
//	Discount    = flat PKR amount off the subtotal
//	Taxable     = Subtotal − Discount
//	Tax         = Taxable × TaxPct
//	TotalAmount = Taxable + Tax
//	Balance     = TotalAmount − AmountPaid
type Bill struct {
	ID            primitive.ObjectID `bson:"_id,omitempty"   json:"id"`
	BillNumber    string             `bson:"invoice_number"  json:"bill_number"` // BILL-DD-MM-YYYY-xxxxxx
	SaleID        primitive.ObjectID `bson:"sale_id"         json:"sale_id"`
	CustomerID    primitive.ObjectID `bson:"customer_id"     json:"customer_id"`
	CustomerName  string             `bson:"customer_name"   json:"customer_name"`  // denormalised
	CustomerPhone string             `bson:"customer_phone"  json:"customer_phone"` // denormalised
	Items         []BillItem         `bson:"items"           json:"items"`
	Subtotal      float64            `bson:"subtotal"        json:"subtotal"`
	Discount      float64            `bson:"discount"        json:"discount"`     // flat PKR deduction
	DiscountPct   float64            `bson:"discount_pct"    json:"discount_pct"` // informational %
	Tax           float64            `bson:"tax"             json:"tax"`          // PKR tax amount
	TaxPct        float64            `bson:"tax_pct"         json:"tax_pct"`      // e.g. 0.17 for 17 % GST
	TotalAmount   float64            `bson:"total_amount"    json:"total_amount"` // after discount + tax
	AmountPaid    float64            `bson:"amount_paid"     json:"amount_paid"`
	Balance       float64            `bson:"balance"         json:"balance"`
	Status        BillStatus         `bson:"status"          json:"status"`
	Notes         string             `bson:"notes,omitempty" json:"notes,omitempty"`
	IssuedAt      *time.Time         `bson:"issued_at,omitempty"  json:"issued_at,omitempty"`
	VoidedAt      *time.Time         `bson:"voided_at,omitempty"  json:"voided_at,omitempty"`
	CreatedBy     string             `bson:"created_by"      json:"created_by"`
	CreatedAt     time.Time          `bson:"created_at"      json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at"      json:"updated_at"`
}

// GenerateBillNumber creates a human-readable bill number from the bill's
// ObjectID and the current date in IST (Asia/Kolkata).
// Format: BILL-DD-MM-YYYY-XXXXXX  (last 6 hex chars of the ObjectID)
func GenerateBillNumber(id primitive.ObjectID) string {
	hex := id.Hex()
	suffix := hex[len(hex)-6:]
	return fmt.Sprintf("BILL-%s-%s", time.Now().In(istLocation).Format("02-01-2006"), suffix)
}
