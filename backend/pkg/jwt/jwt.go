// Package jwt provides token generation and validation for the application.
//
// Two token types are issued:
//   - Access token  : short-lived (15 min), carries userID + email + role
//   - Refresh token : long-lived  (7 days),  carries only userID + type claim
//
// Both are signed with HMAC-SHA256 using the secret from config.
// The Manager is safe for concurrent use.
package jwt

import (
	"errors"
	"fmt"
	"time"

	"aman-agency/backend/internal/config"

	gojwt "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ── Claim types ───────────────────────────────────────────────────────────────

// AccessClaims is the payload of an access token.
type AccessClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	gojwt.RegisteredClaims
}

// RefreshClaims is the minimal payload of a refresh token.
type RefreshClaims struct {
	UserID    string `json:"user_id"`
	TokenType string `json:"token_type"` // always "refresh"
	gojwt.RegisteredClaims
}

// ── Manager ───────────────────────────────────────────────────────────────────

// Manager handles signing and parsing of JWT tokens.
type Manager struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewManager creates a Manager from application JWT config.
func NewManager(cfg *config.JWTConfig) *Manager {
	return &Manager{
		secret:     []byte(cfg.Secret),
		accessTTL:  cfg.AccessTTL,
		refreshTTL: cfg.RefreshTTL,
	}
}

// GenerateAccessToken mints a signed access token for the given user.
func (m *Manager) GenerateAccessToken(userID, email, role string) (string, error) {
	claims := AccessClaims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: gojwt.RegisteredClaims{
			ID:        uuid.NewString(),
			Issuer:    "aman-agency",
			IssuedAt:  gojwt.NewNumericDate(time.Now()),
			ExpiresAt: gojwt.NewNumericDate(time.Now().Add(m.accessTTL)),
		},
	}
	return gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// GenerateRefreshToken mints a signed refresh token carrying only the userID.
// It returns both the signed token string and the JTI (JWT ID) that uniquely
// identifies this token — callers should persist the JTI for revocation checks.
func (m *Manager) GenerateRefreshToken(userID string) (tokenString, jti string, err error) {
	jti = uuid.NewString()
	claims := RefreshClaims{
		UserID:    userID,
		TokenType: "refresh",
		RegisteredClaims: gojwt.RegisteredClaims{
			ID:        jti,
			Issuer:    "aman-agency",
			IssuedAt:  gojwt.NewNumericDate(time.Now()),
			ExpiresAt: gojwt.NewNumericDate(time.Now().Add(m.refreshTTL)),
		},
	}
	tokenString, err = gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims).SignedString(m.secret)
	return tokenString, jti, err
}

// GenerateTokenPair returns a fresh (accessToken, refreshToken, refreshJTI) triple.
// refreshJTI is the JWT ID of the new refresh token; persist it in the user record
// to enable server-side token revocation and refresh-token reuse detection.
func (m *Manager) GenerateTokenPair(userID, email, role string) (access, refresh, refreshJTI string, err error) {
	access, err = m.GenerateAccessToken(userID, email, role)
	if err != nil {
		return "", "", "", fmt.Errorf("generate access token: %w", err)
	}
	refresh, refreshJTI, err = m.GenerateRefreshToken(userID)
	if err != nil {
		return "", "", "", fmt.Errorf("generate refresh token: %w", err)
	}
	return access, refresh, refreshJTI, nil
}

// ParseAccessToken validates and parses an access token string.
// Returns ErrExpired if the token has expired (caller may prompt refresh).
func (m *Manager) ParseAccessToken(raw string) (*AccessClaims, error) {
	token, err := gojwt.ParseWithClaims(raw, &AccessClaims{}, m.keyFunc)
	if err != nil {
		if errors.Is(err, gojwt.ErrTokenExpired) {
			return nil, ErrExpired
		}
		return nil, ErrInvalid
	}
	claims, ok := token.Claims.(*AccessClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalid
	}
	return claims, nil
}

// ParseRefreshToken validates and parses a refresh token string.
func (m *Manager) ParseRefreshToken(raw string) (*RefreshClaims, error) {
	token, err := gojwt.ParseWithClaims(raw, &RefreshClaims{}, m.keyFunc)
	if err != nil {
		if errors.Is(err, gojwt.ErrTokenExpired) {
			return nil, ErrExpired
		}
		return nil, ErrInvalid
	}
	claims, ok := token.Claims.(*RefreshClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalid
	}
	if claims.TokenType != "refresh" {
		return nil, ErrInvalid
	}
	return claims, nil
}

// ── Sentinel errors ───────────────────────────────────────────────────────────

var (
	ErrExpired = errors.New("token has expired")
	ErrInvalid = errors.New("token is invalid")
)

// ── private ───────────────────────────────────────────────────────────────────

func (m *Manager) keyFunc(t *gojwt.Token) (interface{}, error) {
	// Pin the algorithm to exactly HS256. Accepting any *gojwt.SigningMethodHMAC
	// would allow HS384 and HS512 tokens — or "none" algorithm tokens in older
	// library versions — to pass validation. Checking the concrete method pointer
	// is the safest approach.
	if t.Method != gojwt.SigningMethodHS256 {
		return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
	}
	return m.secret, nil
}
