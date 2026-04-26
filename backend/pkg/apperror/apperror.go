// Package apperror defines domain-level error types for the application.
// Controllers and services return these errors; the global error handler
// maps them to the appropriate HTTP status codes.
package apperror

import (
	"fmt"
	"net/http"
)

// Error code constants for programmatic error handling
const (
	ErrCodeValidation      = "VALIDATION_FAILED"
	ErrCodeNotFound        = "NOT_FOUND"
	ErrCodeConflict        = "CONFLICT"
	ErrCodeUnauthorized    = "UNAUTHORIZED"
	ErrCodeForbidden       = "FORBIDDEN"
	ErrCodeInternal        = "INTERNAL_ERROR"
	ErrCodeBadRequest      = "BAD_REQUEST"
)

// AppError is the base error type. It carries an HTTP status code,
// a user-facing message, an optional error code for programmatic handling,
// and an optional internal cause for logging.
type AppError struct {
	Code      int    // HTTP status code
	Message   string // user-facing message (safe to expose)
	ErrorCode string // optional error code for programmatic error handling
	Cause     error  // internal cause (logged only, never sent to client)
}

func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("[%d] %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("[%d] %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error { return e.Cause }

// ── Constructors ─────────────────────────────────────────────────────────────

func New(code int, message string) *AppError {
	return &AppError{Code: code, Message: message}
}

func NewWithCode(code int, message, errorCode string) *AppError {
	return &AppError{Code: code, Message: message, ErrorCode: errorCode}
}

func Wrap(code int, message string, cause error) *AppError {
	return &AppError{Code: code, Message: message, Cause: cause}
}

func WrapWithCode(code int, message, errorCode string, cause error) *AppError {
	return &AppError{Code: code, Message: message, ErrorCode: errorCode, Cause: cause}
}

// ── Typed constructors ────────────────────────────────────────────────────────

func NotFound(resource string) *AppError {
	return NewWithCode(http.StatusNotFound, fmt.Sprintf("%s not found", resource), ErrCodeNotFound)
}

func Conflict(message string) *AppError {
	return NewWithCode(http.StatusConflict, message, ErrCodeConflict)
}

func Unauthorized(message string) *AppError {
	if message == "" {
		message = "unauthorized"
	}
	return NewWithCode(http.StatusUnauthorized, message, ErrCodeUnauthorized)
}

func Forbidden(message string) *AppError {
	if message == "" {
		message = "you do not have permission to perform this action"
	}
	return NewWithCode(http.StatusForbidden, message, ErrCodeForbidden)
}

func BadRequest(message string) *AppError {
	return NewWithCode(http.StatusBadRequest, message, ErrCodeBadRequest)
}

func ValidationFailed(message string) *AppError {
	return NewWithCode(http.StatusUnprocessableEntity, message, ErrCodeValidation)
}

func Internal(cause error) *AppError {
	return WrapWithCode(http.StatusInternalServerError, "an internal error occurred", ErrCodeInternal, cause)
}

// ── Type checks ───────────────────────────────────────────────────────────────

func IsNotFound(err error) bool     { return isCode(err, http.StatusNotFound) }
func IsUnauthorized(err error) bool { return isCode(err, http.StatusUnauthorized) }
func IsForbidden(err error) bool    { return isCode(err, http.StatusForbidden) }
func IsConflict(err error) bool     { return isCode(err, http.StatusConflict) }

func isCode(err error, code int) bool {
	if err == nil {
		return false
	}
	if e, ok := err.(*AppError); ok {
		return e.Code == code
	}
	return false
}
