package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// UserRole constrains the set of valid roles to a closed enum.
type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleStaff UserRole = "staff"
)

// ValidRoles is the authoritative list used for validation.
var ValidRoles = []UserRole{RoleAdmin, RoleStaff}

// User represents an authenticated operator of the system.
// The PasswordHash field is never serialised to JSON — it is only
// read from and written to MongoDB.
type User struct {
	ID           primitive.ObjectID `bson:"_id,omitempty"      json:"-"`
	Name         string             `bson:"name"               json:"name"`
	Email        string             `bson:"email"              json:"email"`
	PasswordHash string             `bson:"password_hash"      json:"-"` // never in API responses
	Role         UserRole           `bson:"role"               json:"role"`
	IsActive     bool               `bson:"is_active"          json:"is_active"`
	CreatedAt    time.Time          `bson:"created_at"         json:"created_at"`
	UpdatedAt    time.Time          `bson:"updated_at"         json:"updated_at"`
}

// IDHex returns the ObjectID as a lowercase hex string.
func (u *User) IDHex() string {
	return u.ID.Hex()
}

// IsAdmin returns true when the user holds the admin role.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}
