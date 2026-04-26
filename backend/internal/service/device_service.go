// Package service implements business logic for the device / inventory domain.
package service

import (
	"context"
	"fmt"
	"strings"

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

// DeviceService defines the business-logic contract for inventory operations.
type DeviceService interface {
	Create(ctx context.Context, req dto.CreateDeviceRequest) (*dto.DeviceResponse, error)
	GetByID(ctx context.Context, id string) (*dto.DeviceResponse, error)
	GetByIMEI(ctx context.Context, imei string) (*dto.DeviceResponse, error)
	List(ctx context.Context, f dto.DeviceFilter) ([]*dto.DeviceResponse, *response.Meta, error)
	Update(ctx context.Context, id string, req dto.UpdateDeviceRequest) (*dto.DeviceResponse, error)
	ChangeStatus(ctx context.Context, id string, req dto.ChangeStatusRequest) (*dto.DeviceResponse, error)
	Delete(ctx context.Context, id string) error
	StockSummary(ctx context.Context) (*dto.StockSummaryResponse, error)
}

type deviceService struct {
	deviceRepo  repository.DeviceRepository
	productRepo repository.ProductRepository
}

// NewDeviceService constructs a DeviceService with its required repositories.
func NewDeviceService(deviceRepo repository.DeviceRepository, productRepo repository.ProductRepository) DeviceService {
	return &deviceService{
		deviceRepo:  deviceRepo,
		productRepo: productRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parseDeviceOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid device id: %s", id))
	}
	return oid, nil
}

func toDeviceResponse(d *models.Device) *dto.DeviceResponse {
	return &dto.DeviceResponse{
		ID:            d.ID.Hex(),
		ProductID:     d.ProductID.Hex(),
		ProductName:   d.ProductName,
		BrandName:     d.BrandName,
		IMEI1:         d.IMEI1,
		IMEI2:         d.IMEI2,
		Status:        string(d.Status),
		Condition:     string(d.Condition),
		Color:         d.Color,
		Storage:       d.Storage,
		PurchasePrice: d.PurchasePrice,
		SellingPrice:  d.SellingPrice,
		Notes:         d.Notes,
		CreatedAt:     d.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:     d.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

// imeiConflictError formats a user-friendly duplicate-IMEI message.
func imeiConflictError(imei string) error {
	return apperror.Conflict(fmt.Sprintf("IMEI %s is already registered to another device", imei))
}

// isDuplicateKeyError checks whether a MongoDB error is a duplicate-key violation.
func isDuplicateKeyError(err error) bool {
	return mongo.IsDuplicateKeyError(err)
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *deviceService) Create(ctx context.Context, req dto.CreateDeviceRequest) (*dto.DeviceResponse, error) {
	// Validate selling price is not less than purchase price.
	if req.SellingPrice < req.PurchasePrice {
		return nil, apperror.BadRequest("selling price cannot be less than purchase price")
	}

	// Resolve product and denormalise names.
	productOID, err := parseObjectID(req.ProductID, "product_id") // reuse shared helper from product_service
	if err != nil {
		return nil, err
	}
	product, err := s.productRepo.FindByID(ctx, productOID)
	if err != nil {
		return nil, apperror.NotFound("product not found")
	}

	// Normalise IMEIs to uppercase to avoid case-split duplicates.
	imei1 := strings.ToUpper(strings.TrimSpace(req.IMEI1))
	imei2 := strings.ToUpper(strings.TrimSpace(req.IMEI2))

	// Default condition to "new" if not provided.
	condition := models.DeviceCondition(req.Condition)
	if condition == "" {
		condition = models.ConditionNew
	}

	d := &models.Device{
		ProductID:     productOID,
		ProductName:   product.DisplayName(),
		BrandName:     product.BrandName,
		IMEI1:         imei1,
		IMEI2:         imei2,
		Status:        models.DeviceStatusAvailable,
		Condition:     condition,
		Color:         req.Color,
		Storage:       req.Storage,
		PurchasePrice: req.PurchasePrice,
		SellingPrice:  req.SellingPrice,
		Notes:         req.Notes,
	}

	if err := s.deviceRepo.Create(ctx, d); err != nil {
		if isDuplicateKeyError(err) {
			return nil, imeiConflictError(imei1)
		}
		return nil, err
	}
	return toDeviceResponse(d), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *deviceService) GetByID(ctx context.Context, id string) (*dto.DeviceResponse, error) {
	oid, err := parseDeviceOID(id)
	if err != nil {
		return nil, err
	}
	d, err := s.deviceRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("device not found")
	}
	return toDeviceResponse(d), nil
}

func (s *deviceService) GetByIMEI(ctx context.Context, imei string) (*dto.DeviceResponse, error) {
	imei = strings.ToUpper(strings.TrimSpace(imei))
	d, err := s.deviceRepo.FindByIMEI(ctx, imei)
	if err != nil {
		return nil, apperror.NotFound(fmt.Sprintf("no device found with IMEI %s", imei))
	}
	return toDeviceResponse(d), nil
}

func (s *deviceService) List(ctx context.Context, f dto.DeviceFilter) ([]*dto.DeviceResponse, *response.Meta, error) {
	devices, total, err := s.deviceRepo.List(ctx, f)
	if err != nil {
		return nil, nil, err
	}

	pg := pagination.Params{
		Page:  f.Page,
		Limit: f.Limit,
	}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}
	meta := pagination.ToMeta(pg, total)

	out := make([]*dto.DeviceResponse, 0, len(devices))
	for _, d := range devices {
		out = append(out, toDeviceResponse(d))
	}
	return out, meta, nil
}

// ── Update ────────────────────────────────────────────────────────────────────

func (s *deviceService) Update(ctx context.Context, id string, req dto.UpdateDeviceRequest) (*dto.DeviceResponse, error) {
	oid, err := parseDeviceOID(id)
	if err != nil {
		return nil, err
	}

	// Fetch current device to enforce business rules before building the update.
	existing, err := s.deviceRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("device not found")
	}

	// Sold devices are immutable: price edits would retroactively change COGS
	// and profit calculations for already-completed sales.
	if existing.Status == models.DeviceStatusSold {
		return nil, apperror.Conflict(
			"sold devices cannot be edited — price and details are locked at point of sale",
		)
	}

	fields := bson.M{}

	// If product is being re-linked, fetch and denormalise new product name.
	if req.ProductID != "" {
		pOID, err := parseObjectID(req.ProductID, "product_id")
		if err != nil {
			return nil, err
		}
		product, err := s.productRepo.FindByID(ctx, pOID)
		if err != nil {
			return nil, apperror.NotFound("product not found")
		}
		fields["product_id"] = pOID
		fields["product_name"] = product.DisplayName
		fields["brand_name"] = product.BrandName
	}

	if req.IMEI1 != "" {
		fields["imei1"] = strings.ToUpper(strings.TrimSpace(req.IMEI1))
	}
	if req.IMEI2 != "" {
		fields["imei2"] = strings.ToUpper(strings.TrimSpace(req.IMEI2))
	}
	if req.Condition != "" {
		fields["condition"] = models.DeviceCondition(req.Condition)
	}
	if req.Color != "" {
		fields["color"] = req.Color
	}
	if req.Storage != "" {
		fields["storage"] = req.Storage
	}
	if req.PurchasePrice > 0 {
		fields["purchase_price"] = req.PurchasePrice
	}
	if req.SellingPrice > 0 {
		fields["selling_price"] = req.SellingPrice
	}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}

	if len(fields) == 0 {
		return s.GetByID(ctx, id)
	}

	// Validate selling price is not less than purchase price.
	// Use the updated values if provided, otherwise use existing values.
	updatedPurchasePrice := existing.PurchasePrice
	updatedSellingPrice := existing.SellingPrice
	if reqPrice, ok := fields["purchase_price"].(float64); ok {
		updatedPurchasePrice = reqPrice
	}
	if reqPrice, ok := fields["selling_price"].(float64); ok {
		updatedSellingPrice = reqPrice
	}
	if updatedSellingPrice > 0 && updatedSellingPrice < updatedPurchasePrice {
		return nil, apperror.BadRequest("selling price cannot be less than purchase price")
	}

	d, err := s.deviceRepo.Update(ctx, oid, fields)
	if err != nil {
		if isDuplicateKeyError(err) {
			return nil, imeiConflictError(req.IMEI1)
		}
		return nil, apperror.NotFound("device not found")
	}
	return toDeviceResponse(d), nil
}

// ── Status machine ────────────────────────────────────────────────────────────

// ChangeStatus validates the transition against the state machine and applies it.
func (s *deviceService) ChangeStatus(ctx context.Context, id string, req dto.ChangeStatusRequest) (*dto.DeviceResponse, error) {
	oid, err := parseDeviceOID(id)
	if err != nil {
		return nil, err
	}

	d, err := s.deviceRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("device not found")
	}

	newStatus := models.DeviceStatus(req.Status)

	if d.Status == newStatus {
		// Idempotent — no change needed.
		return toDeviceResponse(d), nil
	}

	if !models.CanTransition(d.Status, newStatus) {
		return nil, apperror.ValidationFailed(fmt.Sprintf(
			"cannot transition device from %q to %q", d.Status, newStatus,
		))
	}

	fields := bson.M{"status": newStatus}
	if req.Notes != "" {
		fields["notes"] = req.Notes
	}

	updated, err := s.deviceRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, err
	}
	return toDeviceResponse(updated), nil
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (s *deviceService) Delete(ctx context.Context, id string) error {
	oid, err := parseDeviceOID(id)
	if err != nil {
		return err
	}

	// Prevent deletion of sold or on-repair devices.
	d, err := s.deviceRepo.FindByID(ctx, oid)
	if err != nil {
		return apperror.NotFound("device not found")
	}
	if d.Status == models.DeviceStatusSold || d.Status == models.DeviceStatusRepair {
		return apperror.Conflict(fmt.Sprintf(
			"device cannot be deleted while in %q status", d.Status,
		))
	}

	return s.deviceRepo.Delete(ctx, oid)
}

// ── Stock summary ─────────────────────────────────────────────────────────────

func (s *deviceService) StockSummary(ctx context.Context) (*dto.StockSummaryResponse, error) {
	rows, err := s.deviceRepo.StockSummary(ctx)
	if err != nil {
		return nil, err
	}

	var totalInStock, totalUnits int64
	for _, r := range rows {
		totalInStock += r.InStock
		totalUnits += r.Total
	}

	return &dto.StockSummaryResponse{
		Rows:         rows,
		TotalInStock: totalInStock,
		TotalUnits:   totalUnits,
	}, nil
}
