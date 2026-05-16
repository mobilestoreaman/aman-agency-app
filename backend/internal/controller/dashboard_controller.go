package controller

import (
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// DashboardController handles GET /dashboard.
type DashboardController struct {
	svc service.DashboardService
}

// NewDashboardController constructs a DashboardController.
func NewDashboardController(svc service.DashboardService) *DashboardController {
	return &DashboardController{svc: svc}
}

// Get godoc
// @Summary      Dashboard summary
// @Description  Returns the PWA home-screen payload: today's sales, stock counts, credit outstanding, borrow-lend status, notifications badge, month expenses, recent sales and low-stock alerts. All 8 sub-queries run concurrently. Non-critical failures zero-out gracefully.
// @Tags         Dashboard
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /dashboard [get]
func (ctrl *DashboardController) Get(c *fiber.Ctx) error {
	data, err := ctrl.svc.Get(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, data)
}

// DailyClosing handles GET /dashboard/closing
func (ctrl *DashboardController) DailyClosing(c *fiber.Ctx) error {
	resp, err := ctrl.svc.DailyClosing(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, resp)
}

// StaffPerformance handles GET /dashboard/my-performance
func (ctrl *DashboardController) StaffPerformance(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	staffName := middleware.GetUserEmail(c)
	resp, err := ctrl.svc.StaffPerformance(c.Context(), userID, staffName)
	if err != nil {
		return err
	}
	return response.OK(c, resp)
}
