package service

import (
	"context"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ProductService defines product business logic.
type ProductService interface {
	Create(ctx context.Context, req dto.CreateProductRequest) (*dto.ProductResponse, error)
	GetByID(ctx context.Context, id string) (*dto.ProductResponse, error)
	// GetByBarcode returns (product, nil) on hit, (nil, NotFoundError) on miss.
	// The controller wraps a miss into a BarcodeNotFoundResponse — not a hard error.
	GetByBarcode(ctx context.Context, barcode string) (*dto.ProductResponse, error)
	List(ctx context.Context, filter dto.ProductFilter, pg pagination.Params) ([]*dto.ProductResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateProductRequest) (*dto.ProductResponse, error)
	Delete(ctx context.Context, id string) error
}

type productService struct {
	productRepo repository.ProductRepository
	brandRepo   repository.BrandRepository
}

// NewProductService constructs the ProductService.
func NewProductService(productRepo repository.ProductRepository, brandRepo repository.BrandRepository) ProductService {
	return &productService{
		productRepo: productRepo,
		brandRepo:   brandRepo,
	}
}

// Create validates the brand exists, then inserts the product.
func (s *productService) Create(ctx context.Context, req dto.CreateProductRequest) (*dto.ProductResponse, error) {
	brandOID, err := parseObjectID(req.BrandID, "brand")
	if err != nil {
		return nil, err
	}

	brand, err := s.brandRepo.FindByID(ctx, brandOID)
	if err != nil {
		return nil, err // propagates NotFound("brand")
	}

	now := time.Now()
	p := &models.Product{
		ID:        primitive.NewObjectID(),
		BrandID:   brandOID,
		BrandName: brand.Name,
		ModelName: req.ModelName,
		Variant: models.Variant{
			RAM:     req.Variant.RAM,
			Storage: req.Variant.Storage,
		},
		Color:       req.Color,
		ScreenSize:  req.ScreenSize,
		Barcode:     req.Barcode,
		BarcodeType: models.BarcodeType(req.BarcodeType),
		Accessories: models.Accessories{
			HasCharger:   req.Accessories.HasCharger,
			HasEarphones: req.Accessories.HasEarphones,
			HasCable:     req.Accessories.HasCable,
			HasBox:       req.Accessories.HasBox,
		},
		Images:    req.Images,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := s.productRepo.Create(ctx, p); err != nil {
		return nil, err
	}
	return toProductResponse(p), nil
}

func (s *productService) GetByID(ctx context.Context, id string) (*dto.ProductResponse, error) {
	oid, err := parseObjectID(id, "product")
	if err != nil {
		return nil, err
	}
	p, err := s.productRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	return toProductResponse(p), nil
}

// GetByBarcode returns the product or a NotFound error.
// The controller handles the 404 case by returning a BarcodeNotFoundResponse
// with create_suggested=true rather than a hard error response.
func (s *productService) GetByBarcode(ctx context.Context, barcode string) (*dto.ProductResponse, error) {
	p, err := s.productRepo.FindByBarcode(ctx, barcode)
	if err != nil {
		return nil, err
	}
	return toProductResponse(p), nil
}

func (s *productService) List(
	ctx context.Context,
	filter dto.ProductFilter,
	pg pagination.Params,
) ([]*dto.ProductResponse, *response.Meta, error) {

	repoFilter := repository.ProductFilter{Search: filter.Search}

	if filter.BrandID != "" {
		oid, err := parseObjectID(filter.BrandID, "brand")
		if err != nil {
			return nil, nil, err
		}
		repoFilter.BrandID = &oid
	}

	products, total, err := s.productRepo.List(ctx, repoFilter, pg)
	if err != nil {
		return nil, nil, err
	}

	out := make([]*dto.ProductResponse, len(products))
	for i, p := range products {
		out[i] = toProductResponse(p)
	}

	meta := pagination.ToMeta(pg, total)
	return out, meta, nil
}

// Update applies partial updates. If brand_id changes, re-fetches brand name
// to keep the denormalized field accurate.
func (s *productService) Update(ctx context.Context, id string, req dto.UpdateProductRequest) (*dto.ProductResponse, error) {
	oid, err := parseObjectID(id, "product")
	if err != nil {
		return nil, err
	}

	fields := bson.M{}

	if req.BrandID != "" {
		brandOID, err := parseObjectID(req.BrandID, "brand")
		if err != nil {
			return nil, err
		}
		brand, err := s.brandRepo.FindByID(ctx, brandOID)
		if err != nil {
			return nil, err
		}
		fields["brand_id"] = brandOID
		fields["brand_name"] = brand.Name
	}
	if req.ModelName != "" {
		fields["model_name"] = req.ModelName
	}
	if req.Variant != nil {
		fields["variant"] = models.Variant{RAM: req.Variant.RAM, Storage: req.Variant.Storage}
	}
	if req.Color != "" {
		fields["color"] = req.Color
	}
	if req.ScreenSize != "" {
		fields["screen_size"] = req.ScreenSize
	}
	if req.Barcode != "" {
		fields["barcode"] = req.Barcode
	}
	if req.BarcodeType != "" {
		fields["barcode_type"] = models.BarcodeType(req.BarcodeType)
	}
	if req.Accessories != nil {
		fields["accessories"] = models.Accessories{
			HasCharger:   req.Accessories.HasCharger,
			HasEarphones: req.Accessories.HasEarphones,
			HasCable:     req.Accessories.HasCable,
			HasBox:       req.Accessories.HasBox,
		}
	}
	if req.Images != nil {
		// nil pointer = "not in request", non-nil (even empty slice) = explicit update
		if len(*req.Images) == 0 {
			fields["images"] = []string{}
		} else {
			fields["images"] = *req.Images
		}
	}

	if len(fields) == 0 {
		return nil, apperror.BadRequest("no fields to update")
	}

	if err := s.productRepo.Update(ctx, oid, fields); err != nil {
		return nil, err
	}

	updated, err := s.productRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	return toProductResponse(updated), nil
}

func (s *productService) Delete(ctx context.Context, id string) error {
	oid, err := parseObjectID(id, "product")
	if err != nil {
		return err
	}
	// Prevent deletion if devices in inventory still reference this product.
	hasDevices, err := s.productRepo.HasDevices(ctx, oid)
	if err != nil {
		return err
	}
	if hasDevices {
		return apperror.Conflict("cannot delete product: it still has devices in inventory")
	}
	return s.productRepo.Delete(ctx, oid)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func toProductResponse(p *models.Product) *dto.ProductResponse {
	return &dto.ProductResponse{
		ID:          p.ID.Hex(),
		BrandID:     p.BrandID.Hex(),
		BrandName:   p.BrandName,
		ModelName:   p.ModelName,
		DisplayName: p.DisplayName(),
		Variant:     dto.VariantRequest{RAM: p.Variant.RAM, Storage: p.Variant.Storage},
		Color:       p.Color,
		ScreenSize:  p.ScreenSize,
		Barcode:     p.Barcode,
		BarcodeType: string(p.BarcodeType),
		Accessories: dto.AccessoriesRequest{
			HasCharger:   p.Accessories.HasCharger,
			HasEarphones: p.Accessories.HasEarphones,
			HasCable:     p.Accessories.HasCable,
			HasBox:       p.Accessories.HasBox,
		},
		Images:    p.Images,
		CreatedAt: p.CreatedAt.Format(time.RFC3339),
		UpdatedAt: p.UpdatedAt.Format(time.RFC3339),
	}
}
