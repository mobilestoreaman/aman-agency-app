package dto

import (
	"time"
)

// ─── Request DTOs ─────────────────────────────────────────────────────────────

// CreateNotificationRequest is used by admins to post a manual notification.
type CreateNotificationRequest struct {
	Type           string `json:"type"             validate:"required,oneof=low_stock overdue credit_due sale_cancel general"`
	Title          string `json:"title"            validate:"required,max=120"`
	Body           string `json:"body"             validate:"required,min=1,max=1000"`
	RecipientEmail string `json:"recipient_email"` // empty = broadcast to all staff
	CustomerID     string `json:"customer_id"`     // optional, links to a customer record
	SaleID         string `json:"sale_id"`         // optional, links to a sale record
	RefID          string `json:"ref_id"`          // optional, generic deep-link ID
}

// ─── Filter ───────────────────────────────────────────────────────────────────

// NotificationFilter controls list queries.
type NotificationFilter struct {
	Status string `query:"status"` // unread | read | dismissed
	Type   string `query:"type"`
	Page   int    `query:"page"`
	Limit  int    `query:"limit"`
}

// ─── Response DTO ─────────────────────────────────────────────────────────────

// NotificationResponse is the external representation of a Notification.
type NotificationResponse struct {
	ID             string     `json:"id"`
	Type           string     `json:"type"`
	Title          string     `json:"title"`
	Body           string     `json:"body"`
	Status         string     `json:"status"`
	RecipientEmail string     `json:"recipient_email,omitempty"`
	CustomerID     string     `json:"customer_id,omitempty"`
	SaleID         string     `json:"sale_id,omitempty"`
	RefID          string     `json:"ref_id,omitempty"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	ReadAt         *time.Time `json:"read_at,omitempty"`
}

// UnreadCountResponse is the lightweight payload for the badge-count endpoint.
type UnreadCountResponse struct {
	Count int64 `json:"count"`
}
