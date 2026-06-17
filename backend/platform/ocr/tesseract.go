package ocr

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// TesseractEngine implements Engine using the Tesseract OCR CLI.
//
// # Container setup
//
// Add to your backend Dockerfile:
//
//	RUN apt-get update && apt-get install -y \
//	    tesseract-ocr \
//	    tesseract-ocr-eng \
//	    poppler-utils \
//	    && rm -rf /var/lib/apt/lists/*
//
// Additional language packs:
//
//	tesseract-ocr-hin  # Hindi (Devanagari)
//	tesseract-ocr-osd  # Orientation / script detection
//
// # Supported input formats
//
// Tesseract accepts JPEG and PNG natively. PDF inputs are first converted to
// JPEG at 300 DPI using Preprocessor (requires poppler-utils or ImageMagick).

const (
	tesseractDefaultBin  = "tesseract"
	tesseractDefaultLang = "eng"
)

// TesseractEngine implements Engine.
type TesseractEngine struct {
	name         string
	binPath      string
	language     string
	preprocessor *Preprocessor
	parser       *InvoiceTextParser
}

// NewTesseractEngine constructs a TesseractEngine.
//
//   - binPath: path to the tesseract binary (empty = "tesseract" from PATH)
//   - language: Tesseract language code, e.g. "eng", "eng+hin" (empty = "eng")
func NewTesseractEngine(name, binPath, language string) *TesseractEngine {
	if binPath == "" {
		binPath = tesseractDefaultBin
	}
	if language == "" {
		language = tesseractDefaultLang
	}
	return &TesseractEngine{
		name:         name,
		binPath:      binPath,
		language:     language,
		preprocessor: NewPreprocessor(),
		parser:       NewInvoiceTextParser(),
	}
}

// Name implements Engine.
func (e *TesseractEngine) Name() string { return e.name }

// ExtractFromFile preprocesses the file (converting PDFs to JPEG if necessary),
// runs Tesseract, and parses the raw stdout text into a structured result.
func (e *TesseractEngine) ExtractFromFile(ctx context.Context, fileBytes []byte, mimeType string) (*EngineResult, error) {
	start := time.Now()

	// Verify Tesseract is available
	if _, err := exec.LookPath(e.binPath); err != nil {
		return nil, fmt.Errorf("tesseract: binary %q not found — install tesseract-ocr in the container", e.binPath)
	}

	// Convert to image if needed (PDFs must be rasterised)
	imgBytes, imgMime, err := e.preprocessor.PrepareImage(ctx, fileBytes, mimeType)
	if err != nil {
		return nil, fmt.Errorf("tesseract: preprocess: %w", err)
	}

	// Apply image enhancement for better OCR accuracy
	imgBytes, _ = e.preprocessor.EnhanceImage(ctx, imgBytes, imgMime)

	// Write to temp file (Tesseract requires a file path, not stdin)
	ext := ".jpg"
	if strings.Contains(imgMime, "png") {
		ext = ".png"
	}
	tmp, err := os.CreateTemp("", "ocr-tesseract-*"+ext)
	if err != nil {
		return nil, fmt.Errorf("tesseract: create temp file: %w", err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(imgBytes); err != nil {
		tmp.Close()
		return nil, fmt.Errorf("tesseract: write temp file: %w", err)
	}
	tmp.Close()

	// Run Tesseract
	// Flags:
	//   stdout        — write output to stdout
	//   --psm 6       — assume a uniform block of text (good for invoices)
	//   --oem 1       — use LSTM OCR engine
	//   -l <lang>     — language(s) to use
	cmd := exec.CommandContext(ctx,
		e.binPath,
		tmp.Name(),
		"stdout",
		"--psm", "6",
		"--oem", "1",
		"-l", e.language,
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return nil, fmt.Errorf("tesseract: run: %s", errMsg)
	}

	rawText := stdout.String()
	if strings.TrimSpace(rawText) == "" {
		return nil, fmt.Errorf("tesseract: produced no output — check input image quality")
	}

	// Parse structured fields from raw text
	result := e.parser.Parse(rawText)

	return &EngineResult{
		Extraction:     result,
		EngineName:     e.name,
		ProcessingTime: time.Since(start),
	}, nil
}
