package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// VendorController handles all /api/v1/vendors endpoints.
type VendorController struct {
	svc service.VendorService
}

// NewVendorController constructs a VendorController.
func NewVendorController(svc service.VendorService) *VendorController {
	return &VendorController{svc: svc}
}

// List handles GET /api/v1/vendors
// @Summary      List vendors
// @Description  Paginated vendor list sorted by name. Supports search by name or phone.
// @Tags         vendors
// @Produce      json
// @Security     BearerAuth
// @Param        page    query  int     false  "Page (default 1)"
// @Param        limit   query  int     false  "Per page (default 20, max 100)"
// @Param        search  query  string  false  "Search by name or phone"
// @Success      200  {array}  dto.VendorResponse
// @Router       /vendors [get]
func (ctrl *VendorController) List(c *fiber.Ctx) error {
	f := dto.VendorFilter{
		Search: c.Query("search"),
		Page:   parseIntQuery(c, "page", 1),
		Limit:  parseIntQuery(c, "limit", 20),
	}
	vendors, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, vendors, meta)
}

// GetByID handles GET /api/v1/vendors/:id
// @Summary      Get vendor by ID
// @Tags         vendors
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Vendor ObjectID"
// @Success      200  {object}  dto.VendorResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendors/{id} [get]
func (ctrl *VendorController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	v, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, v)
}

// Create handles POST /api/v1/vendors  [admin only]
// @Summary      Create vendor
// @Tags         vendors
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateVendorRequest  true  "Vendor data"
// @Success      201   {object}  dto.VendorResponse
// @Failure      409   {object}  map[string]interface{}  "Phone already registered"
// @Router       /vendors [post]
func (ctrl *VendorController) Create(c *fiber.Ctx) error {
	var req dto.CreateVendorRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	v, err := ctrl.svc.Create(c.Context(), req)
	if err != nil {
		return err
	}
	return response.Created(c, v)
}

// Update handles PUT /api/v1/vendors/:id  [admin only]
// @Summary      Update vendor
// @Tags         vendors
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                   true  "Vendor ObjectID"
// @Param        body  body      dto.UpdateVendorRequest  true  "Fields to update"
// @Success      200   {object}  dto.VendorResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /vendors/{id} [put]
func (ctrl *VendorController) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	var req dto.UpdateVendorRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	v, err := ctrl.svc.Update(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, v)
}

// Delete handles DELETE /api/v1/vendors/:id  [admin only]
// @Summary      Delete vendor
// @Tags         vendors
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Vendor ObjectID"
// @Success      204
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendors/{id} [delete]
func (ctrl *VendorController) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	if err := ctrl.svc.Delete(c.Context(), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
