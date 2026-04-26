package repository

import (
	"context"
	"errors"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/pkg/regexutil"
	"aman-agency/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// VendorRepository defines the persistence contract for Vendor documents.
type VendorRepository interface {
	Create(ctx context.Context, v *models.Vendor) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Vendor, error)
	FindByPhone(ctx context.Context, phone string) (*models.Vendor, error)
	List(ctx context.Context, f dto.VendorFilter) ([]*models.Vendor, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Vendor, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type vendorRepository struct {
	col *mongo.Collection
}

// NewVendorRepository constructs a repository backed by the "vendors" collection.
func NewVendorRepository(db *mongo.Database) VendorRepository {
	return &vendorRepository{col: db.Collection("vendors")}
}

func (r *vendorRepository) Create(ctx context.Context, v *models.Vendor) error {
	v.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	v.CreatedAt = now
	v.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, v)
	return err
}

func (r *vendorRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Vendor, error) {
	var v models.Vendor
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&v)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &v, nil
}

func (r *vendorRepository) FindByPhone(ctx context.Context, phone string) (*models.Vendor, error) {
	var v models.Vendor
	err := r.col.FindOne(ctx, bson.M{"phone": phone}).Decode(&v)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &v, nil
}

func (r *vendorRepository) List(ctx context.Context, f dto.VendorFilter) ([]*models.Vendor, int64, error) {
	query := bson.M{}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		query["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": regex}},
			bson.M{"phone": bson.M{"$regex": regex}},
		}
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
		SetSort(bson.D{{Key: "name", Value: 1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	cur, err := r.col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	var vendors []*models.Vendor
	if err := cur.All(ctx, &vendors); err != nil {
		return nil, 0, err
	}
	if vendors == nil {
		vendors = []*models.Vendor{}
	}
	total, err := r.col.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}
	return vendors, total, nil
}

func (r *vendorRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Vendor, error) {
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
	var v models.Vendor
	if err := res.Decode(&v); err != nil {
		return nil, err
	}
	return &v, nil
}

func (r *vendorRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}
