package ocr

import (
	"math"
	"regexp"
	"strings"
	"unicode"

	"aman-agency/backend/internal/models"
)

// InvoiceTextParser converts raw OCR text (from PaddleOCR or Tesseract) into a
// structured InvoiceExtractionResult using regex patterns tuned for Indian GST
// invoices.
//
// Confidence scores are heuristic:
//   - High-specificity patterns (GSTIN, invoice number regex) → 0.85
//   - Date patterns                                          → 0.80
//   - Amount patterns                                        → 0.80
//   - Vendor name (first non-empty line heuristic)          → 0.55
//   - Unmatched / empty fields                              → 0.00

type InvoiceTextParser struct{}

// NewInvoiceTextParser returns a ready-to-use parser.
func NewInvoiceTextParser() *InvoiceTextParser { return &InvoiceTextParser{} }

// Parse extracts invoice fields from raw OCR text.
// The text argument should be the full concatenated OCR output (newline-separated).
func (p *InvoiceTextParser) Parse(text string) *models.InvoiceExtractionResult {
	r := &models.InvoiceExtractionResult{}

	r.VendorGSTIN   = p.extractGSTIN(text)
	r.InvoiceNumber = p.extractInvoiceNumber(text)
	r.InvoiceDate   = p.extractDate("invoice", text)
	r.DueDate       = p.extractDate("due", text)
	r.TotalAmount   = p.extractAmount("total", text)
	r.Subtotal      = p.extractAmount("subtotal", text)
	r.CGST          = p.extractTax("cgst", text)
	r.SGST          = p.extractTax("sgst", text)
	r.IGST          = p.extractTax("igst", text)
	r.TaxAmount     = p.extractTaxTotal(text)
	r.VendorPhone   = p.extractPhone(text)
	r.VendorEmail   = p.extractEmail(text)
	r.PaymentTerms  = p.extractPaymentTerms(text)
	r.VendorName    = p.extractVendorName(text)
	r.VendorAddress = p.extractAddress(text)
	r.LineItems     = p.extractLineItems(text)

	RecomputeQuality(r, lowConfidenceThreshold)
	MarkNeedsReview(r, lowConfidenceThreshold)
	return r
}

// ─── Regex patterns ───────────────────────────────────────────────────────────

var (
	// Indian GSTIN: 2 digits + 5 alpha + 4 digits + 1 alpha + 1 alphanum + Z + 1 alphanum
	gstinRe = regexp.MustCompile(`(?i)(?:GSTIN|GST\s*(?:No|Num|Number|IN|Identification)?)[:\s#./]*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])`)

	// Invoice / Bill number
	invoiceNumRe = regexp.MustCompile(`(?i)(?:Invoice|Inv|Bill|Tax\s+Invoice|Challan)\s*(?:No|Num|Number|#)?[:\s./]*([A-Z0-9][A-Z0-9/\-]{1,30})`)

	// Date patterns: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD
	dateRe = regexp.MustCompile(`(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}[/.\-]\d{2}[/.\-]\d{2})`)

	// Date with label context
	invoiceDateRe = regexp.MustCompile(`(?i)(?:Invoice|Bill|Tax\s+Invoice|Date)[:\s]*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})`)
	dueDateRe     = regexp.MustCompile(`(?i)(?:Due\s+Date|Payment\s+Due)[:\s]*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})`)

	// Amount: digits, optional commas, optional decimal
	amountRe = regexp.MustCompile(`[₹Rs.]*\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)

	totalAmtRe = regexp.MustCompile(`(?i)(?:Grand\s+Total|Total\s+Amount|Net\s+(?:Payable|Amount|Total)|Amount\s+Payable)[:\s₹Rs.]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)
	subtotalRe = regexp.MustCompile(`(?i)(?:Sub\s*Total|Taxable\s+(?:Value|Amount))[:\s₹Rs.]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)
	cgstRe     = regexp.MustCompile(`(?i)CGST[\s@0-9%.]*?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)
	sgstRe     = regexp.MustCompile(`(?i)SGST[\s@0-9%.]*?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)
	igstRe     = regexp.MustCompile(`(?i)IGST[\s@0-9%.]*?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)
	taxTotalRe = regexp.MustCompile(`(?i)(?:Total\s+Tax|Tax\s+Amount|Total\s+GST)[:\s₹Rs.]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)`)

	// Phone (Indian format: +91 followed by 10 digits, or just 10 digits)
	phoneRe = regexp.MustCompile(`(?:\+91[\s\-]?)?(?:[6-9]\d{9})`)

	// Email
	emailRe = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)

	// Payment terms
	paymentTermsRe = regexp.MustCompile(`(?i)(?:Payment\s+Terms?|Terms?)[:\s]*([^\n]{3,50})`)
)

func (p *InvoiceTextParser) extractGSTIN(text string) models.ExtractedField {
	m := gstinRe.FindStringSubmatch(text)
	if len(m) > 1 {
		return models.ExtractedField{Value: strings.ToUpper(m[1]), Confidence: 0.88}
	}
	// Try bare GSTIN pattern (no label)
	bare := regexp.MustCompile(`\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b`)
	if bm := bare.FindStringSubmatch(strings.ToUpper(text)); len(bm) > 1 {
		return models.ExtractedField{Value: bm[1], Confidence: 0.75}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractInvoiceNumber(text string) models.ExtractedField {
	m := invoiceNumRe.FindStringSubmatch(text)
	if len(m) > 1 {
		v := strings.TrimSpace(m[1])
		return models.ExtractedField{Value: v, Confidence: 0.82}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractDate(kind, text string) models.ExtractedField {
	var re *regexp.Regexp
	switch kind {
	case "due":
		re = dueDateRe
	default:
		re = invoiceDateRe
	}
	m := re.FindStringSubmatch(text)
	if len(m) > 1 {
		return models.ExtractedField{Value: m[1], Confidence: 0.82}
	}
	// Fallback: first bare date in document
	if kind != "due" {
		dm := dateRe.FindString(text)
		if dm != "" {
			return models.ExtractedField{Value: dm, Confidence: 0.55}
		}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractAmount(kind, text string) models.ExtractedField {
	var re *regexp.Regexp
	switch kind {
	case "subtotal":
		re = subtotalRe
	default:
		re = totalAmtRe
	}
	m := re.FindStringSubmatch(text)
	if len(m) > 1 {
		v := strings.ReplaceAll(m[1], ",", "")
		return models.ExtractedField{Value: v, Confidence: 0.80}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractTax(kind, text string) models.ExtractedField {
	var re *regexp.Regexp
	switch kind {
	case "cgst":
		re = cgstRe
	case "sgst":
		re = sgstRe
	default:
		re = igstRe
	}
	m := re.FindStringSubmatch(text)
	if len(m) > 1 {
		v := strings.ReplaceAll(m[1], ",", "")
		return models.ExtractedField{Value: v, Confidence: 0.80}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractTaxTotal(text string) models.ExtractedField {
	m := taxTotalRe.FindStringSubmatch(text)
	if len(m) > 1 {
		v := strings.ReplaceAll(m[1], ",", "")
		return models.ExtractedField{Value: v, Confidence: 0.78}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractPhone(text string) models.ExtractedField {
	// Remove common separators before matching
	clean := regexp.MustCompile(`[\s\-()]`).ReplaceAllString(text, "")
	m := phoneRe.FindString(clean)
	if m != "" {
		return models.ExtractedField{Value: m, Confidence: 0.78}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractEmail(text string) models.ExtractedField {
	m := emailRe.FindString(text)
	if m != "" {
		return models.ExtractedField{Value: strings.ToLower(m), Confidence: 0.90}
	}
	return models.ExtractedField{}
}

func (p *InvoiceTextParser) extractPaymentTerms(text string) models.ExtractedField {
	m := paymentTermsRe.FindStringSubmatch(text)
	if len(m) > 1 {
		v := strings.TrimSpace(m[1])
		if len(v) > 3 {
			return models.ExtractedField{Value: v, Confidence: 0.72}
		}
	}
	return models.ExtractedField{}
}

// extractVendorName uses a heuristic: the first non-empty line that is all or
// mostly uppercase, longer than 4 characters, and not a common header keyword.
func (p *InvoiceTextParser) extractVendorName(text string) models.ExtractedField {
	skipWords := map[string]bool{
		"invoice": true, "tax invoice": true, "bill": true, "receipt": true,
		"purchase": true, "order": true, "original": true, "duplicate": true,
		"gstin": true, "date": true, "total": true,
	}
	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) < 4 {
			continue
		}
		lower := strings.ToLower(line)
		if skipWords[lower] {
			continue
		}
		if isLikelyName(line) {
			return models.ExtractedField{Value: line, Confidence: 0.55}
		}
	}
	return models.ExtractedField{}
}

// extractAddress tries to capture 2–4 consecutive lines that look like an address
// (contain digits, road/street/city keywords, or PIN codes).
func (p *InvoiceTextParser) extractAddress(text string) models.ExtractedField {
	pinRe := regexp.MustCompile(`\b[1-9][0-9]{5}\b`)
	addrKeywords := []string{"road", "street", "nagar", "colony", "district", "state", "city", "plot", "floor", "building", "near", "opp"}

	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lLow := strings.ToLower(line)
		hasKeyword := false
		for _, kw := range addrKeywords {
			if strings.Contains(lLow, kw) {
				hasKeyword = true
				break
			}
		}
		if !hasKeyword && !pinRe.MatchString(line) {
			continue
		}
		// Found a likely address line — collect up to 3 surrounding lines
		start := i
		if start > 0 {
			start--
		}
		end := i + 2
		if end >= len(lines) {
			end = len(lines) - 1
		}
		parts := lines[start : end+1]
		addr := strings.Join(removeEmpty(parts), ", ")
		if len(addr) > 5 {
			return models.ExtractedField{Value: addr, Confidence: 0.58}
		}
	}
	return models.ExtractedField{}
}

// extractLineItems tries to detect table rows using a simple positional heuristic:
// rows that contain a description followed by numeric columns.
func (p *InvoiceTextParser) extractLineItems(text string) []models.ExtractedLineItem {
	// Row pattern: text description followed by qty, rate, amount columns
	// e.g.: "iPhone 15 Pro   2   80000   160000"
	rowRe := regexp.MustCompile(`^(.{5,40})\s{2,}(\d[\d.]*)\s{2,}(\d[\d,.]*)\s{2,}(\d[\d,.]*)`)

	var items []models.ExtractedLineItem
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		m := rowRe.FindStringSubmatch(line)
		if len(m) < 5 {
			continue
		}
		desc := strings.TrimSpace(m[1])
		// Skip header rows
		if looksLikeHeader(desc) {
			continue
		}
		items = append(items, models.ExtractedLineItem{
			Description: models.ExtractedField{Value: desc, Confidence: 0.68},
			Quantity:    models.ExtractedField{Value: cleanAmount(m[2]), Confidence: 0.68},
			UnitPrice:   models.ExtractedField{Value: cleanAmount(m[3]), Confidence: 0.65},
			Amount:      models.ExtractedField{Value: cleanAmount(m[4]), Confidence: 0.65},
		})
	}
	return items
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func isLikelyName(s string) bool {
	upper := 0
	for _, r := range s {
		if unicode.IsUpper(r) {
			upper++
		}
	}
	ratio := float64(upper) / math.Max(1, float64(len(s)))
	return ratio > 0.5 && !strings.ContainsAny(s, "@:/\\")
}

func looksLikeHeader(s string) bool {
	headers := []string{"item", "description", "product", "particulars", "sl.", "s.no", "qty", "quantity", "rate", "amount", "total"}
	low := strings.ToLower(s)
	for _, h := range headers {
		if strings.Contains(low, h) {
			return true
		}
	}
	return false
}

func cleanAmount(s string) string {
	return strings.ReplaceAll(s, ",", "")
}

func removeEmpty(lines []string) []string {
	var out []string
	for _, l := range lines {
		if t := strings.TrimSpace(l); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// ─── Unused pattern (kept for reference) ─────────────────────────────────────

var _ = amountRe // suppress unused warning
