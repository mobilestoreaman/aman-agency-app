// Package ocr provides a standalone invoice OCR pipeline powered entirely by
// Tesseract, an open-source OCR engine that runs inside the container with no
// external API calls, subscriptions, or microservices required.
//
// Supported engines:
//   - TesseractEngine: Tesseract CLI (raw text → InvoiceTextParser → structured fields)
//
// All engines implement the Engine interface and are composed by Manager.
// Adding a new engine requires only implementing Engine — no other changes needed.
package ocr

import (
	"context"
	"time"

	"aman-agency/backend/internal/models"
)

// lowConfidenceThreshold is the package-wide default below which a field is
// flagged NeedsReview. Used by InvoiceTextParser and RecomputeQuality.
const lowConfidenceThreshold = 0.70

// OCRMode controls which engine(s) to use and how to combine their outputs.
type OCRMode string

const (
	// ModeAuto is the default: uses the registered primary engine.
	ModeAuto OCRMode = "auto"

	// ModePrimary explicitly selects the primary engine (same as auto).
	ModePrimary OCRMode = "primary"

	// ModeTesseract explicitly selects the Tesseract standalone engine.
	ModeTesseract OCRMode = "tesseract"
)

// ParseMode converts a raw string to OCRMode, defaulting to ModeAuto.
func ParseMode(s string) OCRMode {
	switch OCRMode(s) {
	case ModePrimary, ModeTesseract:
		return OCRMode(s)
	default:
		return ModeAuto
	}
}

// Engine is the strategy interface every OCR back-end must satisfy.
// Implementations are responsible for accepting raw file bytes, performing
// OCR, and returning a fully-populated EngineResult (including per-field
// confidence scores and overall quality metrics).
type Engine interface {
	// Name returns a human-readable label shown in UI (e.g. "Claude Haiku (Fast)").
	Name() string

	// ExtractFromFile runs OCR on the given file bytes and returns structured data.
	// mimeType hints at the file format (e.g. "application/pdf", "image/jpeg").
	ExtractFromFile(ctx context.Context, fileBytes []byte, mimeType string) (*EngineResult, error)
}

// EngineResult wraps a structured extraction result together with provenance metadata.
type EngineResult struct {
	// Extraction is the structured invoice data produced by this engine.
	Extraction *models.InvoiceExtractionResult

	// EngineName matches Engine.Name().
	EngineName string

	// ProcessingTime is how long the engine took.
	ProcessingTime time.Duration
}

// ProcessResult is the final output of Manager.Process.
// It carries the winning extraction plus diagnostic metadata about what ran.
type ProcessResult struct {
	// Extraction is the final (possibly merged) structured result.
	Extraction *models.InvoiceExtractionResult

	// EngineUsed is the human-readable name of the engine whose data was used
	// (or "merged" when both engines contributed).
	EngineUsed string

	// TotalTime is the wall-clock time from Process entry to return.
	TotalTime time.Duration

	// RetryCount is 0 normally; 1 if auto mode retried with the alternate engine.
	RetryCount int

	// Primary and Alternate hold individual engine results when both ran.
	Primary   *EngineResult
	Alternate *EngineResult

	// Comparison is populated when two engines ran and their results were compared.
	// Reserved for future multi-engine setups; nil for single-engine runs.
	Comparison *models.OCRComparison
}

// ─── RecomputeQuality ─────────────────────────────────────────────────────────

// RecomputeQuality walks all scalar fields of r and updates OverallConfidence
// and LowConfidenceCount based on the supplied threshold.
// Call this after any field is modified (e.g. after merging two results).
func RecomputeQuality(r *models.InvoiceExtractionResult, threshold float64) {
	if r == nil {
		return
	}

	var sumConf float64
	var count, low int

	add := func(f models.ExtractedField) {
		if f.Value == "" {
			return
		}
		count++
		sumConf += f.Confidence
		if f.Confidence < threshold {
			low++
		}
	}

	// Header fields
	add(r.VendorName)
	add(r.VendorGSTIN)
	add(r.VendorPhone)
	add(r.VendorAddress)
	add(r.VendorEmail)
	add(r.InvoiceNumber)
	add(r.InvoiceDate)
	add(r.DueDate)
	add(r.PaymentTerms)
	add(r.Subtotal)
	add(r.CGST)
	add(r.SGST)
	add(r.IGST)
	add(r.TaxAmount)
	add(r.TotalAmount)
	add(r.Notes)

	// Line item fields
	for _, li := range r.LineItems {
		add(li.Description)
		add(li.Quantity)
		add(li.UnitPrice)
		add(li.Amount)
		add(li.HSNCode)
		add(li.TaxRate)
	}

	if count > 0 {
		r.OverallConfidence = sumConf / float64(count)
	} else {
		r.OverallConfidence = 0
	}
	r.LowConfidenceCount = low
}

// MarkNeedsReview sets NeedsReview=true on every ExtractedField whose
// Confidence falls below threshold.
func MarkNeedsReview(r *models.InvoiceExtractionResult, threshold float64) {
	if r == nil {
		return
	}

	mark := func(f *models.ExtractedField) {
		if f.Value != "" && f.Confidence < threshold {
			f.NeedsReview = true
		}
	}

	mark(&r.VendorName)
	mark(&r.VendorGSTIN)
	mark(&r.VendorPhone)
	mark(&r.VendorAddress)
	mark(&r.VendorEmail)
	mark(&r.InvoiceNumber)
	mark(&r.InvoiceDate)
	mark(&r.DueDate)
	mark(&r.PaymentTerms)
	mark(&r.Subtotal)
	mark(&r.CGST)
	mark(&r.SGST)
	mark(&r.IGST)
	mark(&r.TaxAmount)
	mark(&r.TotalAmount)
	mark(&r.Notes)

	for i := range r.LineItems {
		mark(&r.LineItems[i].Description)
		mark(&r.LineItems[i].Quantity)
		mark(&r.LineItems[i].UnitPrice)
		mark(&r.LineItems[i].Amount)
		mark(&r.LineItems[i].HSNCode)
		mark(&r.LineItems[i].TaxRate)
	}
}
