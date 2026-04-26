package repository

import (
	"context"
	"errors"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/regexutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// CustomerRepository defines the persistence contract for Customer documents.
type CustomerRepository interface {
	Create(ctx context.Context, c *models.Customer) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error)
	FindByPhone(ctx context.Context, phone string) (*models.Customer, error)
	List(ctx context.Context, f dto.CustomerFilter) ([]*models.Customer, int64, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Customer, error)
	Delete(ctx context.Context, id primitive.ObjectID) error
	// IncrementCredit atomically adjusts the customer's credit_balance by delta.
	// Positive delta = debit (customer owes more); negative delta = credit (balance reduced).
	IncrementCredit(ctx context.Context, id primitive.ObjectID, delta float64) error
}

type customerRepository struct {
	col *mongo.Collection
}

// NewCustomerRepository constructs a repository backed by the "customers" collection.
func NewCustomerRepository(db *mongo.Database) CustomerRepository {
	return &customerRepository{col: db.Collection("customers")}
}

func (r *customerRepository) Create(ctx context.Context, c *models.Customer) error {
	c.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	_, err := r.col.InsertOne(ctx, c)
	return err
}

func (r *customerRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Customer, error) {
	var c models.Customer
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&c)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *customerRepository) FindByPhone(ctx context.Context, phone string) (*models.Customer, error) {
	var c models.Customer
	err := r.col.FindOne(ctx, bson.M{"phone": phone}).Decode(&c)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (r *customerRepository) List(ctx context.Context, f dto.CustomerFilter) ([]*models.Customer, int64, error) {
	query := bson.M{}
	if f.Search != "" {
		safe := regexutil.Escape(f.Search)
		regex := primitive.Regex{Pattern: safe, Options: "i"}
		query["$or"] = bson.A{
			bson.M{"name": bson.M{"$regex": regex}},
			bson.M{"phone": bson.M{"$regex": regex}},
		}
	}
	switch f.CreditFilter {
	case "with_balance":
		query["credit_balance"] = bson.M{"$gt": 0}
	case "no_balance":
		query["credit_balance"] = bson.M{"$lte": 0}
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

	var customers []*models.Customer
	var total int64

	cur, err := r.col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)
	if err := cur.All(ctx, &customers); err != nil {
		return nil, 0, err
	}

	total, err = r.col.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}
	if customers == nil {
		customers = []*models.Customer{}
	}
	return customers, total, nil
}

func (r *customerRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Customer, error) {
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
	var c models.Customer
	if err := res.Decode(&c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *customerRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// IncrementCredit atomically adjusts the customer's credit_balance field by delta
// using MongoDB's $inc operator. Also bumps updated_at.
func (r *customerRepository) IncrementCredit(ctx context.Context, id primitive.ObjectID, delta float64) error {
	_, err := r.col.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{
			"$inc": bson.M{"credit_balance": delta},
			"$set": bson.M{"updated_at": time.Now().UTC()},
		},
	)
	return err
}
