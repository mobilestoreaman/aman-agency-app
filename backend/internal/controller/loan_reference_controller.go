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

// LoanReferenceController handles all /api/v1/loan-references endpoints.
type LoanReferenceController struct {
	svc service.LoanReferenceService
}

// NewLoanReferenceController constructs a LoanReferenceController.
func NewLoanReferenceController(svc service.LoanReferenceService) *LoanReferenceController {
	return &LoanReferenceController{svc: svc}
}

// List handles GET /api/v1/loan-references
// @Summary      List loan references
// @Description  Paginated list of guarantor references. Filter by customer_id, sale_id, or status.
// @Tags         loan-references
// @Produce      json
// @Security     BearerAuth
// @Param        customer_id  query  string  false  "Filter by customer ObjectID"
// @Param        sale_id      query  string  false  "Filter by sale ObjectID"
// @Param        status       query  string  false  "Filter: active|closed|overdue"
// @Param        page         query  int     false  "Page (default 1)"
// @Param        limit        query  int     false  "Per page (default 20, max 100)"
// @Success      200  {array}   dto.LoanReferenceResponse
// @Router       /loan-references [get]
func (ctrl *LoanReferenceController) List(c *fiber.Ctx) error {
	f := dto.LoanReferenceFilter{
		CustomerID: c.Query("customer_id"),
		SaleID:     c.Query("sale_id"),
		Provider:   c.Query("provider"),
		Status:     c.Query("status"),
		Search:     c.Query("search"),
		Page:       parseIntQuery(c, "page", 1),
		Limit:      parseIntQuery(c, "limit", 20),
	}
	refs, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, refs, meta)
}

// GetByID handles GET /api/v1/loan-references/:id
// @Summary      Get loan reference by ID
// @Tags         loan-references
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "LoanReference ObjectID"
// @Success      200  {object}  dto.LoanReferenceResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /loan-references/{id} [get]
func (ctrl *LoanReferenceController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("loan reference id is required")
	}
	ref, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, ref)
}

// Create handles POST /api/v1/loan-references
// @Summary      Create loan reference
// @Description  Attaches a guarantor reference to an existing credit sale.
// @Description  The sale must not be cancelled. CustomerID and InvoiceNumber are resolved from the sale.
// @Tags         loan-references
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateLoanReferenceRequest  true  "Reference details"
// @Success      201   {object}  dto.LoanReferenceResponse
// @Failure      400   {object}  map[string]interface{}
// @Failure      404   {object}  map[string]interface{}  "Sale not found"
// @Failure      409   {object}  map[string]interface{}  "Sale is cancelled"
// @Router       /loan-references [post]
func (ctrl *LoanReferenceController) Create(c *fiber.Ctx) error {
	var req dto.CreateLoanReferenceRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	staffName := middleware.GetUserEmail(c)
	ref, err := ctrl.svc.Create(c.Context(), staffName, req)
	if err != nil {
		return err
	}
	return response.Created(c, ref)
}

// Update handles PUT /api/v1/loan-references/:id
// @Summary      Update loan reference
// @Description  Patches the reference person's contact details. All fields are optional.
// @Tags         loan-references
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                         true  "LoanReference ObjectID"
// @Param        body  body  dto.UpdateLoanReferenceRequest true  "Fields to update"
// @Success      200   {object}  dto.LoanReferenceResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /loan-references/{id} [put]
func (ctrl *LoanReferenceController) Update(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("loan reference id is required")
	}
	var req dto.UpdateLoanReferenceRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	ref, err := ctrl.svc.Update(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, ref)
}

// ChangeStatus handles PATCH /api/v1/loan-references/:id/status  [admin only]
// @Summary      Change loan reference status
// @Description  Admin only. Transitions the loan status: active → closed | overdue.
// @Tags         loan-references
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                                true  "LoanReference ObjectID"
// @Param        body  body  dto.ChangeLoanReferenceStatusRequest  true  "New status"
// @Success      200   {object}  dto.LoanReferenceResponse
// @Failure      400   {object}  map[string]interface{}
// @Failure      404   {object}  map[string]interface{}
// @Router       /loan-references/{id}/status [patch]
func (ctrl *LoanReferenceController) ChangeStatus(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("loan reference id is required")
	}
	var req dto.ChangeLoanReferenceStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	ref, err := ctrl.svc.ChangeStatus(c.Context(), id, req)
	if err != nil {
		return err
	}
	return response.OK(c, ref)
}

// Delete handles DELETE /api/v1/loan-references/:id  [admin only]
// @Summary      Delete loan reference
// @Description  Admin only. Permanently removes the guarantor reference record.
// @Tags         loan-references
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "LoanReference ObjectID"
// @Success      204  "No Content"
// @Failure      404  {object}  map[string]interface{}
// @Router       /loan-references/{id} [delete]
func (ctrl *LoanReferenceController) Delete(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("loan reference id is required")
	}
	if err := ctrl.svc.Delete(c.Context(), id); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}
