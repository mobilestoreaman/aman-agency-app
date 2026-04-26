package service

import (
	"context"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// NotificationService manages in-app notifications for staff.
// It is also used internally by other services (e.g. SaleService, BorrowLendService)
// to fire event-driven alerts via Notify.
type NotificationService interface {
	// Notify creates a notification programmatically from another service.
	// It never returns an error to the caller — failures are silently logged.
	Notify(ctx context.Context, n models.Notification)

	// List returns paginated notifications visible to the requesting staff member.
	// Admins pass isAdmin=true to see all notifications regardless of recipient.
	List(ctx context.Context, callerEmail string, isAdmin bool, f dto.NotificationFilter) ([]dto.NotificationResponse, *response.Meta, error)

	// UnreadCount returns the badge count for the requesting staff member.
	UnreadCount(ctx context.Context, callerEmail string, isAdmin bool) (*dto.UnreadCountResponse, error)

	// Create lets an admin manually post a notification.
	Create(ctx context.Context, staffEmail string, req dto.CreateNotificationRequest) (*dto.NotificationResponse, error)

	// MarkRead marks a single notification as read.
	MarkRead(ctx context.Context, id string) error

	// MarkAllRead marks every unread notification visible to the caller as read.
	MarkAllRead(ctx context.Context, callerEmail string, isAdmin bool) error

	// Dismiss sets a notification to dismissed.
	Dismiss(ctx context.Context, id string) error

	// Delete hard-deletes a notification (admin only, enforced by route).
	Delete(ctx context.Context, id string) error
}

type notificationService struct {
	repo repository.NotificationRepository
}

// NewNotificationService constructs a NotificationService.
func NewNotificationService(repo repository.NotificationRepository) NotificationService {
	return &notificationService{repo: repo}
}

// ─── Notify (internal helper) ─────────────────────────────────────────────────

// Notify inserts a notification created by another service hook (e.g. after a
// sale is cancelled). Errors are deliberately swallowed — a failed notification
// must never roll back the originating business transaction.
func (s *notificationService) Notify(ctx context.Context, n models.Notification) {
	n.Status = models.NotificationStatusUnread
	if n.CreatedBy == "" {
		n.CreatedBy = "system"
	}
	_ = s.repo.Create(ctx, &n) // ignore error intentionally
}

// ─── List ─────────────────────────────────────────────────────────────────────

func (s *notificationService) List(ctx context.Context, callerEmail string, isAdmin bool, f dto.NotificationFilter) ([]dto.NotificationResponse, *response.Meta, error) {
	recipient := callerEmail
	if isAdmin {
		recipient = "" // empty = no recipient filter → admin sees all
	}

	items, meta, err := s.repo.List(ctx, recipient, f)
	if err != nil {
		return nil, nil, err
	}

	resp := make([]dto.NotificationResponse, 0, len(items))
	for _, n := range items {
		resp = append(resp, toNotificationResponse(n))
	}
	return resp, meta, nil
}

// ─── UnreadCount ─────────────────────────────────────────────────────────────

func (s *notificationService) UnreadCount(ctx context.Context, callerEmail string, isAdmin bool) (*dto.UnreadCountResponse, error) {
	recipient := callerEmail
	if isAdmin {
		recipient = ""
	}
	count, err := s.repo.UnreadCount(ctx, recipient)
	if err != nil {
		return nil, err
	}
	return &dto.UnreadCountResponse{Count: count}, nil
}

// ─── Create (manual, admin) ───────────────────────────────────────────────────

func (s *notificationService) Create(ctx context.Context, staffEmail string, req dto.CreateNotificationRequest) (*dto.NotificationResponse, error) {
	n := models.Notification{
		Type:           models.NotificationType(req.Type),
		Title:          req.Title,
		Body:           req.Body,
		Status:         models.NotificationStatusUnread,
		RecipientEmail: req.RecipientEmail,
		CreatedBy:      staffEmail,
	}

	if req.CustomerID != "" {
		oid, err := primitive.ObjectIDFromHex(req.CustomerID)
		if err != nil {
			return nil, apperror.BadRequest("invalid customer_id")
		}
		n.CustomerID = &oid
	}

	if req.SaleID != "" {
		oid, err := primitive.ObjectIDFromHex(req.SaleID)
		if err != nil {
			return nil, apperror.BadRequest("invalid sale_id")
		}
		n.SaleID = &oid
	}

	n.RefID = req.RefID

	if err := s.repo.Create(ctx, &n); err != nil {
		return nil, err
	}
	r := toNotificationResponse(n)
	return &r, nil
}

// ─── MarkRead ─────────────────────────────────────────────────────────────────

func (s *notificationService) MarkRead(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return apperror.BadRequest("invalid notification id")
	}
	// Confirm existence first so the handler can return 404 when appropriate.
	if _, err = s.repo.FindByID(ctx, oid); err != nil {
		return err
	}
	return s.repo.MarkRead(ctx, oid)
}

// ─── MarkAllRead ─────────────────────────────────────────────────────────────

func (s *notificationService) MarkAllRead(ctx context.Context, callerEmail string, isAdmin bool) error {
	recipient := callerEmail
	if isAdmin {
		recipient = ""
	}
	return s.repo.MarkAllRead(ctx, recipient)
}

// ─── Dismiss ─────────────────────────────────────────────────────────────────

func (s *notificationService) Dismiss(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return apperror.BadRequest("invalid notification id")
	}
	if _, err = s.repo.FindByID(ctx, oid); err != nil {
		return err
	}
	return s.repo.MarkDismissed(ctx, oid)
}

// ─── Delete ───────────────────────────────────────────────────────────────────

func (s *notificationService) Delete(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return apperror.BadRequest("invalid notification id")
	}
	return s.repo.Delete(ctx, oid)
}

// ─── mapping helper ───────────────────────────────────────────────────────────

func toNotificationResponse(n models.Notification) dto.NotificationResponse {
	r := dto.NotificationResponse{
		ID:             n.ID.Hex(),
		Type:           string(n.Type),
		Title:          n.Title,
		Body:           n.Body,
		Status:         string(n.Status),
		RecipientEmail: n.RecipientEmail,
		RefID:          n.RefID,
		CreatedBy:      n.CreatedBy,
		CreatedAt:      n.CreatedAt,
		ReadAt:         n.ReadAt,
	}
	if n.CustomerID != nil {
		r.CustomerID = n.CustomerID.Hex()
	}
	if n.SaleID != nil {
		r.SaleID = n.SaleID.Hex()
	}
	return r
}
