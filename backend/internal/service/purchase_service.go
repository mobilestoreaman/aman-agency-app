package service

import (
	"context"
	"fmt"
	"strings"
	"time"

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

// PurchaseService defines the business-logic contract for purchase orders.
type PurchaseService interface {
	Create(ctx context.Context, req dto.CreatePurchaseRequest) (*dto.PurchaseResponse, error)
	GetByID(ctx context.Context, id string) (*dto.PurchaseResponse, error)
	List(ctx context.Context, f dto.PurchaseFilter) ([]*dto.PurchaseResponse, *response.Meta, error)
	// Update modifies a pending purchase's vendor, items, date, or notes.
	// Received purchases cannot be edited.
	Update(ctx context.Context, id string, req dto.UpdatePurchaseRequest) (*dto.PurchaseResponse, error)
	// Receive marks a pending purchase as received, creating Device documents for
	// every line item and linking them back via device_id.
	Receive(ctx context.Context, id string, req dto.ReceivePurchaseRequest) (*dto.PurchaseResponse, error)
	Delete(ctx context.Context, id string) error
}

type purchaseService struct {
	purchaseRepo repository.PurchaseRepository
	vendorRepo   repository.VendorRepository
	productRepo  repository.ProductRepository
	deviceRepo   repository.DeviceRepository
}

// NewPurchaseService constructs a PurchaseService with all required repositories.
func NewPurchaseService(
	purchaseRepo repository.PurchaseRepository,
	vendorRepo repository.VendorRepository,
	productRepo repository.ProductRepository,
	deviceRepo repository.DeviceRepository,
) PurchaseService {
	return &purchaseService{
		purchaseRepo: purchaseRepo,
		vendorRepo:   vendorRepo,
		productRepo:  productRepo,
		deviceRepo:   deviceRepo,
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func parsePurchaseOID(id string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return primitive.NilObjectID, apperror.BadRequest(fmt.Sprintf("invalid purchase id: %s", id))
	}
	return oid, nil
}

func toPurchaseItemResponse(item models.PurchaseItem) dto.PurchaseItemResponse {
	r := dto.PurchaseItemResponse{
		ProductID:     item.ProductID.Hex(),
		ProductName:   item.ProductName,
		BrandName:     item.BrandName,
		IMEI1:         item.IMEI1,
		IMEI2:         item.IMEI2,
		Condition:     string(item.Condition),
		Color:         item.Color,
		Storage:       item.Storage,
		PurchasePrice: item.PurchasePrice,
		SellingPrice:  item.SellingPrice,
	}
	if item.DeviceID != nil {
		r.DeviceID = item.DeviceID.Hex()
	}
	return r
}

func toPurchaseResponse(p *models.Purchase) *dto.PurchaseResponse {
	items := make([]dto.PurchaseItemResponse, 0, len(p.Items))
	for _, item := range p.Items {
		items = append(items, toPurchaseItemResponse(item))
	}

	resp := &dto.PurchaseResponse{
		ID:          p.ID.Hex(),
		VendorID:    p.VendorID.Hex(),
		VendorName:  p.VendorName,
		Items:       items,
		Status:      string(p.Status),
		TotalCost:   p.TotalCost,
		Notes:       p.Notes,
		PurchasedAt: p.PurchasedAt.Format("2006-01-02T15:04:05Z"),
		CreatedAt:   p.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:   p.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if p.ReceivedAt != nil {
		resp.ReceivedAt = p.ReceivedAt.Format("2006-01-02T15:04:05Z")
	}
	return resp
}

// ── Create ────────────────────────────────────────────────────────────────────

func (s *purchaseService) Create(ctx context.Context, req dto.CreatePurchaseRequest) (*dto.PurchaseResponse, error) {
	// Resolve vendor and denormalise name.
	vendorOID, err := parseObjectID(req.VendorID, "vendor_id")
	if err != nil {
		return nil, err
	}
	vendor, err := s.vendorRepo.FindByID(ctx, vendorOID)
	if err != nil {
		return nil, apperror.NotFound("vendor not found")
	}

	// Parse optional purchased_at date (defaults to now).
	purchasedAt := time.Now().UTC()
	if req.PurchasedAt != "" {
		t, err := time.Parse(time.RFC3339, req.PurchasedAt)
		if err != nil {
			return nil, apperror.BadRequest("purchased_at must be an ISO 8601 date-time string")
		}
		purchasedAt = t.UTC()
	}

	// Resolve each line item's product and build the embedded items array.
	var totalCost float64
	items := make([]models.PurchaseItem, 0, len(req.Items))
	for i, reqItem := range req.Items {
		productOID, err := parseObjectID(reqItem.ProductID, "product_id")
		if err != nil {
			return nil, apperror.BadRequest(fmt.Sprintf("item[%d]: invalid product_id", i))
		}
		product, err := s.productRepo.FindByID(ctx, productOID)
		if err != nil {
			return nil, apperror.BadRequest(fmt.Sprintf("item[%d]: product not found", i))
		}

		items = append(items, models.PurchaseItem{
			ProductID:     productOID,
			ProductName:   product.DisplayName(),
			BrandName:     product.BrandName,
			IMEI1:         strings.ToUpper(strings.TrimSpace(reqItem.IMEI1)),
			IMEI2:         strings.ToUpper(strings.TrimSpace(reqItem.IMEI2)),
			Condition:     models.DeviceCondition(reqItem.Condition),
			Color:         reqItem.Color,
			Storage:       reqItem.Storage,
			PurchasePrice: reqItem.PurchasePrice,
			SellingPrice:  reqItem.SellingPrice,
		})
		totalCost += reqItem.PurchasePrice
	}

	purchase := &models.Purchase{
		VendorID:    vendorOID,
		VendorName:  vendor.Name,
		Items:       items,
		Status:      models.PurchaseStatusPending,
		TotalCost:   totalCost,
		Notes:       req.Notes,
		PurchasedAt: purchasedAt,
	}

	if err := s.purchaseRepo.Create(ctx, purchase); err != nil {
		return nil, err
	}
	return toPurchaseResponse(purchase), nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (s *purchaseService) GetByID(ctx context.Context, id string) (*dto.PurchaseResponse, error) {
	oid, err := parsePurchaseOID(id)
	if err != nil {
		return nil, err
	}
	p, err := s.purchaseRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("purchase not found")
	}
	return toPurchaseResponse(p), nil
}

func (s *purchaseService) List(ctx context.Context, f dto.PurchaseFilter) ([]*dto.PurchaseResponse, *response.Meta, error) {
	purchases, total, err := s.purchaseRepo.List(ctx, f)
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

	out := make([]*dto.PurchaseResponse, 0, len(purchases))
	for _, p := range purchases {
		out = append(out, toPurchaseResponse(p))
	}
	return out, meta, nil
}

// ── Update ────────────────────────────────────────────────────────────────────

func (s *purchaseService) Update(ctx context.Context, id string, req dto.UpdatePurchaseRequest) (*dto.PurchaseResponse, error) {
	oid, err := parsePurchaseOID(id)
	if err != nil {
		return nil, err
	}

	purchase, err := s.purchaseRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("purchase not found")
	}
	if purchase.Status != models.PurchaseStatusPending {
		return nil, apperror.Conflict("only pending purchases can be edited")
	}

	fields := bson.M{}

	// Optional vendor change
	if req.VendorID != "" {
		vendorOID, err := parseObjectID(req.VendorID, "vendor_id")
		if err != nil {
			return nil, err
		}
		vendor, err := s.vendorRepo.FindByID(ctx, vendorOID)
		if err != nil {
			return nil, apperror.NotFound("vendor not found")
		}
		fields["vendor_id"] = vendorOID
		fields["vendor_name"] = vendor.Name
	}

	// Optional purchased_at change
	if req.PurchasedAt != "" {
		t, err := time.Parse(time.RFC3339, req.PurchasedAt)
		if err != nil {
			return nil, apperror.BadRequest("purchased_at must be an ISO 8601 date-time string")
		}
		fields["purchased_at"] = t.UTC()
	}

	// Optional notes change
	fields["notes"] = req.Notes

	// Optional items replacement
	if len(req.Items) > 0 {
		var totalCost float64
		items := make([]models.PurchaseItem, 0, len(req.Items))
		for i, reqItem := range req.Items {
			productOID, err := parseObjectID(reqItem.ProductID, "product_id")
			if err != nil {
				return nil, apperror.BadRequest(fmt.Sprintf("item[%d]: invalid product_id", i))
			}
			product, err := s.productRepo.FindByID(ctx, productOID)
			if err != nil {
				return nil, apperror.BadRequest(fmt.Sprintf("item[%d]: product not found", i))
			}
			items = append(items, models.PurchaseItem{
				ProductID:     productOID,
				ProductName:   product.DisplayName(),
				BrandName:     product.BrandName,
				IMEI1:         strings.ToUpper(strings.TrimSpace(reqItem.IMEI1)),
				IMEI2:         strings.ToUpper(strings.TrimSpace(reqItem.IMEI2)),
				Condition:     models.DeviceCondition(reqItem.Condition),
				Color:         reqItem.Color,
				Storage:       reqItem.Storage,
				PurchasePrice: reqItem.PurchasePrice,
				SellingPrice:  reqItem.SellingPrice,
			})
			totalCost += reqItem.PurchasePrice
		}
		fields["items"] = items
		fields["total_cost"] = totalCost
	}

	updated, err := s.purchaseRepo.Update(ctx, oid, fields)
	if err != nil {
		return nil, err
	}
	return toPurchaseResponse(updated), nil
}

// ── Receive ───────────────────────────────────────────────────────────────────

// Receive materialises every line item as a Device document and marks the
// purchase as received. If any IMEI already exists the whole operation aborts
// before any devices are persisted, so the caller can fix the conflict.
func (s *purchaseService) Receive(ctx context.Context, id string, req dto.ReceivePurchaseRequest) (*dto.PurchaseResponse, error) {
	oid, err := parsePurchaseOID(id)
	if err != nil {
		return nil, err
	}

	purchase, err := s.purchaseRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, apperror.NotFound("purchase not found")
	}
	if purchase.Status != models.PurchaseStatusPending {
		return nil, apperror.Conflict(fmt.Sprintf(
			"purchase is already %q — only pending purchases can be received", purchase.Status,
		))
	}

	// ── Pre-flight: verify all IMEIs are unique before writing anything ──────
	// This prevents a partial-commit situation where items[0..k-1] are created
	// as Device documents but items[k] fails due to a duplicate IMEI, leaving
	// orphaned inventory records with no purchase link.
	for i, item := range purchase.Items {
		if _, err := s.deviceRepo.FindByIMEI(ctx, item.IMEI1); err == nil {
			return nil, apperror.Conflict(fmt.Sprintf(
				"item[%d]: IMEI %s is already registered in inventory", i, item.IMEI1,
			))
		}
		if item.IMEI2 != "" {
			if _, err := s.deviceRepo.FindByIMEI(ctx, item.IMEI2); err == nil {
				return nil, apperror.Conflict(fmt.Sprintf(
					"item[%d]: IMEI2 %s is already registered in inventory", i, item.IMEI2,
				))
			}
		}
	}

	// ── Create device documents (all IMEIs validated above) ──────────────────
	type created struct {
		index    int
		deviceID primitive.ObjectID
	}
	var createdDevices []created

	for i, item := range purchase.Items {
		d := &models.Device{
			ProductID:     item.ProductID,
			ProductName:   item.ProductName,
			BrandName:     item.BrandName,
			IMEI1:         item.IMEI1,
			IMEI2:         item.IMEI2,
			Status:        models.DeviceStatusAvailable,
			Condition:     item.Condition,
			Color:         item.Color,
			Storage:       item.Storage,
			PurchasePrice: item.PurchasePrice,
			SellingPrice:  item.SellingPrice,
			Notes:         req.Notes,
		}
		if err := s.deviceRepo.Create(ctx, d); err != nil {
			// Rollback devices already created in this loop.
			for _, cd := range createdDevices {
				_ = s.deviceRepo.Delete(ctx, cd.deviceID)
			}
			if mongo.IsDuplicateKeyError(err) {
				return nil, apperror.Conflict(fmt.Sprintf(
					"item[%d]: IMEI %s is already registered (concurrent conflict)", i, item.IMEI1,
				))
			}
			return nil, fmt.Errorf("item[%d]: failed to create device: %w", i, err)
		}
		createdDevices = append(createdDevices, created{index: i, deviceID: d.ID})
	}

	// Back-fill device_id on each purchase item.
	updatedItems := make([]models.PurchaseItem, len(purchase.Items))
	copy(updatedItems, purchase.Items)
	for _, cd := range createdDevices {
		devID := cd.deviceID
		updatedItems[cd.index].DeviceID = &devID
	}

	// Persist the receive event atomically.
	if err := s.purchaseRepo.UpdateReceived(ctx, oid, updatedItems); err != nil {
		return nil, err
	}

	// Return the updated purchase.
	return s.GetByID(ctx, id)
}

// ── Delete ────────────────────────────────────────────────────────────────────

func (s *purchaseService) Delete(ctx context.Context, id string) error {
	oid, err := parsePurchaseOID(id)
	if err != nil {
		return err
	}
	purchase, err := s.purchaseRepo.FindByID(ctx, oid)
	if err != nil {
		return apperror.NotFound("purchase not found")
	}
	if purchase.Status == models.PurchaseStatusReceived {
		return apperror.Conflict("received purchases cannot be deleted")
	}
	return s.purchaseRepo.Delete(ctx, oid)
}
