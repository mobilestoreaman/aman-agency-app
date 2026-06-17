package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// InvoiceProcessingStatus tracks the lifecycle of a vendor invoice document.
type InvoiceProcessingStatus string

const (
	InvoiceStatusPending     InvoiceProcessingStatus = "pending"
	InvoiceStatusProcessing  InvoiceProcessingStatus = "processing"
	InvoiceStatusDone        InvoiceProcessingStatus = "done"
	InvoiceStatusFailed      InvoiceProcessingStatus = "failed"
	InvoiceStatusNeedsReview InvoiceProcessingStatus = "needs_review"
)

// ExtractedField holds an OCR-extracted value together with its confidence
// score (0.0–1.0) and a flag indicating that a human should review it.
type ExtractedField struct {
	Value       string  `bson:"value"        json:"value"`
	Confidence  float64 `bson:"confidence"   json:"confidence"`
	NeedsReview bool    `bson:"needs_review" json:"needs_review"`
}

// ExtractedLineItem represents one row in an invoice line-items table.
type ExtractedLineItem struct {
	Description ExtractedField `bson:"description" json:"description"`
	Quantity    ExtractedField `bson:"quantity"    json:"quantity"`
	UnitPrice   ExtractedField `bson:"unit_price"  json:"unit_price"`
	Amount      ExtractedField `bson:"amount"      json:"amount"`
	HSNCode     ExtractedField `bson:"hsn_code"    json:"hsn_code"`
	TaxRate     ExtractedField `bson:"tax_rate"    json:"tax_rate"`
}

// InvoiceExtractionResult is the structured output from any OCR engine.
// Each field carries the extracted value and confidence so the UI can
// highlight uncertain values for manual review.
type InvoiceExtractionResult struct {
	// Vendor / supplier details
	VendorName    ExtractedField `bson:"vendor_name"    json:"vendor_name"`
	VendorGSTIN   ExtractedField `bson:"vendor_gstin"   json:"vendor_gstin"`
	VendorPhone   ExtractedField `bson:"vendor_phone"   json:"vendor_phone"`
	VendorAddress ExtractedField `bson:"vendor_address" json:"vendor_address"`
	VendorEmail   ExtractedField `bson:"vendor_email"   json:"vendor_email"`

	// Invoice metadata
	InvoiceNumber ExtractedField `bson:"invoice_number" json:"invoice_number"`
	InvoiceDate   ExtractedField `bson:"invoice_date"   json:"invoice_date"`
	DueDate       ExtractedField `bson:"due_date"       json:"due_date"`
	PaymentTerms  ExtractedField `bson:"payment_terms"  json:"payment_terms"`

	// Financial totals (Indian GST format)
	Subtotal    ExtractedField `bson:"subtotal"     json:"subtotal"`
	CGST        ExtractedField `bson:"cgst"         json:"cgst"`
	SGST        ExtractedField `bson:"sgst"         json:"sgst"`
	IGST        ExtractedField `bson:"igst"         json:"igst"`
	TaxAmount   ExtractedField `bson:"tax_amount"   json:"tax_amount"`
	TotalAmount ExtractedField `bson:"total_amount" json:"total_amount"`

	Notes ExtractedField `bson:"notes" json:"notes"`

	// Line items
	LineItems []ExtractedLineItem `bson:"line_items" json:"line_items"`

	// Overall quality
	OverallConfidence  float64 `bson:"overall_confidence"   json:"overall_confidence"`
	LowConfidenceCount int     `bson:"low_confidence_count" json:"low_confidence_count"`
}

// ─── OCR metrics / comparison ─────────────────────────────────────────────────

// OCRMetrics records which engine(s) were used and how they performed.
type OCRMetrics struct {
	Mode          string  `bson:"mode"           json:"mode"`
	EngineUsed    string  `bson:"engine_used"    json:"engine_used"`
	ProcessingMs  int64   `bson:"processing_ms"  json:"processing_ms"`
	RetryCount    int     `bson:"retry_count"    json:"retry_count"`
	PrimaryConf   float64 `bson:"primary_confidence,omitempty"   json:"primary_confidence,omitempty"`
	AlternateConf float64 `bson:"alternate_confidence,omitempty" json:"alternate_confidence,omitempty"`
}

// FieldConflict records a disagreement between engines on a single field
// during a "both" or "auto" OCR run.
type FieldConflict struct {
	Field         string  `bson:"field"          json:"field"`
	PrimaryValue  string  `bson:"primary_value"  json:"primary_value"`
	AltValue      string  `bson:"alt_value"      json:"alt_value"`
	SelectedValue string  `bson:"selected_value" json:"selected_value"`
	SelectedBy    string  `bson:"selected_by"    json:"selected_by"`
	PrimaryConf   float64 `bson:"primary_conf"   json:"primary_conf"`
	AltConf       float64 `bson:"alt_conf"       json:"alt_conf"`
}

// OCRComparison holds detailed side-by-side comparison data for runs where
// more than one engine was used.
type OCRComparison struct {
	PrimaryEngine   string          `bson:"primary_engine"   json:"primary_engine"`
	AlternateEngine string          `bson:"alternate_engine" json:"alternate_engine"`
	PrimaryConf     float64         `bson:"primary_conf"     json:"primary_conf"`
	AltConf         float64         `bson:"alt_conf"         json:"alt_conf"`
	PrimaryTimeMs   int64           `bson:"primary_time_ms"  json:"primary_time_ms"`
	AltTimeMs       int64           `bson:"alt_time_ms"      json:"alt_time_ms"`
	Conflicts       []FieldConflict `bson:"conflicts,omitempty" json:"conflicts,omitempty"`
	AutoMerged      bool            `bson:"auto_merged"      json:"auto_merged"`
}

// ─── VendorInvoice ────────────────────────────────────────────────────────────

// VendorInvoice is the top-level MongoDB document for an uploaded vendor
// invoice (PDF or image).  The OCR pipeline writes extraction results back
// asynchronously after the initial HTTP response returns.
type VendorInvoice struct {
	ID             primitive.ObjectID      `bson:"_id,omitempty"              json:"id"`
	VendorID       *primitive.ObjectID     `bson:"vendor_id,omitempty"        json:"vendor_id,omitempty"`
	PurchaseID     *primitive.ObjectID     `bson:"purchase_id,omitempty"      json:"purchase_id,omitempty"`
	OriginalName   string                  `bson:"original_name"              json:"original_name"`
	StoredPath     string                  `bson:"stored_path"                json:"stored_path"`
	MimeType       string                  `bson:"mime_type"                  json:"mime_type"`
	FileSizeBytes  int64                   `bson:"file_size_bytes"            json:"file_size_bytes"`
	Status         InvoiceProcessingStatus `bson:"status"                     json:"status"`
	ProcessingError string                 `bson:"processing_error,omitempty" json:"processing_error,omitempty"`
	Extraction     *InvoiceExtractionResult `bson:"extraction,omitempty"       json:"extraction,omitempty"`
	OCRMetrics     *OCRMetrics             `bson:"ocr_metrics,omitempty"      json:"ocr_metrics,omitempty"`
	OCRComparison  *OCRComparison          `bson:"ocr_comparison,omitempty"   json:"ocr_comparison,omitempty"`
	UploadedBy     string                  `bson:"uploaded_by"                json:"uploaded_by"`
	CreatedAt      time.Time               `bson:"created_at"                 json:"created_at"`
	UpdatedAt      time.Time               `bson:"updated_at"                 json:"updated_at"`
}
