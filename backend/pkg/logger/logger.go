package logger

import (
	"context"
	"time"

	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson"
)

// Logger provides structured application-level logging that persists to MongoDB
// AND writes to zerolog stdout simultaneously.
type Logger struct {
	repo repository.TraceLogRepository
}

// New constructs a Logger.
func New(repo repository.TraceLogRepository) *Logger {
	return &Logger{repo: repo}
}

// Info logs an informational business event.
func (l *Logger) Info(ctx context.Context, module, traceID, message string, opts ...Option) {
	entry := &models.TraceLog{
		TraceID:   traceID,
		SpanID:    uuid.NewString(),
		Level:     models.LogLevelINFO,
		Module:    module,
		Message:   message,
		Status:    models.StatusSuccess,
		CreatedAt: time.Now().UTC(),
	}

	// Apply options
	for _, opt := range opts {
		opt(entry)
	}

	// Write to zerolog
	log.Info().
		Str("trace_id", traceID).
		Str("span_id", entry.SpanID).
		Str("module", module).
		Str("message", message).
		Msg("info")

	// Persist asynchronously
	l.insertAsync(ctx, entry)
}

// Warn logs a warning.
func (l *Logger) Warn(ctx context.Context, module, traceID, message string, opts ...Option) {
	entry := &models.TraceLog{
		TraceID:   traceID,
		SpanID:    uuid.NewString(),
		Level:     models.LogLevelWARN,
		Module:    module,
		Message:   message,
		Status:    models.StatusSuccess,
		CreatedAt: time.Now().UTC(),
	}

	// Apply options
	for _, opt := range opts {
		opt(entry)
	}

	// Write to zerolog
	log.Warn().
		Str("trace_id", traceID).
		Str("span_id", entry.SpanID).
		Str("module", module).
		Str("message", message).
		Msg("warn")

	// Persist asynchronously
	l.insertAsync(ctx, entry)
}

// Error logs an error with optional stack trace.
func (l *Logger) Error(ctx context.Context, module, traceID, message string, err error, opts ...Option) {
	entry := &models.TraceLog{
		TraceID:   traceID,
		SpanID:    uuid.NewString(),
		Level:     models.LogLevelERROR,
		Module:    module,
		Message:   message,
		Status:    models.StatusFailure,
		CreatedAt: time.Now().UTC(),
	}

	// Add error message
	if err != nil {
		entry.ErrorMessage = err.Error()
	}

	// Apply options
	for _, opt := range opts {
		opt(entry)
	}

	// Write to zerolog
	logEvent := log.Error().
		Str("trace_id", traceID).
		Str("span_id", entry.SpanID).
		Str("module", module).
		Str("message", message)

	if err != nil {
		logEvent = logEvent.Err(err)
	}

	logEvent.Msg("error")

	// Persist asynchronously
	l.insertAsync(ctx, entry)
}

// insertAsync persists the log entry asynchronously with a timeout.
func (l *Logger) insertAsync(ctx context.Context, entry *models.TraceLog) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Error().Interface("panic", r).Str("trace_id", entry.TraceID).Msg("panic in logger goroutine")
			}
		}()
		insertCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := l.repo.Insert(insertCtx, entry); err != nil {
			log.Error().
				Err(err).
				Str("trace_id", entry.TraceID).
				Str("span_id", entry.SpanID).
				Msg("failed to persist log entry")
		}
	}()
}

// Option pattern for flexible metadata configuration.
type Option func(*models.TraceLog)

// WithUserID adds user ID to the log entry.
func WithUserID(id string) Option {
	return func(e *models.TraceLog) {
		e.UserID = id
	}
}

// WithUserEmail adds user email to the log entry.
func WithUserEmail(email string) Option {
	return func(e *models.TraceLog) {
		e.UserEmail = email
	}
}

// WithUserRole adds user role to the log entry.
func WithUserRole(role string) Option {
	return func(e *models.TraceLog) {
		e.UserRole = role
	}
}

// WithTags adds searchable tags to the log entry.
func WithTags(tags ...string) Option {
	return func(e *models.TraceLog) {
		e.Tags = append(e.Tags, tags...)
	}
}

// WithMetadata adds a key-value pair to the metadata.
func WithMetadata(key string, val interface{}) Option {
	return func(e *models.TraceLog) {
		if e.Metadata == nil {
			e.Metadata = bson.M{}
		}
		e.Metadata[key] = val
	}
}

// WithRequestPayload captures the request payload (use carefully — avoid sensitive data).
func WithRequestPayload(v interface{}) Option {
	return func(entry *models.TraceLog) {
		data, err := bson.Marshal(bson.M{"payload": v})
		if err == nil {
			raw := bson.Raw(data)
			entry.RequestPayload = &raw
		}
	}
}

// WithResponsePayload captures the response payload (use carefully — avoid sensitive data).
func WithResponsePayload(v interface{}) Option {
	return func(entry *models.TraceLog) {
		data, err := bson.Marshal(bson.M{"payload": v})
		if err == nil {
			raw := bson.Raw(data)
			entry.ResponsePayload = &raw
		}
	}
}

// WithStackTrace adds a stack trace to the log entry.
func WithStackTrace(trace string) Option {
	return func(e *models.TraceLog) {
		e.StackTrace = trace
	}
}

// WithIPAddress adds the IP address to the log entry.
func WithIPAddress(ip string) Option {
	return func(e *models.TraceLog) {
		e.IPAddress = ip
	}
}
