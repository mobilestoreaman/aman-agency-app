package controller

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// maxLogoBytes is the upload size cap (2 MB). Larger images are rejected to
// keep the MongoDB document manageable; the base64 representation of a 2 MB
// image is ~2.7 MB, well within MongoDB's 16 MB document limit.
const maxLogoBytes = 2 * 1024 * 1024

// SettingsController handles GET and PUT /settings.
// GET is available to any authenticated staff (needed to render bill headers,
// currency symbols, etc. on the PWA); PUT is admin-only via route middleware.
type SettingsController struct {
	svc      service.SettingsService
	auditSvc service.AuditService
}

// NewSettingsController constructs a SettingsController.
func NewSettingsController(svc service.SettingsService, auditSvc service.AuditService) *SettingsController {
	return &SettingsController{svc: svc, auditSvc: auditSvc}
}

// Get godoc
// @Summary      Get store settings
// @Description  Returns the singleton store configuration. Creates default values on first boot.
// @Tags         Settings
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /settings [get]
func (ctrl *SettingsController) Get(c *fiber.Ctx) error {
	settings, err := ctrl.svc.Get(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, settings)
}

// UploadLogo godoc
// @Summary      Upload store logo (admin)
// @Description  Admin only. Accepts a multipart/form-data upload with a single
//
//	"logo" file field. Supported types: image/jpeg, image/png, image/webp,
//	image/gif, image/svg+xml. Maximum size: 2 MB.
//	The image is converted to a base64 data URL and stored in settings.
//
// @Tags         Settings
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        logo  formData  file  true  "Logo image file (max 2 MB)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /settings/logo [post]
func (ctrl *SettingsController) UploadLogo(c *fiber.Ctx) error {
	fh, err := c.FormFile("logo")
	if err != nil {
		return apperror.BadRequest("logo file is required (multipart field: logo)")
	}

	// Enforce size cap before reading the file into memory.
	if fh.Size > maxLogoBytes {
		return apperror.BadRequest(fmt.Sprintf(
			"logo file too large: %.1f MB (max 2 MB)", float64(fh.Size)/1024/1024,
		))
	}

	// Validate MIME type against the Content-Type header provided by the client.
	// We also sniff the actual bytes below for defence-in-depth.
	ct := fh.Header.Get("Content-Type")
	if !isAllowedImageMIME(ct) {
		return apperror.BadRequest("unsupported image type: use JPEG, PNG, WebP, GIF, or SVG")
	}

	f, err := fh.Open()
	if err != nil {
		return apperror.BadRequest("could not open uploaded file")
	}
	defer f.Close()

	imgBytes := make([]byte, fh.Size)
	if _, err := f.Read(imgBytes); err != nil {
		return apperror.BadRequest("could not read uploaded file")
	}

	// Defence-in-depth: sniff the actual file bytes rather than trusting the
	// client-declared Content-Type header. This prevents uploading a script/
	// executable disguised with a fake MIME type header.
	sniffed := http.DetectContentType(imgBytes)
	// DetectContentType returns e.g. "image/png" (no params), so normalise once.
	sniffedBase := strings.ToLower(strings.TrimSpace(strings.Split(sniffed, ";")[0]))
	// SVG is text/xml or text/plain when sniffed — allow client-declared svg+xml
	// only if the declared type is svg and the sniffed type is text/*.
	isSVG := ct == "image/svg+xml" && strings.HasPrefix(sniffedBase, "text/")
	if !isAllowedImageMIME(sniffedBase) && !isSVG {
		return apperror.BadRequest(fmt.Sprintf(
			"file content does not match an allowed image type (detected: %s)", sniffedBase,
		))
	}

	// Build the data URL: "data:<mime>;base64,<encoded>"
	encoded := base64.StdEncoding.EncodeToString(imgBytes)
	dataURL := fmt.Sprintf("data:%s;base64,%s", ct, encoded)

	staffEmail := middleware.GetUserEmail(c)
	settings, err := ctrl.svc.SetLogo(c.Context(), staffEmail, dataURL)
	if err != nil {
		return err
	}
	return response.OK(c, settings)
}

// DeleteLogo godoc
// @Summary      Delete store logo (admin)
// @Description  Admin only. Removes the store logo from settings.
// @Tags         Settings
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /settings/logo [delete]
func (ctrl *SettingsController) DeleteLogo(c *fiber.Ctx) error {
	staffEmail := middleware.GetUserEmail(c)
	settings, err := ctrl.svc.RemoveLogo(c.Context(), staffEmail)
	if err != nil {
		return err
	}
	return response.OK(c, settings)
}

// isAllowedImageMIME returns true for the image MIME types we accept as logos.
func isAllowedImageMIME(mimeType string) bool {
	// Normalise: strip parameters like "; charset=utf-8"
	mimeType = strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	switch mimeType {
	case "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml":
		return true
	}
	return false
}

// Update godoc
// @Summary      Update store settings (admin)
// @Description  Admin only. Applies a partial update to store configuration. Only non-empty string fields and all numeric fields are written.
// @Tags         Settings
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  dto.UpdateSettingsRequest  true  "Settings update payload"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /settings [put]
func (ctrl *SettingsController) Update(c *fiber.Ctx) error {
	var req dto.UpdateSettingsRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	staffEmail := middleware.GetUserEmail(c)
	settings, err := ctrl.svc.Update(c.Context(), staffEmail, req)
	if err != nil {
		return err
	}

	// Log the settings update for audit trail
	changes := make(map[string]interface{})
	if req.StoreName != "" {
		changes["store_name"] = req.StoreName
	}
	if req.Currency != "" {
		changes["currency"] = req.Currency
	}
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionSettingsUpdate, "settings", "singleton", changes)

	return response.OK(c, settings)
}
