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

// SaleRepository defines the persistence contract for Sale documents.
type SaleRepository interface {
	Create(ctx context.Context, s *models.Sale) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Sale, error)
	FindByInvoice(ctx context.Context, invoiceNumber string) (*models.Sale, error)
	List(ctx context.Context, f dto.SaleFilter) ([]*models.Sale, int64, error)
	// Cancel sets status=cancelled and stamps cancelled_at.
	Cancel(ctx context.Context, id primitive.ObjectID, notes string) error
	// HasActiveByCustomer returns true if the customer has any non-cancelled sales.
	HasActiveByCustomer(ctx context.Context, customerID primitive.ObjectID) (bool, error)
}

type saleRepository struct {
	col *mongo.Collection
}

// NewSaleRepository constructs a repository backed by the "sales" collection.
func NewSaleRepository(db *mongo.Database) SaleRepository {
	return &saleRepository{col: db.Collection("sales")}
}

func (r *saleRepository) Create(ctx context.Context, s *models.Sale) error {
	s.ID = primitive.NewObjectID()
	now := time.Now().UTC()
	s.CreatedAt = now
	s.UpdatedAt = now
	// Invoice number is derived from the ObjectID, so generate after ID assignment.
	s.InvoiceNumber = models.GenerateInvoiceNumber(s.ID)
	_, err := r.col.InsertOne(ctx, s)
	return err
}

func (r *saleRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Sale, error) {
	var s models.Sale
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&s)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *saleRepository) FindByInvoice(ctx context.Context, invoiceNumber string) (*models.Sale, error) {
	var s models.Sale
	err := r.col.FindOne(ctx, bson.M{"invoice_number": invoiceNumber}).Decode(&s)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *saleRepository) List(ctx context.Context, f dto.SaleFilter) ([]*models.Sale, int64, error) {
	query := buildSaleFilter(f)

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
		SetSort(bson.D{{Key: "sold_at", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	var (
		sales   []*models.Sale
		total   int64
		dataErr error
		cntErr  error
		wg      sync.WaitGroup
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
		dataErr = cur.All(ctx, &sales)
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
	if sales == nil {
		sales = []*models.Sale{}
	}
	return sales, total, nil
}

func buildSaleFilter(f dto.SaleFilter) bson.M {
	query := bson.M{}
	if f.CustomerID != "" {
		if oid, err := primitive.ObjectIDFromHex(f.CustomerID); err == nil {
			query["customer_id"] = oid
		}
	}
	if f.StaffID != "" {
		if oid, err := primitive.ObjectIDFromHex(f.StaffID); err == nil {
			query["staff_id"] = oid
		}
	}
	if f.Status != "" {
		query["status"] = f.Status
	}
	if f.Search != "" {
		regex := primitive.Regex{Pattern: regexutil.Escape(f.Search), Options: "i"}
		query["$or"] = bson.A{
			bson.M{"invoice_number": bson.M{"$regex": regex}},
			bson.M{"customer_name": bson.M{"$regex": regex}},
		}
	}
	// Date range filter on sold_at — both bounds are optional and independent.
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
		query["sold_at"] = dateFilter
	}
	return query
}

// HasActiveByCustomer returns true if the customer has any sale that is NOT cancelled.
func (r *saleRepository) HasActiveByCustomer(ctx context.Context, customerID primitive.ObjectID) (bool, error) {
	n, err := r.col.CountDocuments(ctx,
		bson.M{
			"customer_id": customerID,
			"status":      bson.M{"$ne": models.SaleStatusCancelled},
		},
		options.Count().SetLimit(1),
	)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func (r *saleRepository) Cancel(ctx context.Context, id primitive.ObjectID, notes string) error {
	now := time.Now().UTC()
	update := bson.M{
		"status":       models.SaleStatusCancelled,
		"cancelled_at": now,
		"updated_at":   now,
	}
	if notes != "" {
		update["notes"] = notes
	}
	res, err := r.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": update})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}
