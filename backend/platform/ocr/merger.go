package ocr

import (
	"fmt"
	"math"

	"aman-agency/backend/internal/models"
)

// MergeResults combines the outputs of two OCR engine runs into a single
// InvoiceExtractionResult, using field-level confidence-based selection.
//
// Strategy:
//  1. If |primaryConf - alternateConf| > autoMergeThreshold: use the winner wholesale.
//  2. Otherwise: field-by-field pick whichever engine had higher confidence.
//     Conflicts (both non-empty, different values) are recorded in OCRComparison.
//  3. Line items: positional merge if counts match; otherwise use the engine
//     with more items.
func MergeResults(
	primary, alternate *EngineResult,
	autoMergeThreshold, confidenceThreshold float64,
) (*models.InvoiceExtractionResult, *models.OCRComparison) {

	pConf := primary.Extraction.OverallConfidence
	aConf := alternate.Extraction.OverallConfidence

	cmp := &models.OCRComparison{
		PrimaryEngine:   primary.EngineName,
		AlternateEngine: alternate.EngineName,
		PrimaryConf:     pConf,
		AltConf:         aConf,
		PrimaryTimeMs:   primary.ProcessingTime.Milliseconds(),
		AltTimeMs:       alternate.ProcessingTime.Milliseconds(),
	}

	// If confidence delta is large: use the winner outright
	if math.Abs(pConf-aConf) > autoMergeThreshold {
		cmp.AutoMerged = false
		if pConf >= aConf {
			cmp.PrimaryEngine = primary.EngineName + " (winner)"
			return cloneResult(primary.Extraction), cmp
		}
		cmp.AlternateEngine = alternate.EngineName + " (winner)"
		return cloneResult(alternate.Extraction), cmp
	}

	// Field-level merge
	cmp.AutoMerged = true
	merged := &models.InvoiceExtractionResult{}
	var conflicts []models.FieldConflict

	pf := primary.Extraction
	af := alternate.Extraction

	merged.VendorName    = pickField("vendor_name", pf.VendorName, af.VendorName, primary.EngineName, alternate.EngineName, &conflicts)
	merged.VendorGSTIN   = pickField("vendor_gstin", pf.VendorGSTIN, af.VendorGSTIN, primary.EngineName, alternate.EngineName, &conflicts)
	merged.VendorPhone   = pickField("vendor_phone", pf.VendorPhone, af.VendorPhone, primary.EngineName, alternate.EngineName, &conflicts)
	merged.VendorAddress = pickField("vendor_address", pf.VendorAddress, af.VendorAddress, primary.EngineName, alternate.EngineName, &conflicts)
	merged.VendorEmail   = pickField("vendor_email", pf.VendorEmail, af.VendorEmail, primary.EngineName, alternate.EngineName, &conflicts)
	merged.InvoiceNumber = pickField("invoice_number", pf.InvoiceNumber, af.InvoiceNumber, primary.EngineName, alternate.EngineName, &conflicts)
	merged.InvoiceDate   = pickField("invoice_date", pf.InvoiceDate, af.InvoiceDate, primary.EngineName, alternate.EngineName, &conflicts)
	merged.DueDate        = pickField("due_date", pf.DueDate, af.DueDate, primary.EngineName, alternate.EngineName, &conflicts)
	merged.PaymentTerms  = pickField("payment_terms", pf.PaymentTerms, af.PaymentTerms, primary.EngineName, alternate.EngineName, &conflicts)
	merged.Subtotal      = pickField("subtotal", pf.Subtotal, af.Subtotal, primary.EngineName, alternate.EngineName, &conflicts)
	merged.CGST          = pickField("cgst", pf.CGST, af.CGST, primary.EngineName, alternate.EngineName, &conflicts)
	merged.SGST          = pickField("sgst", pf.SGST, af.SGST, primary.EngineName, alternate.EngineName, &conflicts)
	merged.IGST          = pickField("igst", pf.IGST, af.IGST, primary.EngineName, alternate.EngineName, &conflicts)
	merged.TaxAmount     = pickField("tax_amount", pf.TaxAmount, af.TaxAmount, primary.EngineName, alternate.EngineName, &conflicts)
	merged.TotalAmount   = pickField("total_amount", pf.TotalAmount, af.TotalAmount, primary.EngineName, alternate.EngineName, &conflicts)
	merged.Notes         = pickField("notes", pf.Notes, af.Notes, primary.EngineName, alternate.EngineName, &conflicts)

	// Line items: positional merge when counts match; else use engine with more items
	merged.LineItems = mergeLineItems(pf.LineItems, af.LineItems, primary.EngineName, alternate.EngineName)

	if len(conflicts) > 0 {
		cmp.Conflicts = conflicts
	}

	RecomputeQuality(merged, confidenceThreshold)
	MarkNeedsReview(merged, confidenceThreshold)
	return merged, cmp
}

// pickField returns the field with the higher confidence, recording a conflict
// if both engines returned different non-empty values.
func pickField(
	fieldName string,
	p, a models.ExtractedField,
	primaryName, altName string,
	conflicts *[]models.FieldConflict,
) models.ExtractedField {
	bothNonEmpty := p.Value != "" && a.Value != ""
	different := p.Value != a.Value

	winner, winnerName := p, primaryName
	if a.Confidence > p.Confidence {
		winner, winnerName = a, altName
	}

	if bothNonEmpty && different {
		*conflicts = append(*conflicts, models.FieldConflict{
			Field:         fieldName,
			PrimaryValue:  p.Value,
			AltValue:      a.Value,
			SelectedValue: winner.Value,
			SelectedBy:    fmt.Sprintf("%s (conf %.2f)", winnerName, winner.Confidence),
			PrimaryConf:   p.Confidence,
			AltConf:       a.Confidence,
		})
	}

	return winner
}

// mergeLineItems merges line-item slices from two engines.
func mergeLineItems(
	primary, alternate []models.ExtractedLineItem,
	primaryName, altName string,
) []models.ExtractedLineItem {
	if len(primary) == 0 {
		return alternate
	}
	if len(alternate) == 0 {
		return primary
	}

	// If counts differ, use the engine with more items
	if len(primary) != len(alternate) {
		if len(alternate) > len(primary) {
			return alternate
		}
		return primary
	}

	// Positional merge: field-level pick per row
	merged := make([]models.ExtractedLineItem, len(primary))
	var dummy []models.FieldConflict
	for i := range primary {
		p := primary[i]
		a := alternate[i]
		merged[i] = models.ExtractedLineItem{
			Description: pickField("line_item_description", p.Description, a.Description, primaryName, altName, &dummy),
			Quantity:    pickField("line_item_quantity", p.Quantity, a.Quantity, primaryName, altName, &dummy),
			UnitPrice:   pickField("line_item_unit_price", p.UnitPrice, a.UnitPrice, primaryName, altName, &dummy),
			Amount:      pickField("line_item_amount", p.Amount, a.Amount, primaryName, altName, &dummy),
			HSNCode:     pickField("line_item_hsn_code", p.HSNCode, a.HSNCode, primaryName, altName, &dummy),
			TaxRate:     pickField("line_item_tax_rate", p.TaxRate, a.TaxRate, primaryName, altName, &dummy),
		}
	}
	return merged
}

// cloneResult does a shallow clone of an InvoiceExtractionResult to avoid
// aliasing when the original engine result is stored separately.
func cloneResult(r *models.InvoiceExtractionResult) *models.InvoiceExtractionResult {
	if r == nil {
		return nil
	}
	cp := *r
	if r.LineItems != nil {
		cp.LineItems = make([]models.ExtractedLineItem, len(r.LineItems))
		copy(cp.LineItems, r.LineItems)
	}
	return &cp
}
