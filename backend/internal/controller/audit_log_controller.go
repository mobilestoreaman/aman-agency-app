package controller

import (
	"time"

	"aman-agency/backend/internal/repository"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AuditLogController handles audit log listing for admin dashboards.
type AuditLogController struct {
	auditSvc service.AuditService
}

// NewAuditLogController constructs an AuditLogController.
func NewAuditLogController(auditSvc service.AuditService) *AuditLogController {
	return &AuditLogController{auditSvc: auditSvc}
}

// List handles GET /api/v1/admin/audit-logs
// @Summary      List audit logs
// @Description  Returns paginated audit logs for admin dashboards. Supports filtering by actor, action, and resource.
// @Tags         audit
// @Produce      json
// @Security     BearerAuth
// @Param        page        query  int     false  "Page (default 1)"
// @Param        limit       query  int     false  "Per page (default 20, max 100)"
// @Param        actor_id    query  string  false  "Filter by actor ObjectID"
// @Param        action      query  string  false  "Filter by action (e.g. user.create)"
// @Param        resource    query  string  false  "Filter by resource (e.g. user)"
// @Param        from_date   query  string  false  "Filter from date (RFC3339)"
// @Param        to_date     query  string  false  "Filter to date (RFC3339)"
// @Success      200  {array}  models.AuditLog
// @Router       /admin/audit-logs [get]
func (ctrl *AuditLogController) List(c *fiber.Ctx) error {
	var filter repository.AuditFilter

	// Parse pagination
	filter.Page = c.QueryInt("page", 1)
	filter.Limit = c.QueryInt("limit", 20)

	// Parse optional actor_id filter
	if actorIDStr := c.Query("actor_id"); actorIDStr != "" {
		oid, err := primitive.ObjectIDFromHex(actorIDStr)
		if err != nil {
			return apperror.BadRequest("invalid actor_id format")
		}
		filter.ActorID = oid
	}

	// Parse optional action and resource filters
	filter.Action = c.Query("action")
	filter.Resource = c.Query("resource")

	// Parse optional date range filters (RFC3339 format)
	if fromDateStr := c.Query("from_date"); fromDateStr != "" {
		fromDate, err := time.Parse(time.RFC3339, fromDateStr)
		if err != nil {
			return apperror.BadRequest("invalid from_date format (expected RFC3339)")
		}
		filter.FromDate = fromDate
	}

	if toDateStr := c.Query("to_date"); toDateStr != "" {
		toDate, err := time.Parse(time.RFC3339, toDateStr)
		if err != nil {
			return apperror.BadRequest("invalid to_date format (expected RFC3339)")
		}
		filter.ToDate = toDate
	}

	logs, meta, err := ctrl.auditSvc.List(c.Context(), filter)
	if err != nil {
		return err
	}

	return response.OKWithMeta(c, logs, meta)
}
