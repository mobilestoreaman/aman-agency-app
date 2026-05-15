package config

import (
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all application configuration loaded from environment variables.
// All required fields are validated at startup — the app refuses to start if any
// are missing, preventing silent misconfiguration in production.
type Config struct {
	App      AppConfig
	Mongo    MongoConfig
	JWT      JWTConfig
	Crypto   CryptoConfig
	WhatsApp WhatsAppConfig
	PDF      PDFConfig
	Upload   UploadConfig
	CORS     CORSConfig
}

type AppConfig struct {
	Env     string // production | development
	Port    string
	Version string
}

type MongoConfig struct {
	URI      string
	Database string
}

type JWTConfig struct {
	Secret     string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

type CryptoConfig struct {
	// 32-byte hex-encoded key for AES-GCM encryption of sensitive fields
	EncryptionKey string
}

type WhatsAppConfig struct {
	Provider   string // twilio | 360dialog | waba
	APIKey     string
	FromNumber string
}

type PDFConfig struct {
	StoragePath   string
	StaticBaseURL string
}

type UploadConfig struct {
	StoragePath   string // local root for all uploaded files, served at /static/
	StaticBaseURL string // public URL prefix, e.g. http://localhost/static
}

type CORSConfig struct {
	AllowedOrigins string
}

// Load reads config from environment variables.
// In non-production environments it also attempts to load a .env file.
func Load() (*Config, error) {
	// Load .env only in local development (not inside Docker containers).
	// We detect Docker by checking whether MONGO_URI is already set — if it is,
	// env vars were injected by Docker Compose / env_file and we must NOT override them.
	// godotenv.Load() does not overwrite already-set vars, but a blank string set by
	// a failed ${VAR} substitution in an environment: block IS "already set", so
	// we guard on MONGO_URI being non-empty to be safe.
	if os.Getenv("APP_ENV") != "production" && os.Getenv("MONGO_URI") == "" {
		_ = godotenv.Load()
	}

	cfg := &Config{}

	// ── App ─────────────────────────────────────────────────────────
	cfg.App.Env = getEnv("APP_ENV", "development")
	cfg.App.Port = getEnv("APP_PORT", "3000")
	cfg.App.Version = getEnv("APP_VERSION", "dev")

	// ── MongoDB ──────────────────────────────────────────────────────
	cfg.Mongo.URI = mustGetEnv("MONGO_URI")
	cfg.Mongo.Database = mustGetEnv("MONGO_DB")

	// ── JWT ──────────────────────────────────────────────────────────
	cfg.JWT.Secret = mustGetEnv("JWT_SECRET")
	if len(cfg.JWT.Secret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters long (got %d)", len(cfg.JWT.Secret))
	}

	accessTTL, err := parseDuration("JWT_ACCESS_TTL", "15m")
	if err != nil {
		return nil, err
	}
	cfg.JWT.AccessTTL = accessTTL

	refreshTTL, err := parseDuration("JWT_REFRESH_TTL", "168h")
	if err != nil {
		return nil, err
	}
	cfg.JWT.RefreshTTL = refreshTTL

	// ── Encryption ───────────────────────────────────────────────────
	cfg.Crypto.EncryptionKey = mustGetEnv("ENCRYPTION_KEY")

	// ── WhatsApp ─────────────────────────────────────────────────────
	cfg.WhatsApp.Provider = getEnv("WA_PROVIDER", "twilio")
	cfg.WhatsApp.APIKey = getEnv("WA_API_KEY", "")
	cfg.WhatsApp.FromNumber = getEnv("WA_FROM_NUMBER", "")

	// ── PDF ──────────────────────────────────────────────────────────
	cfg.PDF.StoragePath = getEnv("PDF_STORAGE_PATH", "/app/storage/invoices")
	cfg.PDF.StaticBaseURL = getEnv("STATIC_BASE_URL", "http://localhost/static")

	// ── Upload ───────────────────────────────────────────────────────
	cfg.Upload.StoragePath = getEnv("UPLOAD_STORAGE_PATH", "./storage")
	cfg.Upload.StaticBaseURL = getEnv("STATIC_BASE_URL", "http://localhost/static")

	// ── CORS ─────────────────────────────────────────────────────────
	cfg.CORS.AllowedOrigins = getEnv("CORS_ALLOWED_ORIGINS", "http://localhost")

	return cfg, nil
}

// IsDevelopment returns true when running outside production.
func (c *Config) IsDevelopment() bool {
	return c.App.Env != "production"
}

// ── helpers ──────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// mustGetEnv panics with a clear message if a required variable is absent.
func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		// Use fmt.Errorf pattern so callers can bubble it up cleanly
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}

func parseDuration(key, fallback string) (time.Duration, error) {
	raw := getEnv(key, fallback)
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid duration for %s=%q: %w", key, raw, err)
	}
	return d, nil
}

