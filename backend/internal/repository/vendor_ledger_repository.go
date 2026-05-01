package repository

import (
	"context"
	"errors"
	"sync"
	"time"

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
}

type vendorLedgerRepository struct {
	col *mongo.Collection
}

// NewVendorLedgerRepository constructs a repository backed by the "vendor_ledgers" collection.
func NewVendorLedgerRepository(db *mongo.Database) VendorLedgerRepository {
	return &vendorLedgerRepository{col: db.Collection("vendor_ledgers")}
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
