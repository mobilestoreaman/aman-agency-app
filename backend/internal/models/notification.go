package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// NotificationType classifies what triggered the notification.
type NotificationType string

const (
	// NotificationTypeLowStock fires when a device status aggregation shows
	// available stock for a product falls below the configured threshold.
	NotificationTypeLowStock NotificationType = "low_stock"

	// NotificationTypeOverdue fires when a BorrowLend is marked overdue.
	NotificationTypeOverdue NotificationType = "overdue"

	// NotificationTypeCreditDue fires when a customer's credit balance
	// exceeds a configured ceiling or a payment becomes overdue.
	NotificationTypeCreditDue NotificationType = "credit_due"

	// NotificationTypeSaleCancel fires when a sale is cancelled.
	NotificationTypeSaleCancel NotificationType = "sale_cancel"

	// NotificationTypeGeneral covers manually created announcements or reminders.
	NotificationTypeGeneral NotificationType = "general"
)

// NotificationStatus tracks whether a staff member has seen the notification.
type NotificationStatus string

const (
	NotificationStatusUnread    NotificationStatus = "unread"
	NotificationStatusRead      NotificationStatus = "read"
	NotificationStatusDismissed NotificationStatus = "dismissed"
)

// Notification is a stored in-app alert. Notifications are created by service
// hooks (e.g. SaleService.Cancel, BorrowLendService.MarkOverdue) or manually
// by an admin. They are scoped per-recipient (empty RecipientEmail = broadcast
// to all staff).
type Notification struct {
	ID             primitive.ObjectID  `bson:"_id,omitempty"         json:"id"`
	Type           NotificationType    `bson:"type"                  json:"type"`
	Title          string              `bson:"title"                 json:"title"`
	Body           string              `bson:"body"                  json:"body"`
	Status         NotificationStatus  `bson:"status"                json:"status"`
	RecipientEmail string              `bson:"recipient_email,omitempty" json:"recipient_email,omitempty"` // empty = broadcast
	CustomerID     *primitive.ObjectID `bson:"customer_id,omitempty" json:"customer_id,omitempty"`
	SaleID         *primitive.ObjectID `bson:"sale_id,omitempty"     json:"sale_id,omitempty"`
	RefID          string              `bson:"ref_id,omitempty"      json:"ref_id,omitempty"` // generic entity ID string for deep-link
	CreatedBy      string              `bson:"created_by"            json:"created_by"`        // "system" or staff email
	CreatedAt      time.Time           `bson:"created_at"            json:"created_at"`
	ReadAt         *time.Time          `bson:"read_at,omitempty"     json:"read_at,omitempty"`
}
