package controller

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// UploadController handles file upload endpoints.
type UploadController struct {
	storagePath   string // local directory to store uploaded files
	staticBaseURL string // public URL prefix used to construct the returned URL
}

// NewUploadController constructs an UploadController.
// storagePath  — absolute or relative path to the root storage directory
//
//	(e.g. "./storage"). Files are placed under <storagePath>/uploads/<category>/.
//
// staticBaseURL — public URL prefix for accessing stored files
//
//	(e.g. "http://localhost/static"). The final URL is
//	<staticBaseURL>/uploads/<category>/<filename>.
func NewUploadController(storagePath, staticBaseURL string) *UploadController {
	return &UploadController{
		storagePath:   storagePath,
		staticBaseURL: strings.TrimRight(staticBaseURL, "/"),
	}
}

// UploadProductImage handles POST /api/v1/upload/product-image
//
// Accepts:   multipart/form-data  field "file"
// Returns:   { "url": "http://..." }
// Limits:    5 MB per file, image/* MIME types only (jpeg, png, webp), max 3 images per product (enforced by product service)
func (ctrl *UploadController) UploadProductImage(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return apperror.BadRequest("no file provided — send a multipart/form-data request with a 'file' field")
	}

	// Size guard (5 MB)
	const maxSize = 5 * 1024 * 1024
	if file.Size > maxSize {
		return apperror.BadRequest("file too large — maximum allowed size is 5 MB")
	}

	// Open file for content-based MIME type detection
	src, err := file.Open()
	if err != nil {
		return apperror.BadRequest("failed to read file")
	}
	defer src.Close()

	// Read first 512 bytes for MIME type detection
	buf := make([]byte, 512)
	n, err := src.Read(buf)
	if err != nil && err != io.EOF {
		return apperror.BadRequest("failed to read file")
	}
	buf = buf[:n]

	// Detect MIME type from content (magic bytes)
	detectedMimeType := http.DetectContentType(buf)
	allowedMimeTypes := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/webp": true,
	}
	if !allowedMimeTypes[detectedMimeType] {
		return apperror.BadRequest(fmt.Sprintf("only JPEG, PNG, and WebP images are allowed; detected type: %s", detectedMimeType))
	}

	// Map detected MIME type to safe extension
	var ext string
	switch detectedMimeType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	default:
		ext = ".jpg" // fallback (shouldn't reach here)
	}

	// Unique filename: <unix-ms>_<uuid-prefix><ext>
	filename := fmt.Sprintf("%d_%s%s",
		time.Now().UnixMilli(),
		uuid.New().String()[:8],
		ext,
	)

	// Ensure destination directory exists
	dir := filepath.Join(ctrl.storagePath, "uploads", "products")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create upload directory: %w", err)
	}

	// Reset file pointer to beginning for saving
	src2, err := file.Open()
	if err != nil {
		return apperror.BadRequest("failed to read file")
	}
	defer src2.Close()

	// Save file to disk
	dst := filepath.Join(dir, filename)
	dstFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, src2); err != nil {
		_ = os.Remove(dst) // Clean up on error
		return fmt.Errorf("failed to save uploaded file: %w", err)
	}

	// Construct the public URL
	url := ctrl.staticBaseURL + "/uploads/products/" + filename

	return response.Created(c, fiber.Map{"url": url})
}
