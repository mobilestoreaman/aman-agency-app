// Package pagination provides helpers for parsing and applying cursor-free
// offset pagination from HTTP query parameters.
package pagination

import (
	"math"

	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

const (
	DefaultPage  = 1
	DefaultLimit = 20
	MaxLimit     = 100
	MaxPage      = 1000
)

// Params holds the parsed pagination values ready for MongoDB skip/limit.
type Params struct {
	Page  int
	Limit int
	Skip  int64 // (Page-1) * Limit — passed directly to MongoDB FindOptions
}

// FromCtx parses ?page= and ?limit= from the request query string.
// Invalid or out-of-range values are clamped to safe defaults.
func FromCtx(c *fiber.Ctx) Params {
	page := c.QueryInt("page", DefaultPage)
	limit := c.QueryInt("limit", DefaultLimit)

	if page < 1 {
		page = 1
	}
	if page > MaxPage {
		page = MaxPage
	}
	if limit < 1 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}

	return Params{
		Page:  page,
		Limit: limit,
		Skip:  int64((page - 1) * limit),
	}
}

// ToMeta converts pagination params + a total count into a response.Meta
// that carries page, limit, total, and total_pages for the client.
func ToMeta(p Params, total int64) *response.Meta {
	totalPages := int(math.Ceil(float64(total) / float64(p.Limit)))
	if totalPages < 1 {
		totalPages = 1
	}
	return &response.Meta{
		Page:       p.Page,
		Limit:      p.Limit,
		Total:      total,
		TotalPages: totalPages,
	}
}

// Normalize ensures valid pagination values
func (p *Params) Normalise() {
	if p.Page <= 0 {
		p.Page = DefaultPage
	}
	if p.Page > MaxPage {
		p.Page = MaxPage
	}
	if p.Limit <= 0 {
		p.Limit = DefaultLimit
	}
	if p.Limit > MaxLimit {
		p.Limit = MaxLimit
	}
}

// Offset calculates MongoDB skip value
func (p *Params) Offset() int {
	return (p.Page - 1) * p.Limit
}
