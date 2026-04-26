package controller

import (
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/service"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/response"
	appvalidator "aman-agency/backend/pkg/validator"

	"github.com/gofiber/fiber/v2"
)

// AuthController handles all authentication and user-management endpoints.
type AuthController struct {
	authSvc  service.AuthService
	auditSvc service.AuditService
}

// NewAuthController constructs an AuthController with its service dependency.
func NewAuthController(authSvc service.AuthService, auditSvc service.AuditService) *AuthController {
	return &AuthController{authSvc: authSvc, auditSvc: auditSvc}
}

// Login handles POST /api/v1/auth/login
// @Summary      Authenticate user
// @Description  Validates credentials and returns a JWT access + refresh token pair
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.LoginRequest true "Credentials"
// @Success      200  {object} dto.LoginResponse
// @Failure      401  {object} response.envelope
// @Router       /auth/login [post]
func (ctrl *AuthController) Login(c *fiber.Ctx) error {
	var req dto.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	resp, err := ctrl.authSvc.Login(c.Context(), req)
	if err != nil {
		return err
	}
	return response.OK(c, resp)
}

// Refresh handles POST /api/v1/auth/refresh
// @Summary      Rotate token pair
// @Description  Exchanges a valid refresh token for a new access + refresh pair
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.RefreshRequest true "Refresh token"
// @Success      200  {object} dto.LoginResponse
// @Failure      401  {object} response.envelope
// @Router       /auth/refresh [post]
func (ctrl *AuthController) Refresh(c *fiber.Ctx) error {
	var req dto.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	resp, err := ctrl.authSvc.Refresh(c.Context(), req)
	if err != nil {
		return err
	}
	return response.OK(c, resp)
}

// Logout handles POST /api/v1/auth/logout  [protected]
// Stateless JWT — we can't invalidate server-side. The client must discard tokens.
// A 200 response signals the client to clear its storage.
// @Summary      Logout
// @Description  Stateless logout — client must discard tokens. Server returns 200.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Router       /auth/logout [post]
func (ctrl *AuthController) Logout(c *fiber.Ctx) error {
	return response.OK(c, fiber.Map{"message": "logged out successfully"})
}

// Me handles GET /api/v1/auth/me  [protected]
// @Summary      Get current user
// @Description  Returns the profile of the authenticated user
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} dto.UserInfo
// @Router       /auth/me [get]
func (ctrl *AuthController) Me(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	info, err := ctrl.authSvc.Me(c.Context(), userID)
	if err != nil {
		return err
	}
	return response.OK(c, info)
}

// ChangePassword handles POST /api/v1/auth/change-password  [protected]
// @Summary      Change password
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  dto.ChangePasswordRequest  true  "Old and new password"
// @Success      200   {object}  map[string]interface{}
// @Failure      400   {object}  map[string]interface{}
// @Router       /auth/change-password [post]
func (ctrl *AuthController) ChangePassword(c *fiber.Ctx) error {
	var req dto.ChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	userID := middleware.GetUserID(c)
	if err := ctrl.authSvc.ChangePassword(c.Context(), userID, req); err != nil {
		return err
	}
	return response.OK(c, fiber.Map{"message": "password changed successfully"})
}

// ── User management (admin only) ─────────────────────────────────────────────

// CreateUser handles POST /api/v1/users  [admin only]
// @Summary      Create user
// @Tags         users
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      dto.CreateUserRequest  true  "New user data"
// @Success      201   {object}  dto.UserInfo
// @Failure      409   {object}  map[string]interface{}  "Email already exists"
// @Router       /users [post]
func (ctrl *AuthController) CreateUser(c *fiber.Ctx) error {
	var req dto.CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	info, err := ctrl.authSvc.CreateUser(c.Context(), req)
	if err != nil {
		return err
	}

	// Log the user creation for audit trail
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionUserCreate, "user", info.ID, map[string]interface{}{
		"email": info.Email,
		"role":  info.Role,
		"name":  info.Name,
	})

	return response.Created(c, info)
}

// UpdateUser handles PATCH /api/v1/users/:id  [admin only]
// @Summary      Update user
// @Tags         users
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      string                 true  "User ObjectID"
// @Param        body  body      dto.UpdateUserRequest  true  "Fields to update"
// @Success      200   {object}  dto.UserInfo
// @Failure      404   {object}  map[string]interface{}
// @Router       /users/{id} [patch]
func (ctrl *AuthController) UpdateUser(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return apperror.BadRequest("user ID is required")
	}

	var req dto.UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return apperror.BadRequest("invalid request body")
	}
	if err := appvalidator.Struct(req); err != nil {
		return err
	}

	info, err := ctrl.authSvc.UpdateUser(c.Context(), id, req)
	if err != nil {
		return err
	}

	// Log the user update for audit trail
	changes := make(map[string]interface{})
	if req.Name != "" {
		changes["name"] = req.Name
	}
	if req.Role != "" {
		changes["role"] = req.Role
	}
	if req.IsActive != nil {
		changes["is_active"] = *req.IsActive
	}
	ctrl.auditSvc.Log(c.Context(), c, models.AuditActionUserUpdate, "user", id, changes)

	return response.OK(c, info)
}

// ListUsers handles GET /api/v1/users  [admin only]
// @Summary      List all users
// @Tags         users
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}  dto.UserInfo
// @Router       /users [get]
func (ctrl *AuthController) ListUsers(c *fiber.Ctx) error {
	users, err := ctrl.authSvc.ListUsers(c.Context())
	if err != nil {
		return err
	}
	return response.OK(c, users)
}
