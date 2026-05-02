package repository

import (
	"context"
	"errors"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/regexutil"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ExpenseRepository defines persistence operations for Expense documents.
type ExpenseRepository interface {
	Create(ctx context.Context, e *models.Expense) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Expense, error)
	List(ctx context.Context, f dto.ExpenseFilter, from, to time.Time) ([]models.Expense, *response.Meta, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Expense, error)
	Delete(ctx context.Context, id primitive.ObjectID) error

	// Aggregate returns total amount and per-category breakdown for the report.
	Aggregate(ctx context.Context, from, to time.Time) (*dto.ExpenseSummaryResponse, error)
}

type expenseRepository struct {
	col *mongo.Collection
}

// NewExpenseRepository constructs an ExpenseRepository.
func NewExpenseRepository(db *mongo.Database) ExpenseRepository {
	return &expenseRepository{col: db.Collection("expenses")}
}

// Create inserts a new expense document.
func (r *expenseRepository) Create(ctx context.Context, e *models.Expense) error {
	e.ID = primitive.NewObjectID()
	e.CreatedAt = time.Now().UTC()
	e.UpdatedAt = e.CreatedAt
	_, err := r.col.InsertOne(ctx, e)
	return err
}

// FindByID returns a single expense or ErrNotFound.
func (r *expenseRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Expense, error) {
	var e models.Expense
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&e)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, apperror.NotFound("expense")
	}
	return &e, err
}

// List returns a paginated slice of expenses, sorted newest first.
// from/to are pre-parsed UTC bounds on the `date` field; zero values omit the date filter.
func (r *expenseRepository) List(ctx context.Context, f dto.ExpenseFilter, from, to time.Time) ([]models.Expense, *response.Meta, error) {
	filter := buildExpenseFilter(f.Category, f.Search, from, to)

	p := pagination.Params{Page: f.Page, Limit: f.Limit}
	p.Normalise()

	findOpts := options.Find().
		SetSort(bson.D{{Key: "date", Value: -1}}).
		SetSkip(int64(p.Offset())).
		SetLimit(int64(p.Limit))

	var (
		items             []models.Expense
		total             int64
		wg                sync.WaitGroup
		findErr, countErr error
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		cur, err := r.col.Find(ctx, filter, findOpts)
		if err != nil {
			findErr = err
			return
		}
		defer cur.Close(ctx)
		findErr = cur.All(ctx, &items)
	}()
	go func() {
		defer wg.Done()
		total, countErr = r.col.CountDocuments(ctx, filter)
	}()
	wg.Wait()

	if findErr != nil {
		return nil, nil, findErr
	}
	if countErr != nil {
		return nil, nil, countErr
	}

	meta := pagination.ToMeta(p, total)
	return items, meta, nil
}

// Update applies a $set map to a single expense and returns the updated document.
func (r *expenseRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) (*models.Expense, error) {
	fields["updated_at"] = time.Now().UTC()

	after := options.After
	opts := options.FindOneAndUpdate().SetReturnDocument(after)

	var e models.Expense
	err := r.col.FindOneAndUpdate(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": fields},
		opts,
	).Decode(&e)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, apperror.NotFound("expense")
	}
	return &e, err
}

// Delete hard-deletes an expense.
func (r *expenseRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return apperror.NotFound("expense")
	}
	return nil
}

// Aggregate returns per-category totals and counts within the date range.
func (r *expenseRepository) Aggregate(ctx context.Context, from, to time.Time) (*dto.ExpenseSummaryResponse, error) {
	matchFilter := bson.M{}
	if !from.IsZero() && !to.IsZero() {
		matchFilter["date"] = bson.M{"$gte": from, "$lte": to}
	}

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: matchFilter}},
		{{Key: "$facet", Value: bson.M{
			"totals": bson.A{
				bson.M{"$group": bson.M{
					"_id":          nil,
					"total_amount": bson.M{"$sum": "$amount"},
					"total_count":  bson.M{"$sum": 1},
				}},
			},
			"by_category": bson.A{
				bson.M{"$group": bson.M{
					"_id":   "$category",
					"total": bson.M{"$sum": "$amount"},
					"count": bson.M{"$sum": 1},
				}},
				bson.M{"$sort": bson.D{{Key: "total", Value: -1}}},
			},
		}}},
	}

	cur, err := r.col.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	resp := &dto.ExpenseSummaryResponse{From: from, To: to}

	if cur.Next(ctx) {
		var facet struct {
			Totals []struct {
				TotalAmount float64 `bson:"total_amount"`
				TotalCount  int64   `bson:"total_count"`
			} `bson:"totals"`
			ByCategory []struct {
				Category string  `bson:"_id"`
				Total    float64 `bson:"total"`
				Count    int64   `bson:"count"`
			} `bson:"by_category"`
		}
		if err := cur.Decode(&facet); err != nil {
			return nil, err
		}
		if len(facet.Totals) > 0 {
			resp.TotalAmount = facet.Totals[0].TotalAmount
			resp.TotalCount = facet.Totals[0].TotalCount
		}
		for _, row := range facet.ByCategory {
			resp.ByCategory = append(resp.ByCategory, dto.ExpenseCategoryBreakdown{
				Category: row.Category,
				Amount:   row.Total,
				Count:    row.Count,
			})
		}
	}

	return resp, nil
}

// ─── helper ───────────────────────────────────────────────────────────────────

func buildExpenseFilter(category, search string, from, to time.Time) bson.M {
	filter := bson.M{}
	if category != "" {
		filter["category"] = category
	}
	if search != "" {
		filter["description"] = bson.M{"$regex": primitive.Regex{Pattern: regexutil.Escape(search), Options: "i"}}
	}
	if !from.IsZero() && !to.IsZero() {
		filter["date"] = bson.M{"$gte": from, "$lte": to}
	}
	return filter
}
