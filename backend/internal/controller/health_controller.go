package controller

import (
	"context"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// Pinger is satisfied by database.Client — keeps controller decoupled from MongoDB.
type Pinger interface {
	Ping(ctx context.Context) error
}

// HealthController handles the /api/health endpoint.
type HealthController struct {
	cfg     *config.AppConfig
	db      Pinger
	startAt time.Time
}

// NewHealthController creates a new HealthController.
func NewHealthController(cfg *config.AppConfig, db Pinger) *HealthController {
	return &HealthController{
		cfg:     cfg,
		db:      db,
		startAt: time.Now(),
	}
}

// healthResponse is the JSON shape returned by the health endpoint.
type healthResponse struct {
	Status    string `json:"status"`
	Env       string `json:"env"`
	Version   string `json:"version"`
	Uptime    string `json:"uptime"`
	MongoMS   int64  `json:"mongo_ping_ms"`
	MongoOK   bool   `json:"mongo_ok"`
}

// Check handles GET /api/health
// Returns 200 when healthy, 503 when MongoDB is unreachable.
// @Summary      Health check
// @Description  Returns application status and MongoDB ping latency.
// @Tags         health
// @Produce      json
// @Success      200  {object}  healthResponse
// @Failure      503  {object}  healthResponse  "MongoDB unreachable"
// @Router       /health [get]
func (h *HealthController) Check(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 3*time.Second)
	defer cancel()

	mongoOK := true
	var mongoMS int64

	start := time.Now()
	if err := h.db.Ping(ctx); err != nil {
		mongoOK = false
		mongoMS = -1
	} else {
		mongoMS = time.Since(start).Milliseconds()
	}

	res := healthResponse{
		Status:  "ok",
		Env:     h.cfg.Env,
		Version: h.cfg.Version,
		Uptime:  time.Since(h.startAt).Round(time.Second).String(),
		MongoMS: mongoMS,
		MongoOK: mongoOK,
	}

	if !mongoOK {
		res.Status = "degraded"
		return c.Status(fiber.StatusServiceUnavailable).JSON(res)
	}

	return response.OK(c, res)
}
