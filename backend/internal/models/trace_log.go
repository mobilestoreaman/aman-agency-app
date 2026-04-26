package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Log level constants
const (
	LogLevelDEBUG = "DEBUG"
	LogLevelINFO  = "INFO"
	LogLevelWARN  = "WARN"
	LogLevelERROR = "ERROR"
)

// Module constants
const (
	ModuleAuth          = "Auth"
	ModuleSales         = "Sales"
	ModuleInventory     = "Inventory"
	ModuleBilling       = "Billing"
	ModulePayments      = "Payments"
	ModuleNotifications = "Notifications"
	ModuleReports       = "Reports"
	ModuleSystem        = "System"
	ModuleUpload        = "Upload"
)

// Log status constants
const (
	StatusSuccess = "success"
	StatusFailure = "failure"
)

// TraceLog represents a single structured log entry persisted to MongoDB.
// It tracks both HTTP requests (via middleware) and custom business events (via logger helper).
type TraceLog struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"               json:"id"`
	TraceID         string             `bson:"trace_id"                   json:"trace_id"`        // correlates entire request journey
	SpanID          string             `bson:"span_id"                    json:"span_id"`         // unique per log entry (uuid)
	Level           string             `bson:"level"                      json:"level"`           // DEBUG, INFO, WARN, ERROR
	Module          string             `bson:"module"                     json:"module"`          // Auth, Sales, Inventory, etc.
	Message         string             `bson:"message"                    json:"message"`         // short human description
	Method          string             `bson:"method,omitempty"           json:"method,omitempty"`
	Path            string             `bson:"path,omitempty"             json:"path,omitempty"`
	StatusCode      int                `bson:"status_code,omitempty"      json:"status_code,omitempty"`
	LatencyMs       int64              `bson:"latency_ms,omitempty"       json:"latency_ms,omitempty"`
	UserID          string             `bson:"user_id,omitempty"          json:"user_id,omitempty"`
	UserEmail       string             `bson:"user_email,omitempty"       json:"user_email,omitempty"`
	UserRole        string             `bson:"user_role,omitempty"        json:"user_role,omitempty"`
	IPAddress       string             `bson:"ip_address"                 json:"ip_address"`
	RequestPayload  *bson.Raw          `bson:"request_payload,omitempty"  json:"request_payload,omitempty"`  // DO NOT log sensitive fields
	ResponsePayload *bson.Raw          `bson:"response_payload,omitempty" json:"response_payload,omitempty"` // DO NOT log sensitive fields
	ErrorMessage    string             `bson:"error_message,omitempty"    json:"error_message,omitempty"`
	StackTrace      string             `bson:"stack_trace,omitempty"      json:"stack_trace,omitempty"`
	Status          string             `bson:"status"                     json:"status"`          // success, failure
	Tags            []string           `bson:"tags,omitempty"             json:"tags,omitempty"`  // searchable tags e.g. ["invoice:INV-001", "imei:123"]
	Metadata        bson.M             `bson:"metadata,omitempty"         json:"metadata,omitempty"` // flexible extra fields
	CreatedAt       time.Time          `bson:"created_at"                 json:"created_at"`
}
