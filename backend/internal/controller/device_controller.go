package controller

import (
	"strconv"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// DeviceController handles all /api/v1/devices and /api/v1/stock endpoints.
type DeviceController struct {
	svc service.DeviceService
}

// NewDeviceController constructs a DeviceController.
func NewDeviceController(svc service.DeviceService) *DeviceController {
	return &DeviceController{svc: svc}
}

// ── List ──────────────────────────────────────────────────────────────────────

// List handles GET /api/v1/devices
// @Summary      List devices
// @Description  Paginated inventory list. Supports filtering by product, status, condition, and IMEI/name search.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        page       query  int     false  "Page (default 1)"
// @Param        limit      query  int     false  "Per page (default 20, max 100)"
// @Param        product_id query  string  false  "Filter by product ObjectID"
// @Param        status     query  string  false  "Filter by status (in_stock|sold|repair|returned|defective)"
// @Param        condition  query  string  false  "Filter by condition (new|used|refurbished)"
// @Param        search     query  string  false  "Search by IMEI, product name, or brand"
// @Success      200  {array}   dto.DeviceResponse
// @Router       /devices [get]
func (ctrl *DeviceController) List(c *fiber.Ctx) error {
	f := dto.DeviceFilter{
		ProductID:          c.Query("product_id"),
		Status:             c.Query("status"),
		Condition:          c.Query("condition"),
		Search:             c.Query("search"),
		Page:               parseIntQuery(c, "page", 1),
		Limit:              parseIntQuery(c, "limit", 20),
		SortAvailableFirst: c.QueryBool("sort_available_first"),
	}
	devices, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, devices, meta)
}

// ── GetByID ───────────────────────────────────────────────────────────────────

// GetByID handles GET /api/v1/devices/:id
// @Summary      Get device by ID
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Device ObjectID"
// @Success      200  {object}  dto.DeviceResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /devices/{id} [get]
func (ctrl *DeviceController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("device id is required")
	}
	dev, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, dev)
}

// ── GetByIMEI ─────────────────────────────────────────────────────────────────

// GetByIMEI handles GET /api/v1/devices/imei/:imei
// @Summary      Look up device by IMEI
// @Description  Matches against IMEI1 and IMEI2. Returns 404 if not found.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        imei  path  string  true  "IMEI number"
// @Success      200  {object}  dto.DeviceResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /devices/imei/{imei} [get]
func (ctrl *DeviceController) GetByIMEI(c *fiber.Ctx) error {
	imei := c.Params("imei")
	if imei == "" {
		return apperror.BadRequest("IMEI is required")
	}
	dev, err := ctrl.svc.GetByIMEI(c.Context(), imei)
	if err != nil {
		return err
	}
	return response.OK(c, dev)
}

// ── Create ────────────────────────────────────────────────────────────────────

// Create handles POST /api/v1/devices  [admin only]
// @Summary      Add device to inventory
// @Description  Creates a new device unit. IMEI1 must be globally unique. Status defaults to in_stock.
// @Tags         devices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateDeviceRequest  true  "Device data"
// @Success      201   {object}  dto.DeviceResponse
// @Failure      400   {object}  map[string]interface{}
// @Failure      409   {object}  map[string]interface{}  "IMEI already exists"
// @Router       /devices [post]
func (ctrl *DeviceController) Create(c *fiber.Ctx) error {
	var req dto.CreateDeviceRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	dev, err := ctrl.svc.Create(c.Context(), req)
	if err != nil {
		return err
	}
	return response.Created(c, dev)
}

// ── Update ────────────────────────────────────────────────────────────────────

// Update handles PUT /api/v1/devices/:id  [admin only]
// @Summary      Update device fields
// @Description  Updates mutable fields. Status changes must use PATCH /devices/:id/status.
// @Tags         devices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                   true  "Device ObjectID"
// @Param        body  body      dto.UpdateDeviceRequest  true  "Fields to update"
// @Success      200   {object}  dto.DeviceResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /devices/{id} [put]
func (ctrl *DeviceController) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("device id is required")
	}
	var req dto.UpdateDeviceRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	dev, err := ctrl.svc.Update(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, dev)
}

// ── ChangeStatus ──────────────────────────────────────────────────────────────

// ChangeStatus handles PATCH /api/v1/devices/:id/status  [admin only]
// @Summary      Change device status
// @Description  Enforces the status state machine. Invalid transitions return 422.
// @Description  Allowed transitions:
// @Description    in_stock → sold | repair | defective
// @Description    sold     → returned
// @Description    repair   → in_stock | defective
// @Description    returned → in_stock | defective
// @Description    defective → repair
// @Tags         devices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                   true  "Device ObjectID"
// @Param        body  body      dto.ChangeStatusRequest  true  "New status"
// @Success      200   {object}  dto.DeviceResponse
// @Failure      422   {object}  map[string]interface{}  "Invalid transition"
// @Router       /devices/{id}/status [patch]
func (ctrl *DeviceController) ChangeStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("device id is required")
	}
	var req dto.ChangeStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	dev, err := ctrl.svc.ChangeStatus(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, dev)
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Delete handles DELETE /api/v1/devices/:id  [admin only]
// @Summary      Delete device
// @Description  Prevents deletion of devices in 'sold' or 'repair' status.
// @Tags         devices
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Device ObjectID"
// @Success      204
// @Failure      409  {object}  map[string]interface{}  "Device is sold or in repair"
// @Router       /devices/{id} [delete]
func (ctrl *DeviceController) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("device id is required")
	}
	if err := ctrl.svc.Delete(c.Context(), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ── Stock summary ─────────────────────────────────────────────────────────────

// StockSummary handles GET /api/v1/stock/summary
// @Summary      Stock summary
// @Description  Returns device counts per product grouped by status, plus global totals.
// @Tags         stock
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  dto.StockSummaryResponse
// @Router       /stock/summary [get]
func (ctrl *DeviceController) StockSummary(c *fiber.Ctx) error {
	summary, err := ctrl.svc.StockSummary(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, summary)
}

// ── helpers ───────────────────────────────────────────────────────────────────

// parseIntQuery parses a query-string integer, returning def on failure.
func parseIntQuery(c *fiber.Ctx, key string, def int) int {
	v := c.Query(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return def
	}
	return n
}
