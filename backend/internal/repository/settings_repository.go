package repository

import (
	"context"
	"time"

	"aman-agency/backend/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// SettingsRepository manages the singleton Settings document.
// There is exactly one document per store, keyed by store_id == "default".
type SettingsRepository interface {
	// Get returns the current settings, creating a default document if none exists.
	Get(ctx context.Context) (*models.Settings, error)

	// Upsert applies a $set update to the singleton document, creating it on the
	// first call. Returns the updated document.
	Upsert(ctx context.Context, fields bson.M) (*models.Settings, error)
}

type settingsRepository struct {
	col *mongo.Collection
}

// NewSettingsRepository constructs a SettingsRepository.
func NewSettingsRepository(db *mongo.Database) SettingsRepository {
	return &settingsRepository{col: db.Collection("settings")}
}

// Get retrieves the singleton settings document, upserting a safe default when
// the collection is empty (e.g. first boot after a fresh deployment).
func (r *settingsRepository) Get(ctx context.Context) (*models.Settings, error) {
	// Attempt a plain find first (fast path — document already exists).
	var s models.Settings
	err := r.col.FindOne(ctx, bson.M{"store_id": models.DefaultStoreID}).Decode(&s)
	if err == nil {
		return &s, nil
	}
	if err != mongo.ErrNoDocuments {
		return nil, err
	}

	// First boot: insert a default document and return it.
	defaults := bson.M{
		"$setOnInsert": bson.M{
			"store_name":          "New Aman Agency",
			"currency":            "PKR",
			"default_tax_pct":     0.0,
			"low_stock_threshold": 3,
			"credit_ceiling":      0.0,
			"updated_by":          "system",
			"created_at":          time.Now().UTC(),
			"updated_at":          time.Now().UTC(),
		},
	}
	after := options.After
	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(after)

	err = r.col.FindOneAndUpdate(
		ctx,
		bson.M{"store_id": models.DefaultStoreID},
		defaults,
		opts,
	).Decode(&s)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Upsert applies the given $set fields to the singleton and returns the
// resulting document. Called by the service layer after building the update map.
func (r *settingsRepository) Upsert(ctx context.Context, fields bson.M) (*models.Settings, error) {
	fields["updated_at"] = time.Now().UTC()

	after := options.After
	opts := options.FindOneAndUpdate().
		SetUpsert(true).
		SetReturnDocument(after)

	var s models.Settings
	err := r.col.FindOneAndUpdate(
		ctx,
		bson.M{"store_id": models.DefaultStoreID},
		bson.M{
			"$set": fields,
			"$setOnInsert": bson.M{
				"store_id":   models.DefaultStoreID,
				"created_at": time.Now().UTC(),
			},
		},
		opts,
	).Decode(&s)
	if err != nil {
		return nil, err
	}
	return &s, nil
}
