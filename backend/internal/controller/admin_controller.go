package controller

import (
	"mime"
	"path/filepath"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// AdminController handles all /api/v1/admin/db/* endpoints.
// Every endpoint is protected by AdminOnly middleware at the route level.
type AdminController struct {
	svc      service.AdminService
	auditSvc service.AuditService
}

// NewAdminController constructs an AdminController.
func NewAdminController(svc service.AdminService, auditSvc service.AuditService) *AdminController {
	return &AdminController{svc: svc, auditSvc: auditSvc}
}

// ── Collections ───────────────────────────────────────────────────────────────

// ListCollections godoc
// @Summary     List all MongoDB collections with basic stats
// @Tags        admin-db
// @Produce     json
// @Success     200 {object} response.envelope
// @Router      /admin/db/collections [get]
func (ctrl *AdminController) ListCollections(c *fiber.Ctx) error {
	infos, err := ctrl.svc.ListCollections(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, infos)
}

// GetCollectionStats godoc
// @Summary     Get stats for a single collection
// @Tags        admin-db
// @Param       collection path string true "Collection name"
// @Produce     json
// @Success     200 {object} response.envelope
// @Router      /admin/db/collections/{collection}/stats [get]
func (ctrl *AdminController) GetCollectionStats(c *fiber.Ctx) error {
	name := c.Params("collection")
	if name == "" {
		return apperror.BadRequest("collection name is required")
	}
	info, err := ctrl.svc.GetCollectionStats(c.Context(), name)
	if err != nil {
		return err
	}
	return response.OK(c, info)
}

// ── Documents ─────────────────────────────────────────────────────────────────

// ListDocuments godoc
// @Summary     List documents in a collection (paginated, filtered)
// @Tags        admin-db
// @Param       collection path  string true  "Collection name"
// @Param       page       query int    false "Page (default 1)"
// @Param       limit      query int    false "Limit (max 50, default 20)"
// @Param       search     query string false "Free-text search"
// @Param       field      query string false "Exact field filter"
// @Param       value      query string false "Field filter value"
// @Param       sort_by    query string false "Sort field (default _id)"
// @Param       sort_dir   query string false "asc | desc (default desc)"
// @Param       date_field query string false "Date range field"
// @Param       from       query string false "Date from (RFC3339)"
// @Param       to         query string false "Date to (RFC3339)"
// @Produce     json
// @Success     200 {object} response.envelope
// @Router      /admin/db/collections/{collection}/documents [get]
func (ctrl *AdminController) ListDocuments(c *fiber.Ctx) error {
	collection := c.Params("collection")
	if collection == "" {
		return apperror.BadRequest("collection name is required")
	}

	var f dto.DocumentFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}
	// Safety clamp
	if f.Page < 1 {
		f.Page = 1
	}
	if f.Limit < 1 || f.Limit > 50 {
		f.Limit = 20
	}

	docs, meta, err := ctrl.svc.ListDocuments(c.Context(), collection, f)
	if err != nil {
		return err
	}

	return response.OKWithMeta(c, docs, meta)
}

// GetDocument godoc
// @Summary     Fetch a single document by _id
// @Tags        admin-db
// @Param       collection path string true "Collection name"
// @Param       id         path string true "Document _id (hex ObjectID or string)"
// @Produce     json
// @Success     200 {object} response.envelope
// @Router      /admin/db/collections/{collection}/documents/{id} [get]
func (ctrl *AdminController) GetDocument(c *fiber.Ctx) error {
	collection := c.Params("collection")
	id := c.Params("id")
	if collection == "" || id == "" {
		return apperror.BadRequest("collection and document id are required")
	}

	doc, err := ctrl.svc.GetDocument(c.Context(), collection, id)
	if err != nil {
		return err
	}
	return response.OK(c, doc)
}

// ── Dumps ─────────────────────────────────────────────────────────────────────

// GenerateDump godoc
// @Summary     Generate a MongoDB dump (JSON or ZIP)
// @Tags        admin-db
// @Accept      json
// @Produce     json
// @Param       body body dto.DumpRequest true "Dump request"
// @Success     200 {object} response.envelope
// @Router      /admin/db/dump/generate [post]
func (ctrl *AdminController) GenerateDump(c *fiber.Ctx) error {
	var req dto.DumpRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	userEmail := middleware.GetUserEmail(c)
	ip := c.IP()

	record, err := ctrl.svc.GenerateDump(c.Context(), req, userEmail, ip)
	if err != nil {
		return err
	}

	// Audit log
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionDBDumpGenerate, "dump", record.ID,
		map[string]interface{}{
			"collection":   record.Collection,
			"format":       record.Format,
			"file_name":    record.FileName,
			"size_bytes":   record.SizeBytes,
			"generated_by": userEmail,
		},
	)

	return response.OK(c, record)
}

// DownloadDump godoc
// @Summary     Download a previously generated dump file
// @Tags        admin-db
// @Param       id path string true "Dump ID"
// @Produce     application/zip
// @Success     200 {file} binary
// @Router      /admin/db/dump/{id}/download [get]
func (ctrl *AdminController) DownloadDump(c *fiber.Ctx) error {
	dumpID := c.Params("id")
	if dumpID == "" {
		return apperror.BadRequest("dump id is required")
	}

	record, err := ctrl.svc.GetDumpRecord(c.Context(), dumpID)
	if err != nil {
		return err
	}

	filePath, err := ctrl.svc.GetDumpFilePath(c.Context(), dumpID)
	if err != nil {
		return err
	}

	// Detect MIME type from file extension.
	ext := filepath.Ext(record.FileName)
	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		if ext == ".zip" {
			mimeType = "application/zip"
		} else {
			mimeType = "application/octet-stream"
		}
	}

	// Audit download
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionDBDumpDownload, "dump", dumpID,
		map[string]interface{}{
			"file_name": record.FileName,
			"user":      middleware.GetUserEmail(c),
		},
	)

	c.Set("Content-Disposition", `attachment; filename="`+record.FileName+`"`)
	c.Set("Content-Type", mimeType)
	c.Set("X-Content-Type-Options", "nosniff")

	return c.SendFile(filePath)
}

// ListDumpHistory godoc
// @Summary     List all previously generated dumps
// @Tags        admin-db
// @Produce     json
// @Success     200 {object} response.envelope
// @Router      /admin/db/dump/history [get]
func (ctrl *AdminController) ListDumpHistory(c *fiber.Ctx) error {
	history, err := ctrl.svc.ListDumpHistory(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, history)
}

