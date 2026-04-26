package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// NotificationController handles in-app notification endpoints.
type NotificationController struct {
	svc service.NotificationService
}

// NewNotificationController constructs a NotificationController.
func NewNotificationController(svc service.NotificationService) *NotificationController {
	return &NotificationController{svc: svc}
}

// List godoc
// @Summary      List notifications
// @Description  Returns paginated notifications. Admins see all; staff see only broadcast + their own.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "Filter by status: unread | read | dismissed"
// @Param        type    query  string  false  "Filter by type: low_stock | overdue | credit_due | sale_cancel | general"
// @Param        page    query  int     false  "Page number (default 1)"
// @Param        limit   query  int     false  "Items per page (default 20, max 100)"
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /notifications [get]
func (ctrl *NotificationController) List(c *fiber.Ctx) error {
	var f dto.NotificationFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}

	caller := middleware.GetUserEmail(c)
	isAdmin := middleware.IsAdmin(c)

	items, meta, err := ctrl.svc.List(c.Context(), caller, isAdmin, f)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, items, meta)
}

// UnreadCount godoc
// @Summary      Unread notification count
// @Description  Returns the count of unread notifications visible to the caller (used for badge UI).
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /notifications/unread-count [get]
func (ctrl *NotificationController) UnreadCount(c *fiber.Ctx) error {
	caller := middleware.GetUserEmail(c)
	isAdmin := middleware.IsAdmin(c)

	resp, err := ctrl.svc.UnreadCount(c.Context(), caller, isAdmin)
	if err != nil {
		return err
	}
	return response.OK(c, resp)
}

// Create godoc
// @Summary      Create a notification (admin)
// @Description  Admin only. Manually posts a notification to all staff or a specific recipient.
// @Tags         Notifications
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  dto.CreateNotificationRequest  true  "Notification payload"
// @Success      201  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Router       /notifications [post]
func (ctrl *NotificationController) Create(c *fiber.Ctx) error {
	var req dto.CreateNotificationRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}

	staffEmail := middleware.GetUserEmail(c)
	n, err := ctrl.svc.Create(c.Context(), staffEmail, req)
	if err != nil {
		return err
	}
	return response.Created(c, n)
}

// MarkRead godoc
// @Summary      Mark notification as read
// @Description  Sets status=read and stamps read_at on the notification.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Notification ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /notifications/{id}/read [patch]
func (ctrl *NotificationController) MarkRead(c *fiber.Ctx) error {
	if err := ctrl.svc.MarkRead(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"message": "notification marked as read"})
}

// MarkAllRead godoc
// @Summary      Mark all notifications as read
// @Description  Marks every unread notification visible to the caller as read in one operation.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Router       /notifications/read-all [patch]
func (ctrl *NotificationController) MarkAllRead(c *fiber.Ctx) error {
	caller := middleware.GetUserEmail(c)
	isAdmin := middleware.IsAdmin(c)

	if err := ctrl.svc.MarkAllRead(c.Context(), caller, isAdmin); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"message": "all notifications marked as read"})
}

// Dismiss godoc
// @Summary      Dismiss a notification
// @Description  Sets status=dismissed on the notification (hides it from default views).
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Notification ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /notifications/{id}/dismiss [patch]
func (ctrl *NotificationController) Dismiss(c *fiber.Ctx) error {
	if err := ctrl.svc.Dismiss(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"message": "notification dismissed"})
}

// Delete godoc
// @Summary      Delete a notification (admin)
// @Description  Admin only. Hard-deletes a notification document.
// @Tags         Notifications
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Notification ID"
// @Success      200  {object}  map[string]interface{}
// @Failure      404  {object}  map[string]interface{}
// @Router       /notifications/{id} [delete]
func (ctrl *NotificationController) Delete(c *fiber.Ctx) error {
	if err := ctrl.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"message": "notification deleted"})
}
