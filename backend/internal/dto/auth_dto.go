// Package dto defines Data Transfer Objects for HTTP request/response bodies.
// Validation tags are read by pkg/validator at the controller layer.
package dto

// ── Auth ──────────────────────────────────────────────────────────────────────

// LoginRequest is the body of POST /api/v1/auth/login
type LoginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required,min=8,max=72"`
}

// LoginResponse is returned on successful login.
type LoginResponse struct {
	AccessToken  string   `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
	TokenType    string   `json:"token_type"`  // always "Bearer"
	ExpiresIn    int      `json:"expires_in"`  // access token TTL in seconds
	User         UserInfo `json:"user"`
}

// RefreshRequest is the body of POST /api/v1/auth/refresh
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// ChangePasswordRequest is the body of POST /api/v1/auth/change-password
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password"     validate:"required,min=8,max=72"`
}

// ── User management (admin only) ─────────────────────────────────────────────

// CreateUserRequest is the body of POST /api/v1/users  (admin only)
type CreateUserRequest struct {
	Name     string `json:"name"     validate:"required,min=2,max=100"`
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required,min=8,max=72"`
	Role     string `json:"role"     validate:"required,oneof=admin staff"`
}

// UpdateUserRequest is the body of PATCH /api/v1/users/:id  (admin only)
type UpdateUserRequest struct {
	Name     string `json:"name"      validate:"omitempty,min=2,max=100"`
	IsActive *bool  `json:"is_active" validate:"omitempty"`
	Role     string `json:"role"      validate:"omitempty,oneof=admin staff"`
}

// ── Shared response shapes ────────────────────────────────────────────────────

// UserInfo is the safe user representation returned in all auth responses.
// Never includes password hash.
type UserInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}
