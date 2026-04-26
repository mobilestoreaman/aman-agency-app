package repository

import (
	"context"
	"sync"
	"time"

	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/regexutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// TraceLogFilter defines the query parameters for listing trace logs.
type TraceLogFilter struct {
	TraceID    string
	Level      string
	Module     string
	Status     string
	Search     string // searches message, path, user_email, tags
	UserID     string
	FromDate   time.Time
	ToDate     time.Time
	Page       int
	Limit      int
	SortBy     string // "created_at" default
	SortOrder  int    // -1 desc, 1 asc
}

// TraceLogRepository defines the persistence contract for TraceLog documents.
type TraceLogRepository interface {
	Insert(ctx context.Context, log *models.TraceLog) error
	List(ctx context.Context, f TraceLogFilter) ([]*models.TraceLog, int64, error)
	GetByID(ctx context.Context, id string) (*models.TraceLog, error)
	GetByTraceID(ctx context.Context, traceID string) ([]*models.TraceLog, error)
	DeleteOlderThan(ctx context.Context, before time.Time) (int64, error)
}

type traceLogRepository struct {
	col *mongo.Collection
}

// NewTraceLogRepository constructs a repository backed by the "trace_logs" collection.
func NewTraceLogRepository(db *mongo.Database) TraceLogRepository {
	return &traceLogRepository{col: db.Collection("trace_logs")}
}

// Insert records a trace log entry. It is expected to be called fire-and-forget
// from a goroutine, so errors are not returned to the caller.
func (r *traceLogRepository) Insert(ctx context.Context, log *models.TraceLog) error {
	if log.ID == (primitive.NilObjectID) {
		log.ID = primitive.NewObjectID()
	}
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now().UTC()
	}
	_, err := r.col.InsertOne(ctx, log)
	return err
}

// List returns paginated trace logs with optional filters.
func (r *traceLogRepository) List(ctx context.Context, f TraceLogFilter) ([]*models.TraceLog, int64, error) {
	query := buildTraceLogFilter(f)

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

	sortBy := f.SortBy
	if sortBy == "" {
		sortBy = "created_at"
	}
	sortOrder := f.SortOrder
	if sortOrder == 0 {
		sortOrder = -1 // default descending
	}

	opts := options.Find().
		SetSort(bson.D{{Key: sortBy, Value: sortOrder}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	cur, err := r.col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	var logs []*models.TraceLog
	if err = cur.All(ctx, &logs); err != nil {
		return nil, 0, err
	}

	// Use goroutines to count in parallel
	var wg sync.WaitGroup
	var total int64
	var countErr error

	wg.Add(1)
	go func() {
		defer wg.Done()
		total, countErr = r.col.CountDocuments(ctx, query)
	}()

	wg.Wait()
	if countErr != nil {
		return nil, 0, countErr
	}

	if logs == nil {
		logs = []*models.TraceLog{}
	}
	return logs, total, nil
}

// GetByID retrieves a single trace log by ID.
func (r *traceLogRepository) GetByID(ctx context.Context, id string) (*models.TraceLog, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}

	var log *models.TraceLog
	err = r.col.FindOne(ctx, bson.M{"_id": oid}).Decode(&log)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, nil
		}
		return nil, err
	}

	return log, nil
}

// GetByTraceID retrieves all spans for a given traceID, sorted chronologically.
func (r *traceLogRepository) GetByTraceID(ctx context.Context, traceID string) ([]*models.TraceLog, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: 1}})

	cur, err := r.col.Find(ctx, bson.M{"trace_id": traceID}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var logs []*models.TraceLog
	if err = cur.All(ctx, &logs); err != nil {
		return nil, err
	}

	if logs == nil {
		logs = []*models.TraceLog{}
	}
	return logs, nil
}

// DeleteOlderThan removes trace logs created before the specified time.
// Used for cleanup jobs (e.g. TTL enforcement).
func (r *traceLogRepository) DeleteOlderThan(ctx context.Context, before time.Time) (int64, error) {
	result, err := r.col.DeleteMany(ctx, bson.M{
		"created_at": bson.M{"$lt": before},
	})
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

func buildTraceLogFilter(f TraceLogFilter) bson.M {
	query := bson.M{}

	if f.TraceID != "" {
		query["trace_id"] = f.TraceID
	}
	if f.Level != "" {
		query["level"] = f.Level
	}
	if f.Module != "" {
		query["module"] = f.Module
	}
	if f.Status != "" {
		query["status"] = f.Status
	}
	if f.UserID != "" {
		query["user_id"] = f.UserID
	}

	// Search: regex on message, path, user_email, tags (OR condition)
	if f.Search != "" {
		escapedSearch := regexutil.Escape(f.Search)
		regex := bson.M{"$regex": escapedSearch, "$options": "i"}
		query["$or"] = bson.A{
			bson.M{"message": regex},
			bson.M{"path": regex},
			bson.M{"user_email": regex},
			bson.M{"tags": regex},
		}
	}

	// Date range filter
	if !f.FromDate.IsZero() || !f.ToDate.IsZero() {
		dateQuery := bson.M{}
		if !f.FromDate.IsZero() {
			dateQuery["$gte"] = f.FromDate
		}
		if !f.ToDate.IsZero() {
			dateQuery["$lte"] = f.ToDate
		}
		if len(dateQuery) > 0 {
			query["created_at"] = dateQuery
		}
	}

	return query
}
