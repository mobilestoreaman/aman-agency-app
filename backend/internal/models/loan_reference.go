package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// LoanReferenceStatus tracks the lifecycle of a consumer EMI loan.
type LoanReferenceStatus string

const (
	// LoanReferenceStatusActive is set at creation while the loan is being repaid.
	LoanReferenceStatusActive LoanReferenceStatus = "active"
	// LoanReferenceStatusClosed is set when the loan has been fully repaid.
	LoanReferenceStatusClosed LoanReferenceStatus = "closed"
	// LoanReferenceStatusOverdue is set when the customer has missed payments.
	LoanReferenceStatusOverdue LoanReferenceStatus = "overdue"
)

// LoanReference tracks a consumer EMI loan processed through a finance partner
// (e.g. Bajaj Finserv, HDFC Bank, ICICI Bank) for a device sale.
//
// CustomerID is required and links to the Customer who took the loan.
// SaleID is optional and links to a specific sale invoice when known.
// Provider identifies the NBFC / bank that disbursed the loan.
// LoanAccountNumber is the account/reference number issued by the provider.
type LoanReference struct {
	ID                primitive.ObjectID  `bson:"_id,omitempty"              json:"id"`
	CustomerID        primitive.ObjectID  `bson:"customer_id"                json:"customer_id"`
	CustomerName      string              `bson:"customer_name"              json:"customer_name"`   // denormalised
	SaleID            *primitive.ObjectID `bson:"sale_id,omitempty"          json:"sale_id,omitempty"`
	InvoiceNumber     string              `bson:"invoice_number,omitempty"   json:"invoice_number,omitempty"` // denormalised
	// Provider is the canonical slug for the finance company.
	// Full set: bajaj|tata_capital|hdb_financial|home_credit|hdfc|icici|axis|idfc|tvs_credit|other
	Provider           string              `bson:"provider"                    json:"provider"`
	// FinanceCompanyName holds the free-text name entered when Provider == "other".
	FinanceCompanyName string              `bson:"finance_company_name,omitempty" json:"finance_company_name,omitempty"`
	LoanAccountNumber  string              `bson:"loan_account_number"         json:"loan_account_number"`
	LoanAmount        float64             `bson:"loan_amount"                json:"loan_amount"`
	EMIAmount         float64             `bson:"emi_amount,omitempty"       json:"emi_amount,omitempty"`
	TenureMonths      int                 `bson:"tenure_months,omitempty"    json:"tenure_months,omitempty"`
	DisbursedDate     *time.Time          `bson:"disbursed_date,omitempty"   json:"disbursed_date,omitempty"`
	Status            LoanReferenceStatus `bson:"status"                     json:"status"`
	Notes             string              `bson:"notes,omitempty"            json:"notes,omitempty"`
	CreatedBy         string              `bson:"created_by"                 json:"created_by"`
	CreatedAt         time.Time           `bson:"created_at"                 json:"created_at"`
	UpdatedAt         time.Time           `bson:"updated_at"                 json:"updated_at"`
}
