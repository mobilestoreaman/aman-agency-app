package controller

import (
	"errors"
	"fmt"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	"aman-agency/backend/platform/pdf"
	"aman-agency/backend/platform/whatsapp"

	"github.com/gofiber/fiber/v2"
)

// BillController handles HTTP requests for billing documents.
type BillController struct {
	svc          service.BillService
	auditSvc     service.AuditService
	settingsRepo repository.SettingsRepository
	wa           whatsapp.MessageProvider
	storagePath  string
	staticBase   string
}

// NewBillController constructs a BillController.
// settingsRepo, wa, storagePath, and staticBase are used by the invoice and
// WhatsApp endpoints; pass nil/empty values if those endpoints are not needed.
func NewBillController(
	svc service.BillService,
	auditSvc service.AuditService,
	settingsRepo repository.SettingsRepository,
	wa whatsapp.MessageProvider,
	storagePath string,
	staticBase string,
) *BillController {
	return &BillController{
		svc:          svc,
		auditSvc:     auditSvc,
		settingsRepo: settingsRepo,
		wa:           wa,
		storagePath:  storagePath,
		staticBase:   staticBase,
	}
}

// List godoc
// @Summary      List bills
// @Description  Returns a paginated list of billing documents with optional filters.
// @Tags         Bills
// @Produce      json
// @Security     BearerAuth
// @Param        customer_id  query  string  false  "Filter by customer ID"
// @Param        sale_id      query  string  false  "Filter by sale ID"
// @Param        status       query  string  false  "Filter by status (draft|issued|voided)"
// @Param        page         query  int     false  "Page number (default 1)"
// @Param        limit        query  int     false  "Items per page (default 20, max 100)"
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /bills [get]
func (ctrl *BillController) List(c *fiber.Ctx) error {
	var f dto.BillFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}

	bills, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, bills, meta)
}

// GetByID godoc
// @Summary      Get bill by ID
// @Description  Returns a single billing document by its ObjectID.
// @Tags         Bills
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string  true  "Bill ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /bills/{id} [get]
func (ctrl *BillController) GetByID(c *fiber.Ctx) error {
	id := c.Params("id")
	bill, err := ctrl.svc.GetByID(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, bill)
}

// GetBySaleID godoc
// @Summary      Get bill by sale ID
// @Description  Returns the billing document associated with a specific sale.
// @Tags         Bills
// @Produce      json
// @Security     BearerAuth
// @Param        sale_id  path  string  true  "Sale ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /bills/sale/{sale_id} [get]
func (ctrl *BillController) GetBySaleID(c *fiber.Ctx) error {
	saleID := c.Params("sale_id")
	bill, err := ctrl.svc.GetBySaleID(c.Context(), saleID)
	if err != nil {
		return err
	}
	return response.OK(c, bill)
}

// Create godoc
// @Summary      Create a bill
// @Description  Generates a formal billing document from an existing completed sale. One bill per sale.
// @Tags         Bills
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  dto.CreateBillRequest  true  "Bill creation request"
// @Success      201  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Failure      409  {object}  map[string]interface{}
// @Router       /bills [post]
func (ctrl *BillController) Create(c *fiber.Ctx) error {
	var req dto.CreateBillRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	staffName := middleware.GetUserEmail(c)
	bill, err := ctrl.svc.Create(c.Context(), staffName, req)
	if err != nil {
		return err
	}
	return response.Created(c, bill)
}

// Issue godoc
// @Summary      Issue a bill
// @Description  Transitions a draft bill to issued status, stamping issued_at.
// @Tags         Bills
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Bill ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Failure      409  {object}  map[string]interface{}
// @Router       /bills/{id}/issue [patch]
func (ctrl *BillController) Issue(c *fiber.Ctx) error {
	id := c.Params("id")
	bill, err := ctrl.svc.Issue(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, bill)
}

// Void godoc
// @Summary      Void a bill
// @Description  Cancels a draft or issued bill (admin only).
// @Tags         Bills
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Bill ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Failure      409  {object}  map[string]interface{}
// @Router       /bills/{id}/void [patch]
func (ctrl *BillController) Void(c *fiber.Ctx) error {
	id := c.Params("id")
	var req dto.VoidBillRequest
	_ = c.BodyParser(&req) // body is optional
	bill, err := ctrl.svc.Void(c.Context(), id, req.Notes)
	if err != nil {
		return err
	}

	// Log the bill void for audit trail
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionBillVoid, "bill", id, map[string]interface{}{
		"bill_number": bill.BillNumber,
		"sale_id":     bill.SaleID,
		"voided_at":   bill.VoidedAt,
	})

	return response.OK(c, bill)
}

// Invoice godoc
// @Summary      Get HTML invoice for a bill
// @Description  Renders a print-ready HTML invoice for the given bill ID.
//
//	The HTML may also be persisted to disk if PDF_STORAGE_PATH is configured.
//
// @Tags         Bills
// @Produce      html
// @Security     BearerAuth
// @Param        id  path  string  true  "Bill ID"
// @Success      200  {string}  string  "HTML invoice"
// @Failure      404  {object}  map[string]interface{}
// @Router       /bills/{id}/invoice [get]
func (ctrl *BillController) Invoice(c *fiber.Ctx) error {
	id := c.Params("id")

	bill, err := ctrl.svc.GetModel(c.Context(), id)
	if err != nil {
		return err
	}

	// Load store settings for the invoice header (optional – nil renders fine).
	var storeSettings *models.Settings
	if ctrl.settingsRepo != nil {
		if s, sErr := ctrl.settingsRepo.Get(c.Context()); sErr == nil {
			storeSettings = s
		}
	}

	htmlBytes, renderErr := pdf.RenderInvoiceHTML(bill, storeSettings, ctrl.storagePath, ctrl.staticBase)
	if renderErr != nil {
		return apperror.Internal(fmt.Errorf("failed to render invoice: %w", renderErr))
	}

	c.Set(fiber.HeaderContentType, "text/html; charset=utf-8")
	return c.Status(fiber.StatusOK).Send(htmlBytes)
}

// SendWhatsApp godoc
// @Summary      Send invoice via WhatsApp
// @Description  Sends the invoice link to the customer's registered phone number via WhatsApp.
// @Tags         Bills
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Bill ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /bills/{id}/whatsapp [post]
func (ctrl *BillController) SendWhatsApp(c *fiber.Ctx) error {
	id := c.Params("id")

	bill, err := ctrl.svc.GetModel(c.Context(), id)
	if err != nil {
		return err
	}

	if bill.CustomerPhone == "" {
		return apperror.BadRequest("customer has no phone number registered")
	}
	if ctrl.wa == nil {
		return apperror.Internal(errors.New("WhatsApp provider is not configured"))
	}

	invoiceURL := pdf.InvoiceStaticURL(ctrl.staticBase, bill.ID.Hex())
	currency := "₹"
	if ctrl.settingsRepo != nil {
		if s, sErr := ctrl.settingsRepo.Get(c.Context()); sErr == nil && s.Currency != "" {
			currency = s.Currency
		}
	}
	totalStr := fmt.Sprintf("%s%.2f", currency, bill.TotalAmount)

	if waErr := ctrl.wa.SendInvoiceLink(
		c.Context(),
		bill.CustomerPhone,
		bill.CustomerName,
		invoiceURL,
		bill.BillNumber,
		totalStr,
	); waErr != nil {
		return apperror.Internal(fmt.Errorf("failed to send WhatsApp message: %w", waErr))
	}

	return response.OK(c, fiber.Map{
		"message": fmt.Sprintf("Invoice link sent to %s via WhatsApp", bill.CustomerPhone),
	})
}
