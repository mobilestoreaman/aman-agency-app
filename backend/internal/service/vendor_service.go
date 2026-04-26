package service

import (
	"context"
	"fmt"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// VendorService defines the business-logic contract for vendor management.
type VendorService interface {
	Create(ctx context.Context, req dto.CreateVendorRequest) (*dto.VendorResponse, error)
	GetByID(ctx context.Context, id string) (*dto.VendorResponse, error)
	List(ctx context.Context, f dto.VendorFilter) ([]*dto.VendorResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateVendorRequest) (*dto.VendorResponse, error)
	Delete(ctx context.Context, id string) error
}

type vendorService struct {
	repo         repository.VendorRepository
	purchaseRepo repository.PurchaseRepository
}

// NewVendorService constructs a VendorService.
// purchaseRepo is used to enforce deletion constraints.
func NewVendorService(repo repository.VendorRepository, purchaseRepo repository.PurchaseRepository) VendorService {
	return &vendorService{repo: repo, purchaseRepo: purchaseRepo}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parseVendorOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid vendor id: %s", id))
	}
	return oid, nil
}

func toVendorResponse(v *models.Vendor) *dto.VendorResponse {
	return &dto.VendorResponse{
		ID:        v.ID.Hex(),
		Name:      v.Name,
		Phone:     v.Phone,
		Address:   v.Address,
		Notes:     v.Notes,
		CreatedAt: v.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt: v.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *vendorService) Create(ctx context.Context, req dto.CreateVendorRequest) (*dto.VendorResponse, error) {
	v := &models.Vendor{
		Name:    req.Name,
		Phone:   req.Phone,
		Address: req.Address,
		Notes:   req.Notes,
	}
	if err := s.repo.Create(ctx, v); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, apperror.Conflict(fmt.Sprintf("vendor with phone %s already exists", req.Phone))
		}
		return nil, err
	}
	return toVendorResponse(v), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *vendorService) GetByID(ctx context.Context, id string) (*dto.VendorResponse, error) {
	oid, err := parseVendorOID(id)
	if err != nil {
		return nil, err
	}
	v, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("vendor not found")
	}
	return toVendorResponse(v), nil
}

func (s *vendorService) List(ctx context.Context, f dto.VendorFilter) ([]*dto.VendorResponse, *response.Meta, error) {
	vendors, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}
	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 {
		pg.Limit = 20
	}
	if pg.Limit > 100 {
		pg.Limit = 100
	}
	meta := pagination.ToMeta(pg, total)
	out := make([]*dto.VendorResponse, 0, len(vendors))
	for _, v := range vendors {
		out = append(out, toVendorResponse(v))
	}
	return out, meta, nil
}

// ── Update ────────────────────────────────────────────────────────────────────

func (s *vendorService) Update(ctx context.Context, id string, req dto.UpdateVendorRequest) (*dto.VendorResponse, error) {
	oid, err := parseVendorOID(id)
	if err != nil {
		return nil, err
	}

	fields := bson.M{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.Phone != "" {
		fields["phone"] = req.Phone
	}
	if req.Address != "" {
		fields["address"] = req.Address
	}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}

	if len(fields) == 0 {
		return s.GetByID(ctx, id)
	}

	v, err := s.repo.Update(ctx, oid, fields)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, apperror.Conflict(fmt.Sprintf("phone %s is already used by another vendor", req.Phone))
		}
		return nil, apperror.NotFound("vendor not found")
	}
	return toVendorResponse(v), nil
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (s *vendorService) Delete(ctx context.Context, id string) error {
	oid, err := parseVendorOID(id)
	if err != nil {
		return err
	}

	// Block deletion if the vendor has any purchase records.
	// Purchases are the vendor's transaction history — deleting the vendor
	// would orphan those financial records.
	hasPurchases, err := s.purchaseRepo.HasByVendor(ctx, oid)
	if err != nil {
		return fmt.Errorf("failed to check vendor purchases: %w", err)
	}
	if hasPurchases {
		return apperror.Conflict("cannot delete vendor: they have existing purchase records — delete the purchases first")
	}

	if err := s.repo.Delete(ctx, oid); err != nil {
		return apperror.NotFound("vendor not found")
	}
	return nil
}
