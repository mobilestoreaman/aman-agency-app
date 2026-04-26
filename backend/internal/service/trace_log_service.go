package service

import (
	"context"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"go.mongodb.org/mongo-driver/bson"
)

// TraceLogService provides business logic for trace log queries and display.
type TraceLogService interface {
	List(ctx context.Context, f dto.TraceLogFilterRequest) ([]*dto.TraceLogResponse, *response.Meta, error)
	GetByID(ctx context.Context, id string) (*dto.TraceLogDetailResponse, error)
	GetTrace(ctx context.Context, traceID string) ([]*dto.TraceLogResponse, error)
}

type traceLogService struct {
	repo repository.TraceLogRepository
}

// NewTraceLogService constructs a TraceLogService.
func NewTraceLogService(repo repository.TraceLogRepository) TraceLogService {
	return &traceLogService{repo: repo}
}

// List returns paginated trace logs with optional filtering.
func (s *traceLogService) List(ctx context.Context, f dto.TraceLogFilterRequest) ([]*dto.TraceLogResponse, *response.Meta, error) {
	// Parse pagination
	page := f.Page
	if page < 1 {
		page = 1
	}
	limit := f.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// Parse date range
	var fromDate, toDate time.Time
	if f.FromDate != "" {
		parsed, err := time.Parse("2006-01-02", f.FromDate)
		if err != nil {
			return nil, nil, apperror.BadRequest("invalid from_date format (expected YYYY-MM-DD)")
		}
		fromDate = parsed
	}
	if f.ToDate != "" {
		parsed, err := time.Parse("2006-01-02", f.ToDate)
		if err != nil {
			return nil, nil, apperror.BadRequest("invalid to_date format (expected YYYY-MM-DD)")
		}
		// Set to end of day
		toDate = parsed.Add(24 * time.Hour)
	}

	// Determine sort order
	sortOrder := -1 // default descending
	if f.SortOrder == "asc" {
		sortOrder = 1
	}

	// Build repository filter
	repoFilter := repository.TraceLogFilter{
		TraceID:   f.TraceID,
		Level:     f.Level,
		Module:    f.Module,
		Status:    f.Status,
		Search:    f.Search,
		UserID:    f.UserID,
		FromDate:  fromDate,
		ToDate:    toDate,
		Page:      page,
		Limit:     limit,
		SortBy:    "created_at",
		SortOrder: sortOrder,
	}

	logs, total, err := s.repo.List(ctx, repoFilter)
	if err != nil {
		return nil, nil, apperror.Internal(err)
	}

	// Convert models to DTOs
	responses := make([]*dto.TraceLogResponse, len(logs))
	for i, log := range logs {
		responses[i] = modelToResponse(log)
	}

	meta := &response.Meta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: int((total + int64(limit) - 1) / int64(limit)),
	}

	return responses, meta, nil
}

// GetByID retrieves a single trace log by ID with full details (payloads, stack trace).
func (s *traceLogService) GetByID(ctx context.Context, id string) (*dto.TraceLogDetailResponse, error) {
	log, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, apperror.Internal(err)
	}

	if log == nil {
		return nil, apperror.NotFound("trace log")
	}

	return modelToDetailResponse(log), nil
}

// GetTrace retrieves all spans for a given traceID in chronological order (timeline).
func (s *traceLogService) GetTrace(ctx context.Context, traceID string) ([]*dto.TraceLogResponse, error) {
	logs, err := s.repo.GetByTraceID(ctx, traceID)
	if err != nil {
		return nil, apperror.Internal(err)
	}

	responses := make([]*dto.TraceLogResponse, len(logs))
	for i, log := range logs {
		responses[i] = modelToResponse(log)
	}

	return responses, nil
}

// modelToResponse converts a TraceLog model to a list response DTO (no payloads).
func modelToResponse(log *models.TraceLog) *dto.TraceLogResponse {
	return &dto.TraceLogResponse{
		ID:           log.ID.Hex(),
		TraceID:      log.TraceID,
		SpanID:       log.SpanID,
		Level:        log.Level,
		Module:       log.Module,
		Message:      log.Message,
		Method:       log.Method,
		Path:         log.Path,
		StatusCode:   log.StatusCode,
		LatencyMs:    log.LatencyMs,
		UserID:       log.UserID,
		UserEmail:    log.UserEmail,
		UserRole:     log.UserRole,
		IPAddress:    log.IPAddress,
		ErrorMessage: log.ErrorMessage,
		Status:       log.Status,
		Tags:         log.Tags,
		CreatedAt:    log.CreatedAt.Format(time.RFC3339),
	}
}

// modelToDetailResponse converts a TraceLog model to a detail response DTO (with payloads).
func modelToDetailResponse(log *models.TraceLog) *dto.TraceLogDetailResponse {
	resp := &dto.TraceLogDetailResponse{
		TraceLogResponse: *modelToResponse(log),
		StackTrace:       log.StackTrace,
		Metadata:         log.Metadata,
	}

	// Convert bson.Raw payloads to map[string]interface{} for JSON marshaling.
	// bson.Unmarshal decodes the raw BSON bytes into a generic Go value.
	if log.RequestPayload != nil && len(*log.RequestPayload) > 0 {
		var payload interface{}
		if err := bson.Unmarshal(*log.RequestPayload, &payload); err == nil {
			resp.RequestPayload = payload
		}
	}
	if log.ResponsePayload != nil && len(*log.ResponsePayload) > 0 {
		var payload interface{}
		if err := bson.Unmarshal(*log.ResponsePayload, &payload); err == nil {
			resp.ResponsePayload = payload
		}
	}

	return resp
}
