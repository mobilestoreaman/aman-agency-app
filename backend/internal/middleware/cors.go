package middleware

import (
	"strings"

	"aman-agency/backend/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

// CORS returns a configured CORS middleware.
// Allowed origins are sourced from config so they can vary per environment.
func CORS(cfg *config.CORSConfig) fiber.Handler {
	origins := cfg.AllowedOrigins
	if origins == "" {
		origins = "http://localhost"
	}

	// Normalise: trim spaces around commas
	parts := strings.Split(origins, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	origins = strings.Join(parts, ",")

	// Startup-time guard: panic if CORS misconfiguration detected
	// (wildcard origins cannot be combined with AllowCredentials=true)
	for _, o := range strings.Split(origins, ",") {
		if strings.TrimSpace(o) == "*" {
			panic("CORS misconfiguration: AllowCredentials cannot be true when AllowOrigins contains '*'")
		}
	}

	return cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Request-ID",
		ExposeHeaders:    "Content-Length,Content-Range",
		AllowCredentials: true,
		MaxAge:           86400, // 24 h preflight cache
	})
}
