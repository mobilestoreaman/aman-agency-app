package ocr

// RemoteEngine calls the Python PaddleOCR microservice over HTTP.
//
// It implements the Engine interface so the Manager can use it as primary
// (or alternate) without any changes to the rest of the pipeline.
//
// Fallback behaviour:
//   If the HTTP call to the Python service fails for any reason (connection
//   refused, timeout, non-2xx status), RemoteEngine transparently delegates
//   to a local fallback Engine (typically TesseractEngine) and logs a warning.
//
// Environment:
//   OCR_SERVICE_URL — base URL of the Python service, e.g. "http://ocr-service:8001"
//   Defaults to "http://ocr-service:8001" when unset.

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"aman-agency/backend/internal/models"
	"github.com/rs/zerolog/log"
)

const (
	defaultServiceURL = "http://ocr-service:8001"

	// First /extract call triggers PaddleOCR model download (~500 MB).
	// Set a generous timeout so the Go client doesn't give up before
	// the Python service finishes downloading and returns a result.
	defaultRequestTimeout = 300 * time.Second
)

// remoteRequest is the JSON body sent to POST /extract.
type remoteRequest struct {
	FileB64  string `json:"file_b64"`
	MimeType string `json:"mime_type"`
}

// remoteExtractedField mirrors the Python ExtractedField pydantic model.
type remoteExtractedField struct {
	Value       string  `json:"value"`
	Confidence  float64 `json:"confidence"`
	NeedsReview bool    `json:"needs_review"`
}

// remoteLineItem mirrors the Python ExtractedLineItem pydantic model.
type remoteLineItem struct {
	Description remoteExtractedField `json:"description"`
	Quantity    remoteExtractedField `json:"quantity"`
	UnitPrice   remoteExtractedField `json:"unit_price"`
	Amount      remoteExtractedField `json:"amount"`
	HSNCode     remoteExtractedField `json:"hsn_code"`
	TaxRate     remoteExtractedField `json:"tax_rate"`
	// Device-specific fields
	IMEI      remoteExtractedField `json:"imei"`
	ModelCode remoteExtractedField `json:"model_code"`
	Color     remoteExtractedField `json:"color"`
	Storage   remoteExtractedField `json:"storage"`
}

// remoteExtractionResult mirrors the Python InvoiceExtractionResult pydantic model.
type remoteExtractionResult struct {
	VendorName    remoteExtractedField `json:"vendor_name"`
	VendorGSTIN   remoteExtractedField `json:"vendor_gstin"`
	VendorPhone   remoteExtractedField `json:"vendor_phone"`
	VendorAddress remoteExtractedField `json:"vendor_address"`
	VendorEmail   remoteExtractedField `json:"vendor_email"`

	InvoiceNumber remoteExtractedField `json:"invoice_number"`
	InvoiceDate   remoteExtractedField `json:"invoice_date"`
	DueDate       remoteExtractedField `json:"due_date"`
	PaymentTerms  remoteExtractedField `json:"payment_terms"`

	Subtotal    remoteExtractedField `json:"subtotal"`
	CGST        remoteExtractedField `json:"cgst"`
	SGST        remoteExtractedField `json:"sgst"`
	IGST        remoteExtractedField `json:"igst"`
	TaxAmount   remoteExtractedField `json:"tax_amount"`
	TotalAmount remoteExtractedField `json:"total_amount"`
	Notes       remoteExtractedField `json:"notes"`

	LineItems []remoteLineItem `json:"line_items"`

	OverallConfidence  float64 `json:"overall_confidence"`
	LowConfidenceCount int     `json:"low_confidence_count"`
}

// remoteOCRResponse mirrors the Python OCRResponse pydantic model.
type remoteOCRResponse struct {
	Extraction       remoteExtractionResult `json:"extraction"`
	ProcessingTimeMs int                    `json:"processing_time_ms"`
	EngineName       string                 `json:"engine_name"`
	Warnings         []string               `json:"warnings"`
}

// RemoteEngine calls the Python PaddleOCR microservice.
type RemoteEngine struct {
	name       string
	serviceURL string
	fallback   Engine
	client     *http.Client
}

// NewRemoteEngine constructs a RemoteEngine.
//   - serviceURL: base URL, e.g. "http://ocr-service:8001" (empty → default)
//   - fallback:   engine to use when the service is unreachable (may be nil)
//   - _:          reserved parameter (kept for API stability)
func NewRemoteEngine(serviceURL string, fallback Engine, _ interface{}) *RemoteEngine {
	if serviceURL == "" {
		serviceURL = defaultServiceURL
	}
	return &RemoteEngine{
		name:       "PaddleOCR (Python service)",
		serviceURL: serviceURL,
		fallback:   fallback,
		client: &http.Client{
			Timeout: defaultRequestTimeout,
		},
	}
}

// Name implements Engine.
func (e *RemoteEngine) Name() string { return e.name }

// ExtractFromFile implements Engine.
// On any HTTP-level error it transparently falls back to e.fallback (if configured).
func (e *RemoteEngine) ExtractFromFile(ctx context.Context, fileBytes []byte, mimeType string) (*EngineResult, error) {
	start := time.Now()

	result, err := e.callService(ctx, fileBytes, mimeType)
	if err != nil {
		log.Warn().Err(err).Str("url", e.serviceURL).Msg("RemoteEngine: OCR service call failed, using fallback")
		if e.fallback != nil {
			return e.fallback.ExtractFromFile(ctx, fileBytes, mimeType)
		}
		return nil, fmt.Errorf("paddleocr remote: %w", err)
	}

	goResult := remoteToGoModel(&result.Extraction)
	RecomputeQuality(goResult, lowConfidenceThreshold)
	MarkNeedsReview(goResult, lowConfidenceThreshold)

	engineName := result.EngineName
	if engineName == "" {
		engineName = e.name
	}

	return &EngineResult{
		Extraction:     goResult,
		EngineName:     engineName,
		ProcessingTime: time.Since(start),
	}, nil
}

// callService makes the HTTP request to the Python microservice.
func (e *RemoteEngine) callService(ctx context.Context, fileBytes []byte, mimeType string) (*remoteOCRResponse, error) {
	payload := remoteRequest{
		FileB64:  base64.StdEncoding.EncodeToString(fileBytes),
		MimeType: mimeType,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		e.serviceURL+"/extract",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http call: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20)) // cap at 8 MiB
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		snippet := string(respBody)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return nil, fmt.Errorf("service returned HTTP %d: %s", resp.StatusCode, snippet)
	}

	var out remoteOCRResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &out, nil
}

// ─── Model conversion ─────────────────────────────────────────────────────────

func toGoField(r remoteExtractedField) models.ExtractedField {
	return models.ExtractedField{
		Value:       r.Value,
		Confidence:  r.Confidence,
		NeedsReview: r.NeedsReview,
	}
}

func remoteToGoModel(r *remoteExtractionResult) *models.InvoiceExtractionResult {
	if r == nil {
		return &models.InvoiceExtractionResult{}
	}

	items := make([]models.ExtractedLineItem, 0, len(r.LineItems))
	for _, li := range r.LineItems {
		items = append(items, models.ExtractedLineItem{
			Description: toGoField(li.Description),
			Quantity:    toGoField(li.Quantity),
			UnitPrice:   toGoField(li.UnitPrice),
			Amount:      toGoField(li.Amount),
			HSNCode:     toGoField(li.HSNCode),
			TaxRate:     toGoField(li.TaxRate),
			IMEI:        toGoField(li.IMEI),
			ModelCode:   toGoField(li.ModelCode),
			Color:       toGoField(li.Color),
			Storage:     toGoField(li.Storage),
		})
	}

	return &models.InvoiceExtractionResult{
		VendorName:    toGoField(r.VendorName),
		VendorGSTIN:   toGoField(r.VendorGSTIN),
		VendorPhone:   toGoField(r.VendorPhone),
		VendorAddress: toGoField(r.VendorAddress),
		VendorEmail:   toGoField(r.VendorEmail),

		InvoiceNumber: toGoField(r.InvoiceNumber),
		InvoiceDate:   toGoField(r.InvoiceDate),
		DueDate:       toGoField(r.DueDate),
		PaymentTerms:  toGoField(r.PaymentTerms),

		Subtotal:    toGoField(r.Subtotal),
		CGST:        toGoField(r.CGST),
		SGST:        toGoField(r.SGST),
		IGST:        toGoField(r.IGST),
		TaxAmount:   toGoField(r.TaxAmount),
		TotalAmount: toGoField(r.TotalAmount),
		Notes:       toGoField(r.Notes),

		LineItems:          items,
		OverallConfidence:  r.OverallConfidence,
		LowConfidenceCount: r.LowConfidenceCount,
	}
}
