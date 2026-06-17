package ocr

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Preprocessor converts uploaded files into a format suitable for raw-text OCR
// engines (PaddleOCR, Tesseract). Claude's vision API handles PDFs natively so
// this is not needed for AnthropicEngine.
//
// Supported operations:
//   - PDF → JPEG via pdftoppm (poppler-utils) or ImageMagick convert
//   - Pass-through for JPEG/PNG inputs (no-op)
//
// Image enhancement operations (deskew, denoise, contrast) are delegated to
// ImageMagick when available; they fall back gracefully if not installed.

type Preprocessor struct{}

// NewPreprocessor constructs a Preprocessor.
func NewPreprocessor() *Preprocessor { return &Preprocessor{} }

// PrepareImage converts fileBytes to JPEG bytes suitable for raw OCR.
// For PDF inputs it renders the first page at 300 DPI.
// For image inputs it returns the bytes as-is (engines handle JPEG/PNG).
func (p *Preprocessor) PrepareImage(ctx context.Context, fileBytes []byte, mimeType string) ([]byte, string, error) {
	switch {
	case strings.Contains(mimeType, "pdf"):
		return p.pdfToJPEG(ctx, fileBytes)
	case strings.Contains(mimeType, "jpeg"), strings.Contains(mimeType, "jpg"):
		return fileBytes, "image/jpeg", nil
	case strings.Contains(mimeType, "png"):
		return fileBytes, "image/png", nil
	default:
		// Unknown: try to pass through; the OCR engine will fail gracefully.
		return fileBytes, mimeType, nil
	}
}

// pdfToJPEG converts the first page of a PDF to JPEG at 300 DPI.
// Tries pdftoppm first (poppler-utils), then ImageMagick convert.
func (p *Preprocessor) pdfToJPEG(ctx context.Context, pdfBytes []byte) ([]byte, string, error) {
	// Write PDF to a temp file
	tmp, err := os.CreateTemp("", "ocr-preproc-*.pdf")
	if err != nil {
		return nil, "", fmt.Errorf("preprocessor: create temp file: %w", err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(pdfBytes); err != nil {
		tmp.Close()
		return nil, "", fmt.Errorf("preprocessor: write temp pdf: %w", err)
	}
	tmp.Close()

	outBase := tmp.Name() + "-page"

	// Try pdftoppm (poppler-utils) — output is <outBase>-1.jpg
	if path, err := exec.LookPath("pdftoppm"); err == nil {
		cmd := exec.CommandContext(ctx, path,
			"-r", "300",
			"-jpeg",
			"-f", "1", "-l", "1",
			tmp.Name(), outBase,
		)
		if err := cmd.Run(); err == nil {
			// Find the generated file
			pattern := outBase + "*.jpg"
			matches, _ := filepath.Glob(pattern)
			if len(matches) > 0 {
				data, err := os.ReadFile(matches[0])
				os.Remove(matches[0])
				if err == nil {
					return data, "image/jpeg", nil
				}
			}
		}
	}

	// Fallback: ImageMagick convert
	if path, err := exec.LookPath("convert"); err == nil {
		outFile := tmp.Name() + ".jpg"
		defer os.Remove(outFile)
		cmd := exec.CommandContext(ctx, path,
			"-density", "300",
			tmp.Name()+"[0]",
			"-quality", "90",
			outFile,
		)
		if err := cmd.Run(); err == nil {
			data, err := os.ReadFile(outFile)
			if err == nil {
				return data, "image/jpeg", nil
			}
		}
	}

	return nil, "", fmt.Errorf("preprocessor: PDF conversion failed — install poppler-utils or ImageMagick in the container")
}

// EnhanceImage applies basic image enhancement to improve OCR accuracy.
// Uses ImageMagick for deskew, denoise, and contrast normalisation.
// Returns original bytes unchanged if ImageMagick is not available.
func (p *Preprocessor) EnhanceImage(ctx context.Context, imgBytes []byte, mimeType string) ([]byte, error) {
	ext := ".jpg"
	if strings.Contains(mimeType, "png") {
		ext = ".png"
	}

	path, err := exec.LookPath("convert")
	if err != nil {
		// ImageMagick not available — skip enhancement silently
		return imgBytes, nil
	}

	in, err := os.CreateTemp("", "ocr-enhance-in-*"+ext)
	if err != nil {
		return imgBytes, nil
	}
	defer os.Remove(in.Name())
	if _, err := in.Write(imgBytes); err != nil {
		in.Close()
		return imgBytes, nil
	}
	in.Close()

	outFile := in.Name() + "-enhanced" + ext
	defer os.Remove(outFile)

	cmd := exec.CommandContext(ctx, path,
		in.Name(),
		"-deskew", "40%",
		"-despeckle",
		"-normalize",
		"-sharpen", "0x1",
		outFile,
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		// Non-fatal: return original
		return imgBytes, nil
	}

	enhanced, err := os.ReadFile(outFile)
	if err != nil {
		return imgBytes, nil
	}
	return enhanced, nil
}
