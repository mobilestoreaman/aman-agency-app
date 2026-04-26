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

// ProductController handles HTTP for /api/v1/products
type ProductController struct {
	svc service.ProductService
}

// NewProductController wires the controller to its service.
func NewProductController(svc service.ProductService) *ProductController {
	return &ProductController{svc: svc}
}

// List handles GET /api/v1/products
// @Summary      List products
// @Description  Paginated product catalogue. Supports brand filter and full-text search.
// @Tags         products
// @Produce      json
// @Security     BearerAuth
// @Param        page      query  int     false  "Page (default 1)"
// @Param        limit     query  int     false  "Per page (default 20, max 100)"
// @Param        brand_id  query  string  false  "Filter by brand ObjectID"
// @Param        search    query  string  false  "Full-text search (model name, barcode, brand)"
// @Success      200  {array}   dto.ProductResponse
// @Router       /products [get]
func (ctrl *ProductController) List(c *fiber.Ctx) error {
	pg := pagination.FromCtx(c)
	filter := dto.ProductFilter{
		BrandID: c.Query("brand_id"),
		Search:  c.Query("search"),
	}

	products, meta, err := ctrl.svc.List(c.Context(), filter, pg)
	if err != nil {
		return err
	}
	return response.OKWithMeta(c, products, meta)
}

// GetByID handles GET /api/v1/products/:id
// @Summary      Get product by ID
// @Tags         products
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Product ObjectID"
// @Success      200  {object}  dto.ProductResponse
// @Failure      404  {object}  map[string]interface{}
// @Router       /products/{id} [get]
func (ctrl *ProductController) GetByID(c *fiber.Ctx) error {
	p, err := ctrl.svc.GetByID(c.Context(), c.Params("id"))
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// GetByBarcode handles GET /api/v1/products/barcode/:barcode
//
// This is the barcode-scan endpoint used by both camera and external scanner.
//
// Response contract:
//   - 200  found=true  → product data  (client proceeds to sale/purchase form)
//   - 200  found=false → create_suggested=true  (client shows create-product form)
//
// A 200 is always returned (not 404) so the client can distinguish
// "product missing — offer to create it" from a real server error.
//
// @Summary      Look up product by barcode
// @Description  Barcode-scan endpoint. Always returns HTTP 200. Check `found` field in response.
// @Tags         products
// @Produce      json
// @Security     BearerAuth
// @Param        barcode  path  string  true  "Barcode string (any symbology)"
// @Success      200  {object}  map[string]interface{}  "found=true with product, or found=false with create_suggested=true"
// @Router       /products/barcode/{barcode} [get]
func (ctrl *ProductController) GetByBarcode(c *fiber.Ctx) error {
	barcode := c.Params("barcode")
	if barcode == "" {
		return apperror.BadRequest("barcode is required")
	}

	p, err := ctrl.svc.GetByBarcode(c.Context(), barcode)
	if err != nil {
		// Product not found — tell client to offer creation, not an error
		if apperror.IsNotFound(err) {
			return response.OK(c, dto.BarcodeNotFoundResponse{
				Found:           false,
				Barcode:         barcode,
				CreateSuggested: true,
				Message:         "product not found — you can create it now",
			})
		}
		return err
	}

	// Wrap found product in the same envelope shape for consistency
	return response.OK(c, fiber.Map{
		"found":   true,
		"barcode": barcode,
		"product": p,
	})
}

// Create handles POST /api/v1/products  [admin only]
// @Summary      Create product
// @Tags         products
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateProductRequest  true  "Product data"
// @Success      201   {object}  dto.ProductResponse
// @Failure      400   {object}  map[string]interface{}
// @Failure      409   {object}  map[string]interface{}  "Barcode already exists"
// @Router       /products [post]
func (ctrl *ProductController) Create(c *fiber.Ctx) error {
	var req dto.CreateProductRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	p, err := ctrl.svc.Create(c.Context(), req)
	if err != nil {
		return err
	}
	return response.Created(c, p)
}

// Update handles PUT /api/v1/products/:id  [admin only]
// @Summary      Update product
// @Tags         products
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                  true  "Product ObjectID"
// @Param        body  body      dto.UpdateProductRequest  true  "Fields to update"
// @Success      200   {object}  dto.ProductResponse
// @Failure      404   {object}  map[string]interface{}
// @Router       /products/{id} [put]
func (ctrl *ProductController) Update(c *fiber.Ctx) error {
	var req dto.UpdateProductRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	p, err := ctrl.svc.Update(c.Context(), c.Params("id"), req)
	if err != nil {
		return err
	}
	return response.OK(c, p)
}

// Delete handles DELETE /api/v1/products/:id  [admin only]
// @Summary      Delete product
// @Description  Fails with 409 if any devices are linked to this product.
// @Tags         products
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  string  true  "Product ObjectID"
// @Success      204
// @Failure      409  {object}  map[string]interface{}
// @Router       /products/{id} [delete]
func (ctrl *ProductController) Delete(c *fiber.Ctx) error {
	if err := ctrl.svc.Delete(c.Context(), c.Params("id")); err != nil {
		return err
	}
	return response.NoContent(c)
}
