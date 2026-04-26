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
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// NotificationRepository defines persistence operations for Notification documents.
type NotificationRepository interface {
	Create(ctx context.Context, n *models.Notification) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.Notification, error)
	List(ctx context.Context, recipientEmail string, f dto.NotificationFilter) ([]models.Notification, *response.Meta, error)
	UnreadCount(ctx context.Context, recipientEmail string) (int64, error)
	MarkRead(ctx context.Context, id primitive.ObjectID) error
	MarkAllRead(ctx context.Context, recipientEmail string) error
	MarkDismissed(ctx context.Context, id primitive.ObjectID) error
	Delete(ctx context.Context, id primitive.ObjectID) error
}

type notificationRepository struct {
	col *mongo.Collection
}

// NewNotificationRepository constructs a NotificationRepository.
func NewNotificationRepository(db *mongo.Database) NotificationRepository {
	return &notificationRepository{col: db.Collection("notifications")}
}

// Create inserts a new notification document.
func (r *notificationRepository) Create(ctx context.Context, n *models.Notification) error {
	n.ID = primitive.NewObjectID()
	n.CreatedAt = time.Now().UTC()
	_, err := r.col.InsertOne(ctx, n)
	return err
}

// FindByID returns a single notification or ErrNotFound.
func (r *notificationRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.Notification, error) {
	var n models.Notification
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&n)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, apperror.NotFound("notification")
	}
	return &n, err
}

// List returns a paginated slice of notifications visible to the given
// recipientEmail. A broadcast notification (recipient_email == "") is visible
// to every staff member; a targeted notification is visible only to its
// recipient or to any admin (the admin check is enforced in the service layer).
func (r *notificationRepository) List(ctx context.Context, recipientEmail string, f dto.NotificationFilter) ([]models.Notification, *response.Meta, error) {
	filter := r.buildFilter(recipientEmail, f.Status, f.Type)

	p := pagination.Params{Page: f.Page, Limit: f.Limit}
	p.Normalise()

	findOpts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64(p.Offset())).
		SetLimit(int64(p.Limit))

	var (
		items             []models.Notification
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

// UnreadCount returns the number of unread notifications visible to the recipient.
func (r *notificationRepository) UnreadCount(ctx context.Context, recipientEmail string) (int64, error) {
	filter := r.buildFilter(recipientEmail, string(models.NotificationStatusUnread), "")
	return r.col.CountDocuments(ctx, filter)
}

// MarkRead stamps read_at and sets status=read on a single notification.
func (r *notificationRepository) MarkRead(ctx context.Context, id primitive.ObjectID) error {
	now := time.Now().UTC()
	_, err := r.col.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{
			"status":  models.NotificationStatusRead,
			"read_at": now,
		}},
	)
	return err
}

// MarkAllRead sets status=read on every unread notification visible to
// the given recipientEmail (both broadcast and targeted).
func (r *notificationRepository) MarkAllRead(ctx context.Context, recipientEmail string) error {
	now := time.Now().UTC()
	filter := r.buildFilter(recipientEmail, string(models.NotificationStatusUnread), "")
	_, err := r.col.UpdateMany(ctx, filter,
		bson.M{"$set": bson.M{
			"status":  models.NotificationStatusRead,
			"read_at": now,
		}},
	)
	return err
}

// MarkDismissed sets status=dismissed on a single notification.
func (r *notificationRepository) MarkDismissed(ctx context.Context, id primitive.ObjectID) error {
	_, err := r.col.UpdateOne(ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"status": models.NotificationStatusDismissed}},
	)
	return err
}

// Delete hard-deletes a notification (admin only, enforced by route middleware).
func (r *notificationRepository) Delete(ctx context.Context, id primitive.ObjectID) error {
	res, err := r.col.DeleteOne(ctx, bson.M{"_id": id})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return apperror.NotFound("notification")
	}
	return nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// buildFilter constructs the MongoDB filter for list/count queries.
// A notification is visible when:
//
//	recipient_email == "" (broadcast)  OR  recipient_email == callerEmail
//
// Admins bypass the recipient filter — the service layer handles that by
// passing an empty recipientEmail so the filter includes all notifications.
func (r *notificationRepository) buildFilter(recipientEmail, status, notifType string) bson.M {
	filter := bson.M{}

	// Visibility: broadcast OR explicitly addressed to this recipient.
	// Empty recipientEmail from caller means "show all" (admin path).
	if recipientEmail != "" {
		filter["$or"] = bson.A{
			bson.M{"recipient_email": ""},
			bson.M{"recipient_email": recipientEmail},
		}
	}

	if status != "" {
		filter["status"] = status
	}
	if notifType != "" {
		filter["type"] = notifType
	}

	return filter
}
