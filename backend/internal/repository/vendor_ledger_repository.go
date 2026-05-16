package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/regexutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// VendorLedgerRepository is the persistence contract for VendorLedger documents.
type VendorLedgerRepository interface {
	Create(ctx context.Context, entry *models.VendorLedger) error
	// List returns entries across all vendors. vendorID can be zero to skip filter.
	List(ctx context.Context, vendorID primitive.ObjectID, entryType string, from, to *time.Time, search string, pg pagination.Params) ([]models.VendorLedger, int64, error)
	ListByVendor(ctx context.Context, vendorID primitive.ObjectID, entryType string, pg pagination.Params) ([]models.VendorLedger, int64, error)
	GetByID(ctx context.Context, id primitive.ObjectID) (*models.VendorLedger, error)
	// Delete removes a ledger entry by ID. Used as a compensating action when a
	// balance update fails after the entry has already been written.
	Delete(ctx context.Context, id primitive.ObjectID) error
	// HasEntriesByVendor returns true if the vendor has any ledger entries.
	HasEntriesByVendor(ctx context.Context, vendorID primitive.ObjectID) (bool, error)
	// Aging returns outstanding payables bucketed by age.
	Aging(ctx context.Context) (*dto.VendorAgingResponse, error)
}

type vendorLedgerRepository struct {
	col *mongo.Collection
	db  *mongo.Database
}

// NewVendorLedgerRepository constructs a repository backed by the "vendor_ledgers" collection.
func NewVendorLedgerRepository(db *mongo.Database) VendorLedgerRepository {
	return &vendorLedgerRepository{col: db.Collection("vendor_ledgers"), db: db}
}

func (r *vendorLedgerRepository) Create(ctx context.Context, entry *models.VendorLedger) error {
	if entry.ID.IsZero() {
		entry.ID = primitive.NewObjectID()
	}
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now().UTC()
	}
	_, err := r.col.InsertOne(ctx, entry)
	return err
}

// List returns paginated vendor ledger entries across all vendors.
// Pass a zero vendorID to skip the vendor filter.
// from and to are inclusive date-time bounds on created_at.
func (r *vendorLedgerRepository) List(
	ctx context.Context,
	vendorID primitive.ObjectID,
	entryType string,
	from, to *time.Time,
	search string,
	pg pagination.Params,
) ([]models.VendorLedger, int64, error) {
	filter := bson.M{}
	if !vendorID.IsZero() {
		filter["vendor_id"] = vendorID
	}
	if entryType != "" {
		filter["type"] = entryType
	}
	if from != nil || to != nil {
		dateRange := bson.M{}
		if from != nil {
			dateRange["$gte"] = *from
		}
		if to != nil {
			dateRange["$lte"] = *to
		}
		filter["created_at"] = dateRange
	}
	if search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(search), Options: "i"}
		filter["$or"] = bson.A{
			bson.M{"vendor_name": bson.M{"$regex": regex}},
			bson.M{"reference": bson.M{"$regex": regex}},
		}
	}

	if pg.Page < 1 {
		pg.Page = 1
	}
	const maxPage = 1000
	if pg.Page > maxPage {
		pg.Page = maxPage
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64((pg.Page - 1) * pg.Limit)).
		SetLimit(int64(pg.Limit))

	var (
		entries  []models.VendorLedger
		total    int64
		wg       sync.WaitGroup
		findErr  error
		countErr error
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		cur, err := r.col.Find(ctx, filter, opts)
		if err != nil {
			findErr = err
			return
		}
		defer cur.Close(ctx)
		findErr = cur.All(ctx, &entries)
	}()
	go func() {
		defer wg.Done()
		total, countErr = r.col.CountDocuments(ctx, filter)
	}()
	wg.Wait()

	if findErr != nil {
		return nil, 0, findErr
	}
	if countErr != nil {
		return nil, 0, countErr
	}
	if entries == nil {
		entries = []models.VendorLedger{}
	}
	return entries, total, nil
}

func (r *vendorLedgerRepository) ListByVendor(
	ctx context.Context,
	vendorID primitive.ObjectID,
	entryType string,
	pg pagination.Params,
) ([]models.VendorLedger, int64, error) {
	filter := bson.M{"vendor_id": vendorID}
	if entryType != "" {
		filter["type"] = entryType
	}

	if pg.Page < 1 {
		pg.Page = 1
	}
	const maxPage = 1000
	if pg.Page > maxPage {
		pg.Page = maxPage
	}
	if pg.Limit < 1 || pg.Limit > 100 {
		pg.Limit = 20
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64((pg.Page - 1) * pg.Limit)).
		SetLimit(int64(pg.Limit))

	var (
		entries  []models.VendorLedger
		total    int64
		wg       sync.WaitGroup
		findErr  error
		countErr error
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		cur, err := r.col.Find(ctx, filter, opts)
		if err != nil {
			findErr = err
			return
		}
		defer cur.Close(ctx)
		findErr = cur.All(ctx, &entries)
	}()
	go func() {
		defer wg.Done()
		total, countErr = r.col.CountDocuments(ctx, filter)
	}()
	wg.Wait()

	if findErr != nil {
		return nil, 0, findErr
	}
	if countErr != nil {
		return nil, 0, countErr
	}
	if entries == nil {
		entries = []models.VendorLedger{}
	}
	return entries, total, nil
}

func (r *vendorLedgerRepository) GetByID(ctx context.Context, id primitive.ObjectID) (*models.VendorLedger, error) {
	var entry models.VendorLedger
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&entry)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &entry, nil
}

// Delete removes a ledger entry by ID. Intended for compensating rollbacks only.
func (r *vendorLedgerRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// HasEntriesByVendor returns true if the vendor has at least one ledger entry.
func (r *vendorLedgerRepository) HasEntriesByVendor(ctx context.Context, vendorID primitive.ObjectID) (bool, error) {
	n, err := r.col.CountDocuments(ctx,
		bson.M{"vendor_id": vendorID},
		options.Count().SetLimit(1),
	)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Aging returns outstanding payables bucketed by age (0-30, 31-60, 60+ days).
func (r *vendorLedgerRepository) Aging(ctx context.Context) (*dto.VendorAgingResponse, error) {
	pipeline := mongo.Pipeline{
		// Group by vendor to get running balance and oldest entry date
		{{Key: "$group", Value: bson.M{
			"_id":         "$vendor_id",
			"balance":     bson.M{"$sum": "$amount"},
			"oldest_date": bson.M{"$min": "$created_at"},
		}}},
		// Only vendors with outstanding (positive) balance
		{{Key: "$match", Value: bson.M{"balance": bson.M{"$gt": 0}}}},
		// Join vendor name
		{{Key: "$lookup", Value: bson.M{
			"from": "vendors", "localField": "_id",
			"foreignField": "_id", "as": "vendor",
		}}},
		{{Key: "$unwind", Value: bson.M{"path": "$vendor", "preserveNullAndEmptyArrays": true}}},
		{{Key: "$sort", Value: bson.D{{Key: "balance", Value: -1}}}},
	}

	cur, err := r.col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type agingRow struct {
		ID          interface{} `bson:"_id"`
		Balance     float64     `bson:"balance"`
		OldestDate  time.Time   `bson:"oldest_date"`
		Vendor      struct {
			Name string `bson:"name"`
		} `bson:"vendor"`
	}

	bucketMap := map[string]*dto.VendorAgingBucket{
		"0-30 days":  {Label: "0-30 days"},
		"31-60 days": {Label: "31-60 days"},
		"60+ days":   {Label: "60+ days"},
	}

	var vendors []dto.VendorAgingEntry

	for cur.Next(ctx) {
		var row agingRow
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}

		vendorID := ""
		if oid, ok := row.ID.(interface{ Hex() string }); ok {
			vendorID = oid.Hex()
		}

		ageDays := int64(time.Since(row.OldestDate).Hours() / 24)
		var bucket string
		switch {
		case ageDays <= 30:
			bucket = "0-30 days"
		case ageDays <= 60:
			bucket = "31-60 days"
		default:
			bucket = "60+ days"
		}

		vendors = append(vendors, dto.VendorAgingEntry{
			VendorID:   vendorID,
			VendorName: row.Vendor.Name,
			Balance:    row.Balance,
			AgeDays:    ageDays,
			Bucket:     bucket,
		})

		b := bucketMap[bucket]
		b.VendorCount++
		b.TotalOwed += row.Balance
	}

	buckets := []dto.VendorAgingBucket{
		*bucketMap["0-30 days"],
		*bucketMap["31-60 days"],
		*bucketMap["60+ days"],
	}

	if vendors == nil {
		vendors = []dto.VendorAgingEntry{}
	}

	return &dto.VendorAgingResponse{
		AsOf:    time.Now().Format("02 Jan 2006"),
		Buckets: buckets,
		Vendors: vendors,
	}, nil
}
