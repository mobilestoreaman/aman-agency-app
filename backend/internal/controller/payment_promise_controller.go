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

// PaymentPromiseController handles /api/v1/payment-promises endpoints.
type PaymentPromiseController struct {
	svc service.PaymentPromiseService
}

func NewPaymentPromiseController(svc service.PaymentPromiseService) *PaymentPromiseController {
	return &PaymentPromiseController{svc: svc}
}

// Create handles POST /api/v1/payment-promises
func (ctrl *PaymentPromiseController) Create(c *fiber.Ctx) error {
	staffName := middleware.GetUserEmail(c)

	var req dto.CreatePaymentPromiseRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	p, err := ctrl.svc.Create(c.Context(), staffName, req)
	if err != nil {
		return err
	}
	return response.Created(c, p)
}

// List handles GET /api/v1/payment-promises
func (ctrl *PaymentPromiseController) List(c *fiber.Ctx) error {
	var f dto.PaymentPromiseFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}
	promises, meta, err := ctrl.svc.List(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, promises, meta)
}

// Reschedule handles PATCH /api/v1/payment-promises/:id/reschedule
func (ctrl *PaymentPromiseController) Reschedule(c *fiber.Ctx) error {
	staffName := middleware.GetUserEmail(c)
	id := c.Params("id")

	var req dto.ReschedulePromiseRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	p, err := ctrl.svc.Reschedule(c.Context(), id, staffName, req)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// MarkPaid handles PATCH /api/v1/payment-promises/:id/paid
func (ctrl *PaymentPromiseController) MarkPaid(c *fiber.Ctx) error {
	staffName := middleware.GetUserEmail(c)
	id := c.Params("id")

	var body struct {
		Notes string `json:"notes"`
	}
	_ = c.BodyParser(&body)

	p, err := ctrl.svc.MarkPaid(c.Context(), id, staffName, body.Notes)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// MarkBroken handles PATCH /api/v1/payment-promises/:id/broken (admin only)
func (ctrl *PaymentPromiseController) MarkBroken(c *fiber.Ctx) error {
	id := c.Params("id")
	p, err := ctrl.svc.MarkBroken(c.Context(), id)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// BulkMarkPaid handles POST /api/v1/payment-promises/bulk-paid
func (ctrl *PaymentPromiseController) BulkMarkPaid(c *fiber.Ctx) error {
	var req dto.BulkMarkPaidRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}
	resp, err := ctrl.svc.BulkMarkPaid(c.Context(), req)
	if err != nil {
		return err
	}
	return response.OK(c, resp)
}
