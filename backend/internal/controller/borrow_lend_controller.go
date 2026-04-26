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

// BorrowLendController handles all /api/v1/borrow-lends endpoints.
type BorrowLendController struct {
	svc service.BorrowLendService
}

// NewBorrowLendController constructs a BorrowLendController.
func NewBorrowLendController(svc service.BorrowLendService) *BorrowLendController {
	return &BorrowLendController{svc: svc}
}

// List handles GET /api/v1/borrow-lends
// @Summary      List borrow/lend records
// @Description  Paginated list. Filter by type (borrow|lend), status, or customer_id.
// @Tags         borrow-lends
// @Produce      json
// @Security     BearerAuth
// @Param        type        query  string  false  "borrow|lend"
// @Param        status      query  string  false  "active|returned|overdue"
// @Param        customer_id query  string  false  "Filter by linked customer ObjectID"
// @Param        page        query  int     false  "Page (default 1)"
// @Param        limit       query  int     false  "Per page (default 20, max 100)"
// @Success      200  {array}   dto.BorrowLendResponse
// @Router       /borrow-lends [get]
func (ctrl *BorrowLendController) List(c *fiber.Ctx) error {
	f := dto.BorrowLendFilter{
		Type:       c.Query("type"),
		Status:     c.Query("status"),
		CustomerID: c.Query("customer_id"),
		Search:     c.Query("search"),
		Page:       parseIntQuery(c, "page", 1),
		Limit:      parseIntQuery(c, "limit", 20),
	}
	records, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, records, meta)
}

// GetByID handles GET /api/v1/borrow-lends/:id
// @Summary      Get borrow/lend record by ID
// @Tags         borrow-lends
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "BorrowLend ObjectID"
// @Success      200  {object}  dto.BorrowLendResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /borrow-lends/{id} [get]
func (ctrl *BorrowLendController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("borrow/lend id is required")
	}
	bl, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, bl)
}

// Create handles POST /api/v1/borrow-lends
// @Summary      Create borrow/lend record
// @Description  Opens a new borrow or lend transaction.
// @Description  DeviceID (optional) links to an inventory device — its status is NOT changed.
// @Description  CustomerID (optional) links to a customer record for denormalisation.
// @Tags         borrow-lends
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateBorrowLendRequest  true  "Transaction details"
// @Success      201   {object}  dto.BorrowLendResponse
// @Failure      400   {object}  map[string]interface{}
// @Failure      404   {object}  map[string]interface{}  "Device or customer not found"
// @Router       /borrow-lends [post]
func (ctrl *BorrowLendController) Create(c *fiber.Ctx) error {
	var req dto.CreateBorrowLendRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	staffName := middleware.GetUserEmail(c)
	bl, err := ctrl.svc.Create(c.Context(), staffName, req)
	if err != nil {
		return err
	}
	return response.Created(c, bl)
}

// Update handles PUT /api/v1/borrow-lends/:id
// @Summary      Update borrow/lend record
// @Description  Patches mutable contact and description fields. All fields are optional.
// @Tags         borrow-lends
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                      true  "BorrowLend ObjectID"
// @Param        body  body  dto.UpdateBorrowLendRequest true  "Fields to update"
// @Success      200   {object}  dto.BorrowLendResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /borrow-lends/{id} [put]
func (ctrl *BorrowLendController) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("borrow/lend id is required")
	}
	var req dto.UpdateBorrowLendRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	bl, err := ctrl.svc.Update(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, bl)
}

// Return handles PATCH /api/v1/borrow-lends/:id/return
// @Summary      Mark device as returned
// @Description  Stamps returned_at and sets status=returned. Already-returned records return 409.
// @Tags         borrow-lends
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                      true   "BorrowLend ObjectID"
// @Param        body  body  dto.ReturnBorrowLendRequest false  "Optional return notes"
// @Success      200   {object}  dto.BorrowLendResponse
// @Failure      404   {object}  map[string]interface{}
// @Failure      409   {object}  map[string]interface{}  "Already returned"
// @Router       /borrow-lends/{id}/return [patch]
func (ctrl *BorrowLendController) Return(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("borrow/lend id is required")
	}
	var req dto.ReturnBorrowLendRequest
	_ = c.BodyParser(&req)

	bl, err := ctrl.svc.Return(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, bl)
}

// MarkOverdue handles PATCH /api/v1/borrow-lends/:id/overdue  [admin only]
// @Summary      Mark transaction as overdue
// @Description  Admin only. Sets status=overdue. Returned transactions return 409.
// @Tags         borrow-lends
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "BorrowLend ObjectID"
// @Success      200   {object}  dto.BorrowLendResponse
// @Failure      404   {object}  map[string]interface{}
// @Failure      409   {object}  map[string]interface{}  "Already returned or overdue"
// @Router       /borrow-lends/{id}/overdue [patch]
func (ctrl *BorrowLendController) MarkOverdue(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("borrow/lend id is required")
	}
	bl, err := ctrl.svc.MarkOverdue(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, bl)
}

// Delete handles DELETE /api/v1/borrow-lends/:id  [admin only]
// @Summary      Delete borrow/lend record
// @Description  Admin only. Permanently removes the record.
// @Tags         borrow-lends
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "BorrowLend ObjectID"
// @Success      204  "No Content"
// @Failure      404  {object}  map[string]interface{}
// @Router       /borrow-lends/{id} [delete]
func (ctrl *BorrowLendController) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("borrow/lend id is required")
	}
	if err := ctrl.svc.Delete(c.Context(), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
