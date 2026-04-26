package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// ExpenseController handles HTTP requests for operational expense records.
// All write operations are admin-only via route middleware.
type ExpenseController struct {
	svc service.ExpenseService
}

// NewExpenseController constructs an ExpenseController.
func NewExpenseController(svc service.ExpenseService) *ExpenseController {
	return &ExpenseController{svc: svc}
}

// List godoc
// @Summary      List expenses
// @Description  Returns a paginated list of expense records with optional category and date-range filters.
// @Tags         Expenses
// @Produce      json
// @Security     BearerAuth
// @Param        category  query  string  false  "rent | salary | utilities | maintenance | marketing | miscellaneous"
// @Param        from      query  string  false  "Start date DD-MM-YYYY IST (default: 30 days ago)"
// @Param        to        query  string  false  "End date DD-MM-YYYY IST (default: today)"
// @Param        page      query  int     false  "Page number (default 1)"
// @Param        limit     query  int     false  "Items per page (default 20, max 100)"
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /expenses [get]
func (ctrl *ExpenseController) List(c *fiber.Ctx) error {
	var f dto.ExpenseFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}
	items, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, items, meta)
}

// GetByID godoc
// @Summary      Get expense by ID
// @Description  Returns a single expense document.
// @Tags         Expenses
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Expense ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /expenses/{id} [get]
func (ctrl *ExpenseController) GetByID(c *fiber.Ctx) error {
	e, err := ctrl.svc.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}
	return response.OK(c, e)
}

// Create godoc
// @Summary      Create an expense (admin)
// @Description  Admin only. Records a new operational expense entry.
// @Tags         Expenses
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  dto.CreateExpenseRequest  true  "Expense payload"
// @Success      201  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Router       /expenses [post]
func (ctrl *ExpenseController) Create(c *fiber.Ctx) error {
	var req dto.CreateExpenseRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	staffEmail := middleware.GetUserEmail(c)
	e, err := ctrl.svc.Create(c.Context(), staffEmail, req)
	if err != nil {
		return err
	}
	return response.Created(c, e)
}

// Update godoc
// @Summary      Update an expense (admin)
// @Description  Admin only. Applies a partial update — only non-empty/non-zero fields are written.
// @Tags         Expenses
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                   true  "Expense ID"
// @Param        body  body  dto.UpdateExpenseRequest  true  "Expense update payload"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /expenses/{id} [put]
func (ctrl *ExpenseController) Update(c *fiber.Ctx) error {
	var req dto.UpdateExpenseRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	e, err := ctrl.svc.Update(c.Context(), c.Params("id"), req)
	if err != nil {
		return err
	}
	return response.OK(c, e)
}

// Delete godoc
// @Summary      Delete an expense (admin)
// @Description  Admin only. Hard-deletes an expense document.
// @Tags         Expenses
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Expense ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /expenses/{id} [delete]
func (ctrl *ExpenseController) Delete(c *fiber.Ctx) error {
	if err := ctrl.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"message": "expense deleted"})
}

// Summary godoc
// @Summary      Expense summary report (admin)
// @Description  Admin only. Returns total amount and per-category breakdown for a date range.
// @Tags         Expenses
// @Produce      json
// @Security     BearerAuth
// @Param        from  query  string  false  "Start date DD-MM-YYYY IST (default: 30 days ago)"
// @Param        to    query  string  false  "End date DD-MM-YYYY IST (default: today)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Router       /expenses/summary [get]
func (ctrl *ExpenseController) Summary(c *fiber.Ctx) error {
	var f dto.ReportDateFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}
	data, err := ctrl.svc.Summary(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, data)
}
