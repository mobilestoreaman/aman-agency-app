package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/pkg/regexutil"
	"aman-agency/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DeviceRepository defines the persistence contract for Device documents.
type DeviceRepository interface {
	Create(ctx context.Context, d *models.Device) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Device, error)
	FindByIMEI(ctx context.Context, imei string) (*models.Device, error)
	List(ctx context.Context, f dto.DeviceFilter) ([]*models.Device, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Device, error)
	// UpdateWithFilter performs a FindOneAndUpdate with an extra filter condition in
	// addition to the _id match. Returns ErrNotFound when no document matches
	// (either the ID doesn't exist OR the extra condition is not satisfied).
	// Use this for atomic conditional updates such as "set status=sold only if
	// current status=available" to eliminate the read-modify-write race window.
	UpdateWithFilter(ctx context.Context, id primitive.ObjectID, extraFilter, fields bson.M) (*models.Device, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
	// StockSummary returns per-product status counts via aggregation.
	StockSummary(ctx context.Context) ([]dto.ProductStockRow, error)
}

type deviceRepository struct {
	col *mongo.Collection
}

// NewDeviceRepository constructs a repository backed by the "devices" collection.
func NewDeviceRepository(db *mongo.Database) DeviceRepository {
	return &deviceRepository{col: db.Collection("devices")}
}

// ── Writes ────────────────────────────────────────────────────────────────────

func (r *deviceRepository) Create(ctx context.Context, d *models.Device) error {
	d.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	d.CreatedAt = now
	d.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, d)
	return err
}

func (r *deviceRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Device, error) {
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
	var d models.Device
	if err := res.Decode(&d); err != nil {
		return nil, err
	}
	return &d, nil
}

// UpdateWithFilter performs an atomic conditional FindOneAndUpdate.
// The actual MongoDB filter is: {_id: id, <extraFilter fields>...}
// Returns ErrNotFound when no document matches — either because the ID does not
// exist or because the extra condition (e.g. status=="available") is not met.
func (r *deviceRepository) UpdateWithFilter(ctx context.Context, id primitive.ObjectID, extraFilter, fields bson.M) (*models.Device, error) {
	filter := bson.M{"_id": id}
	for k, v := range extraFilter {
		filter[k] = v
	}
	fields["updated_at"] = time.Now().UTC()
	res := r.col.FindOneAndUpdate(
		ctx,
		filter,
		bson.M{"$set": fields},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	)
	if err := res.Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	var d models.Device
	if err := res.Decode(&d); err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *deviceRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Reads ─────────────────────────────────────────────────────────────────────

func (r *deviceRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Device, error) {
	var d models.Device
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&d)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func (r *deviceRepository) FindByIMEI(ctx context.Context, imei string) (*models.Device, error) {
	// Match against either IMEI1 or IMEI2 slot.
	filter := bson.M{
		"$or": bson.A{
			bson.M{"imei1": imei},
			bson.M{"imei2": imei},
		},
	}
	var d models.Device
	err := r.col.FindOne(ctx, filter).Decode(&d)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func (r *deviceRepository) List(ctx context.Context, f dto.DeviceFilter) ([]*models.Device, int64, error) {
	query := buildDeviceFilter(f)

	page := f.Page
	if page < 1 {
		page = 1
	}
	const maxPage = 1000
	if page > maxPage {
		page = maxPage
	}
	limit := f.Limit
	if limit < 1 {
		limit = 20
	} else if limit > 500 {
		limit = 500
	}
	// When no status filter is active, optionally sort available devices first.
	// Alphabetical sort on status naturally yields: available → defective → repair → returned → sold.
	sortOrder := bson.D{{Key: "created_at", Value: -1}}
	if f.SortAvailableFirst {
		sortOrder = bson.D{
			{Key: "status", Value: 1},
			{Key: "created_at", Value: -1},
		}
	}
	opts := options.Find().
		SetSort(sortOrder).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	var (
		devices []*models.Device
		total   int64
		dataErr error
		cntErr  error
		wg      sync.WaitGroup
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
		dataErr = cur.All(ctx, &devices)
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
	if devices == nil {
		devices = []*models.Device{}
	}
	return devices, total, nil
}

// buildDeviceFilter translates DeviceFilter into a MongoDB query document.
func buildDeviceFilter(f dto.DeviceFilter) bson.M {
	query := bson.M{}

	if f.ProductID != "" {
		if oid, err := primitive.ObjectIDFromHex(f.ProductID); err == nil {
			query["product_id"] = oid
		}
	}
	if f.Status != "" {
		// "available" and the legacy "in_stock" value are the same lifecycle state.
		// Use $in so that old seed documents (status="in_stock") are included when
		// the caller filters for available devices.
		if f.Status == string(models.DeviceStatusAvailable) {
			query["status"] = bson.M{"$in": bson.A{
				string(models.DeviceStatusAvailable),
				string(models.DeviceStatusInStock),
			}}
		} else {
			query["status"] = f.Status
		}
	}
	if f.Condition != "" {
		query["condition"] = f.Condition
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		query["$or"] = bson.A{
			bson.M{"imei1": bson.M{"$regex": regex}},
			bson.M{"imei2": bson.M{"$regex": regex}},
			bson.M{"product_name": bson.M{"$regex": regex}},
			bson.M{"brand_name": bson.M{"$regex": regex}},
		}
	}
	return query
}

// ── Stock aggregation ─────────────────────────────────────────────────────────

// StockSummary uses a $group aggregation to count devices per product and status.
func (r *deviceRepository) StockSummary(ctx context.Context) ([]dto.ProductStockRow, error) {
	pipeline := mongo.Pipeline{
		// Group by product; accumulate counts per status using $sum + $cond
		{{Key: "$group", Value: bson.M{
			"_id":          "$product_id",
			"product_name": bson.M{"$first": "$product_name"},
			"brand_name":   bson.M{"$first": "$brand_name"},
			// Count both "available" and legacy "in_stock" documents.
			"in_stock": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$in": bson.A{"$status", bson.A{"available", "in_stock"}}}, 1, 0},
			}},
			"sold": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$eq": bson.A{"$status", "sold"}}, 1, 0},
			}},
			"repair": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$eq": bson.A{"$status", "repair"}}, 1, 0},
			}},
			"returned": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$eq": bson.A{"$status", "returned"}}, 1, 0},
			}},
			"defective": bson.M{"$sum": bson.M{
				"$cond": bson.A{bson.M{"$eq": bson.A{"$status", "defective"}}, 1, 0},
			}},
			"total": bson.M{"$sum": 1},
		}}},
		// Sort alphabetically by product name for stable rendering
		{{Key: "$sort", Value: bson.D{{Key: "product_name", Value: 1}}}},
	}

	cur, err := r.col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type aggRow struct {
		ID          primitive.ObjectID `bson:"_id"`
		ProductName string             `bson:"product_name"`
		BrandName   string             `bson:"brand_name"`
		InStock     int64              `bson:"in_stock"`
		Sold        int64              `bson:"sold"`
		Repair      int64              `bson:"repair"`
		Returned    int64              `bson:"returned"`
		Defective   int64              `bson:"defective"`
		Total       int64              `bson:"total"`
	}

	var raw []aggRow
	if err := cur.All(ctx, &raw); err != nil {
		return nil, err
	}

	rows := make([]dto.ProductStockRow, 0, len(raw))
	for _, r := range raw {
		rows = append(rows, dto.ProductStockRow{
			ProductID:   r.ID.Hex(),
			ProductName: r.ProductName,
			BrandName:   r.BrandName,
			InStock:     r.InStock,
			Sold:        r.Sold,
			Repair:      r.Repair,
			Returned:    r.Returned,
			Defective:   r.Defective,
			Total:       r.Total,
		})
	}
	return rows, nil
}
