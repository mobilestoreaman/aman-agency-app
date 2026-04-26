package repository

import (
	"context"
	"time"

	"aman-agency/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// AuditFilter defines the query parameters for listing audit logs.
type AuditFilter struct {
	ActorID  primitive.ObjectID
	Action   string
	Resource string
	FromDate time.Time
	ToDate   time.Time
	Page     int
	Limit    int
}

// AuditLogRepository defines the persistence contract for AuditLog documents.
type AuditLogRepository interface {
	Insert(ctx context.Context, log *models.AuditLog) error
	List(ctx context.Context, filter AuditFilter) ([]*models.AuditLog, int64, error)
}

type auditLogRepository struct {
	col *mongo.Collection
}

// NewAuditLogRepository constructs a repository backed by the "audit_logs" collection.
func NewAuditLogRepository(db *mongo.Database) AuditLogRepository {
	return &auditLogRepository{col: db.Collection("audit_logs")}
}

// Insert records an audit log entry. It is expected to be called fire-and-forget
// from a goroutine, so errors are not returned to the caller.
func (r *auditLogRepository) Insert(ctx context.Context, log *models.AuditLog) error {
	log.ID = primitive.NewObjectID()
	if log.CreatedAt.IsZero() {
		log.CreatedAt = time.Now().UTC()
	}
	_, err := r.col.InsertOne(ctx, log)
	return err
}

// List returns paginated audit logs with optional filters.
func (r *auditLogRepository) List(ctx context.Context, filter AuditFilter) ([]*models.AuditLog, int64, error) {
	query := buildAuditFilter(filter)

	page := filter.Page
	if page < 1 {
		page = 1
	}
	const maxPage = 1000
	if page > maxPage {
		page = maxPage
	}
	limit := filter.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	cur, err := r.col.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	var logs []*models.AuditLog
	if err = cur.All(ctx, &logs); err != nil {
		return nil, 0, err
	}

	total, err := r.col.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}

	if logs == nil {
		logs = []*models.AuditLog{}
	}
	return logs, total, nil
}

func buildAuditFilter(f AuditFilter) bson.M {
	query := bson.M{}

	if f.ActorID != primitive.NilObjectID {
		query["actor_id"] = f.ActorID
	}
	if f.Action != "" {
		query["action"] = f.Action
	}
	if f.Resource != "" {
		query["resource"] = f.Resource
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
