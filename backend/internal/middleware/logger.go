// Package middleware provides Fiber middleware for the application.
package middleware

import (
	"os"
	"time"

	"aman-agency/backend/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// InitLogger configures the global zerolog logger.
// Development: human-readable console output with colour.
// Production:  structured JSON to stdout (captured by Docker log driver).
func InitLogger(cfg *config.AppConfig) {
	zerolog.TimeFieldFormat = time.RFC3339

	if cfg.Env != "production" {
		log.Logger = log.Output(
			zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: "15:04:05",
			},
		).With().
			Str("service", "aman-agency-backend").
			Logger()
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		log.Logger = zerolog.New(os.Stdout).
			With().
			Timestamp().
			Str("service", "aman-agency-backend").
			Str("version", cfg.Version).
			Logger()
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}
}

// RequestLogger returns a Fiber middleware that logs every HTTP request
// in a structured format. Skips health check endpoints to reduce noise.
func RequestLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Skip health endpoint logging in production
		if c.Path() == "/api/health" {
			return c.Next()
		}

		start := time.Now()
		err := c.Next()
		duration := time.Since(start)

		status := c.Response().StatusCode()

		event := log.Info()
		if status >= 500 {
			event = log.Error()
		} else if status >= 400 {
			event = log.Warn()
		}

		// Include request_id if RequestID middleware ran before this one
		reqID, _ := c.Locals(LocalRequestID).(string)

		event.
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", status).
			Dur("latency", duration).
			Str("ip", c.IP()).
			Str("request_id", reqID).
			// Str("user_agent", c.Get(fiber.HeaderUserAgent)).
			Msg("request")

		return err
	}
}
