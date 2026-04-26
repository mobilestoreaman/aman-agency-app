package controller

import (
	"encoding/csv"
	"fmt"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// TraceLogController handles trace log listing and inspection for admin dashboards.
type TraceLogController struct {
	svc service.TraceLogService
}

// NewTraceLogController constructs a TraceLogController.
func NewTraceLogController(svc service.TraceLogService) *TraceLogController {
	return &TraceLogController{svc: svc}
}

// List handles GET /api/v1/admin/logs
// Returns paginated list of trace logs with optional filtering.
//
// @Summary      List trace logs
// @Description  Returns paginated trace logs for admin dashboards. Supports filtering by level, module, status, and custom search.
// @Tags         logs
// @Produce      json
// @Security     BearerAuth
// @Param        page        query  int     false  "Page (default 1)"
// @Param        limit       query  int     false  "Per page (default 20, max 100)"
// @Param        trace_id    query  string  false  "Filter by trace ID"
// @Param        level       query  string  false  "Filter by level (DEBUG, INFO, WARN, ERROR)"
// @Param        module      query  string  false  "Filter by module (Auth, Sales, Inventory, etc.)"
// @Param        status      query  string  false  "Filter by status (success, failure)"
// @Param        search      query  string  false  "Full-text search (message, path, email, tags)"
// @Param        user_id     query  string  false  "Filter by user ID"
// @Param        from_date   query  string  false  "Filter from date (YYYY-MM-DD)"
// @Param        to_date     query  string  false  "Filter to date (YYYY-MM-DD)"
// @Param        sort_order  query  string  false  "Sort order (asc, desc)"
// @Success      200  {object}  response.Meta  "List of trace logs with pagination meta"
// @Router       /admin/logs [get]
func (ctrl *TraceLogController) List(c *fiber.Ctx) error {
	var filter dto.TraceLogFilterRequest
	if err := c.QueryParser(&filter); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}

	logs, meta, err := ctrl.svc.List(c.Context(), filter)
	if err != nil {
		return err
	}

	return response.OKWithMeta(c, logs, meta)
}

// GetByID handles GET /api/v1/admin/logs/:id
// Returns full trace log details including payloads and stack trace.
//
// @Summary      Get trace log by ID
// @Description  Returns complete details of a single trace log, including request/response payloads and stack trace.
// @Tags         logs
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Trace log object ID"
// @Success      200  {object}  dto.TraceLogDetailResponse
// @Router       /admin/logs/{id} [get]
func (ctrl *TraceLogController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("missing id parameter")
	}

	detail, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}

	return response.OK(c, detail)
}

// GetTrace handles GET /api/v1/admin/logs/trace/:traceID
// Returns all spans for a trace in chronological order (timeline view).
//
// @Summary      Get trace timeline
// @Description  Returns all log entries (spans) for a given trace ID in chronological order, forming a complete request journey.
// @Tags         logs
// @Produce      json
// @Security     BearerAuth
// @Param        traceID  path  string  true  "Trace ID (UUID)"
// @Success      200  {array}   dto.TraceLogResponse
// @Router       /admin/logs/trace/{traceID} [get]
func (ctrl *TraceLogController) GetTrace(c *fiber.Ctx) error {
	traceID := c.Params("traceID")
	if traceID == "" {
		return apperror.BadRequest("missing traceID parameter")
	}

	logs, err := ctrl.svc.GetTrace(c.Context(), traceID)
	if err != nil {
		return err
	}

	return response.OK(c, logs)
}

// Export handles GET /api/v1/admin/logs/export
// Exports filtered trace logs as CSV or JSON file.
//
// @Summary      Export trace logs
// @Description  Exports trace logs in CSV or JSON format based on the format query parameter.
// @Tags         logs
// @Security     BearerAuth
// @Param        format      query  string  true   "Export format (csv, json)"
// @Param        trace_id    query  string  false  "Filter by trace ID"
// @Param        level       query  string  false  "Filter by level"
// @Param        module      query  string  false  "Filter by module"
// @Param        status      query  string  false  "Filter by status"
// @Param        search      query  string  false  "Full-text search"
// @Param        user_id     query  string  false  "Filter by user ID"
// @Param        from_date   query  string  false  "Filter from date (YYYY-MM-DD)"
// @Param        to_date     query  string  false  "Filter to date (YYYY-MM-DD)"
// @Success      200  "File download"
// @Router       /admin/logs/export [get]
func (ctrl *TraceLogController) Export(c *fiber.Ctx) error {
	format := c.Query("format", "json")
	if format != "csv" && format != "json" {
		return apperror.BadRequest("invalid format — expected csv or json")
	}

	var filter dto.TraceLogFilterRequest
	if err := c.QueryParser(&filter); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}

	// Set high limit for export (but still cap it)
	filter.Limit = 5000
	filter.Page = 1

	logs, _, err := ctrl.svc.List(c.Context(), filter)
	if err != nil {
		return err
	}

	if format == "csv" {
		return exportCSV(c, logs)
	}

	return exportJSON(c, logs)
}

// exportCSV exports logs as CSV.
func exportCSV(c *fiber.Ctx, logs []*dto.TraceLogResponse) error {
	c.Set("Content-Disposition", `attachment; filename="trace-logs.csv"`)
	c.Set("Content-Type", "text/csv")

	w := csv.NewWriter(c)
	defer w.Flush()

	// Write header
	header := []string{
		"ID", "TraceID", "SpanID", "Level", "Module", "Message",
		"Method", "Path", "StatusCode", "LatencyMs", "UserID", "UserEmail",
		"UserRole", "IPAddress", "ErrorMessage", "Status", "Tags", "CreatedAt",
	}
	if err := w.Write(header); err != nil {
		return err
	}

	// Write rows
	for _, log := range logs {
		row := []string{
			log.ID,
			log.TraceID,
			log.SpanID,
			log.Level,
			log.Module,
			log.Message,
			log.Method,
			log.Path,
			fmt.Sprintf("%d", log.StatusCode),
			fmt.Sprintf("%d", log.LatencyMs),
			log.UserID,
			log.UserEmail,
			log.UserRole,
			log.IPAddress,
			log.ErrorMessage,
			log.Status,
			fmt.Sprintf("%v", log.Tags),
			log.CreatedAt,
		}
		if err := w.Write(row); err != nil {
			return err
		}
	}

	return nil
}

// exportJSON exports logs as JSON.
func exportJSON(c *fiber.Ctx, logs []*dto.TraceLogResponse) error {
	c.Set("Content-Disposition", `attachment; filename="trace-logs.json"`)
	c.Set("Content-Type", "application/json")

	return response.OK(c, logs)
}

