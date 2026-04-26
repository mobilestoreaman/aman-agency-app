package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ExpenseCategory classifies operational costs.
type ExpenseCategory string

const (
	ExpenseCategoryRent          ExpenseCategory = "rent"
	ExpenseCategorySalary        ExpenseCategory = "salary"
	ExpenseCategoryUtilities     ExpenseCategory = "utilities"
	ExpenseCategoryMaintenance   ExpenseCategory = "maintenance"
	ExpenseCategoryMarketing     ExpenseCategory = "marketing"
	ExpenseCategoryMiscellaneous ExpenseCategory = "miscellaneous"
)

// ValidExpenseCategories is the canonical list used for validation.
var ValidExpenseCategories = []ExpenseCategory{
	ExpenseCategoryRent,
	ExpenseCategorySalary,
	ExpenseCategoryUtilities,
	ExpenseCategoryMaintenance,
	ExpenseCategoryMarketing,
	ExpenseCategoryMiscellaneous,
}

// Expense records a single business operational cost entry.
// Date is stored as UTC midnight of the IST calendar day selected by the user
// (DD-MM-YYYY → parsed in IST → converted to UTC for MongoDB storage).
type Expense struct {
	ID          primitive.ObjectID `bson:"_id,omitempty"       json:"id"`
	Category    ExpenseCategory    `bson:"category"            json:"category"`
	Amount      float64            `bson:"amount"              json:"amount"`       // PKR
	Description string             `bson:"description"         json:"description"`
	Date        time.Time          `bson:"date"                json:"date"`         // IST calendar day stored as UTC
	ReceiptRef  string             `bson:"receipt_ref,omitempty" json:"receipt_ref,omitempty"` // voucher / receipt number
	Notes       string             `bson:"notes,omitempty"     json:"notes,omitempty"`
	CreatedBy   string             `bson:"created_by"          json:"created_by"`
	CreatedAt   time.Time          `bson:"created_at"          json:"created_at"`
	UpdatedAt   time.Time          `bson:"updated_at"          json:"updated_at"`
}
