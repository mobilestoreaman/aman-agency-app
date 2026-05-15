// main.go — Aman Agency Backend
// Entry point: loads config, connects to MongoDB, bootstraps Fiber,
// registers routes, starts the server, and handles graceful shutdown.
//
// @title           Aman Agency API
// @version         1.0
// @description     Inventory and sales management backend for Aman Agency mobile store.
// @basePath        /api/v1
// @securityDefinitions.apikey BearerAuth
// @in              header
// @name            Authorization
// @description     Enter: Bearer {token}
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/routes"
	"aman-agency/backend/platform/database"
	_ "aman-agency/backend/docs" // registers embedded swagger spec

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// Version is injected at build time via -ldflags.
var Version = "dev"

func main() {
	// ── 1. Load configuration ────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}
	cfg.App.Version = Version

	// ── 2. Init logger (must happen before any log calls) ────────────
	middleware.InitLogger(&cfg.App)
	log.Info().
		Str("env", cfg.App.Env).
		Str("version", cfg.App.Version).
		Msg("starting Aman Agency backend")

	// ── 3. Connect to MongoDB ────────────────────────────────────────
	dbClient, err := database.Connect(&cfg.Mongo)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to MongoDB")
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := dbClient.Disconnect(ctx); err != nil {
			log.Error().Err(err).Msg("error disconnecting MongoDB")
		}
	}()

	// ── 4. Run index migrations ──────────────────────────────────────
	migCtx, migCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer migCancel()
	if err := dbClient.EnsureIndexes(migCtx); err != nil {
		log.Fatal().Err(err).Msg("failed to run index migrations")
	}

	// ── 4b. Run data migrations ──────────────────────────────────────
	dataMigCtx, dataMigCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer dataMigCancel()
	if err := dbClient.RunDataMigrations(dataMigCtx); err != nil {
		log.Fatal().Err(err).Msg("failed to run data migrations")
	}

	// ── 5. Bootstrap Fiber ───────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:           "Aman Agency API",
		ServerHeader:      "",         // don't leak server info
		StrictRouting:     true,
		CaseSensitive:     true,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		BodyLimit:         10 * 1024 * 1024, // 10 MB (for base64 invoice payloads)
		EnablePrintRoutes: cfg.IsDevelopment(),
		ErrorHandler:      middleware.ErrorHandler,
		// Trust X-Real-IP set by the nginx reverse proxy so c.IP() returns
		// the real client IP and per-IP rate limiting works correctly.
		ProxyHeader:    "X-Real-Ip",
		TrustedProxies: []string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12"},
	})

	// ── 6. Register routes ───────────────────────────────────────────
	routes.Setup(app, dbClient, cfg)

	// ── 7. Start server (non-blocking) ───────────────────────────────
	addr := ":" + cfg.App.Port
	go func() {
		log.Info().Str("addr", addr).Msg("server listening")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	// ── 8. Graceful shutdown on SIGTERM / SIGINT ──────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	sig := <-quit

	log.Info().Str("signal", sig.String()).Msg("shutdown signal received")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("error during graceful shutdown")
	}

	log.Info().Msg("server stopped cleanly")
}
