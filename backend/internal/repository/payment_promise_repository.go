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

// PaymentPromiseRepository defines the persistence contract.
type PaymentPromiseRepository interface {
	Create(ctx context.Context, p *models.PaymentPromise) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.PaymentPromise, error)
	List(ctx context.Context, f dto.PaymentPromiseFilter) ([]*models.PaymentPromise, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.PaymentPromise, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
	// FindDueTodayUnnotified returns pending promises whose promised_date falls on
	// today (in UTC) and for which a reminder notification has not yet been sent.
	FindDueTodayUnnotified(ctx context.Context) ([]*models.PaymentPromise, error)
}

type paymentPromiseRepository struct {
	col *mongo.Collection
}

func NewPaymentPromiseRepository(db *mongo.Database) PaymentPromiseRepository {
	return &paymentPromiseRepository{col: db.Collection("payment_promises")}
}

// ── Writes ────────────────────────────────────────────────────────────────────

func (r *paymentPromiseRepository) Create(ctx context.Context, p *models.PaymentPromise) error {
	p.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, p)
	return err
}

func (r *paymentPromiseRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.PaymentPromise, error) {
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
	var p models.PaymentPromise
	if err := res.Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *paymentPromiseRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
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

func (r *paymentPromiseRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.PaymentPromise, error) {
	var p models.PaymentPromise
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&p)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *paymentPromiseRepository) List(
	ctx context.Context,
	f dto.PaymentPromiseFilter,
) ([]*models.PaymentPromise, int64, error) {
	query := bson.M{}

	if f.CustomerID != "" {
		oid, err := primitive.ObjectIDFromHex(f.CustomerID)
		if err == nil {
			query["customer_id"] = oid
		}
	}
	if f.Status != "" {
		query["status"] = f.Status
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		query["$or"] = bson.A{
			bson.M{"customer_name": bson.M{"$regex": regex}},
			bson.M{"invoice_number": bson.M{"$regex": regex}},
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
		query["promised_date"] = dateFilter
	}

	page := f.Page
	if page < 1 {
		page = 1
	}
	limit := f.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "promised_date", Value: 1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	var (
		promises []*models.PaymentPromise
		total    int64
		dataErr  error
		cntErr   error
		wg       sync.WaitGroup
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
		dataErr = cur.All(ctx, &promises)
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
	if promises == nil {
		promises = []*models.PaymentPromise{}
	}
	return promises, total, nil
}

// FindDueTodayUnnotified returns pending promises whose promised_date is today (UTC)
// and notified=false, so the background worker can fire a single notification per promise.
func (r *paymentPromiseRepository) FindDueTodayUnnotified(ctx context.Context) ([]*models.PaymentPromise, error) {
	now := time.Now().UTC()
	// Cover the full calendar day in UTC.
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay   := startOfDay.Add(24 * time.Hour)

	filter := bson.M{
		"status":        models.PromiseStatusPending,
		"notified":      false,
		"promised_date": bson.M{"$gte": startOfDay, "$lt": endOfDay},
	}

	cur, err := r.col.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var promises []*models.PaymentPromise
	if err := cur.All(ctx, &promises); err != nil {
		return nil, err
	}
	return promises, nil
}
