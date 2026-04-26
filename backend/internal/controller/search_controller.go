package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// SearchController handles GET /search.
type SearchController struct {
	svc service.SearchService
}

// NewSearchController constructs a SearchController.
func NewSearchController(svc service.SearchService) *SearchController {
	return &SearchController{svc: svc}
}

// Search godoc
// @Summary      Global search
// @Description  Queries customers (name/phone), products (model/barcode), devices (IMEI), and sales (invoice/customer) concurrently. Results are bucketed by type. Use `types` to restrict scope.
// @Tags         Search
// @Produce      json
// @Security     BearerAuth
// @Param        q      query  string  true   "Search query (minimum 2 characters)"
// @Param        types  query  string  false  "Comma-separated entity scope: customers,products,devices,sales (default: all)"
// @Param        limit  query  int     false  "Max results per bucket (default 5, max 20)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]interface{}
// @Failure      401  {object}  map[string]interface{}
// @Router       /search [get]
func (ctrl *SearchController) Search(c *fiber.Ctx) error {
	var f dto.SearchFilter
	if err := c.QueryParser(&f); err != nil {
		return apperror.BadRequest("invalid query parameters")
	}

	results, err := ctrl.svc.Search(c.Context(), f)
	if err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"results": results})
}
