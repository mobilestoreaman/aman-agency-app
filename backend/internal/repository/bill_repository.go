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

var ErrNotFound = errors.New("resource not found")

// BillRepository is the persistence contract for Bill documents.
type BillRepository interface {
	Create(ctx context.Context, bill *models.Bill) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Bill, error)
	FindBySaleID(ctx context.Context, saleID primitive.ObjectID) (*models.Bill, error)
	List(ctx context.Context, f dto.BillFilter) ([]*models.Bill, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Bill, error)
}

type billRepository struct {
	col *mongo.Collection
}

// NewBillRepository constructs a repository backed by the "bills" collection.
func NewBillRepository(db *mongo.Database) BillRepository {
	return &billRepository{col: db.Collection("bills")}
}

func (r *billRepository) Create(ctx context.Context, bill *models.Bill) error {
	bill.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	bill.CreatedAt = now
	bill.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, bill)
	return err
}

func (r *billRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Bill, error) {
	var bill models.Bill
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&bill)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &bill, nil
}

func (r *billRepository) FindBySaleID(ctx context.Context, saleID primitive.ObjectID) (*models.Bill, error) {
	var bill models.Bill
	err := r.col.FindOne(ctx, bson.M{"sale_id": saleID}).Decode(&bill)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &bill, nil
}

func (r *billRepository) List(ctx context.Context, f dto.BillFilter) ([]*models.Bill, int64, error) {
	filter := bson.M{}
	if f.CustomerID != "" {
		oid, err := primitive.ObjectIDFromHex(f.CustomerID)
		if err == nil {
			filter["customer_id"] = oid
		}
	}
	if f.SaleID != "" {
		oid, err := primitive.ObjectIDFromHex(f.SaleID)
		if err == nil {
			filter["sale_id"] = oid
		}
	}
	if f.Status != "" {
		filter["status"] = f.Status
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		filter["$or"] = bson.A{
			// BSON field is "invoice_number" (Bill.BillNumber bson tag), not "bill_number"
			bson.M{"invoice_number": bson.M{"$regex": regex}},
			bson.M{"customer_name": bson.M{"$regex": regex}},
			bson.M{"customer_phone": bson.M{"$regex": regex}},
		}
	}
	if f.FromDate != "" {
		t, err := time.Parse("2006-01-02", f.FromDate)
		if err == nil {
			dateFilter := bson.M{"$gte": t.UTC()}
			if f.ToDate != "" {
				if t2, err2 := time.Parse("2006-01-02", f.ToDate); err2 == nil {
					dateFilter["$lte"] = t2.Add(24*time.Hour - time.Second).UTC()
				}
			}
			filter["created_at"] = dateFilter
		}
	} else if f.ToDate != "" {
		if t2, err := time.Parse("2006-01-02", f.ToDate); err == nil {
			filter["created_at"] = bson.M{"$lte": t2.Add(24*time.Hour - time.Second).UTC()}
		}
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
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	var (
		bills    []*models.Bill
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
		findErr = cur.All(ctx, &bills)
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
	if bills == nil {
		bills = []*models.Bill{}
	}
	return bills, total, nil
}

func (r *billRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Bill, error) {
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
	var bill models.Bill
	if err := res.Decode(&bill); err != nil {
		return nil, err
	}
	return &bill, nil
}
