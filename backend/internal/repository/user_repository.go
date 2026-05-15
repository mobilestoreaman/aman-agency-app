// Package repository defines data-access interfaces and their MongoDB implementations.
// Services depend only on the interface — never on the concrete struct.
// This keeps services testable and decoupled from the database driver.
package repository

import (
	"context"
	"errors"
	"time"

	"aman-agency/backend/internal/models"
	"aman-agency/backend/pkg/apperror"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// UserRepository is the contract the auth service depends on.
type UserRepository interface {
	Create(ctx context.Context, user *models.User) error
	FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	Update(ctx context.Context, id primitive.ObjectID, fields bson.M) error
	List(ctx context.Context) ([]*models.User, error)
	ExistsAny(ctx context.Context) (bool, error)
	// SetRefreshJTI persists the JTI of the user's current valid refresh token.
	// Must be called after every successful login or token rotation.
	SetRefreshJTI(ctx context.Context, id primitive.ObjectID, jti string) error
	// ClearRefreshJTI removes the stored JTI, invalidating all outstanding
	// refresh tokens for this user. Called on logout and on reuse detection.
	ClearRefreshJTI(ctx context.Context, id primitive.ObjectID) error
}

// mongoUserRepository is the MongoDB implementation of UserRepository.
type mongoUserRepository struct {
	col *mongo.Collection
}

// NewUserRepository constructs a UserRepository backed by MongoDB.
func NewUserRepository(db *mongo.Database) UserRepository {
	return &mongoUserRepository{
		col: db.Collection("users"),
	}
}

// Create inserts a new user document.
// Returns apperror.Conflict if the email already exists.
func (r *mongoUserRepository) Create(ctx context.Context, user *models.User) error {
	_, err := r.col.InsertOne(ctx, user)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return apperror.Conflict("a user with this email already exists")
		}
		return apperror.Internal(err)
	}
	return nil
}

// FindByID retrieves a user by their ObjectID.
func (r *mongoUserRepository) FindByID(ctx context.Context, id primitive.ObjectID) (*models.User, error) {
	var user models.User
	err := r.col.FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, apperror.NotFound("user")
		}
		return nil, apperror.Internal(err)
	}
	return &user, nil
}

// FindByEmail retrieves a user by their email address (case-sensitive).
func (r *mongoUserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.col.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, apperror.NotFound("user")
		}
		return nil, apperror.Internal(err)
	}
	return &user, nil
}

// Update applies a partial update to a user document.
// Only the fields present in `fields` are modified; updated_at is always set.
func (r *mongoUserRepository) Update(ctx context.Context, id primitive.ObjectID, fields bson.M) error {
	fields["updated_at"] = time.Now()
	result, err := r.col.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": fields},
	)
	if err != nil {
		return apperror.Internal(err)
	}
	if result.MatchedCount == 0 {
		return apperror.NotFound("user")
	}
	return nil
}

// List returns all users ordered by creation date descending.
func (r *mongoUserRepository) List(ctx context.Context) ([]*models.User, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := r.col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, apperror.Internal(err)
	}
	defer cursor.Close(ctx)

	var users []*models.User
	if err := cursor.All(ctx, &users); err != nil {
		return nil, apperror.Internal(err)
	}
	return users, nil
}

// ExistsAny returns true if at least one user document exists in the collection.
func (r *mongoUserRepository) ExistsAny(ctx context.Context) (bool, error) {
	count, err := r.col.CountDocuments(ctx, bson.M{}, options.Count().SetLimit(1))
	if err != nil {
		return false, apperror.Internal(err)
	}
	return count > 0, nil
}

// SetRefreshJTI stores the JTI of the user's active refresh token.
// Replaces any previously stored JTI so only one refresh token is ever valid.
func (r *mongoUserRepository) SetRefreshJTI(ctx context.Context, id primitive.ObjectID, jti string) error {
	result, err := r.col.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$set": bson.M{"refresh_jti": jti, "updated_at": time.Now()}},
	)
	if err != nil {
		return apperror.Internal(err)
	}
	if result.MatchedCount == 0 {
		return apperror.NotFound("user")
	}
	return nil
}

// ClearRefreshJTI removes the stored JTI, invalidating all outstanding refresh
// tokens for this user. Called on logout and on refresh-token reuse detection.
func (r *mongoUserRepository) ClearRefreshJTI(ctx context.Context, id primitive.ObjectID) error {
	result, err := r.col.UpdateOne(
		ctx,
		bson.M{"_id": id},
		bson.M{"$unset": bson.M{"refresh_jti": ""}, "$set": bson.M{"updated_at": time.Now()}},
	)
	if err != nil {
		return apperror.Internal(err)
	}
	if result.MatchedCount == 0 {
		return apperror.NotFound("user")
	}
	return nil
}
