package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/regexutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// LoanReferenceRepository is the persistence contract for LoanReference documents.
type LoanReferenceRepository interface {
	Create(ctx context.Context, ref *models.LoanReference) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.LoanReference, error)
	// FindBySaleID returns the first loan reference linked to the given sale, or
	// ErrNotFound if none exists. Used during sale cancellation to close the loan.
	FindBySaleID(ctx context.Context, saleID primitive.ObjectID) (*models.LoanReference, error)
	List(ctx context.Context, f dto.LoanReferenceFilter) ([]*models.LoanReference, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.LoanReference, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type loanReferenceRepository struct {
	col *mongo.Collection
}

// NewLoanReferenceRepository constructs a repository backed by the "loan_references" collection.
func NewLoanReferenceRepository(db *mongo.Database) LoanReferenceRepository {
	return &loanReferenceRepository{col: db.Collection("loan_references")}
}

func (r *loanReferenceRepository) Create(ctx context.Context, ref *models.LoanReference) error {
	ref.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	ref.CreatedAt = now
	ref.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, ref)
	return err
}

func (r *loanReferenceRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.LoanReference, error) {
	var ref models.LoanReference
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&ref)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &ref, nil
}

func (r *loanReferenceRepository) FindBySaleID(ctx context.Context, saleID primitive.ObjectID) (*models.LoanReference, error) {
	var ref models.LoanReference
	err := r.col.FindOne(ctx, bson.M{"sale_id": saleID}).Decode(&ref)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &ref, nil
}

func (r *loanReferenceRepository) List(ctx context.Context, f dto.LoanReferenceFilter) ([]*models.LoanReference, int64, error) {
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
	if f.Provider != "" {
		filter["provider"] = f.Provider
	}
	if f.Status != "" {
		filter["status"] = f.Status
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		filter["$or"] = bson.A{
			bson.M{"customer_name": bson.M{"$regex": regex}},
			bson.M{"loan_account_number": bson.M{"$regex": regex}},
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
		refs     []*models.LoanReference
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
		findErr = cur.All(ctx, &refs)
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
	if refs == nil {
		refs = []*models.LoanReference{}
	}
	return refs, total, nil
}

func (r *loanReferenceRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.LoanReference, error) {
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
	var ref models.LoanReference
	if err := res.Decode(&ref); err != nil {
		return nil, err
	}
	return &ref, nil
}

func (r *loanReferenceRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}
