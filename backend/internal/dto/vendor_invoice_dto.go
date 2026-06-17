package dto

import (
	"aman-agency/backend/internal/models"
)

// ─── Request DTOs ─────────────────────────────────────────────────────────────

// InvoicePurchaseItemReq is one device line when converting an invoice to a purchase.
type InvoicePurchaseItemReq struct {
	ProductID     string  `json:"product_id"     validate:"required,objectid"`
	IMEI1         string  `json:"imei1"          validate:"required,len=15"`
	IMEI2         string  `json:"imei2"          validate:"omitempty,len=15"`
	Condition     string  `json:"condition"      validate:"required,oneof=new used refurbished"`
	Color         string  `json:"color"          validate:"omitempty,max=50"`
	Storage       string  `json:"storage"        validate:"omitempty,max=20"`
	PurchasePrice float64 `json:"purchase_price" validate:"required,gt=0,max=10000000"`
	SellingPrice  float64 `json:"selling_price"  validate:"omitempty,gt=0,max=10000000"`
}

// CreatePurchaseFromInvoiceRequest is the body for POST /vendor-invoices/:id/to-purchase.
// It carries the admin-reviewed data after OCR extraction to create the purchase.
type CreatePurchaseFromInvoiceRequest struct {
	VendorID    string                   `json:"vendor_id"    validate:"required,objectid"`
	Items       []InvoicePurchaseItemReq `json:"items"        validate:"required,min=1,max=100,dive"`
	Notes       string                   `json:"notes"        validate:"omitempty,max=500"`
	PurchasedAt string                   `json:"purchased_at" validate:"omitempty"` // ISO 8601; defaults to now
}

// UpdateVendorInvoiceRequest lets staff correct extracted fields after review.
type UpdateVendorInvoiceRequest struct {
	VendorID string `json:"vendor_id,omitempty"`
	// Overrides for extraction fields (staff can correct OCR mistakes)
	VendorName    string `json:"vendor_name,omitempty"`
	VendorGSTIN   string `json:"vendor_gstin,omitempty"`
	InvoiceNumber string `json:"invoice_number,omitempty"`
	InvoiceDate   string `json:"invoice_date,omitempty"`
	TotalAmount   string `json:"total_amount,omitempty"`
}

// VendorInvoiceFilter carries query-string parameters for listing invoices.
type VendorInvoiceFilter struct {
	VendorID string `query:"vendor_id"`
	Status   string `query:"status"`
	Search   string `query:"search"`
	From     string `query:"from"`
	To       string `query:"to"`
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

type ExtractedFieldResponse struct {
	Value       string  `json:"value"`
	Confidence  float64 `json:"confidence"`
	NeedsReview bool    `json:"needs_review"`
}

type ExtractedLineItemResponse struct {
	Description ExtractedFieldResponse `json:"description"`
	Quantity    ExtractedFieldResponse `json:"quantity"`
	UnitPrice   ExtractedFieldResponse `json:"unit_price"`
	Amount      ExtractedFieldResponse `json:"amount"`
	HSNCode     ExtractedFieldResponse `json:"hsn_code"`
	TaxRate     ExtractedFieldResponse `json:"tax_rate"`
}

type InvoiceExtractionResponse struct {
	VendorName    ExtractedFieldResponse `json:"vendor_name"`
	VendorGSTIN   ExtractedFieldResponse `json:"vendor_gstin"`
	VendorPhone   ExtractedFieldResponse `json:"vendor_phone"`
	VendorAddress ExtractedFieldResponse `json:"vendor_address"`
	VendorEmail   ExtractedFieldResponse `json:"vendor_email"`
	InvoiceNumber ExtractedFieldResponse `json:"invoice_number"`
	InvoiceDate   ExtractedFieldResponse `json:"invoice_date"`
	DueDate       ExtractedFieldResponse `json:"due_date"`
	PaymentTerms  ExtractedFieldResponse `json:"payment_terms"`
	Subtotal      ExtractedFieldResponse `json:"subtotal"`
	CGST          ExtractedFieldResponse `json:"cgst"`
	SGST          ExtractedFieldResponse `json:"sgst"`
	IGST          ExtractedFieldResponse `json:"igst"`
	TaxAmount     ExtractedFieldResponse `json:"tax_amount"`
	TotalAmount   ExtractedFieldResponse `json:"total_amount"`
	Notes         ExtractedFieldResponse `json:"notes"`
	LineItems         []ExtractedLineItemResponse `json:"line_items"`
	OverallConfidence  float64                    `json:"overall_confidence"`
	LowConfidenceCount int                        `json:"low_confidence_count"`
}

type OCRMetricsResponse struct {
	Mode          string  `json:"mode"`
	EngineUsed    string  `json:"engine_used"`
	ProcessingMs  int64   `json:"processing_ms"`
	RetryCount    int     `json:"retry_count"`
	PrimaryConf   float64 `json:"primary_confidence,omitempty"`
	AlternateConf float64 `json:"alternate_confidence,omitempty"`
}

type FieldConflictResponse struct {
	Field         string  `json:"field"`
	PrimaryValue  string  `json:"primary_value"`
	AltValue      string  `json:"alt_value"`
	SelectedValue string  `json:"selected_value"`
	SelectedBy    string  `json:"selected_by"`
	PrimaryConf   float64 `json:"primary_conf"`
	AltConf       float64 `json:"alt_conf"`
}

type OCRComparisonResponse struct {
	PrimaryEngine   string                  `json:"primary_engine"`
	AlternateEngine string                  `json:"alternate_engine"`
	PrimaryConf     float64                 `json:"primary_confidence"`
	AltConf         float64                 `json:"alt_confidence"`
	PrimaryTimeMs   int64                   `json:"primary_time_ms"`
	AltTimeMs       int64                   `json:"alt_time_ms"`
	Conflicts       []FieldConflictResponse `json:"conflicts,omitempty"`
	AutoMerged      bool                    `json:"auto_merged"`
}

type VendorInvoiceResponse struct {
	ID              string                     `json:"id"`
	VendorID        *string                    `json:"vendor_id,omitempty"`
	PurchaseID      *string                    `json:"purchase_id,omitempty"`
	OriginalName    string                     `json:"original_name"`
	MimeType        string                     `json:"mime_type"`
	FileSizeBytes   int64                      `json:"file_size_bytes"`
	Status          string                     `json:"status"`
	ProcessingError string                     `json:"processing_error,omitempty"`
	Extraction      *InvoiceExtractionResponse `json:"extraction,omitempty"`
	OCRMetrics      *OCRMetricsResponse        `json:"ocr_metrics,omitempty"`
	OCRComparison   *OCRComparisonResponse     `json:"ocr_comparison,omitempty"`
	UploadedBy      string                     `json:"uploaded_by"`
	CreatedAt       string                     `json:"created_at"`
	UpdatedAt       string                     `json:"updated_at"`
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

func ToExtractedFieldResponse(f models.ExtractedField) ExtractedFieldResponse {
	return ExtractedFieldResponse{
		Value:       f.Value,
		Confidence:  f.Confidence,
		NeedsReview: f.NeedsReview,
	}
}

func ToLineItemResponse(li models.ExtractedLineItem) ExtractedLineItemResponse {
	return ExtractedLineItemResponse{
		Description: ToExtractedFieldResponse(li.Description),
		Quantity:    ToExtractedFieldResponse(li.Quantity),
		UnitPrice:   ToExtractedFieldResponse(li.UnitPrice),
		Amount:      ToExtractedFieldResponse(li.Amount),
		HSNCode:     ToExtractedFieldResponse(li.HSNCode),
		TaxRate:     ToExtractedFieldResponse(li.TaxRate),
	}
}

func ToExtractionResponse(e *models.InvoiceExtractionResult) *InvoiceExtractionResponse {
	if e == nil {
		return nil
	}
	items := make([]ExtractedLineItemResponse, len(e.LineItems))
	for i, li := range e.LineItems {
		items[i] = ToLineItemResponse(li)
	}
	return &InvoiceExtractionResponse{
		VendorName:         ToExtractedFieldResponse(e.VendorName),
		VendorGSTIN:        ToExtractedFieldResponse(e.VendorGSTIN),
		VendorPhone:        ToExtractedFieldResponse(e.VendorPhone),
		VendorAddress:      ToExtractedFieldResponse(e.VendorAddress),
		VendorEmail:        ToExtractedFieldResponse(e.VendorEmail),
		InvoiceNumber:      ToExtractedFieldResponse(e.InvoiceNumber),
		InvoiceDate:        ToExtractedFieldResponse(e.InvoiceDate),
		DueDate:            ToExtractedFieldResponse(e.DueDate),
		PaymentTerms:       ToExtractedFieldResponse(e.PaymentTerms),
		Subtotal:           ToExtractedFieldResponse(e.Subtotal),
		CGST:               ToExtractedFieldResponse(e.CGST),
		SGST:               ToExtractedFieldResponse(e.SGST),
		IGST:               ToExtractedFieldResponse(e.IGST),
		TaxAmount:          ToExtractedFieldResponse(e.TaxAmount),
		TotalAmount:        ToExtractedFieldResponse(e.TotalAmount),
		Notes:              ToExtractedFieldResponse(e.Notes),
		LineItems:          items,
		OverallConfidence:  e.OverallConfidence,
		LowConfidenceCount: e.LowConfidenceCount,
	}
}

func ToOCRMetricsResponse(m *models.OCRMetrics) *OCRMetricsResponse {
	if m == nil {
		return nil
	}
	return &OCRMetricsResponse{
		Mode:          m.Mode,
		EngineUsed:    m.EngineUsed,
		ProcessingMs:  m.ProcessingMs,
		RetryCount:    m.RetryCount,
		PrimaryConf:   m.PrimaryConf,
		AlternateConf: m.AlternateConf,
	}
}

func ToOCRComparisonResponse(c *models.OCRComparison) *OCRComparisonResponse {
	if c == nil {
		return nil
	}
	conflicts := make([]FieldConflictResponse, len(c.Conflicts))
	for i, fc := range c.Conflicts {
		conflicts[i] = FieldConflictResponse{
			Field:         fc.Field,
			PrimaryValue:  fc.PrimaryValue,
			AltValue:      fc.AltValue,
			SelectedValue: fc.SelectedValue,
			SelectedBy:    fc.SelectedBy,
			PrimaryConf:   fc.PrimaryConf,
			AltConf:       fc.AltConf,
		}
	}
	return &OCRComparisonResponse{
		PrimaryEngine:   c.PrimaryEngine,
		AlternateEngine: c.AlternateEngine,
		PrimaryConf:     c.PrimaryConf,
		AltConf:         c.AltConf,
		PrimaryTimeMs:   c.PrimaryTimeMs,
		AltTimeMs:       c.AltTimeMs,
		Conflicts:       conflicts,
		AutoMerged:      c.AutoMerged,
	}
}
