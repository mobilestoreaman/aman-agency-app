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

// VendorLedgerController handles /api/v1/vendor-ledger,
// /vendors/:id/ledger, /vendors/:id/payments, and /vendors/:id/adjustments.
type VendorLedgerController struct {
	svc      service.VendorLedgerService
	auditSvc service.AuditService
}

// NewVendorLedgerController constructs a VendorLedgerController.
func NewVendorLedgerController(svc service.VendorLedgerService, auditSvc service.AuditService) *VendorLedgerController {
	return &VendorLedgerController{svc: svc, auditSvc: auditSvc}
}

// List handles GET /api/v1/vendor-ledger
// @Summary      List all vendor ledger entries
// @Description  Paginated global vendor ledger. Optionally filter by vendor_id, type, from_date, to_date.
// @Tags         vendor-ledger
// @Produce      json
// @Security     BearerAuth
// @Param        vendor_id   query  string  false  "Filter by vendor ID"
// @Param        type        query  string  false  "Entry type: purchase|payment|adjustment|reversal"
// @Param        from_date   query  string  false  "From date DD-MM-YYYY"
// @Param        to_date     query  string  false  "To date DD-MM-YYYY"
// @Param        page        query  int     false  "Page (default 1)"
// @Param        limit       query  int     false  "Per page (default 20, max 100)"
// @Success      200  {array}   dto.VendorLedgerResponse
// @Router       /vendor-ledger [get]
func (ctrl *VendorLedgerController) List(c *fiber.Ctx) error {
	var f dto.GlobalVendorLedgerFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}
	entries, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, entries, meta)
}

// ListByVendor handles GET /api/v1/vendors/:id/ledger
// @Summary      List vendor ledger entries
// @Description  Paginated payable/payment history for a vendor, newest first.
// @Tags         vendors
// @Produce      json
// @Security     BearerAuth
// @Param        id     path   string  true   "Vendor ObjectID"
// @Param        page   query  int     false  "Page (default 1)"
// @Param        limit  query  int     false  "Per page (default 20, max 100)"
// @Param        type   query  string  false  "Entry type filter"
// @Success      200  {array}   dto.VendorLedgerResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendors/{id}/ledger [get]
func (ctrl *VendorLedgerController) ListByVendor(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	f := dto.VendorLedgerFilter{
		Type:  c.Query("type"),
		Page:  parseIntQuery(c, "page", 1),
		Limit: parseIntQuery(c, "limit", 20),
	}
	entries, meta, err := ctrl.svc.ListByVendor(c.Context(), id, f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, entries, meta)
}

// RecordPayment handles POST /api/v1/vendors/:id/payments
// @Summary      Record vendor payment
// @Description  Records a payment made to a vendor, reducing the payable balance.
// @Description  Amount must be positive; the ledger stores it as a negative entry.
// @Tags         vendors
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                          true  "Vendor ObjectID"
// @Param        body  body  dto.RecordVendorPaymentRequest  true  "Payment details"
// @Success      201  {object}  dto.VendorLedgerResponse
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendors/{id}/payments [post]
func (ctrl *VendorLedgerController) RecordPayment(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	var req dto.RecordVendorPaymentRequest
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

// RecordOpeningBalance handles POST /api/v1/vendors/:id/opening-balance  [admin only]
// @Summary      Set vendor opening balance
// @Description  Admin only. Records a pre-existing payable debt for a vendor that was
// @Description  owed before the system was set up. Amount must be positive.
// @Tags         vendors
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                                    true  "Vendor ObjectID"
// @Param        body  body  dto.RecordVendorOpeningBalanceRequest     true  "Opening balance details"
// @Success      201  {object}  dto.VendorLedgerResponse
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendors/{id}/opening-balance [post]
func (ctrl *VendorLedgerController) RecordOpeningBalance(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	var req dto.RecordVendorOpeningBalanceRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	staffName := middleware.GetUserEmail(c)
	entry, err := ctrl.svc.RecordOpeningBalance(c.Context(), id, staffName, req)
	if err != nil {
		return err
	}

	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionCreditAdjust, "vendor_ledger", entry.ID, map[string]interface{}{
		"vendor_id": id,
		"type":      entry.Type,
		"amount":    entry.Amount,
		"notes":     entry.Notes,
	})

	return response.Created(c, entry)
}

// RecordAdjustment handles POST /api/v1/vendors/:id/adjustments  [admin only]
// @Summary      Manual vendor balance adjustment
// @Description  Admin only. Applies a manual debit (positive) or credit (negative)
// @Description  to the vendor's payable balance. Notes are required for audit trail.
// @Tags         vendors
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string                             true  "Vendor ObjectID"
// @Param        body  body  dto.RecordVendorAdjustmentRequest  true  "Adjustment details"
// @Success      201  {object}  dto.VendorLedgerResponse
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendors/{id}/adjustments [post]
func (ctrl *VendorLedgerController) RecordAdjustment(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("vendor id is required")
	}
	var req dto.RecordVendorAdjustmentRequest
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

	// Log the adjustment for audit trail
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionCreditAdjust, "vendor_ledger", entry.ID, map[string]interface{}{
		"vendor_id": id,
		"type":      entry.Type,
		"amount":    entry.Amount,
		"notes":     entry.Notes,
	})

	return response.Created(c, entry)
}
