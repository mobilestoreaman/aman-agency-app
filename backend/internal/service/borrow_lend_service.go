package service

import (
	"context"
	"fmt"
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

// BorrowLendService manages borrow and lend transactions for physical handsets.
type BorrowLendService interface {
	Create(ctx context.Context, staffName string, req dto.CreateBorrowLendRequest) (*dto.BorrowLendResponse, error)
	GetByID(ctx context.Context, id string) (*dto.BorrowLendResponse, error)
	List(ctx context.Context, f dto.BorrowLendFilter) ([]*dto.BorrowLendResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateBorrowLendRequest) (*dto.BorrowLendResponse, error)
	// Return marks the device as returned and stamps returned_at.
	Return(ctx context.Context, id string, req dto.ReturnBorrowLendRequest) (*dto.BorrowLendResponse, error)
	// MarkOverdue sets status=overdue (admin only — enforced at the route layer).
	MarkOverdue(ctx context.Context, id string) (*dto.BorrowLendResponse, error)
	Delete(ctx context.Context, id string) error
}

type borrowLendService struct {
	blRepo       repository.BorrowLendRepository
	deviceRepo   repository.DeviceRepository
	customerRepo repository.CustomerRepository
}

// NewBorrowLendService constructs a BorrowLendService.
// deviceRepo and customerRepo are used for optional validation / denormalisation
// when a DeviceID or CustomerID is supplied at creation time.
func NewBorrowLendService(
	blRepo repository.BorrowLendRepository,
	deviceRepo repository.DeviceRepository,
	customerRepo repository.CustomerRepository,
) BorrowLendService {
	return &borrowLendService{
		blRepo:       blRepo,
		deviceRepo:   deviceRepo,
		customerRepo: customerRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parseBLOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid borrow/lend id: %s", id))
	}
	return oid, nil
}

// parseBLDate parses a DD-MM-YYYY IST string into UTC midnight of that IST day.
func parseBLDate(s string) (time.Time, error) {
	t, err := time.ParseInLocation("02-01-2006", s, ist)
	if err != nil {
		return time.Time{}, apperror.BadRequest(
			fmt.Sprintf("invalid date: use DD-MM-YYYY, got %q", s))
	}
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, ist), nil
}

func toBLResponse(bl *models.BorrowLend) *dto.BorrowLendResponse {
	r := &dto.BorrowLendResponse{
		ID:               bl.ID.Hex(),
		Type:             string(bl.Type),
		DeviceDesc:       bl.DeviceDesc,
		PartyName:        bl.PartyName,
		PartyPhone:       bl.PartyPhone,
		Status:           string(bl.Status),
		Notes:            bl.Notes,
		CreatedBy:        bl.CreatedBy,
		BorrowDate:       bl.BorrowedAt.Format("2006-01-02T15:04:05Z"),
		ResolutionType:   bl.ResolutionType,
		SettlementAmount: bl.SettlementAmount,
		CreatedAt:        bl.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:        bl.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if bl.DeviceID != nil {
		r.DeviceID = bl.DeviceID.Hex()
	}
	if bl.CustomerID != nil {
		r.CustomerID = bl.CustomerID.Hex()
		r.CustomerName = bl.CustomerName
	}
	if bl.DueAt != nil {
		r.ExpectedReturnDate = bl.DueAt.Format("2006-01-02T15:04:05Z")
	}
	if bl.ReturnedAt != nil {
		r.ActualReturnDate = bl.ReturnedAt.Format("2006-01-02T15:04:05Z")
	}
	return r
}

// ── Create ────────────────────────────────────────────────────────────────────

// Create opens a new borrow or lend transaction. If DeviceID is provided the
// device is validated to exist (status is NOT changed). If CustomerID is
// provided the customer is validated and their name is denormalised.
func (s *borrowLendService) Create(ctx context.Context, staffName string, req dto.CreateBorrowLendRequest) (*dto.BorrowLendResponse, error) {
	bl := &models.BorrowLend{
		Type:       models.BorrowLendType(req.Type),
		DeviceDesc: req.DeviceDesc,
		PartyName:  req.PartyName,
		PartyPhone: req.PartyPhone,
		Status:     models.BorrowLendStatusActive,
		Notes:      req.Notes,
		CreatedBy:  staffName,
	}

	// Optional: link and validate inventory device.
	if req.DeviceID != "" {
		oid, err := primitive.ObjectIDFromHex(req.DeviceID)
		if err != nil {
			return nil, apperror.BadRequest("invalid device_id")
		}
		if _, err := s.deviceRepo.FindByID(ctx, oid); err != nil {
			return nil, apperror.NotFound("device not found")
		}
		bl.DeviceID = &oid
	}

	// Optional: link and denormalise customer.
	if req.CustomerID != "" {
		oid, err := primitive.ObjectIDFromHex(req.CustomerID)
		if err != nil {
			return nil, apperror.BadRequest("invalid customer_id")
		}
		customer, err := s.customerRepo.FindByID(ctx, oid)
		if err != nil {
			return nil, apperror.NotFound("customer not found")
		}
		bl.CustomerID = &oid
		bl.CustomerName = customer.Name
	}

	// Parse borrow_date — defaults to today IST.
	if req.BorrowDate != "" {
		t, err := parseBLDate(req.BorrowDate)
		if err != nil {
			return nil, err
		}
		bl.BorrowedAt = t.UTC()
	} else {
		now := time.Now().In(ist)
		bl.BorrowedAt = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, ist).UTC()
	}

	// Parse optional expected return date.
	if req.ExpectedReturnDate != "" {
		t, err := parseBLDate(req.ExpectedReturnDate)
		if err != nil {
			return nil, apperror.BadRequest("expected_return_date: use DD-MM-YYYY")
		}
		due := t.UTC()
		bl.DueAt = &due
	}

	if err := s.blRepo.Create(ctx, bl); err != nil {
		return nil, err
	}
	return toBLResponse(bl), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *borrowLendService) GetByID(ctx context.Context, id string) (*dto.BorrowLendResponse, error) {
	oid, err := parseBLOID(id)
	if err != nil {
		return nil, err
	}
	bl, err := s.blRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("borrow/lend record not found")
	}
	return toBLResponse(bl), nil
}

func (s *borrowLendService) List(ctx context.Context, f dto.BorrowLendFilter) ([]*dto.BorrowLendResponse, *response.Meta, error) {
	records, total, err := s.blRepo.List(ctx, f)
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

	out := make([]*dto.BorrowLendResponse, 0, len(records))
	for _, bl := range records {
		out = append(out, toBLResponse(bl))
	}
	return out, meta, nil
}

// ── Update ────────────────────────────────────────────────────────────────────

// Update patches mutable fields. Only non-empty values are applied.
// Returned or overdue records can still be updated (notes, contact corrections).
func (s *borrowLendService) Update(ctx context.Context, id string, req dto.UpdateBorrowLendRequest) (*dto.BorrowLendResponse, error) {
	oid, err := parseBLOID(id)
	if err != nil {
		return nil, err
	}

	fields := bson.M{}
	if req.DeviceDesc != "" {
		fields["device_desc"] = req.DeviceDesc
	}
	if req.PartyName != "" {
		fields["party_name"] = req.PartyName
	}
	if req.PartyPhone != "" {
		fields["party_phone"] = req.PartyPhone
	}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}
	if req.ExpectedReturnDate != "" {
		t, err := parseBLDate(req.ExpectedReturnDate)
		if err != nil {
			return nil, apperror.BadRequest("expected_return_date: use DD-MM-YYYY")
		}
		fields["due_at"] = t.UTC()
	}
	if len(fields) == 0 {
		return s.GetByID(ctx, id)
	}

	updated, err := s.blRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, apperror.NotFound("borrow/lend record not found")
	}
	return toBLResponse(updated), nil
}

// ── Return ────────────────────────────────────────────────────────────────────

// Return marks the transaction as returned and stamps returned_at.
// Already-returned records return 409.
func (s *borrowLendService) Return(ctx context.Context, id string, req dto.ReturnBorrowLendRequest) (*dto.BorrowLendResponse, error) {
	oid, err := parseBLOID(id)
	if err != nil {
		return nil, err
	}

	bl, err := s.blRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("borrow/lend record not found")
	}
	if bl.Status == models.BorrowLendStatusReturned {
		return nil, apperror.Conflict("device is already marked as returned")
	}

	if req.ResolutionType == "payment" && req.SettlementAmount <= 0 {
		return nil, apperror.BadRequest("settlement_amount must be greater than 0 when resolution_type is 'payment'")
	}

	now := time.Now().UTC()
	fields := bson.M{
		"status":      models.BorrowLendStatusReturned,
		"returned_at": now,
	}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}
	if req.ResolutionType != "" {
		fields["resolution_type"] = req.ResolutionType
	}
	if req.SettlementAmount > 0 {
		fields["settlement_amount"] = req.SettlementAmount
	}

	updated, err := s.blRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, err
	}
	return toBLResponse(updated), nil
}

// ── MarkOverdue ───────────────────────────────────────────────────────────────

// MarkOverdue transitions an active transaction to overdue status.
// Only active records can be marked overdue; returned records return 409.
func (s *borrowLendService) MarkOverdue(ctx context.Context, id string) (*dto.BorrowLendResponse, error) {
	oid, err := parseBLOID(id)
	if err != nil {
		return nil, err
	}

	bl, err := s.blRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("borrow/lend record not found")
	}
	if bl.Status == models.BorrowLendStatusReturned {
		return nil, apperror.Conflict("cannot mark a returned transaction as overdue")
	}
	if bl.Status == models.BorrowLendStatusOverdue {
		return nil, apperror.Conflict("transaction is already marked as overdue")
	}

	updated, err := s.blRepo.Update(ctx, oid, bson.M{"status": models.BorrowLendStatusOverdue})
	if err != nil {
		return nil, err
	}
	return toBLResponse(updated), nil
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (s *borrowLendService) Delete(ctx context.Context, id string) error {
	oid, err := parseBLOID(id)
	if err != nil {
		return err
	}
	if err := s.blRepo.Delete(ctx, oid); err != nil {
		return apperror.NotFound("borrow/lend record not found")
	}
	return nil
}
