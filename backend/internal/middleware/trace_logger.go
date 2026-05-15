package middleware

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson"
)

// TraceLogger returns a Fiber middleware that persists request traces to MongoDB.
// It is non-blocking — inserts happen asynchronously in goroutines.
// Skips: /api/health, /api/swagger/*, /static/*
//
// Usage: app.Use(middleware.TraceLogger(traceLogRepo, cfg))
func TraceLogger(repo repository.TraceLogRepository, cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Skip logging for certain paths to reduce noise
		if shouldSkipTraceLogging(c.Path()) {
			return c.Next()
		}

		start := time.Now()

		// Get traceID from RequestID middleware (already set)
		traceID, _ := c.Locals(LocalRequestID).(string)

		// Generate a unique spanID for this entry
		spanID := uuid.NewString()

		// Process the request
		err := c.Next()

		// Compute latency
		latency := time.Since(start)
		latencyMs := latency.Milliseconds()

		// Extract response metadata
		statusCode := c.Response().StatusCode()

		// Extract user info from Fiber locals (set by Authenticate middleware)
		userID := GetUserID(c)
		userEmail := GetUserEmail(c)
		userRole := GetUserRole(c)

		// Determine log level based on status code
		level := models.LogLevelINFO
		if statusCode >= 500 {
			level = models.LogLevelERROR
		} else if statusCode >= 400 {
			level = models.LogLevelWARN
		}

		// Determine status
		status := models.StatusSuccess
		if statusCode >= 400 {
			status = models.StatusFailure
		}

		// Determine module by inspecting path
		module := determineModule(c.Path())

		// Capture non-sensitive request context for every request
		queryStr := string(c.Request().URI().QueryString())
		userAgent := c.Get("User-Agent")
		contentType := c.Get("Content-Type")
		referer := c.Get("Referer")

		meta := bson.M{}
		if userAgent != "" {
			meta["user_agent"] = userAgent
		}
		if queryStr != "" {
			meta["query"] = queryStr
		}
		if contentType != "" {
			meta["content_type"] = contentType
		}
		if referer != "" {
			meta["referer"] = referer
		}

		// Build TraceLog entry
		entry := &models.TraceLog{
			TraceID:    traceID,
			SpanID:     spanID,
			Level:      level,
			Module:     module,
			Message:    c.Method() + " " + c.Path(),
			Method:     c.Method(),
			Path:       c.Path(),
			StatusCode: statusCode,
			LatencyMs:  latencyMs,
			UserID:     userID,
			UserEmail:  userEmail,
			UserRole:   userRole,
			IPAddress:  c.IP(),
			Status:     status,
			Metadata:   meta,
			CreatedAt:  time.Now().UTC(),
		}

		// Only capture payloads on errors (status >= 400) to avoid log bloat
		if statusCode >= 400 {
			// Capture request payload unless it's a sensitive endpoint.
			// JSON bytes must be converted to BSON via an intermediate unmarshal
			// — storing raw JSON bytes as bson.Raw would cause an invalid-BSON panic.
			if !isSensitivePath(c.Path()) && len(c.Body()) > 0 {
				if raw := jsonToBSONRaw(c.Body()); raw != nil {
					entry.RequestPayload = raw
				}
			}

			// Capture response payload if available
			if len(c.Response().Body()) > 0 {
				if raw := jsonToBSONRaw(c.Response().Body()); raw != nil {
					entry.ResponsePayload = raw
				}
			}

			// Capture error message if present
			if err != nil {
				entry.ErrorMessage = err.Error()
			}
		}

		// Insert asynchronously (fire-and-forget).
		// IMPORTANT: do NOT use c.Context() here. Fiber recycles *fiber.Ctx objects
		// back to a sync.Pool once the middleware chain returns, so c is invalid by
		// the time this goroutine runs — accessing it causes a nil-pointer panic.
		// context.Background() is correct for a fire-and-forget database write.
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Error().
						Interface("panic", r).
						Str("trace_id", traceID).
						Msg("panic in trace log goroutine")
				}
			}()
			insertCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if insertErr := repo.Insert(insertCtx, entry); insertErr != nil {
				log.Error().
					Err(insertErr).
					Str("trace_id", traceID).
					Str("span_id", spanID).
					Msg("failed to persist trace log")
			}
		}()

		return err
	}
}

// shouldSkipTraceLogging returns true for paths that should not be logged.
func shouldSkipTraceLogging(path string) bool {
	// Skip health check
	if path == "/api/health" {
		return true
	}

	// Skip swagger UI
	if strings.HasPrefix(path, "/api/swagger/") {
		return true
	}

	// Skip static files
	if strings.HasPrefix(path, "/static/") {
		return true
	}

	return false
}

// isSensitivePath returns true for endpoints that should not log request/response bodies
// (e.g. auth endpoints that might contain passwords).
func isSensitivePath(path string) bool {
	sensitivePatterns := []string{
		"/auth/login",
		"/auth/refresh",
		"/change-password",
	}

	for _, pattern := range sensitivePatterns {
		if strings.Contains(path, pattern) {
			return true
		}
	}

	return false
}

// determineModule inspects the request path and returns the appropriate module name.
func determineModule(path string) string {
	pathLower := strings.ToLower(path)

	if strings.Contains(pathLower, "/auth") {
		return models.ModuleAuth
	}
	if strings.Contains(pathLower, "/sales") {
		return models.ModuleSales
	}
	if strings.Contains(pathLower, "/devices") || strings.Contains(pathLower, "/inventory") {
		return models.ModuleInventory
	}
	if strings.Contains(pathLower, "/billing") || strings.Contains(pathLower, "/bills") {
		return models.ModuleBilling
	}
	if strings.Contains(pathLower, "/payments") {
		return models.ModulePayments
	}
	if strings.Contains(pathLower, "/notifications") {
		return models.ModuleNotifications
	}
	if strings.Contains(pathLower, "/reports") {
		return models.ModuleReports
	}
	if strings.Contains(pathLower, "/upload") {
		return models.ModuleUpload
	}

	return models.ModuleSystem
}

// jsonToBSONRaw converts a JSON byte slice to a *bson.Raw suitable for MongoDB storage.
// Returns nil if the bytes are not valid JSON or cannot be marshalled to BSON.
func jsonToBSONRaw(jsonBytes []byte) *bson.Raw {
	var v interface{}
	if err := json.Unmarshal(jsonBytes, &v); err != nil {
		return nil // not valid JSON — skip
	}
	data, err := bson.Marshal(bson.M{"data": v})
	if err != nil {
		return nil
	}
	raw := bson.Raw(data)
	return &raw
}
