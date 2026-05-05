package service

import (
	"context"
	"time"

	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AuditService provides fire-and-forget audit logging.
// All methods are non-blocking and errors are logged only, never returned to callers.
type AuditService interface {
	// Log records an audit event asynchronously.
	// Failures are logged to stderr only and never cause the calling request to fail.
	Log(ctx context.Context, c *fiber.Ctx, action, resource, resourceID string, changes map[string]interface{})

	// List returns paginated audit logs for display in admin dashboards.
	List(ctx context.Context, filter repository.AuditFilter) ([]*models.AuditLog, *response.Meta, error)
}

type auditService struct {
	repo repository.AuditLogRepository
}

// NewAuditService constructs an AuditService.
func NewAuditService(repo repository.AuditLogRepository) AuditService {
	return &auditService{repo: repo}
}

// Log records an audit event asynchronously. It extracts actor info from the Fiber
// context and inserts a log entry in the background. Errors are logged but never
// returned, ensuring that audit logging failures do not impact the main request.
func (s *auditService) Log(ctx context.Context, c *fiber.Ctx, action, resource, resourceID string, changes map[string]interface{}) {
	// Extract actor info from Fiber context locals (set by auth middleware)
	actorIDStr := middleware.GetUserID(c)
	actorEmail := middleware.GetUserEmail(c)
	actorRole := middleware.GetUserRole(c)

	// Parse actor ID
	actorID, err := primitive.ObjectIDFromHex(actorIDStr)
	if err != nil {
		log.Warn().Err(err).Str("actor_id_str", actorIDStr).Msg("failed to parse actor_id in audit log")
		actorID = primitive.NilObjectID
	}

	// Extract request ID and IP address (safe assertion — won't panic if unset)
	requestID, _ := c.Locals(middleware.LocalRequestID).(string)
	ipAddress := c.IP()

	entry := &models.AuditLog{
		ActorID:    actorID,
		ActorEmail: actorEmail,
		ActorRole:  actorRole,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		Changes:    changes,
		IPAddress:  ipAddress,
		RequestID:  requestID,
		CreatedAt:  time.Now().UTC(),
	}

	// Insert asynchronously to avoid blocking the request
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Error().Interface("panic", r).Str("action", action).Msg("panic in audit log goroutine")
			}
		}()
		insertCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()

		if err := s.repo.Insert(insertCtx, entry); err != nil {
			log.Error().
				Err(err).
				Str("action", action).
				Str("resource", resource).
				Str("resource_id", resourceID).
				Msg("failed to insert audit log")
		}
	}()
}

// List returns paginated audit logs with optional filtering.
// This is called from the admin audit log endpoint.
func (s *auditService) List(ctx context.Context, filter repository.AuditFilter) ([]*models.AuditLog, *response.Meta, error) {
	logs, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, nil, err
	}

	meta := &response.Meta{
		Page:       filter.Page,
		Limit:      filter.Limit,
		Total:      total,
		TotalPages: int((total + int64(filter.Limit) - 1) / int64(filter.Limit)),
	}

	return logs, meta, nil
}
