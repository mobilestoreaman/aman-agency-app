package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// CustomerController handles all /api/v1/customers endpoints.
type CustomerController struct {
	svc service.CustomerService
}

// NewCustomerController constructs a CustomerController.
func NewCustomerController(svc service.CustomerService) *CustomerController {
	return &CustomerController{svc: svc}
}

// List handles GET /api/v1/customers
// @Summary      List customers
// @Description  Paginated customer list. Supports search by name or phone.
// @Tags         customers
// @Produce      json
// @Security     BearerAuth
// @Param        page    query  int     false  "Page (default 1)"
// @Param        limit   query  int     false  "Per page (default 20, max 100)"
// @Param        search  query  string  false  "Search by name or phone"
// @Success      200  {array}  dto.CustomerResponse
// @Router       /customers [get]
func (ctrl *CustomerController) List(c *fiber.Ctx) error {
	f := dto.CustomerFilter{
		Search:       c.Query("search"),
		CreditFilter: c.Query("credit"), // "with_balance" | "no_balance" | "" (all)
		Page:         parseIntQuery(c, "page", 1),
		Limit:        parseIntQuery(c, "limit", 20),
	}
	customers, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, customers, meta)
}

// GetByID handles GET /api/v1/customers/:id
// @Summary      Get customer by ID
// @Tags         customers
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Customer ObjectID"
// @Success      200  {object}  dto.CustomerResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /customers/{id} [get]
func (ctrl *CustomerController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("customer id is required")
	}
	cust, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, cust)
}

// Create handles POST /api/v1/customers
// @Summary      Create customer
// @Tags         customers
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateCustomerRequest  true  "Customer data"
// @Success      201   {object}  dto.CustomerResponse
// @Failure      409   {object}  map[string]interface{}  "Phone already registered"
// @Router       /customers [post]
func (ctrl *CustomerController) Create(c *fiber.Ctx) error {
	var req dto.CreateCustomerRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	cust, err := ctrl.svc.Create(c.Context(), req)
	if err != nil {
		return err
	}
	return response.Created(c, cust)
}

// Update handles PUT /api/v1/customers/:id
// @Summary      Update customer
// @Tags         customers
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                     true  "Customer ObjectID"
// @Param        body  body      dto.UpdateCustomerRequest  true  "Fields to update"
// @Success      200   {object}  dto.CustomerResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /customers/{id} [put]
func (ctrl *CustomerController) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("customer id is required")
	}
	var req dto.UpdateCustomerRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	cust, err := ctrl.svc.Update(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, cust)
}

// Delete handles DELETE /api/v1/customers/:id  [admin only]
// @Summary      Delete customer
// @Tags         customers
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Customer ObjectID"
// @Success      204
// @Failure      404  {object}  map[string]interface{}
// @Router       /customers/{id} [delete]
func (ctrl *CustomerController) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("customer id is required")
	}
	if err := ctrl.svc.Delete(c.Context(), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
