package repository

import (
	"context"
	"errors"
	"time"

	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/regexutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ProductFilter carries optional query filters for listing products.
type ProductFilter struct {
	BrandID *primitive.ObjectID // filter by brand
	Search  string              // case-insensitive regex on model_name OR barcode
}

// ProductRepository is the data-access contract for the products collection.
type ProductRepository interface {
	Create(ctx context.Context, p *models.Product) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error)
	FindByBarcode(ctx context.Context, barcode string) (*models.Product, error)
	List(ctx context.Context, filter ProductFilter, pg pagination.Params) ([]*models.Product, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) error
	Delete(ctx context.Context, id primitive.ObjectID) error
	// HasDevices returns true if any device in inventory references this product.
	HasDevices(ctx context.Context, id primitive.ObjectID) (bool, error)
	// HasByBrand returns true if any product belongs to the given brand.
	HasByBrand(ctx context.Context, brandID primitive.ObjectID) (bool, error)
	UpdateBrandName(ctx context.Context, brandID primitive.ObjectID, newName string) error
}

type mongoProductRepository struct {
	col     *mongo.Collection
	devices *mongo.Collection
}

// NewProductRepository constructs the MongoDB-backed ProductRepository.
func NewProductRepository(db *mongo.Database) ProductRepository {
	return &mongoProductRepository{
		col:     db.Collection("products"),
		devices: db.Collection("devices"),
	}
}

func (r *mongoProductRepository) Create(ctx context.Context, p *models.Product) error {
	_, err := r.col.InsertOne(ctx, p)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return apperror.Conflict("a product with this barcode already exists")
		}
		return apperror.Internal(err)
	}
	return nil
}

func (r *mongoProductRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Product, error) {
	var p models.Product
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&p)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, apperror.NotFound("product")
		}
		return nil, apperror.Internal(err)
	}
	return &p, nil
}

// FindByBarcode looks up a product by its unique barcode string.
// Returns apperror.NotFound (HTTP 404) when no match — callers use this
// to determine whether to suggest creation.
func (r *mongoProductRepository) FindByBarcode(ctx context.Context, barcode string) (*models.Product, error) {
	var p models.Product
	err := r.col.FindOne(ctx, bson.M{"barcode": barcode}).Decode(&p)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, apperror.NotFound("product")
		}
		return nil, apperror.Internal(err)
	}
	return &p, nil
}

// List returns a paginated, filtered slice of products.
// Count query runs in parallel to the data query for performance.
func (r *mongoProductRepository) List(
	ctx context.Context,
	filter ProductFilter,
	pg pagination.Params,
) ([]*models.Product, int64, error) {

	query := r.buildFilter(filter)

	// Run count and data fetch concurrently
	type countResult struct {
		n   int64
		err error
	}
	countCh := make(chan countResult, 1)
	go func() {
		n, err := r.col.CountDocuments(ctx, query)
		countCh <- countResult{n, err}
	}()

	opts := options.Find().
		SetSort(bson.D{{Key: "brand_name", Value: 1}, {Key: "model_name", Value: 1}}).
		SetSkip(pg.Skip).
		SetLimit(int64(pg.Limit))

	cursor, err := r.col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, apperror.Internal(err)
	}
	defer cursor.Close(ctx)

	var products []*models.Product
	if err := cursor.All(ctx, &products); err != nil {
		return nil, 0, apperror.Internal(err)
	}

	cr := <-countCh
	if cr.err != nil {
		return nil, 0, apperror.Internal(cr.err)
	}

	return products, cr.n, nil
}

func (r *mongoProductRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) error {
	fields["updated_at"] = time.Now()
	res, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": fields})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return apperror.Conflict("a product with this barcode already exists")
		}
		return apperror.Internal(err)
	}
	if res.MatchedCount == 0 {
		return apperror.NotFound("product")
	}
	return nil
}

// Delete removes a product only if no devices are linked to it.
func (r *mongoProductRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	has, err := r.HasDevices(ctx, id)
	if err != nil {
		return err
	}
	if has {
		return apperror.Conflict("cannot delete product: devices are linked to it")
	}

	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return apperror.Internal(err)
	}
	if res.DeletedCount == 0 {
		return apperror.NotFound("product")
	}
	return nil
}

// HasDevices checks whether any device in inventory references this product.
func (r *mongoProductRepository) HasDevices(ctx context.Context, id primitive.ObjectID) (bool, error) {
	n, err := r.devices.CountDocuments(ctx,
		bson.M{"product_id": id},
		options.Count().SetLimit(1),
	)
	if err != nil {
		return false, apperror.Internal(err)
	}
	return n > 0, nil
}

// HasByBrand returns true if any product belongs to the given brand.
func (r *mongoProductRepository) HasByBrand(ctx context.Context, brandID primitive.ObjectID) (bool, error) {
	n, err := r.col.CountDocuments(ctx,
		bson.M{"brand_id": brandID},
		options.Count().SetLimit(1),
	)
	if err != nil {
		return false, apperror.Internal(err)
	}
	return n > 0, nil
}

// UpdateBrandName propagates a brand rename to all denormalized product records.
// Called by brand service after a successful brand name update.
func (r *mongoProductRepository) UpdateBrandName(ctx context.Context, brandID primitive.ObjectID, newName string) error {
	_, err := r.col.UpdateMany(ctx,
		bson.M{"brand_id": brandID},
		bson.M{"$set": bson.M{
			"brand_name": newName,
			"updated_at": time.Now(),
		}},
	)
	if err != nil {
		return apperror.Internal(err)
	}
	return nil
}

// ── private ───────────────────────────────────────────────────────────────────

func (r *mongoProductRepository) buildFilter(f ProductFilter) bson.M {
	query := bson.M{}

	if f.BrandID != nil {
		query["brand_id"] = f.BrandID
	}

	if f.Search != "" {
		if len(f.Search) >= 3 {
			// Use the text index for queries ≥ 3 chars — faster and ranked by relevance.
			// $text search is word-level and requires a text index on the collection.
			query["$text"] = bson.M{"$search": f.Search}
		} else {
			// For very short queries (1-2 chars) fall back to prefix regex.
			// $text requires whole words; regex handles short prefix scans.
			safe := regexutil.Escape(f.Search)
			regex := primitive.Regex{Pattern: "^" + safe, Options: "i"}
			query["$or"] = bson.A{
				bson.M{"model_name": bson.M{"$regex": regex}},
				bson.M{"barcode": bson.M{"$regex": regex}},
				bson.M{"brand_name": bson.M{"$regex": regex}},
			}
		}
	}

	return query
}
