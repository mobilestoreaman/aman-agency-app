package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// VendorInvoiceRepository defines persistence operations for VendorInvoice documents.
type VendorInvoiceRepository interface {
	Create(ctx context.Context, inv *models.VendorInvoice) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.VendorInvoice, error)
	List(ctx context.Context, f dto.VendorInvoiceFilter) ([]models.VendorInvoice, *response.Meta, error)
	UpdateProcessingResult(
		ctx context.Context,
		id primitive.ObjectID,
		result *models.InvoiceExtractionResult,
		metrics *models.OCRMetrics,
		comparison *models.OCRComparison,
		status models.InvoiceProcessingStatus,
		processingErr string,
	) error
	// SetPurchaseID links a completed invoice to the purchase it generated.
	SetPurchaseID(ctx context.Context, id primitive.ObjectID, purchaseID primitive.ObjectID) error
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type vendorInvoiceRepository struct {
	col *mongo.Collection
}

// NewVendorInvoiceRepository constructs a VendorInvoiceRepository.
func NewVendorInvoiceRepository(db *mongo.Database) VendorInvoiceRepository {
	return &vendorInvoiceRepository{col: db.Collection("vendor_invoices")}
}

// Create inserts a new VendorInvoice document.
func (r *vendorInvoiceRepository) Create(ctx context.Context, inv *models.VendorInvoice) error {
	inv.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	inv.CreatedAt = now
	inv.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, inv)
	return err
}

// FindByID returns a single VendorInvoice or NotFound.
func (r *vendorInvoiceRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.VendorInvoice, error) {
	var inv models.VendorInvoice
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&inv)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, apperror.NotFound("vendor invoice")
	}
	return &inv, err
}

// List returns a paginated slice of vendor invoices, sorted newest first.
func (r *vendorInvoiceRepository) List(ctx context.Context, f dto.VendorInvoiceFilter) ([]models.VendorInvoice, *response.Meta, error) {
	filter := bson.M{}

	if f.VendorID != "" {
		oid, err := primitive.ObjectIDFromHex(f.VendorID)
		if err == nil {
			filter["vendor_id"] = oid
		}
	}
	if f.PurchaseID != "" {
		oid, err := primitive.ObjectIDFromHex(f.PurchaseID)
		if err == nil {
			filter["purchase_id"] = oid
		}
	}
	if f.Status != "" {
		filter["status"] = f.Status
	}

	p := pagination.Params{Page: f.Page, Limit: f.Limit}
	p.Normalise()

	findOpts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64(p.Offset())).
		SetLimit(int64(p.Limit))

	var (
		items             []models.VendorInvoice
		total             int64
		wg                sync.WaitGroup
		findErr, countErr error
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		cur, err := r.col.Find(ctx, filter, findOpts)
		if err != nil {
			findErr = err
			return
		}
		defer cur.Close(ctx)
		findErr = cur.All(ctx, &items)
	}()
	go func() {
		defer wg.Done()
		total, countErr = r.col.CountDocuments(ctx, filter)
	}()
	wg.Wait()

	if findErr != nil {
		return nil, nil, findErr
	}
	if countErr != nil {
		return nil, nil, countErr
	}
	if items == nil {
		items = []models.VendorInvoice{}
	}

	meta := pagination.ToMeta(p, total)
	return items, meta, nil
}

// UpdateProcessingResult writes the OCR extraction result and final status back
// to the document. This is called from the background OCR goroutine.
func (r *vendorInvoiceRepository) UpdateProcessingResult(
	ctx context.Context,
	id primitive.ObjectID,
	result *models.InvoiceExtractionResult,
	metrics *models.OCRMetrics,
	comparison *models.OCRComparison,
	status models.InvoiceProcessingStatus,
	processingErr string,
) error {
	fields := bson.M{
		"status":     status,
		"updated_at": time.Now().UTC(),
	}
	if result != nil {
		fields["extraction"] = result
	}
	if metrics != nil {
		fields["ocr_metrics"] = metrics
	}
	if comparison != nil {
		fields["ocr_comparison"] = comparison
	}
	if processingErr != "" {
		fields["processing_error"] = processingErr
	}

	_, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": fields})
	return err
}

// SetPurchaseID writes the linked purchase ID onto the invoice document.
func (r *vendorInvoiceRepository) SetPurchaseID(ctx context.Context, id primitive.ObjectID, purchaseID primitive.ObjectID) error {
	_, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set": bson.M{
			"purchase_id": purchaseID,
			"updated_at":  time.Now().UTC(),
		},
	})
	return err
}

// Delete removes a VendorInvoice document.
func (r *vendorInvoiceRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return apperror.NotFound("vendor invoice")
	}
	return nil
}
