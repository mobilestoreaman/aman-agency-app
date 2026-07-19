package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	"aman-agency/backend/platform/ocr"

	"github.com/gofiber/fiber/v2"
)

// VendorInvoiceController handles invoice upload and retrieval endpoints.
type VendorInvoiceController struct {
	svc service.VendorInvoiceService
}

// NewVendorInvoiceController constructs a VendorInvoiceController.
func NewVendorInvoiceController(svc service.VendorInvoiceService) *VendorInvoiceController {
	return &VendorInvoiceController{svc: svc}
}

// Upload godoc
// @Summary      Upload a vendor invoice
// @Description  Accepts a PDF/JPEG/PNG invoice, stores it, and runs OCR asynchronously.
// @Tags         VendorInvoices
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        file      formData  file    true   "Invoice file (PDF, JPEG, or PNG)"
// @Param        ocr_mode  formData  string  false  "auto | tesseract  (standalone, no subscription)"
// @Success      202  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Router       /vendor-invoices/upload [post]
func (ctrl *VendorInvoiceController) Upload(c *fiber.Ctx) error {
	staffEmail, ok := c.Locals(middleware.LocalUserEmail).(string)
	if !ok || staffEmail == "" {
		return apperror.Unauthorized("missing auth context")
	}

	file, err := c.FormFile("file")
	if err != nil {
		return apperror.BadRequest("file field is required")
	}

	if file.Size > 20<<20 { // 20 MB
		return apperror.BadRequest("invoice file exceeds 20 MB limit")
	}

	src, err := file.Open()
	if err != nil {
		return apperror.Internal(err)
	}
	defer src.Close()

	mimeType := file.Header.Get("Content-Type")
	mode := ocr.ParseMode(c.FormValue("ocr_mode"))

	inv, err := ctrl.svc.Upload(c.Context(), staffEmail, file.Filename, src, file.Size, mimeType, mode)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"success": true,
		"data":    inv,
	})
}

// List godoc
// @Summary      List vendor invoices
// @Tags         VendorInvoices
// @Produce      json
// @Security     BearerAuth
// @Param        vendor_id  query  string  false  "Filter by vendor ID"
// @Param        status     query  string  false  "pending | processing | done | failed | needs_review"
// @Param        page       query  int     false  "Page number"
// @Param        limit      query  int     false  "Items per page"
// @Success      200  {object}  map[string]interface{}
// @Router       /vendor-invoices [get]
func (ctrl *VendorInvoiceController) List(c *fiber.Ctx) error {
	var f dto.VendorInvoiceFilter
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
// @Summary      Get vendor invoice by ID
// @Tags         VendorInvoices
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Invoice ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendor-invoices/{id} [get]
func (ctrl *VendorInvoiceController) GetByID(c *fiber.Ctx) error {
	inv, err := ctrl.svc.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}
	return response.OK(c, inv)
}

// Delete godoc
// @Summary      Delete a vendor invoice (admin)
// @Tags         VendorInvoices
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Invoice ID"
// @Success      200  {object}  map[string]interface{}
// @Router       /vendor-invoices/{id} [delete]
func (ctrl *VendorInvoiceController) Delete(c *fiber.Ctx) error {
	if err := ctrl.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"deleted": true})
}

// CreatePurchaseFromInvoice godoc
// @Summary      Convert a completed invoice into a purchase
// @Description  Takes admin-reviewed OCR data and creates a Purchase record linked to this invoice.
// @Tags         VendorInvoices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id   path  string  true  "Invoice ID"
// @Success      201  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      409  {object}  map[string]interface{}
// @Router       /vendor-invoices/{id}/to-purchase [post]
func (ctrl *VendorInvoiceController) CreatePurchaseFromInvoice(c *fiber.Ctx) error {
	var req dto.CreatePurchaseFromInvoiceRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	purchase, err := ctrl.svc.CreatePurchaseFromInvoice(c.Context(), c.Params("id"), req)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"data":    purchase,
	})
}

// LinkPurchase godoc
// @Summary      Link an invoice to an existing purchase
// @Description  Writes the purchase_id onto the invoice document so the reference photo can be retrieved from the purchase detail view.
// @Tags         VendorInvoices
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  string  true  "Invoice ID"
// @Param        body  body  object  true  "purchase_id"
// @Success      200  {object}  map[string]interface{}
// @Router       /vendor-invoices/{id}/link-purchase [patch]
func (ctrl *VendorInvoiceController) LinkPurchase(c *fiber.Ctx) error {
	var body struct {
		PurchaseID string `json:"purchase_id"`
	}
	if err := c.BodyParser(&body); err != nil || body.PurchaseID == "" {
		return apperror.BadRequest("purchase_id is required")
	}
	if err := ctrl.svc.LinkPurchase(c.Context(), c.Params("id"), body.PurchaseID); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"linked": true})
}

// ViewFile godoc
// @Summary      Stream the invoice file
// @Description  Returns the raw invoice image or PDF so the browser can display it.
// @Tags         VendorInvoices
// @Produce      application/octet-stream
// @Security     BearerAuth
// @Param        id  path  string  true  "Invoice ID"
// @Success      200
// @Failure      404  {object}  map[string]interface{}
// @Router       /vendor-invoices/{id}/file [get]
func (ctrl *VendorInvoiceController) ViewFile(c *fiber.Ctx) error {
	data, mimeType, err := ctrl.svc.ViewFile(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}
	c.Set("Content-Type", mimeType)
	c.Set("Cache-Control", "private, max-age=86400")
	return c.Send(data)
}

// Engines godoc
// @Summary      List available OCR engines
// @Description  Returns the set of OCR modes supported by this deployment.
// @Tags         VendorInvoices
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Router       /vendor-invoices/engines [get]
func (ctrl *VendorInvoiceController) Engines(c *fiber.Ctx) error {
	return response.OK(c, ctrl.svc.AvailableEngines())
}
