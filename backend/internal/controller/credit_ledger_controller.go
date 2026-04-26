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

// CreditLedgerController handles /api/v1/customers/:id/ledger,
// /customers/:id/payments, and /customers/:id/adjustments endpoints.
type CreditLedgerController struct {
	svc      service.CreditLedgerService
	auditSvc service.AuditService
}

// NewCreditLedgerController constructs a CreditLedgerController.
func NewCreditLedgerController(svc service.CreditLedgerService, auditSvc service.AuditService) *CreditLedgerController {
	return &CreditLedgerController{svc: svc, auditSvc: auditSvc}
}

// List handles GET /api/v1/credit-ledger
// @Summary      List all credit ledger entries
// @Description  Paginated global credit ledger. Optionally filter by customer_id, type, from_date, to_date.
// @Tags         credit-ledger
// @Produce      json
// @Security     BearerAuth
// @Param        customer_id  query  string  false  "Filter by customer ID"
// @Param        type         query  string  false  "Entry type: sale|payment|adjustment|cancellation"
// @Param        from_date    query  string  false  "From date DD-MM-YYYY"
// @Param        to_date      query  string  false  "To date DD-MM-YYYY"
// @Param        page         query  int     false  "Page (default 1)"
// @Param        limit        query  int     false  "Per page (default 20, max 100)"
// @Success      200  {array}   dto.CreditLedgerResponse
// @Router       /credit-ledger [get]
func (ctrl *CreditLedgerController) List(c *fiber.Ctx) error {
	var f dto.GlobalCreditLedgerFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}
	entries, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, entries, meta)
}

// ListByCustomer handles GET /api/v1/customers/:id/ledger
// @Summary      List credit ledger for customer
// @Description  Paginated credit/debit history for a customer, newest first.
// @Description  Filter by type: sale | payment | adjustment | cancellation.
// @Tags         customers
// @Produce      json
// @Security     BearerAuth
// @Param        id     path   string  true   "Customer ObjectID"
// @Param        page   query  int     false  "Page (default 1)"
// @Param        limit  query  int     false  "Per page (default 20, max 100)"
// @Param        type   query  string  false  "Entry type filter"
// @Success      200  {array}   dto.CreditLedgerResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /customers/{id}/ledger [get]
func (ctrl *CreditLedgerController) ListByCustomer(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("customer id is required")
	}
	f := dto.CreditLedgerFilter{
		Type:  c.Query("type"),
		Page:  parseIntQuery(c, "page", 1),
		Limit: parseIntQuery(c, "limit", 20),
	}
	entries, meta, err := ctrl.svc.ListByCustomer(c.Context(), id, f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, entries, meta)
}

// RecordPayment handles POST /api/v1/customers/:id/payments
// @Summary      Record customer payment
// @Description  Records a cash payment received from a customer, reducing their credit balance.
// @Description  Amount must be positive; the ledger stores it as a negative entry (balance reduced).
// @Tags         customers
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                    true  "Customer ObjectID"
// @Param        body  body  dto.RecordPaymentRequest  true  "Payment details"
// @Success      201  {object}  dto.CreditLedgerResponse
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /customers/{id}/payments [post]
func (ctrl *CreditLedgerController) RecordPayment(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("customer id is required")
	}
	var req dto.RecordPaymentRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	staffName := middleware.GetUserEmail(c)
	entry, err := ctrl.svc.RecordPayment(c.Context(), id, staffName, req)
	if err != nil {
		return err
	}
	return response.Created(c, entry)
}

// RecordAdjustment handles POST /api/v1/customers/:id/adjustments  [admin only]
// @Summary      Manual balance adjustment
// @Description  Admin only. Applies a manual debit (positive amount) or credit (negative amount)
// @Description  to the customer's balance. Notes are required for audit trail.
// @Tags         customers
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                       true  "Customer ObjectID"
// @Param        body  body  dto.RecordAdjustmentRequest  true  "Adjustment details"
// @Success      201  {object}  dto.CreditLedgerResponse
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /customers/{id}/adjustments [post]
func (ctrl *CreditLedgerController) RecordAdjustment(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("customer id is required")
	}
	var req dto.RecordAdjustmentRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	staffName := middleware.GetUserEmail(c)
	entry, err := ctrl.svc.RecordAdjustment(c.Context(), id, staffName, req)
	if err != nil {
		return err
	}

	// Log the credit adjustment for audit trail
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionCreditAdjust, "credit_ledger", entry.ID, map[string]interface{}{
		"customer_id": id,
		"type":        entry.Type,
		"amount":      entry.Amount,
		"notes":       entry.Notes,
	})

	return response.Created(c, entry)
}
