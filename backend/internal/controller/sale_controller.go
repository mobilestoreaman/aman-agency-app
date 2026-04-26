package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// SaleController handles all /api/v1/sales endpoints.
type SaleController struct {
	svc      service.SaleService
	auditSvc service.AuditService
}

// NewSaleController constructs a SaleController.
func NewSaleController(svc service.SaleService, auditSvc service.AuditService) *SaleController {
	return &SaleController{svc: svc, auditSvc: auditSvc}
}

// List handles GET /api/v1/sales
// @Summary      List sales
// @Description  Paginated list of sale invoices, most recent first.
// @Tags         sales
// @Produce      json
// @Security     BearerAuth
// @Param        page        query  int     false  "Page (default 1)"
// @Param        limit       query  int     false  "Per page (default 20, max 100)"
// @Param        customer_id query  string  false  "Filter by customer ObjectID"
// @Param        staff_id    query  string  false  "Filter by staff ObjectID"
// @Param        status      query  string  false  "Filter by status (completed|cancelled)"
// @Success      200  {array}  dto.SaleResponse
// @Router       /sales [get]
func (ctrl *SaleController) List(c *fiber.Ctx) error {
	f := dto.SaleFilter{
		CustomerID: c.Query("customer_id"),
		StaffID:    c.Query("staff_id"),
		Status:     c.Query("status"),
		Search:     c.Query("search"),
		Page:       parseIntQuery(c, "page", 1),
		Limit:      parseIntQuery(c, "limit", 20),
	}
	sales, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, sales, meta)
}

// GetByID handles GET /api/v1/sales/:id
// @Summary      Get sale by ID
// @Description  Returns the full sale invoice including all line items.
// @Tags         sales
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Sale ObjectID"
// @Success      200  {object}  dto.SaleResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /sales/{id} [get]
func (ctrl *SaleController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("sale id is required")
	}
	sale, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, sale)
}

// Create handles POST /api/v1/sales
// @Summary      Create sale invoice
// @Description  Validates all devices are in_stock, flips their status to sold, and creates the invoice.
// @Description  Balance = TotalAmount - AmountPaid. Partial payment leaves a positive balance (credit).
// @Tags         sales
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateSaleRequest  true  "Sale data"
// @Success      201   {object}  dto.SaleResponse
// @Failure      400   {object}  map[string]interface{}
// @Failure      409   {object}  map[string]interface{}  "Device not in_stock"
// @Router       /sales [post]
func (ctrl *SaleController) Create(c *fiber.Ctx) error {
	var req dto.CreateSaleRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	// Extract staff identity from JWT claims — passed to service for denormalisation.
	staffID := middleware.GetUserID(c)
	staffName := middleware.GetUserEmail(c) // email used as display name

	sale, err := ctrl.svc.Create(c.Context(), staffID, staffName, req)
	if err != nil {
		return err
	}
	return response.Created(c, sale)
}

// Cancel handles PATCH /api/v1/sales/:id/cancel  [admin only]
// @Summary      Cancel sale
// @Description  Reverses the sale: all device statuses are restored to in_stock.
// @Description  If the sale had a positive balance (credit), a cancellation ledger entry is created
// @Description  and the customer's credit_balance is decremented. Already-cancelled sales return 409.
// @Tags         sales
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                  true   "Sale ObjectID"
// @Param        body  body      dto.CancelSaleRequest   false  "Optional cancellation note"
// @Success      200   {object}  dto.SaleResponse
// @Failure      409   {object}  map[string]interface{}  "Already cancelled"
// @Router       /sales/{id}/cancel [patch]
func (ctrl *SaleController) Cancel(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("sale id is required")
	}
	var req dto.CancelSaleRequest
	_ = c.BodyParser(&req)
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	// Pass the cancelling staff member's identity for the ledger audit trail.
	staffName := middleware.GetUserEmail(c)
	sale, err := ctrl.svc.Cancel(c.Context(), id, staffName, req)
	if err != nil {
		return err
	}

	// Log the sale cancellation for audit trail
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionSaleCancel, "sale", id, map[string]interface{}{
		"invoice_number": sale.InvoiceNumber,
		"customer_id":    sale.CustomerID,
		"amount":         sale.TotalAmount,
		"cancelled_at":   sale.CancelledAt,
	})

	return response.OK(c, sale)
}
