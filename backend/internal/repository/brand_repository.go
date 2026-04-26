package repository

import (
	"context"
	"errors"
	"time"

	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// BrandRepository is the data-access contract for the brands collection.
type BrandRepository interface {
	Create(ctx context.Context, brand *models.Brand) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Brand, error)
	FindByName(ctx context.Context, name string) (*models.Brand, error)
	List(ctx context.Context) ([]*models.Brand, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) error
	Delete(ctx context.Context, id primitive.ObjectID) error
	HasProducts(ctx context.Context, id primitive.ObjectID) (bool, error)
}

type mongoBrandRepository struct {
	col     *mongo.Collection
	products *mongo.Collection // read-only ref to check referential integrity
}

// NewBrandRepository constructs the MongoDB-backed BrandRepository.
func NewBrandRepository(db *mongo.Database) BrandRepository {
	return &mongoBrandRepository{
		col:      db.Collection("brands"),
		products: db.Collection("products"),
	}
}

func (r *mongoBrandRepository) Create(ctx context.Context, brand *models.Brand) error {
	_, err := r.col.InsertOne(ctx, brand)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return apperror.Conflict("a brand with this name already exists")
		}
		return apperror.Internal(err)
	}
	return nil
}

func (r *mongoBrandRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Brand, error) {
	var b models.Brand
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&b)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, apperror.NotFound("brand")
		}
		return nil, apperror.Internal(err)
	}
	return &b, nil
}

func (r *mongoBrandRepository) FindByName(ctx context.Context, name string) (*models.Brand, error) {
	var b models.Brand
	err := r.col.FindOne(ctx, bson.M{"name": name}).Decode(&b)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, apperror.NotFound("brand")
		}
		return nil, apperror.Internal(err)
	}
	return &b, nil
}

// List returns all brands sorted alphabetically by name.
func (r *mongoBrandRepository) List(ctx context.Context) ([]*models.Brand, error) {
	opts := options.Find().SetSort(bson.D{{Key: "name", Value: 1}})
	cursor, err := r.col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, apperror.Internal(err)
	}
	defer cursor.Close(ctx)

	var brands []*models.Brand
	if err := cursor.All(ctx, &brands); err != nil {
		return nil, apperror.Internal(err)
	}
	return brands, nil
}

func (r *mongoBrandRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) error {
	fields["updated_at"] = time.Now()
	res, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": fields})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return apperror.Conflict("a brand with this name already exists")
		}
		return apperror.Internal(err)
	}
	if res.MatchedCount == 0 {
		return apperror.NotFound("brand")
	}
	return nil
}

// Delete removes a brand. Returns Conflict if any products still reference it.
func (r *mongoBrandRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	has, err := r.HasProducts(ctx, id)
	if err != nil {
		return err
	}
	if has {
		return apperror.Conflict("cannot delete brand: products are linked to it")
	}

	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return apperror.Internal(err)
	}
	if res.DeletedCount == 0 {
		return apperror.NotFound("brand")
	}
	return nil
}

// HasProducts returns true if at least one product references this brand.
func (r *mongoBrandRepository) HasProducts(ctx context.Context, id primitive.ObjectID) (bool, error) {
	count, err := r.products.CountDocuments(ctx,
		bson.M{"brand_id": id},
		options.Count().SetLimit(1),
	)
	if err != nil {
		return false, apperror.Internal(err)
	}
	return count > 0, nil
}
