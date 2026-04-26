package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AuditLog records admin/staff actions for compliance and debugging.
type AuditLog struct {
	ID         primitive.ObjectID     `bson:"_id,omitempty"       json:"id"`
	ActorID    primitive.ObjectID     `bson:"actor_id"            json:"actor_id"`
	ActorEmail string                 `bson:"actor_email"         json:"actor_email"`
	ActorRole  string                 `bson:"actor_role"          json:"actor_role"`
	Action     string                 `bson:"action"              json:"action"`        // e.g. "user.create"
	Resource   string                 `bson:"resource"            json:"resource"`      // e.g. "user"
	ResourceID string                 `bson:"resource_id"         json:"resource_id"`
	Changes    map[string]interface{} `bson:"changes,omitempty"   json:"changes,omitempty"`
	IPAddress  string                 `bson:"ip_address"          json:"ip_address"`
	RequestID  string                 `bson:"request_id"          json:"request_id"`
	CreatedAt  time.Time              `bson:"created_at"          json:"created_at"`
}

// Common audit action constants
const (
	AuditActionUserCreate      = "user.create"
	AuditActionUserUpdate      = "user.update"
	AuditActionUserDelete      = "user.delete"
	AuditActionUserDeactivate  = "user.deactivate"
	AuditActionBillVoid        = "bill.void"
	AuditActionSaleCancel      = "sale.cancel"
	AuditActionCreditAdjust    = "credit.adjust"
	AuditActionSettingsUpdate  = "settings.update"
	AuditActionPasswordReset   = "user.password_reset"
)
