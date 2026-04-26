package middleware

import (
	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"

	"github.com/gofiber/fiber/v2"
)

// RequireRole returns a middleware that allows only users whose role is in
// the provided list. Must be chained after Authenticate.
//
// Example — admin-only route:
//
//	api.Delete("/users/:id", middleware.RequireRole(models.RoleAdmin), ctrl.Delete)
//
// Example — admin or staff:
//
//	api.Get("/inventory", middleware.RequireRole(models.RoleAdmin, models.RoleStaff), ctrl.List)
func RequireRole(roles ...models.UserRole) fiber.Handler {
	// Pre-compute a lookup set for O(1) checks
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[string(r)] = struct{}{}
	}

	return func(c *fiber.Ctx) error {
		role, ok := c.Locals(LocalUserRole).(string)
		if !ok || role == "" {
			// Means Authenticate middleware was not applied first
			return apperror.Unauthorized("authentication required")
		}

		if _, permitted := allowed[role]; !permitted {
			return apperror.Forbidden("you do not have permission to perform this action")
		}

		return c.Next()
	}
}

// AdminOnly is a convenience alias for RequireRole(RoleAdmin).
func AdminOnly() fiber.Handler {
	return RequireRole(models.RoleAdmin)
}

// AnyStaff is a convenience alias for RequireRole(RoleAdmin, RoleStaff).
// Use this for routes that both roles can access.
func AnyStaff() fiber.Handler {
	return RequireRole(models.RoleAdmin, models.RoleStaff)
}
