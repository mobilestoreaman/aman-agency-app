package dto

// RecordVendorPaymentRequest records a cash payment made to a vendor,
// reducing the outstanding payable balance.
// Amount must be positive; the service stores it as a negative ledger entry.
// Max 10,000,000 to prevent data-entry errors.
// PurchaseID is optional: when provided the payment is linked to a specific purchase.
type RecordVendorPaymentRequest struct {
	Amount     float64 `json:"amount"      validate:"required,gt=0,max=10000000"`
	Notes      string  `json:"notes"       validate:"omitempty,max=500"`
	PurchaseID string  `json:"purchase_id" validate:"omitempty,len=24"`
}

// RecordVendorAdjustmentRequest is an admin-only manual balance correction.
//   - Amount > 0 → increases the payable (business owes vendor more)
//   - Amount < 0 → reduces the payable (credit / discount from vendor)
//
// Notes are required for audit trail.
type RecordVendorAdjustmentRequest struct {
	Amount float64 `json:"amount" validate:"required,min=-10000000,max=10000000"`
	Notes  string  `json:"notes"  validate:"required,max=500"`
}

// RecordVendorOpeningBalanceRequest sets an initial payable balance for a vendor
// that was owed money before the system was set up (migration / onboarding).
// Amount must be positive — it represents existing debt owed to the vendor.
// Notes are required to document the source of the opening figure.
type RecordVendorOpeningBalanceRequest struct {
	Amount float64 `json:"amount" validate:"required,gt=0,max=10000000"`
	Notes  string  `json:"notes"  validate:"required,max=500"`
}

// VendorLedgerFilter controls the GET /vendors/:id/ledger query.
type VendorLedgerFilter struct {
	Type  string `query:"type"`  // optional: purchase|payment|adjustment|reversal
	Page  int    `query:"page"`
	Limit int    `query:"limit"`
}

// GlobalVendorLedgerFilter controls the GET /vendor-ledger global listing.
type GlobalVendorLedgerFilter struct {
	VendorID string `query:"vendor_id"` // optional ObjectID hex
	Type     string `query:"type"`      // optional: purchase|payment|adjustment|reversal
	FromDate string `query:"from_date"` // optional DD-MM-YYYY
	ToDate   string `query:"to_date"`   // optional DD-MM-YYYY
	Search   string `query:"search"`    // regex on vendor_name or reference
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
}

// VendorAgingBucket represents outstanding payables aged into a time bucket.
type VendorAgingBucket struct {
	Label       string  `json:"label"`        // "0-30 days" | "31-60 days" | "60+ days"
	VendorCount int64   `json:"vendor_count"`
	TotalOwed   float64 `json:"total_owed"`
}

// VendorAgingEntry is one vendor's outstanding balance with its age bucket.
type VendorAgingEntry struct {
	VendorID   string  `json:"vendor_id"`
	VendorName string  `json:"vendor_name"`
	Balance    float64 `json:"balance"`
	AgeDays    int64   `json:"age_days"`
	Bucket     string  `json:"bucket"`
}

// VendorAgingResponse is the payload for GET /vendor-ledger/aging.
type VendorAgingResponse struct {
	AsOf    string              `json:"as_of"`
	Buckets []VendorAgingBucket `json:"buckets"`
	Vendors []VendorAgingEntry  `json:"vendors"`
}

// VendorLedgerResponse is the API representation of a single vendor ledger entry.
type VendorLedgerResponse struct {
	ID           string  `json:"id"`
	VendorID     string  `json:"vendor_id"`
	VendorName   string  `json:"vendor_name"`
	Type         string  `json:"type"`
	Amount       float64 `json:"amount"`
	BalanceAfter float64 `json:"balance_after"`
	Reference    string  `json:"reference,omitempty"`
	PurchaseID   string  `json:"purchase_id,omitempty"`
	Notes        string  `json:"notes,omitempty"`
	CreatedBy    string  `json:"created_by"`
	CreatedAt    string  `json:"created_at"`
}
