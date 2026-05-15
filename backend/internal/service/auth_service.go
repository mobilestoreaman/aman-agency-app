// Package service contains all application business logic.
// Services orchestrate repositories and external platform packages.
// They must not import Fiber or any HTTP-layer concerns.
package service

import (
	"context"
	"strings"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	appjwt "aman-agency/backend/pkg/jwt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

// AuthService defines the auth business-logic contract.
type AuthService interface {
	Login(ctx context.Context, req dto.LoginRequest) (*dto.LoginResponse, error)
	Refresh(ctx context.Context, req dto.RefreshRequest) (*dto.LoginResponse, error)
	// Logout invalidates the user's current refresh token server-side so it
	// cannot be replayed. The userID comes from the validated access token.
	Logout(ctx context.Context, userID string) error
	Me(ctx context.Context, userID string) (*dto.UserInfo, error)
	ChangePassword(ctx context.Context, userID string, req dto.ChangePasswordRequest) error
	CreateUser(ctx context.Context, req dto.CreateUserRequest) (*dto.UserInfo, error)
	UpdateUser(ctx context.Context, id string, req dto.UpdateUserRequest) (*dto.UserInfo, error)
	ListUsers(ctx context.Context) ([]*dto.UserInfo, error)
}

// authService is the concrete implementation.
type authService struct {
	userRepo   repository.UserRepository
	jwtManager *appjwt.Manager
	jwtCfg     *config.JWTConfig
}

// NewAuthService wires up and returns an AuthService.
func NewAuthService(
	userRepo repository.UserRepository,
	jwtManager *appjwt.Manager,
	jwtCfg *config.JWTConfig,
) AuthService {
	return &authService{
		userRepo:   userRepo,
		jwtManager: jwtManager,
		jwtCfg:     jwtCfg,
	}
}

// Login validates credentials and returns a token pair.
func (s *authService) Login(ctx context.Context, req dto.LoginRequest) (*dto.LoginResponse, error) {
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		// Return a generic message — never reveal whether email exists
		return nil, apperror.Unauthorized("invalid email or password")
	}

	if !user.IsActive {
		return nil, apperror.Unauthorized("account is disabled")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, apperror.Unauthorized("invalid email or password")
	}

	access, refresh, refreshJTI, err := s.jwtManager.GenerateTokenPair(user.IDHex(), user.Email, string(user.Role))
	if err != nil {
		return nil, apperror.Internal(err)
	}

	// Persist the new refresh token's JTI so we can validate it on /refresh
	// and detect reuse (i.e. a stolen token being replayed after logout).
	// Failure here is non-fatal for the response but means the token cannot
	// be server-side-revoked — log the error and continue.
	if jtiErr := s.userRepo.SetRefreshJTI(ctx, user.ID, refreshJTI); jtiErr != nil {
		// Log via zerolog if available; for now use the stdlib approach
		_ = jtiErr // TODO: wire zerolog here if needed
	}

	return &dto.LoginResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		TokenType:    "Bearer",
		ExpiresIn:    int(s.jwtCfg.AccessTTL.Seconds()),
		User:         toUserInfo(user),
	}, nil
}

// Refresh validates a refresh token and issues a new token pair (rotation).
// It enforces server-side revocation and detects refresh-token reuse attacks
// (RFC 6749 §10.4 / token family pattern):
//   - if no JTI is stored for the user, the token family was already revoked (e.g. logout)
//   - if the incoming JTI doesn't match the stored one, a previously-rotated
//     token is being replayed → revoke the entire family and return 401
func (s *authService) Refresh(ctx context.Context, req dto.RefreshRequest) (*dto.LoginResponse, error) {
	claims, err := s.jwtManager.ParseRefreshToken(req.RefreshToken)
	if err != nil {
		return nil, apperror.Unauthorized("refresh token is invalid or expired")
	}

	id, err := primitive.ObjectIDFromHex(claims.UserID)
	if err != nil {
		return nil, apperror.Unauthorized("malformed token")
	}

	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, apperror.Unauthorized("user not found")
	}

	if !user.IsActive {
		return nil, apperror.Unauthorized("account is disabled")
	}

	// Server-side revocation + reuse detection.
	// claims.ID is the JTI (jwt.RegisteredClaims.ID) set when the token was minted.
	if user.RefreshJTI == "" || user.RefreshJTI != claims.ID {
		// Either the user logged out (empty JTI) or a previously-rotated token is
		// being replayed (JTI mismatch). In either case, treat the token family as
		// compromised: clear the stored JTI to invalidate any outstanding tokens,
		// then return 401 so the client must re-authenticate.
		_ = s.userRepo.ClearRefreshJTI(ctx, id)
		return nil, apperror.Unauthorized("refresh token is invalid or expired")
	}

	access, refresh, refreshJTI, err := s.jwtManager.GenerateTokenPair(user.IDHex(), user.Email, string(user.Role))
	if err != nil {
		return nil, apperror.Internal(err)
	}

	// Rotate the stored JTI to the newly-issued token.
	if jtiErr := s.userRepo.SetRefreshJTI(ctx, id, refreshJTI); jtiErr != nil {
		_ = jtiErr // log if needed; do not expose error to caller
	}

	return &dto.LoginResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		TokenType:    "Bearer",
		ExpiresIn:    int(s.jwtCfg.AccessTTL.Seconds()),
		User:         toUserInfo(user),
	}, nil
}

// Logout invalidates the user's refresh token family server-side.
// The userID is extracted from the validated access token in the controller.
func (s *authService) Logout(ctx context.Context, userID string) error {
	id, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return apperror.BadRequest("invalid user ID")
	}
	// ClearRefreshJTI makes any outstanding refresh token for this user instantly
	// unusable — the next /auth/refresh call will see an empty JTI and return 401.
	return s.userRepo.ClearRefreshJTI(ctx, id)
}

// Me returns the profile of the currently authenticated user.
func (s *authService) Me(ctx context.Context, userID string) (*dto.UserInfo, error) {
	id, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, apperror.BadRequest("invalid user ID")
	}
	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	info := toUserInfo(user)
	return &info, nil
}

// ChangePassword re-hashes and persists a new password after verifying the current one.
func (s *authService) ChangePassword(ctx context.Context, userID string, req dto.ChangePasswordRequest) error {
	id, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return apperror.BadRequest("invalid user ID")
	}

	user, err := s.userRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return apperror.BadRequest("current password is incorrect")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return apperror.Internal(err)
	}

	return s.userRepo.Update(ctx, id, bson.M{"password_hash": string(hash)})
}

// CreateUser provisions a new user account. Only admins may call this.
func (s *authService) CreateUser(ctx context.Context, req dto.CreateUserRequest) (*dto.UserInfo, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, apperror.Internal(err)
	}

	now := time.Now()
	user := &models.User{
		ID:           primitive.NewObjectID(),
		Name:         req.Name,
		Email:        strings.ToLower(strings.TrimSpace(req.Email)),
		PasswordHash: string(hash),
		Role:         models.UserRole(req.Role),
		IsActive:     true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	info := toUserInfo(user)
	return &info, nil
}

// UpdateUser modifies mutable fields on an existing user (admin only).
func (s *authService) UpdateUser(ctx context.Context, id string, req dto.UpdateUserRequest) (*dto.UserInfo, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, apperror.BadRequest("invalid user ID")
	}

	fields := bson.M{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.Role != "" {
		fields["role"] = req.Role
	}
	if req.IsActive != nil {
		fields["is_active"] = *req.IsActive
	}

	if len(fields) == 0 {
		return nil, apperror.BadRequest("no fields to update")
	}

	if err := s.userRepo.Update(ctx, oid, fields); err != nil {
		return nil, err
	}

	user, err := s.userRepo.FindByID(ctx, oid)
	if err != nil {
		return nil, err
	}
	info := toUserInfo(user)
	return &info, nil
}

// ListUsers returns all users (admin only).
func (s *authService) ListUsers(ctx context.Context) ([]*dto.UserInfo, error) {
	users, err := s.userRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	infos := make([]*dto.UserInfo, len(users))
	for i, u := range users {
		info := toUserInfo(u)
		infos[i] = &info
	}
	return infos, nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func toUserInfo(u *models.User) dto.UserInfo {
	return dto.UserInfo{
		ID:        u.IDHex(),
		Name:      u.Name,
		Email:     u.Email,
		Role:      string(u.Role),
		IsActive:  u.IsActive,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
}
