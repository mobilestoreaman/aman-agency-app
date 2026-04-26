package dto

// CreateBorrowLendRequest opens a new borrow or lend transaction.
//
// DeviceID is optional — provide it to link the transaction to an inventory
// device (the device status is NOT mutated; this is a tracking record only).
// DeviceDesc is always required so the record is self-contained.
//
// CustomerID is optional — provide it to link the transaction to a known
// customer record; CustomerName is then denormalised server-side.
type CreateBorrowLendRequest struct {
	Type               string `json:"type"                 validate:"required,oneof=borrow lend"`
	DeviceID           string `json:"device_id"`            // optional ObjectID
	DeviceDesc         string `json:"device_desc"          validate:"required"`
	PartyName          string `json:"party_name"           validate:"required"`
	PartyPhone         string `json:"party_phone"`
	CustomerID         string `json:"customer_id"`          // optional ObjectID
	BorrowDate         string `json:"borrow_date"          validate:"omitempty,ddmmyyyy"` // DD-MM-YYYY IST; defaults to today
	ExpectedReturnDate string `json:"expected_return_date" validate:"omitempty,ddmmyyyy"` // optional expected return date DD-MM-YYYY IST
	Notes              string `json:"notes"`
}

// UpdateBorrowLendRequest patches mutable fields on an active transaction.
// All fields are optional; only non-empty values are applied.
type UpdateBorrowLendRequest struct {
	DeviceDesc         string `json:"device_desc"`
	PartyName          string `json:"party_name"`
	PartyPhone         string `json:"party_phone"`
	ExpectedReturnDate string `json:"expected_return_date"` // DD-MM-YYYY IST or empty to clear
	Notes              string `json:"notes"`
}

// ReturnBorrowLendRequest marks the device as returned.
// ResolutionType indicates whether the device was physically returned ("device")
// or the party paid a settlement amount instead ("payment").
type ReturnBorrowLendRequest struct {
	ResolutionType   string  `json:"resolution_type"   validate:"omitempty,oneof=device payment"`
	SettlementAmount float64 `json:"settlement_amount" validate:"omitempty,gte=0"`
	Notes            string  `json:"notes"`
}

// BorrowLendFilter controls the GET /borrow-lends list query.
type BorrowLendFilter struct {
	Type       string `query:"type"`        // borrow|lend
	Status     string `query:"status"`      // active|returned|overdue
	CustomerID string `query:"customer_id"` // filter by linked customer
	Search     string `query:"search"`      // regex on party_name or device_desc
	FromDate   string `query:"from_date"`   // YYYY-MM-DD filter on borrowed_at
	ToDate     string `query:"to_date"`     // YYYY-MM-DD filter on borrowed_at
	Page       int    `query:"page"`
	Limit      int    `query:"limit"`
}

// BorrowLendResponse is the API representation of a BorrowLend document.
type BorrowLendResponse struct {
	ID                 string  `json:"id"`
	Type               string  `json:"type"`
	DeviceID           string  `json:"device_id,omitempty"`
	DeviceDesc         string  `json:"device_desc"`
	PartyName          string  `json:"party_name"`
	PartyPhone         string  `json:"party_phone,omitempty"`
	CustomerID         string  `json:"customer_id,omitempty"`
	CustomerName       string  `json:"customer_name,omitempty"`
	BorrowDate         string  `json:"borrow_date"`
	ExpectedReturnDate string  `json:"expected_return_date,omitempty"`
	ActualReturnDate   string  `json:"actual_return_date,omitempty"`
	ResolutionType     string  `json:"resolution_type,omitempty"`
	SettlementAmount   float64 `json:"settlement_amount,omitempty"`
	Status             string  `json:"status"`
	Notes              string  `json:"notes,omitempty"`
	CreatedBy          string  `json:"created_by"`
	CreatedAt          string  `json:"created_at"`
	UpdatedAt          string  `json:"updated_at"`
}
