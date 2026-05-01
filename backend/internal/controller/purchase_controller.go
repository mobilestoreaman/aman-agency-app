package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// PurchaseController handles all /api/v1/purchases endpoints.
type PurchaseController struct {
	svc service.PurchaseService
}

// NewPurchaseController constructs a PurchaseController.
func NewPurchaseController(svc service.PurchaseService) *PurchaseController {
	return &PurchaseController{svc: svc}
}

// List handles GET /api/v1/purchases
// @Summary      List purchases
// @Description  Paginated list of purchase orders, most recent first.
// @Tags         purchases
// @Produce      json
// @Security     BearerAuth
// @Param        page       query  int     false  "Page (default 1)"
// @Param        limit      query  int     false  "Per page (default 20, max 100)"
// @Param        vendor_id  query  string  false  "Filter by vendor ObjectID"
// @Param        status     query  string  false  "Filter by status (pending|received|cancelled)"
// @Success      200  {array}  dto.PurchaseResponse
// @Router       /purchases [get]
func (ctrl *PurchaseController) List(c *fiber.Ctx) error {
	f := dto.PurchaseFilter{
		VendorID: c.Query("vendor_id"),
		Status:   c.Query("status"),
		Search:   c.Query("search"),
		Page:     parseIntQuery(c, "page", 1),
		Limit:    parseIntQuery(c, "limit", 20),
	}
	purchases, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, purchases, meta)
}

// GetByID handles GET /api/v1/purchases/:id
// @Summary      Get purchase by ID
// @Description  Returns the full purchase order including all line items.
// @Tags         purchases
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Purchase ObjectID"
// @Success      200  {object}  dto.PurchaseResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /purchases/{id} [get]
func (ctrl *PurchaseController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("purchase id is required")
	}
	p, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// Create handles POST /api/v1/purchases  [admin only]
// @Summary      Create purchase order
// @Description  Creates a new pending purchase order. Devices are NOT added to inventory until Receive is called.
// @Tags         purchases
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreatePurchaseRequest  true  "Purchase order data"
// @Success      201   {object}  dto.PurchaseResponse
// @Failure      400   {object}  map[string]interface{}
// @Router       /purchases [post]
func (ctrl *PurchaseController) Create(c *fiber.Ctx) error {
	var req dto.CreatePurchaseRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	p, err := ctrl.svc.Create(c.Context(), req)
	if err != nil {
		return err
	}
	return response.Created(c, p)
}

// Update handles PUT /api/v1/purchases/:id  [admin only]
// @Summary      Update purchase order
// @Description  Updates a pending purchase order's vendor, items, date, or notes.
// @Description  Received purchases cannot be edited.
// @Tags         purchases
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                      true  "Purchase ObjectID"
// @Param        body  body      dto.UpdatePurchaseRequest   true  "Fields to update"
// @Success      200   {object}  dto.PurchaseResponse
// @Failure      409   {object}  map[string]interface{}  "Purchase already received"
// @Router       /purchases/{id} [put]
func (ctrl *PurchaseController) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("purchase id is required")
	}
	var req dto.UpdatePurchaseRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	p, err := ctrl.svc.Update(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// Receive handles PATCH /api/v1/purchases/:id/receive  [admin only]
// @Summary      Receive purchase
// @Description  Marks the purchase as received and creates a Device record for each line item.
// @Description  Each device enters inventory with status=in_stock and the line's purchase_price.
// @Description  Fails with 409 if any IMEI already exists or if purchase is not pending.
// @Tags         purchases
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                      true  "Purchase ObjectID"
// @Param        body  body      dto.ReceivePurchaseRequest  false "Optional receive notes"
// @Success      200   {object}  dto.PurchaseResponse
// @Failure      409   {object}  map[string]interface{}
// @Router       /purchases/{id}/receive [patch]
func (ctrl *PurchaseController) Receive(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("purchase id is required")
	}
	var req dto.ReceivePurchaseRequest
	// Body is optional — ignore parse errors
	_ = c.BodyParser(&req)
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	staffName := middleware.GetUserEmail(c)
	p, err := ctrl.svc.Receive(c.Context(), id, staffName, req)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// Delete handles DELETE /api/v1/purchases/:id  [admin only]
// @Summary      Delete purchase order
// @Description  Deletes a pending or cancelled purchase. Received purchases cannot be deleted.
// @Tags         purchases
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Purchase ObjectID"
// @Success      204
// @Failure      409  {object}  map[string]interface{}  "Purchase already received"
// @Router       /purchases/{id} [delete]
func (ctrl *PurchaseController) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("purchase id is required")
	}
	if err := ctrl.svc.Delete(c.Context(), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
