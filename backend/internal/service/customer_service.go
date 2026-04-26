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

// CustomerService defines the business-logic contract for customer management.
type CustomerService interface {
	Create(ctx context.Context, req dto.CreateCustomerRequest) (*dto.CustomerResponse, error)
	GetByID(ctx context.Context, id string) (*dto.CustomerResponse, error)
	List(ctx context.Context, f dto.CustomerFilter) ([]*dto.CustomerResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateCustomerRequest) (*dto.CustomerResponse, error)
	Delete(ctx context.Context, id string) error
}

type customerService struct {
	repo     repository.CustomerRepository
	saleRepo repository.SaleRepository
}

// NewCustomerService constructs a CustomerService.
// saleRepo is used to enforce deletion constraints (no active sales).
func NewCustomerService(
	repo repository.CustomerRepository,
	saleRepo repository.SaleRepository,
) CustomerService {
	return &customerService{
		repo:     repo,
		saleRepo: saleRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parseCustomerOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid customer id: %s", id))
	}
	return oid, nil
}

func toCustomerResponse(c *models.Customer) *dto.CustomerResponse {
	return &dto.CustomerResponse{
		ID:            c.ID.Hex(),
		Name:          c.Name,
		Phone:         c.Phone,
		Address:       c.Address,
		CreditBalance: c.CreditBalance,
		Notes:         c.Notes,
		CreatedAt:     c.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:     c.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *customerService) Create(ctx context.Context, req dto.CreateCustomerRequest) (*dto.CustomerResponse, error) {
	c := &models.Customer{
		Name:    req.Name,
		Phone:   req.Phone,
		Address: req.Address,
		Notes:   req.Notes,
	}
	if err := s.repo.Create(ctx, c); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, apperror.Conflict(fmt.Sprintf("customer with phone %s already exists", req.Phone))
		}
		return nil, err
	}
	return toCustomerResponse(c), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *customerService) GetByID(ctx context.Context, id string) (*dto.CustomerResponse, error) {
	oid, err := parseCustomerOID(id)
	if err != nil {
		return nil, err
	}
	c, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("customer not found")
	}
	return toCustomerResponse(c), nil
}

func (s *customerService) List(ctx context.Context, f dto.CustomerFilter) ([]*dto.CustomerResponse, *response.Meta, error) {
	customers, total, err := s.repo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}
	meta := pagination.ToMeta(pg, total)

	out := make([]*dto.CustomerResponse, 0, len(customers))
	for _, c := range customers {
		out = append(out, toCustomerResponse(c))
	}
	return out, meta, nil
}

// ── Update ────────────────────────────────────────────────────────────────────

func (s *customerService) Update(ctx context.Context, id string, req dto.UpdateCustomerRequest) (*dto.CustomerResponse, error) {
	oid, err := parseCustomerOID(id)
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

	c, err := s.repo.Update(ctx, oid, fields)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return nil, apperror.Conflict(fmt.Sprintf("phone %s is already used by another customer", req.Phone))
		}
		return nil, apperror.NotFound("customer not found")
	}
	return toCustomerResponse(c), nil
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (s *customerService) Delete(ctx context.Context, id string) error {
	oid, err := parseCustomerOID(id)
	if err != nil {
		return err
	}

	// Fetch the customer to check constraints before deletion.
	customer, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		return apperror.NotFound("customer not found")
	}

	// Block deletion if the customer still has an outstanding credit balance.
	if customer.CreditBalance != 0 {
		return apperror.Conflict(fmt.Sprintf(
			"cannot delete customer: they have an outstanding credit balance of ₹%.2f — clear it first",
			customer.CreditBalance,
		))
	}

	// Block deletion if the customer has any non-cancelled sales.
	hasSales, err := s.saleRepo.HasActiveByCustomer(ctx, oid)
	if err != nil {
		return fmt.Errorf("failed to check customer sales: %w", err)
	}
	if hasSales {
		return apperror.Conflict("cannot delete customer: they have existing sale records — cancel them first")
	}

	if err := s.repo.Delete(ctx, oid); err != nil {
		return apperror.NotFound("customer not found")
	}
	return nil
}
