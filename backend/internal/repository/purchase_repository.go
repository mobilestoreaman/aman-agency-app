package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/dateutil"
	"aman-agency/backend/pkg/regexutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PurchaseRepository defines the persistence contract for Purchase documents.
type PurchaseRepository interface {
	Create(ctx context.Context, p *models.Purchase) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Purchase, error)
	List(ctx context.Context, f dto.PurchaseFilter) ([]*models.Purchase, int64, error)
	// UpdateReceived atomically sets status=received, received_at, and back-fills
	// device_id on each item. Called by PurchaseService after devices are created.
	UpdateReceived(ctx context.Context, id primitive.ObjectID, items []models.PurchaseItem) error
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Purchase, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
	// HasByVendor returns true if the vendor has any purchase records (any status).
	HasByVendor(ctx context.Context, vendorID primitive.ObjectID) (bool, error)
}

type purchaseRepository struct {
	col *mongo.Collection
}

// NewPurchaseRepository constructs a repository backed by the "purchases" collection.
func NewPurchaseRepository(db *mongo.Database) PurchaseRepository {
	return &purchaseRepository{col: db.Collection("purchases")}
}

func (r *purchaseRepository) Create(ctx context.Context, p *models.Purchase) error {
	p.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, p)
	return err
}

func (r *purchaseRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Purchase, error) {
	var p models.Purchase
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&p)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *purchaseRepository) List(ctx context.Context, f dto.PurchaseFilter) ([]*models.Purchase, int64, error) {
	query := buildPurchaseFilter(f)

	page := f.Page
	if page < 1 {
		page = 1
	}
	const maxPage = 1000
	if page > maxPage {
		page = maxPage
	}
	limit := f.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "purchased_at", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	var (
		purchases []*models.Purchase
		total     int64
		dataErr   error
		cntErr    error
		wg        sync.WaitGroup
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		cur, err := r.col.Find(ctx, query, opts)
		if err != nil {
			dataErr = err
			return
		}
		defer cur.Close(ctx)
		dataErr = cur.All(ctx, &purchases)
	}()
	go func() {
		defer wg.Done()
		total, cntErr = r.col.CountDocuments(ctx, query)
	}()
	wg.Wait()

	if dataErr != nil {
		return nil, 0, dataErr
	}
	if cntErr != nil {
		return nil, 0, cntErr
	}
	if purchases == nil {
		purchases = []*models.Purchase{}
	}
	return purchases, total, nil
}

func buildPurchaseFilter(f dto.PurchaseFilter) bson.M {
	query := bson.M{}
	if f.VendorID != "" {
		if oid, err := primitive.ObjectIDFromHex(f.VendorID); err == nil {
			query["vendor_id"] = oid
		}
	}
	if f.Status != "" {
		query["status"] = f.Status
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		query["vendor_name"] = bson.M{"$regex": regex}
	}
	// Date range filter on purchased_at — both bounds are optional and independent.
	from, _ := dateutil.ParseDDMMYYYY(f.FromDate)
	to, _ := dateutil.ParseDDMMYYYY(f.ToDate)
	if !from.IsZero() || !to.IsZero() {
		dateFilter := bson.M{}
		if !from.IsZero() {
			dateFilter["$gte"] = from
		}
		if !to.IsZero() {
			dateFilter["$lte"] = dateutil.EndOfDay(to)
		}
		query["purchased_at"] = dateFilter
	}
	return query
}

// UpdateReceived sets status=received, stamps received_at, and replaces the
// items array (which now has device_id populated on each line).
func (r *purchaseRepository) UpdateReceived(ctx context.Context, id primitive.ObjectID, items []models.PurchaseItem) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{
			"status":      models.PurchaseStatusReceived,
			"items":       items,
			"received_at": now,
			"updated_at":  now,
		}},
	)
	return err
}

func (r *purchaseRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Purchase, error) {
	fields["updated_at"] = time.Now().UTC()
	res := r.col.FindOneAndUpdate(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": fields},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	if err := res.Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	var p models.Purchase
	if err := res.Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *purchaseRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// HasByVendor returns true if any purchase (any status) references this vendor.
func (r *purchaseRepository) HasByVendor(ctx context.Context, vendorID primitive.ObjectID) (bool, error) {
	n, err := r.col.CountDocuments(ctx,
		bson.M{"vendor_id": vendorID},
		options.Count().SetLimit(1),
	)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
