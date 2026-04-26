package controller

import (
	"github.com/gofiber/fiber/v2"
)

const (
	defaultPage  = 1
	defaultLimit = 20
	maxLimit     = 100
)

// parsePagination extracts and validates page/limit query params.
// Returns page (1-based) and limit (capped at maxLimit).
func parsePagination(c *fiber.Ctx) (page, limit int) {
	page = c.QueryInt("page", defaultPage)
	limit = c.QueryInt("limit", defaultLimit)
	if page < 1 {
		page = defaultPage
	}
	if limit < 1 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	return page, limit
}
