// Package response provides a consistent JSON envelope for all API responses.
//
// Success shape:
//
//	{ "success": true,  "data": {...},  "meta": {...} }
//
// Error shape:
//
//	{ "success": false, "error": "message", "details": [...] }
package response

import (
	"github.com/gofiber/fiber/v2"
)

// Meta carries pagination and context metadata for list responses.
type Meta struct {
	Page       int   `json:"page,omitempty"`
	Limit      int   `json:"limit,omitempty"`
	Total      int64 `json:"total,omitempty"`
	TotalPages int   `json:"total_pages,omitempty"`
}

// envelope is the internal structure used for all responses.
type envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Details interface{} `json:"details,omitempty"` // validation field errors
	Meta    *Meta       `json:"meta,omitempty"`
}

// ── Success responses ─────────────────────────────────────────────────────────

// OK sends HTTP 200 with data payload.
func OK(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusOK).JSON(envelope{
		Success: true,
		Data:    data,
	})
}

// OKWithMeta sends HTTP 200 with data + pagination meta.
func OKWithMeta(c *fiber.Ctx, data interface{}, meta *Meta) error {
	return c.Status(fiber.StatusOK).JSON(envelope{
		Success: true,
		Data:    data,
		Meta:    meta,
	})
}

// Created sends HTTP 201 with the newly created resource.
func Created(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusCreated).JSON(envelope{
		Success: true,
		Data:    data,
	})
}

// NoContent sends HTTP 204 (no body).
func NoContent(c *fiber.Ctx) error {
	return c.SendStatus(fiber.StatusNoContent)
}

// ── Error responses ───────────────────────────────────────────────────────────

// Error sends a JSON error with the given HTTP status.
func Error(c *fiber.Ctx, status int, message string) error {
	return c.Status(status).JSON(envelope{
		Success: false,
		Error:   message,
	})
}

// ValidationError sends HTTP 422 with per-field error details.
func ValidationError(c *fiber.Ctx, details interface{}) error {
	return c.Status(fiber.StatusUnprocessableEntity).JSON(envelope{
		Success: false,
		Error:   "validation failed",
		Details: details,
	})
}

// BadRequest sends HTTP 400.
func BadRequest(c *fiber.Ctx, message string) error {
	return Error(c, fiber.StatusBadRequest, message)
}

// Unauthorized sends HTTP 401.
func Unauthorized(c *fiber.Ctx, message string) error {
	if message == "" {
		message = "unauthorized"
	}
	return Error(c, fiber.StatusUnauthorized, message)
}

// Forbidden sends HTTP 403.
func Forbidden(c *fiber.Ctx, message string) error {
	if message == "" {
		message = "forbidden"
	}
	return Error(c, fiber.StatusForbidden, message)
}

// NotFound sends HTTP 404.
func NotFound(c *fiber.Ctx, message string) error {
	if message == "" {
		message = "resource not found"
	}
	return Error(c, fiber.StatusNotFound, message)
}

// Conflict sends HTTP 409.
func Conflict(c *fiber.Ctx, message string) error {
	return Error(c, fiber.StatusConflict, message)
}

// InternalError sends HTTP 500 (never exposes cause to client).
func InternalError(c *fiber.Ctx) error {
	return Error(c, fiber.StatusInternalServerError, "an internal error occurred")
}
