package service

import (
	"context"
	"fmt"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// BrandService defines brand business logic.
type BrandService interface {
	Create(ctx context.Context, req dto.CreateBrandRequest) (*dto.BrandResponse, error)
	GetByID(ctx context.Context, id string) (*dto.BrandResponse, error)
	List(ctx context.Context) ([]*dto.BrandResponse, error)
	Update(ctx context.Context, id string, req dto.UpdateBrandRequest) (*dto.BrandResponse, error)
	Delete(ctx context.Context, id string) error
}

type brandService struct {
	brandRepo   repository.BrandRepository
	productRepo repository.ProductRepository // for propagating name changes
}

// NewBrandService constructs the BrandService.
func NewBrandService(brandRepo repository.BrandRepository, productRepo repository.ProductRepository) BrandService {
	return &brandService{
		brandRepo:   brandRepo,
		productRepo: productRepo,
	}
}

func (s *brandService) Create(ctx context.Context, req dto.CreateBrandRequest) (*dto.BrandResponse, error) {
	now := time.Now()
	brand := &models.Brand{
		ID:        primitive.NewObjectID(),
		Name:      req.Name,
		LogoURL:   req.LogoURL,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.brandRepo.Create(ctx, brand); err != nil {
		return nil, err
	}
	return toBrandResponse(brand), nil
}

func (s *brandService) GetByID(ctx context.Context, id string) (*dto.BrandResponse, error) {
	oid, err := parseObjectID(id, "brand")
	if err != nil {
		return nil, err
	}
	brand, err := s.brandRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	return toBrandResponse(brand), nil
}

func (s *brandService) List(ctx context.Context) ([]*dto.BrandResponse, error) {
	brands, err := s.brandRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*dto.BrandResponse, len(brands))
	for i, b := range brands {
		out[i] = toBrandResponse(b)
	}
	return out, nil
}

// Update modifies a brand's mutable fields.
// When the name changes, it propagates the new name to all linked products
// to keep the denormalized brand_name in sync.
func (s *brandService) Update(ctx context.Context, id string, req dto.UpdateBrandRequest) (*dto.BrandResponse, error) {
	oid, err := parseObjectID(id, "brand")
	if err != nil {
		return nil, err
	}

	fields := bson.M{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.LogoURL != "" {
		fields["logo_url"] = req.LogoURL
	}
	if len(fields) == 0 {
		return nil, apperror.BadRequest("no fields to update")
	}

	if err := s.brandRepo.Update(ctx, oid, fields); err != nil {
		return nil, err
	}

	// Propagate name change to denormalized product.brand_name.
	// This keeps all product records consistent without a separate reconciliation job.
	if newName, ok := fields["name"].(string); ok {
		if err := s.productRepo.UpdateBrandName(ctx, oid, newName); err != nil {
			return nil, fmt.Errorf("brand renamed but product records could not be updated: %w", err)
		}
	}

	brand, err := s.brandRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	return toBrandResponse(brand), nil
}

func (s *brandService) Delete(ctx context.Context, id string) error {
	oid, err := parseObjectID(id, "brand")
	if err != nil {
		return err
	}
	// Prevent deletion if products are still associated with this brand.
	hasProducts, err := s.productRepo.HasByBrand(ctx, oid)
	if err != nil {
		return err
	}
	if hasProducts {
		return apperror.Conflict("cannot delete brand: it still has products associated with it")
	}
	return s.brandRepo.Delete(ctx, oid)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func toBrandResponse(b *models.Brand) *dto.BrandResponse {
	return &dto.BrandResponse{
		ID:        b.ID.Hex(),
		Name:      b.Name,
		LogoURL:   b.LogoURL,
		CreatedAt: b.CreatedAt.Format(time.RFC3339),
		UpdatedAt: b.UpdatedAt.Format(time.RFC3339),
	}
}

// parseObjectID converts a hex string to a primitive.ObjectID,
// returning a user-friendly BadRequest error on malformed input.
func parseObjectID(hex, resource string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest("invalid " + resource + " ID")
	}
	return oid, nil
}
