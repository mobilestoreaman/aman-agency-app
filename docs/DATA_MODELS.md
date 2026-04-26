# Aman Agency — Data Models

All models stored in MongoDB. Go structs use `bson` tags.
ObjectIDs are used as primary keys. Indexes noted per model.

---

## 1. User

```go
type User struct {
    ID           primitive.ObjectID `bson:"_id,omitempty"`
    Name         string             `bson:"name"`
    Email        string             `bson:"email"`       // unique index
    PasswordHash string             `bson:"password_hash"`
    Role         string             `bson:"role"`        // "admin" | "staff"
    IsActive     bool               `bson:"is_active"`
    CreatedAt    time.Time          `bson:"created_at"`
    UpdatedAt    time.Time          `bson:"updated_at"`
}
```

**Indexes:** `email` (unique)

---

## 2. Brand

```go
type Brand struct {
    ID        primitive.ObjectID `bson:"_id,omitempty"`
    Name      string             `bson:"name"`    // unique index
    LogoURL   string             `bson:"logo_url,omitempty"`
    CreatedAt time.Time          `bson:"created_at"`
    UpdatedAt time.Time          `bson:"updated_at"`
}
```

**Indexes:** `name` (unique)

---

## 3. Product

```go
type Variant struct {
    RAM     string `bson:"ram"`     // e.g. "8GB"
    Storage string `bson:"storage"` // e.g. "128GB"
}

type Accessories struct {
    HasCharger   bool `bson:"has_charger"`
    HasEarphones bool `bson:"has_earphones"`
    HasCable     bool `bson:"has_cable"`
    HasBox       bool `bson:"has_box"`
}

type Product struct {
    ID          primitive.ObjectID `bson:"_id,omitempty"`
    BrandID     primitive.ObjectID `bson:"brand_id"`
    BrandName   string             `bson:"brand_name"` // denormalized for display
    ModelName   string             `bson:"model_name"`
    Variant     Variant            `bson:"variant"`
    Color       string             `bson:"color"`
    ScreenSize  string             `bson:"screen_size"` // e.g. "6.7 inch"
    Barcode     string             `bson:"barcode"`     // unique index
    Accessories Accessories        `bson:"accessories"`
    CreatedAt   time.Time          `bson:"created_at"`
    UpdatedAt   time.Time          `bson:"updated_at"`
}
```

**Indexes:** `barcode` (unique), `brand_id`

---

## 4. Device (Inventory Unit)

```go
type DeviceStatus string

const (
    StatusAvailable DeviceStatus = "available"
    StatusSold      DeviceStatus = "sold"
    StatusBorrowed  DeviceStatus = "borrowed"
    StatusLent      DeviceStatus = "lent"
    StatusReturned  DeviceStatus = "returned"
)

type Device struct {
    ID            primitive.ObjectID `bson:"_id,omitempty"`
    IMEI          string             `bson:"imei"`        // unique index
    ProductID     primitive.ObjectID `bson:"product_id"`
    PurchasePrice float64            `bson:"purchase_price"`
    SellingPrice  float64            `bson:"selling_price"`
    Status        DeviceStatus       `bson:"status"`
    PurchasedAt   time.Time          `bson:"purchased_at"`
    CreatedAt     time.Time          `bson:"created_at"`
    UpdatedAt     time.Time          `bson:"updated_at"`
}
```

**Indexes:** `imei` (unique), `product_id`, `status`

---

## 5. Customer

```go
type Customer struct {
    ID           primitive.ObjectID `bson:"_id,omitempty"`
    Name         string             `bson:"name"`
    Phone        string             `bson:"phone"`   // unique index
    AltPhone     string             `bson:"alt_phone,omitempty"`
    Address      string             `bson:"address,omitempty"`
    CreditBalance float64           `bson:"credit_balance"` // outstanding balance
    CreatedAt    time.Time          `bson:"created_at"`
    UpdatedAt    time.Time          `bson:"updated_at"`
}
```

**Indexes:** `phone` (unique)

---

## 6. Sale

```go
type PaymentType string

const (
    PaymentFull   PaymentType = "full"
    PaymentLoan   PaymentType = "loan"
    PaymentCredit PaymentType = "credit"
)

type SaleItem struct {
    DeviceID  primitive.ObjectID `bson:"device_id"`
    IMEI      string             `bson:"imei"`
    ProductID primitive.ObjectID `bson:"product_id"`
    Price     float64            `bson:"price"`
}

type Sale struct {
    ID              primitive.ObjectID  `bson:"_id,omitempty"`
    InvoiceNumber   string              `bson:"invoice_number"` // unique, auto-generated
    CustomerID      primitive.ObjectID  `bson:"customer_id"`
    Items           []SaleItem          `bson:"items"`
    PaymentType     PaymentType         `bson:"payment_type"`
    TotalAmount     float64             `bson:"total_amount"`
    AmountPaid      float64             `bson:"amount_paid"`
    Balance         float64             `bson:"balance"`      // TotalAmount - AmountPaid
    LoanReferenceID *primitive.ObjectID `bson:"loan_reference_id,omitempty"`
    BillID          *primitive.ObjectID `bson:"bill_id,omitempty"`
    SoldBy          primitive.ObjectID  `bson:"sold_by"`     // User ref
    Notes           string              `bson:"notes,omitempty"`
    CreatedAt       time.Time           `bson:"created_at"`
    UpdatedAt       time.Time           `bson:"updated_at"`
}
```

**Indexes:** `invoice_number` (unique), `customer_id`, `created_at`

---

## 7. Vendor

Replaces the plain `vendor_name` string on Purchase — enables vendor history,
outstanding balance tracking, and purchase analytics per supplier.

```go
type Vendor struct {
    ID             primitive.ObjectID `bson:"_id,omitempty"`
    Name           string             `bson:"name"`
    Phone          string             `bson:"phone"`            // unique index
    AltPhone       string             `bson:"alt_phone,omitempty"`
    Address        string             `bson:"address,omitempty"`
    ContactPerson  string             `bson:"contact_person,omitempty"`
    OutstandingDue float64            `bson:"outstanding_due"`  // running payable balance
    Notes          string             `bson:"notes,omitempty"`
    IsActive       bool               `bson:"is_active"`
    CreatedAt      time.Time          `bson:"created_at"`
    UpdatedAt      time.Time          `bson:"updated_at"`
}
```

**Indexes:** `phone` (unique), `name`

---

## 8. Purchase

```go
type PurchaseItem struct {
    DeviceID      primitive.ObjectID `bson:"device_id"`
    IMEI          string             `bson:"imei"`
    ProductID     primitive.ObjectID `bson:"product_id"`
    PurchasePrice float64            `bson:"purchase_price"`
}

type Purchase struct {
    ID          primitive.ObjectID `bson:"_id,omitempty"`
    VendorID    primitive.ObjectID `bson:"vendor_id"`    // ref to Vendor
    VendorSnap  VendorSnapshot     `bson:"vendor_snap"`  // name+phone snapshot
    Items       []PurchaseItem     `bson:"items"`
    TotalAmount float64            `bson:"total_amount"`
    AmountPaid  float64            `bson:"amount_paid"`
    Balance     float64            `bson:"balance"`      // outstanding to vendor
    PurchasedBy primitive.ObjectID `bson:"purchased_by"`
    Notes       string             `bson:"notes,omitempty"`
    PurchasedAt time.Time          `bson:"purchased_at"`
    CreatedAt   time.Time          `bson:"created_at"`
    UpdatedAt   time.Time          `bson:"updated_at"`
}

type VendorSnapshot struct {
    Name  string `bson:"name"`
    Phone string `bson:"phone"`
}
```

**Indexes:** `vendor_id`, `purchased_at`

---

## 9. Credit Ledger

```go
type LedgerType string

const (
    LedgerDebit  LedgerType = "debit"  // customer owes more
    LedgerCredit LedgerType = "credit" // customer pays back
)

type CreditLedger struct {
    ID          primitive.ObjectID  `bson:"_id,omitempty"`
    CustomerID  primitive.ObjectID  `bson:"customer_id"`
    SaleID      *primitive.ObjectID `bson:"sale_id,omitempty"`
    Type        LedgerType          `bson:"type"`
    Amount      float64             `bson:"amount"`
    Balance     float64             `bson:"balance"` // running balance after entry
    Note        string              `bson:"note,omitempty"`
    CreatedBy   primitive.ObjectID  `bson:"created_by"`
    CreatedAt   time.Time           `bson:"created_at"`
}
```

**Indexes:** `customer_id`, `created_at`

---

## 10. Loan Reference

```go
type LoanReference struct {
    ID              primitive.ObjectID `bson:"_id,omitempty"`
    SaleID          primitive.ObjectID `bson:"sale_id"`
    CustomerID      primitive.ObjectID `bson:"customer_id"`
    FinancierName   string             `bson:"financier_name"` // bank/NBFC name
    LoanAmount      float64            `bson:"loan_amount"`
    ReferenceNumber string             `bson:"reference_number"`
    Remarks         string             `bson:"remarks,omitempty"`
    CreatedAt       time.Time          `bson:"created_at"`
    UpdatedAt       time.Time          `bson:"updated_at"`
}
```

**Indexes:** `sale_id`, `customer_id`

---

## 11. Borrow / Lend

```go
type BorrowLendType string

const (
    TypeBorrow BorrowLendType = "borrow" // we borrowed a device
    TypeLend   BorrowLendType = "lend"   // we lent a device
)

type BorrowLendStatus string

const (
    BLStatusActive   BorrowLendStatus = "active"
    BLStatusReturned BorrowLendStatus = "returned"
)

type BorrowLend struct {
    ID           primitive.ObjectID `bson:"_id,omitempty"`
    Type         BorrowLendType     `bson:"type"`
    DeviceID     primitive.ObjectID `bson:"device_id"`
    IMEI         string             `bson:"imei"`
    PersonName   string             `bson:"person_name"`
    PersonPhone  string             `bson:"person_phone"`
    Reason       string             `bson:"reason,omitempty"`
    Status       BorrowLendStatus   `bson:"status"`
    BorrowedAt   time.Time          `bson:"borrowed_at"`
    ExpectedBack time.Time          `bson:"expected_back,omitempty"`
    ReturnedAt   *time.Time         `bson:"returned_at,omitempty"`
    CreatedBy    primitive.ObjectID `bson:"created_by"`
    CreatedAt    time.Time          `bson:"created_at"`
    UpdatedAt    time.Time          `bson:"updated_at"`
}
```

**Indexes:** `device_id`, `status`, `type`

---

## 12. Bill / Invoice

```go
type Bill struct {
    ID            primitive.ObjectID `bson:"_id,omitempty"`
    SaleID        primitive.ObjectID `bson:"sale_id"`
    InvoiceNumber string             `bson:"invoice_number"` // matches Sale.InvoiceNumber
    CustomerSnap  CustomerSnapshot   `bson:"customer_snap"`  // snapshot at time of sale
    Items         []BillItem         `bson:"items"`
    TotalAmount   float64            `bson:"total_amount"`
    AmountPaid    float64            `bson:"amount_paid"`
    Balance       float64            `bson:"balance"`
    PaymentType   PaymentType        `bson:"payment_type"`
    PDFPath       string             `bson:"pdf_path,omitempty"` // stored PDF path
    PrintCount    int                `bson:"print_count"`
    CreatedAt     time.Time          `bson:"created_at"`
}

type CustomerSnapshot struct {
    Name    string `bson:"name"`
    Phone   string `bson:"phone"`
    Address string `bson:"address"`
}

type BillItem struct {
    IMEI      string  `bson:"imei"`
    ModelName string  `bson:"model_name"`
    BrandName string  `bson:"brand_name"`
    Variant   string  `bson:"variant"`   // e.g. "8GB / 128GB"
    Color     string  `bson:"color"`
    Price     float64 `bson:"price"`
}
```

**Indexes:** `sale_id` (unique), `invoice_number` (unique)

---

---

## 13. Notification (WhatsApp Audit Trail)

Records every outbound WhatsApp message attempt — provider response,
delivery status, and the exact payload sent. Enables retrys and auditing.

```go
type NotificationChannel string
type NotificationStatus  string
type NotificationEvent   string

const (
    ChannelWhatsApp NotificationChannel = "whatsapp"

    NotifStatusPending   NotificationStatus = "pending"
    NotifStatusSent      NotificationStatus = "sent"
    NotifStatusFailed    NotificationStatus = "failed"
    NotifStatusDelivered NotificationStatus = "delivered"  // provider webhook

    EventInvoiceSent    NotificationEvent = "invoice_sent"
    EventPaymentReminder NotificationEvent = "payment_reminder"
    EventCreditAlert    NotificationEvent = "credit_alert"
)

type Notification struct {
    ID           primitive.ObjectID  `bson:"_id,omitempty"`
    Channel      NotificationChannel `bson:"channel"`
    Event        NotificationEvent   `bson:"event"`
    RecipientPhone string            `bson:"recipient_phone"`
    RecipientName  string            `bson:"recipient_name"`

    // Optional refs — at least one is set
    CustomerID   *primitive.ObjectID `bson:"customer_id,omitempty"`
    SaleID       *primitive.ObjectID `bson:"sale_id,omitempty"`
    BillID       *primitive.ObjectID `bson:"bill_id,omitempty"`

    // Payload sent to provider
    TemplateID   string             `bson:"template_id,omitempty"`  // WA template name
    Payload      string             `bson:"payload"`                // JSON string

    // Provider response
    ProviderMsgID string            `bson:"provider_msg_id,omitempty"`
    Status        NotificationStatus `bson:"status"`
    ErrorMessage  string            `bson:"error_message,omitempty"`
    SentAt        *time.Time        `bson:"sent_at,omitempty"`
    DeliveredAt   *time.Time        `bson:"delivered_at,omitempty"`

    RetryCount    int               `bson:"retry_count"`
    CreatedBy     primitive.ObjectID `bson:"created_by"`
    CreatedAt     time.Time         `bson:"created_at"`
    UpdatedAt     time.Time         `bson:"updated_at"`
}
```

**Indexes:** `customer_id`, `sale_id`, `status`, `created_at`

---

## 14. Settings

Single document (upserted by store config). Keyed by `store_id = "default"`.
Only admins can modify.

```go
type TaxConfig struct {
    Enabled  bool    `bson:"enabled"`
    Rate     float64 `bson:"rate"`      // e.g. 0.18 for 18%
    Label    string  `bson:"label"`     // e.g. "GST", "VAT"
    Included bool    `bson:"included"`  // price inclusive or exclusive
}

type InvoiceConfig struct {
    Prefix        string `bson:"prefix"`         // e.g. "AA" → AA-00001
    NextSequence  int64  `bson:"next_sequence"`  // auto-incremented
    FooterNote    string `bson:"footer_note,omitempty"`
    ShowLogo      bool   `bson:"show_logo"`
    ThermalWidth  int    `bson:"thermal_width"`  // mm, e.g. 58 or 80
}

type WhatsAppConfig struct {
    Provider     string `bson:"provider"`      // "twilio" | "360dialog" | "waba"
    APIKey       string `bson:"api_key"`       // encrypted at rest
    FromNumber   string `bson:"from_number"`
    Enabled      bool   `bson:"enabled"`
}

type Settings struct {
    ID             primitive.ObjectID `bson:"_id,omitempty"`
    StoreID        string             `bson:"store_id"`    // always "default"
    StoreName      string             `bson:"store_name"`
    StorePhone     string             `bson:"store_phone"`
    StoreAddress   string             `bson:"store_address"`
    StoreLogoURL   string             `bson:"store_logo_url,omitempty"`
    Currency       string             `bson:"currency"`    // e.g. "INR", "USD"
    CurrencySymbol string             `bson:"currency_symbol"` // e.g. "₹", "$"
    Tax            TaxConfig          `bson:"tax"`
    Invoice        InvoiceConfig      `bson:"invoice"`
    WhatsApp       WhatsAppConfig     `bson:"whatsapp"`
    UpdatedBy      primitive.ObjectID `bson:"updated_by"`
    UpdatedAt      time.Time          `bson:"updated_at"`
}
```

**Indexes:** `store_id` (unique)
**Note:** `WhatsAppConfig.APIKey` must be encrypted before persistence (AES-GCM).
The service layer handles encrypt/decrypt — the repository stores ciphertext only.

---

## Entity Relationship Summary (Final)

```
Settings (singleton)
    │ invoice prefix
    ▼

Brand ─────< Product ─────< Device
                                │
                    Vendor ──< Purchase (items → Device)
                                │
                     BorrowLend─┤
                                │
Sale ──────────────────────────<┘
  │
  ├── Customer ──< CreditLedger
  ├── LoanReference
  ├── Bill ──< Notification
  └── Notification (direct event refs)

User ────< Sale (sold_by)
User ────< Purchase (purchased_by)
User ────< CreditLedger (created_by)
User ────< BorrowLend (created_by)
User ────< Notification (created_by)
User ────< Settings (updated_by)
```

---

## Collection Summary (14 models → 14 collections)

| # | Collection          | Key Indexes                         |
|---|---------------------|-------------------------------------|
| 1 | `users`             | `email` unique                      |
| 2 | `brands`            | `name` unique                       |
| 3 | `products`          | `barcode` unique, `brand_id`        |
| 4 | `devices`           | `imei` unique, `product_id`, `status` |
| 5 | `customers`         | `phone` unique                      |
| 6 | `sales`             | `invoice_number` unique, `customer_id`, `created_at` |
| 7 | `vendors`           | `phone` unique, `name`              |
| 8 | `purchases`         | `vendor_id`, `purchased_at`         |
| 9 | `credit_ledgers`    | `customer_id`, `created_at`         |
|10 | `loan_references`   | `sale_id`, `customer_id`            |
|11 | `borrow_lends`      | `device_id`, `status`, `type`       |
|12 | `bills`             | `sale_id` unique, `invoice_number` unique |
|13 | `notifications`     | `customer_id`, `sale_id`, `status`, `created_at` |
|14 | `settings`          | `store_id` unique                   |
