package ocr

import (
	"context"
	"fmt"
	"sync"
	"time"

	"aman-agency/backend/internal/models"
)

// ManagerConfig holds tuneable thresholds for the Manager.
// Zero values use sensible defaults.
type ManagerConfig struct {
	// AutoRetryThreshold: in ModeAuto, retry with alternate engine if primary
	// overall confidence falls below this value. Default: 0.75.
	AutoRetryThreshold float64

	// AutoMergeThreshold: when two engine results are compared, if the confidence
	// delta exceeds this, use the winner outright instead of merging field-by-field.
	// Reserved for future multi-engine setups. Default: 0.15.
	AutoMergeThreshold float64

	// ConfidenceThreshold: fields below this are flagged NeedsReview. Default: 0.70.
	ConfidenceThreshold float64
}

func (c *ManagerConfig) applyDefaults() {
	if c.AutoRetryThreshold == 0 {
		c.AutoRetryThreshold = 0.75
	}
	if c.AutoMergeThreshold == 0 {
		c.AutoMergeThreshold = 0.15
	}
	if c.ConfidenceThreshold == 0 {
		c.ConfidenceThreshold = 0.70
	}
}

// Manager orchestrates one or more OCR engines according to the requested mode.
//
// Engine registry:
//   - primary: default engine for ModeAuto and ModePrimary (currently TesseractEngine)
//   - alternate: reserved for a second engine; pass nil when only one engine is configured
//   - named: additional engines addressable directly by mode string (e.g. "tesseract")
type Manager struct {
	primary   Engine
	alternate Engine
	named     map[string]Engine // keyed by OCRMode value (e.g. "paddleocr", "tesseract")
	cfg       ManagerConfig
}

// NewManager constructs a Manager.
// primary must not be nil. alternate may be nil (auto/both modes degrade gracefully).
func NewManager(primary, alternate Engine, cfg ManagerConfig) *Manager {
	cfg.applyDefaults()
	m := &Manager{
		primary:   primary,
		alternate: alternate,
		named:     make(map[string]Engine),
		cfg:       cfg,
	}
	// Register primary engine under the "primary" mode key
	if primary != nil {
		m.named[string(ModePrimary)] = primary
	}
	return m
}

// RegisterEngine adds a named engine addressable via OCRMode (e.g. "paddleocr", "tesseract").
// Call this after NewManager for optional engines.
func (m *Manager) RegisterEngine(mode OCRMode, eng Engine) {
	m.named[string(mode)] = eng
}

// Process runs the OCR pipeline for the given mode and returns a ProcessResult.
func (m *Manager) Process(ctx context.Context, mode OCRMode, fileBytes []byte, mimeType string) (*ProcessResult, error) {
	start := time.Now()

	switch mode {
	case ModeTesseract:
		// Explicit Tesseract selection: look up named registration, fall back to primary.
		eng, ok := m.named[string(ModeTesseract)]
		if !ok || eng == nil {
			eng = m.primary
		}
		return m.runSingle(ctx, start, mode, eng, fileBytes, mimeType)
	default: // ModeAuto, ModePrimary — use primary (Tesseract standalone)
		return m.runAuto(ctx, start, fileBytes, mimeType)
	}
}

// ─── Internal run methods ─────────────────────────────────────────────────────

func (m *Manager) runSingle(ctx context.Context, start time.Time, mode OCRMode, eng Engine, fileBytes []byte, mimeType string) (*ProcessResult, error) {
	if eng == nil {
		if m.primary != nil {
			eng = m.primary
		} else {
			return nil, fmt.Errorf("ocr: no engine available")
		}
	}

	er, err := eng.ExtractFromFile(ctx, fileBytes, mimeType)
	if err != nil {
		return nil, err
	}

	result := &ProcessResult{
		Extraction: er.Extraction,
		EngineUsed: er.EngineName,
		TotalTime:  time.Since(start),
	}
	if mode == ModePrimary || mode == ModeAuto {
		result.Primary = er
	} else {
		result.Alternate = er
	}
	return result, nil
}

func (m *Manager) runAuto(ctx context.Context, start time.Time, fileBytes []byte, mimeType string) (*ProcessResult, error) {
	if m.primary == nil {
		return nil, fmt.Errorf("ocr: no primary engine configured")
	}

	primaryResult, err := m.primary.ExtractFromFile(ctx, fileBytes, mimeType)
	if err != nil {
		// Primary failed — try alternate if available
		if m.alternate != nil {
			altResult, altErr := m.alternate.ExtractFromFile(ctx, fileBytes, mimeType)
			if altErr != nil {
				return nil, fmt.Errorf("ocr: primary failed (%v); alternate also failed (%v)", err, altErr)
			}
			return &ProcessResult{
				Extraction: altResult.Extraction,
				EngineUsed: altResult.EngineName,
				TotalTime:  time.Since(start),
				RetryCount: 1,
				Alternate:  altResult,
			}, nil
		}
		return nil, err
	}

	// Primary succeeded — check if confidence is good enough
	if primaryResult.Extraction.OverallConfidence >= m.cfg.AutoRetryThreshold || m.alternate == nil {
		return &ProcessResult{
			Extraction: primaryResult.Extraction,
			EngineUsed: primaryResult.EngineName,
			TotalTime:  time.Since(start),
			Primary:    primaryResult,
		}, nil
	}

	// Confidence too low — retry with alternate
	altResult, err := m.alternate.ExtractFromFile(ctx, fileBytes, mimeType)
	if err != nil {
		// Alternate failed — return primary result (better than nothing)
		return &ProcessResult{
			Extraction: primaryResult.Extraction,
			EngineUsed: primaryResult.EngineName,
			TotalTime:  time.Since(start),
			RetryCount: 1,
			Primary:    primaryResult,
		}, nil
	}

	// Pick the better result
	var chosen *EngineResult
	if altResult.Extraction.OverallConfidence >= primaryResult.Extraction.OverallConfidence {
		chosen = altResult
	} else {
		chosen = primaryResult
	}

	pr := &ProcessResult{
		Extraction: chosen.Extraction,
		EngineUsed: chosen.EngineName,
		TotalTime:  time.Since(start),
		RetryCount: 1,
		Primary:    primaryResult,
		Alternate:  altResult,
	}

	// Add comparison metadata
	_, cmp := MergeResults(primaryResult, altResult, m.cfg.AutoMergeThreshold, m.cfg.ConfidenceThreshold)
	pr.Comparison = cmp

	return pr, nil
}

func (m *Manager) runBoth(ctx context.Context, start time.Time, fileBytes []byte, mimeType string) (*ProcessResult, error) {
	if m.primary == nil {
		return nil, fmt.Errorf("ocr: no primary engine configured for 'both' mode")
	}
	if m.alternate == nil {
		// Degrade to primary only
		return m.runSingle(ctx, start, ModePrimary, m.primary, fileBytes, mimeType)
	}

	type engineOut struct {
		result *EngineResult
		err    error
	}

	pCh := make(chan engineOut, 1)
	aCh := make(chan engineOut, 1)

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		r, err := m.primary.ExtractFromFile(ctx, fileBytes, mimeType)
		pCh <- engineOut{r, err}
	}()
	go func() {
		defer wg.Done()
		r, err := m.alternate.ExtractFromFile(ctx, fileBytes, mimeType)
		aCh <- engineOut{r, err}
	}()

	wg.Wait()
	pOut := <-pCh
	aOut := <-aCh

	if pOut.err != nil && aOut.err != nil {
		return nil, fmt.Errorf("ocr: both engines failed — primary: %v; alternate: %v", pOut.err, aOut.err)
	}
	if pOut.err != nil {
		return &ProcessResult{
			Extraction: aOut.result.Extraction,
			EngineUsed: aOut.result.EngineName,
			TotalTime:  time.Since(start),
			Alternate:  aOut.result,
		}, nil
	}
	if aOut.err != nil {
		return &ProcessResult{
			Extraction: pOut.result.Extraction,
			EngineUsed: pOut.result.EngineName,
			TotalTime:  time.Since(start),
			Primary:    pOut.result,
		}, nil
	}

	// Both succeeded — merge
	merged, cmp := MergeResults(pOut.result, aOut.result, m.cfg.AutoMergeThreshold, m.cfg.ConfidenceThreshold)

	engineUsed := "merged"
	if !cmp.AutoMerged {
		// Wholesale winner
		if pOut.result.Extraction.OverallConfidence >= aOut.result.Extraction.OverallConfidence {
			engineUsed = pOut.result.EngineName
		} else {
			engineUsed = aOut.result.EngineName
		}
	}

	return &ProcessResult{
		Extraction: merged,
		EngineUsed: engineUsed,
		TotalTime:  time.Since(start),
		Primary:    pOut.result,
		Alternate:  aOut.result,
		Comparison: cmp,
	}, nil
}

// AvailableEngines returns a map of mode → engine name for all registered engines.
// Used by the frontend to know which modes are available.
func (m *Manager) AvailableEngines() map[string]string {
	engineName := "Tesseract OCR (Standalone)"
	if m.primary != nil {
		engineName = m.primary.Name()
	}
	return map[string]string{
		"auto":      "Auto (Recommended)",
		"tesseract": engineName,
	}
}

// toOCRMetrics converts a ProcessResult into the OCRMetrics model for DB storage.
func ToOCRMetrics(pr *ProcessResult, mode OCRMode) *models.OCRMetrics {
	m := &models.OCRMetrics{
		Mode:         string(mode),
		EngineUsed:   pr.EngineUsed,
		ProcessingMs: pr.TotalTime.Milliseconds(),
		RetryCount:   pr.RetryCount,
	}
	if pr.Primary != nil {
		m.PrimaryConf = pr.Primary.Extraction.OverallConfidence
	}
	if pr.Alternate != nil {
		m.AlternateConf = pr.Alternate.Extraction.OverallConfidence
	}
	return m
}
