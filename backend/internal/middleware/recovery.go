package middleware

import (
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// Recovery catches any panic in a handler, logs it with a stack trace,
// and returns a safe HTTP 500 response to the client.
func Recovery() fiber.Handler {
	return func(c *fiber.Ctx) (err error) {
		defer func() {
			if r := recover(); r != nil {
				log.Error().
					Interface("panic", r).
					Str("path", c.Path()).
					Str("method", c.Method()).
					Msg("recovered from panic")

				err = response.InternalError(c)
			}
		}()
		return c.Next()
	}
}
