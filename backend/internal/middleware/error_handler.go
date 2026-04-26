package middleware

import (
	"errors"
	"net/http"

	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// ErrorHandler is Fiber's global error handler — registered on the app config,
// not as a middleware chain. It intercepts every error returned by a handler
// and maps it to the correct HTTP status + JSON body.
//
// Error priority:
//  1. *fiber.Error  — Fiber built-in (404, 405, etc.)
//  2. *apperror.AppError — our domain errors
//  3. validator.ValidationErrors — request DTO errors
//  4. everything else → 500 (cause logged, not exposed)
func ErrorHandler(c *fiber.Ctx, err error) error {
	// 1. Fiber built-in errors (e.g. route not found)
	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		return response.Error(c, fiberErr.Code, fiberErr.Message)
	}

	// 2. Application domain errors
	var appErr *apperror.AppError
	if errors.As(err, &appErr) {
		if appErr.Code >= http.StatusInternalServerError {
			log.Error().
				Err(appErr.Cause).
				Str("path", c.Path()).
				Msg("internal application error")
		}
		return response.Error(c, appErr.Code, appErr.Message)
	}

	// 3. Validation errors from go-playground/validator
	var validationErrs validator.ValidationErrors
	if errors.As(err, &validationErrs) {
		return response.ValidationError(c, formatValidationErrors(validationErrs))
	}

	// 4. Unknown / unexpected errors — log cause, hide detail from client
	log.Error().
		Err(err).
		Str("path", c.Path()).
		Str("method", c.Method()).
		Msg("unhandled error")

	return response.InternalError(c)
}

// fieldError is the shape sent back to the client for validation failures.
type fieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func formatValidationErrors(errs validator.ValidationErrors) []fieldError {
	out := make([]fieldError, 0, len(errs))
	for _, e := range errs {
		out = append(out, fieldError{
			Field:   toSnakeCase(e.Field()),
			Message: validationMessage(e),
		})
	}
	return out
}

func validationMessage(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return "this field is required"
	case "email":
		return "must be a valid email address"
	case "min":
		return "value is too short (min: " + e.Param() + ")"
	case "max":
		return "value is too long (max: " + e.Param() + ")"
	case "oneof":
		return "must be one of: " + e.Param()
	case "e164":
		return "must be a valid phone number in E.164 format"
	default:
		return "invalid value"
	}
}

// toSnakeCase converts a PascalCase field name to snake_case for API responses.
func toSnakeCase(s string) string {
	var result []rune
	for i, r := range s {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				result = append(result, '_')
			}
			result = append(result, r+32)
		} else {
			result = append(result, r)
		}
	}
	return string(result)
}
