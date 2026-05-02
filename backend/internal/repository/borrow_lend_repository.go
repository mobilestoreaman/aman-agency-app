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

// BorrowLendRepository is the persistence contract for BorrowLend documents.
type BorrowLendRepository interface {
	Create(ctx context.Context, bl *models.BorrowLend) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.BorrowLend, error)
	List(ctx context.Context, f dto.BorrowLendFilter) ([]*models.BorrowLend, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.BorrowLend, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type borrowLendRepository struct {
	col *mongo.Collection
}

// NewBorrowLendRepository constructs a repository backed by the "borrow_lends" collection.
func NewBorrowLendRepository(db *mongo.Database) BorrowLendRepository {
	return &borrowLendRepository{col: db.Collection("borrow_lends")}
}

func (r *borrowLendRepository) Create(ctx context.Context, bl *models.BorrowLend) error {
	bl.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	bl.CreatedAt = now
	bl.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, bl)
	return err
}

func (r *borrowLendRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.BorrowLend, error) {
	var bl models.BorrowLend
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&bl)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &bl, nil
}

func (r *borrowLendRepository) List(ctx context.Context, f dto.BorrowLendFilter) ([]*models.BorrowLend, int64, error) {
	filter := bson.M{}
	if f.Type != "" {
		filter["type"] = f.Type
	}
	if f.Status != "" {
		filter["status"] = f.Status
	}
	if f.CustomerID != "" {
		oid, err := primitive.ObjectIDFromHex(f.CustomerID)
		if err == nil {
			filter["customer_id"] = oid
		}
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		filter["$or"] = bson.A{
			bson.M{"party_name": bson.M{"$regex": regex}},
			bson.M{"device_desc": bson.M{"$regex": regex}},
		}
	}
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
		filter["borrowed_at"] = dateFilter
	}

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
		SetSort(bson.D{{Key: "borrowed_at", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	var (
		records  []*models.BorrowLend
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
		findErr = cur.All(ctx, &records)
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
	if records == nil {
		records = []*models.BorrowLend{}
	}
	return records, total, nil
}

func (r *borrowLendRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.BorrowLend, error) {
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
	var bl models.BorrowLend
	if err := res.Decode(&bl); err != nil {
		return nil, err
	}
	return &bl, nil
}

func (r *borrowLendRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}
