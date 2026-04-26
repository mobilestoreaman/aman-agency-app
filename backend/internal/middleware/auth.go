package middleware

import (
	"errors"
	"strings"

	appjwt "aman-agency/backend/pkg/jwt"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"

	"github.com/gofiber/fiber/v2"
)

// Context key constants — used by handlers to read authenticated identity.
const (
	LocalUserID    = "auth_user_id"
	LocalUserRole  = "auth_user_role"
	LocalUserEmail = "auth_user_email"
)

// Authenticate returns a middleware that requires a valid Bearer access token.
// On success it stores user claims in c.Locals for downstream handlers.
// On failure it returns 401 Unauthorized.
func Authenticate(jwtManager *appjwt.Manager) fiber.Handler {
	return func(c *fiber.Ctx) error {
		raw := c.Get(fiber.HeaderAuthorization)
		if raw == "" {
			return apperror.Unauthorized("missing Authorization header")
		}

		// Accept "Bearer <token>" format only
		parts := strings.SplitN(raw, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			return apperror.Unauthorized("malformed Authorization header — expected: Bearer <token>")
		}

		claims, err := jwtManager.ParseAccessToken(parts[1])
		if err != nil {
			if errors.Is(err, appjwt.ErrExpired) {
				return apperror.Unauthorized("access token has expired")
			}
			return apperror.Unauthorized("access token is invalid")
		}

		// Inject identity into request context
		c.Locals(LocalUserID, claims.UserID)
		c.Locals(LocalUserRole, claims.Role)
		c.Locals(LocalUserEmail, claims.Email)

		return c.Next()
	}
}

// GetUserID extracts the authenticated user's ID string from context.
// Returns an empty string if called outside an authenticated route rather than
// panicking, which prevents a server crash on middleware misconfiguration.
func GetUserID(c *fiber.Ctx) string {
	v, _ := c.Locals(LocalUserID).(string)
	return v
}

// GetUserRole extracts the authenticated user's role from context.
// Returns an empty string if not set (safe fallback instead of panic).
func GetUserRole(c *fiber.Ctx) string {
	v, _ := c.Locals(LocalUserRole).(string)
	return v
}

// GetUserEmail extracts the authenticated user's email from context.
func GetUserEmail(c *fiber.Ctx) string {
	v, _ := c.Locals(LocalUserEmail).(string)
	return v
}

// IsAdmin returns true when the authenticated user holds the admin role.
func IsAdmin(c *fiber.Ctx) bool {
	return GetUserRole(c) == string(models.RoleAdmin)
}
