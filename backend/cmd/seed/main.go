// seed — one-shot command that bootstraps a production database.
//
// Run once after first deploy (or in CI):
//
//	go run ./cmd/seed
//
// Environment variables required (same as the main server):
//
//	MONGO_URI, MONGO_DB, JWT_SECRET, ENCRYPTION_KEY
//
// Optional overrides:
//
//	SEED_ADMIN_NAME     (default: "Admin")
//	SEED_ADMIN_EMAIL    (default: "admin@amanagency.com")
//	SEED_ADMIN_PASSWORD (default: auto-generated, printed to stdout ONCE)
//
// The command is idempotent: it skips creation if any admin already exists.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/platform/database"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// Human-readable logs for this one-shot command
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: "15:04:05"})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// ── Connect ──────────────────────────────────────────────────────────────
	db, err := database.Connect(&cfg.Mongo)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to MongoDB")
	}
	defer func() {
		dctx, dcancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer dcancel()
		_ = db.Disconnect(dctx)
	}()

	// ── Ensure indexes first ──────────────────────────────────────────────────
	if err := db.EnsureIndexes(ctx); err != nil {
		log.Fatal().Err(err).Msg("index migration failed")
	}

	// ── Check if any admin already exists ────────────────────────────────────
	users := db.DB.Collection("users")
	count, err := users.CountDocuments(ctx, bson.M{"role": string(models.RoleAdmin)})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to query users")
	}
	if count > 0 {
		log.Info().Msg("admin user already exists — skipping seed")
		os.Exit(0)
	}

	// ── Resolve credentials ───────────────────────────────────────────────────
	name := getEnv("SEED_ADMIN_NAME", "Admin")
	email := getEnv("SEED_ADMIN_EMAIL", "admin@amanagency.com")
	password := os.Getenv("SEED_ADMIN_PASSWORD")

	generated := false
	if password == "" {
		// Auto-generate a secure random password
		password = uuid.NewString()[:16] + "Aa1!" // meets typical complexity reqs
		generated = true
	}

	// ── Hash password ─────────────────────────────────────────────────────────
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to hash password")
	}

	// ── Insert admin user ─────────────────────────────────────────────────────
	now := time.Now()
	admin := models.User{
		ID:           primitive.NewObjectID(),
		Name:         name,
		Email:        email,
		PasswordHash: string(hash),
		Role:         models.RoleAdmin,
		IsActive:     true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if _, err := users.InsertOne(ctx, admin); err != nil {
		log.Fatal().Err(err).Msg("failed to insert admin user")
	}

	// ── Print credentials ─────────────────────────────────────────────────────
	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════╗")
	fmt.Println("║       Aman Agency — Seed Complete        ║")
	fmt.Println("╠══════════════════════════════════════════╣")
	fmt.Printf( "║  Name  : %-32s║\n", name)
	fmt.Printf( "║  Email : %-32s║\n", email)
	if generated {
		fmt.Printf("║  Pass  : %-32s║\n", password)
		fmt.Println("║  ⚠️  Save this password — shown once!    ║")
	} else {
		fmt.Println("║  Pass  : (provided via SEED_ADMIN_PASSWORD) ║")
	}
	fmt.Println("╚══════════════════════════════════════════╝")
	fmt.Println()

	log.Info().Str("email", email).Str("role", "admin").Msg("admin user created successfully")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
