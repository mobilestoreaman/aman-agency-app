package middleware

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

const (
	// HeaderRequestID is the canonical header name for distributed tracing.
	HeaderRequestID = "X-Request-ID"

	// LocalRequestID is the Fiber context key where the request ID is stored.
	LocalRequestID = "request_id"

	// ContextKeyRequestID is the context key for storing request ID in Go context.
	ContextKeyRequestID = "request_id"
)

// RequestID extracts the X-Request-ID header from incoming requests or
// generates a new UUID v4 if absent. The ID is:
//   - stored in c.Locals for access within handlers
//   - stored in Go context for access in repositories and services
//   - echoed back on the response as X-Request-ID
//   - injected into the zerolog logger so every log line for this request
//     carries the same trace ID
func RequestID() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Honour an upstream-provided ID (e.g. from Nginx or a load balancer)
		reqID := c.Get(HeaderRequestID)
		if reqID == "" {
			reqID = uuid.NewString()
		}

		// Make available to handlers and downstream middleware via Fiber locals
		c.Locals(LocalRequestID, reqID)

		// Also store in Go context for access in repositories and services
		ctx := context.WithValue(c.UserContext(), ContextKeyRequestID, reqID)
		c.SetUserContext(ctx)

		// Echo back so the client can correlate its own logs
		c.Set(HeaderRequestID, reqID)

		// Attach to zerolog context — all log calls inside this request
		// will automatically include "request_id": "<uuid>"
		logger := log.With().Str("request_id", reqID).Logger()
		c.Locals("logger", &logger)

		return c.Next()
	}
}

// LoggerFromCtx returns the request-scoped zerolog logger stored by RequestID
// middleware. Falls back to the global logger if not found (e.g. in tests).
func LoggerFromCtx(c *fiber.Ctx) *zerolog.Logger {
	if l, ok := c.Locals("logger").(*zerolog.Logger); ok {
		return l
	}
	return &log.Logger
}

// RequestIDFromCtx extracts the request ID from a Go context (set by RequestID middleware).
// Returns empty string if not found.
func RequestIDFromCtx(ctx context.Context) string {
	if id, ok := ctx.Value(ContextKeyRequestID).(string); ok {
		return id
	}
	return ""
}
