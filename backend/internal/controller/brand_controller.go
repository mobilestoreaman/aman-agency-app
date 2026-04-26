package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// BrandController handles HTTP for /api/v1/brands
type BrandController struct {
	svc        service.BrandService
	productSvc service.ProductService // for nested GET /brands/:id/products
}

// NewBrandController wires the controller to its services.
func NewBrandController(svc service.BrandService, productSvc service.ProductService) *BrandController {
	return &BrandController{svc: svc, productSvc: productSvc}
}

// List handles GET /api/v1/brands
// @Summary      List all brands
// @Description  Returns all brands sorted alphabetically. No pagination — brand count is small.
// @Tags         brands
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   dto.BrandResponse
// @Failure      401  {object}  map[string]interface{}
// @Router       /brands [get]
func (ctrl *BrandController) List(c *fiber.Ctx) error {
	brands, err := ctrl.svc.List(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, brands)
}

// GetByID handles GET /api/v1/brands/:id
// @Summary      Get brand by ID
// @Tags         brands
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Brand ObjectID"
// @Success      200  {object}  dto.BrandResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /brands/{id} [get]
func (ctrl *BrandController) GetByID(c *fiber.Ctx) error {
	brand, err := ctrl.svc.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}
	return response.OK(c, brand)
}

// GetProducts handles GET /api/v1/brands/:id/products
// @Summary      List products for a brand
// @Description  Returns a paginated list of all products belonging to the specified brand.
// @Tags         brands
// @Produce      json
// @Security     BearerAuth
// @Param        id      path   string  true   "Brand ObjectID"
// @Param        page    query  int     false  "Page number (default 1)"
// @Param        limit   query  int     false  "Items per page (default 20, max 100)"
// @Param        search  query  string  false  "Search by model name or barcode"
// @Success      200  {array}   dto.ProductResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /brands/{id}/products [get]
func (ctrl *BrandController) GetProducts(c *fiber.Ctx) error {
	brandID := c.Params("id")
	if brandID == "" {
		return apperror.BadRequest("brand ID is required")
	}

	// Verify brand exists first — returns a clean 404 if not
	if _, err := ctrl.svc.GetByID(c.Context(), brandID); err != nil {
		return err
	}

	pg := pagination.FromCtx(c)
	filter := dto.ProductFilter{
		BrandID: brandID,
		Search:  c.Query("search"),
	}

	products, meta, err := ctrl.productSvc.List(c.Context(), filter, pg)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, products, meta)
}

// Create handles POST /api/v1/brands  [admin only]
// @Summary      Create brand
// @Tags         brands
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateBrandRequest  true  "Brand data"
// @Success      201   {object}  dto.BrandResponse
// @Failure      409   {object}  map[string]interface{}
// @Router       /brands [post]
func (ctrl *BrandController) Create(c *fiber.Ctx) error {
	var req dto.CreateBrandRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	brand, err := ctrl.svc.Create(c.Context(), req)
	if err != nil {
		return err
	}
	return response.Created(c, brand)
}

// Update handles PUT /api/v1/brands/:id  [admin only]
// @Summary      Update brand
// @Tags         brands
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                  true  "Brand ObjectID"
// @Param        body  body      dto.UpdateBrandRequest  true  "Fields to update"
// @Success      200   {object}  dto.BrandResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /brands/{id} [put]
func (ctrl *BrandController) Update(c *fiber.Ctx) error {
	var req dto.UpdateBrandRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	brand, err := ctrl.svc.Update(c.Context(), c.Params("id"), req)
	if err != nil {
		return err
	}
	return response.OK(c, brand)
}

// Delete handles DELETE /api/v1/brands/:id  [admin only]
// @Summary      Delete brand
// @Description  Fails with 409 if any products are linked to this brand.
// @Tags         brands
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Brand ObjectID"
// @Success      204
// @Failure      409  {object}  map[string]interface{}
// @Router       /brands/{id} [delete]
func (ctrl *BrandController) Delete(c *fiber.Ctx) error {
	if err := ctrl.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.NoContent(c)
}
