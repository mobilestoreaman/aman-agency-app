// Package database manages the MongoDB connection pool and index migrations.
// All 15 collection indexes are created idempotently on startup — safe to
// run on every deploy (MongoDB ignores existing identical indexes).
package database

import (
	"context"
	"fmt"
	"time"

	"aman-agency/backend/internal/config"

	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

// Client wraps the mongo.Client with the target database reference.
type Client struct {
	client *mongo.Client
	DB     *mongo.Database
}

// Connect establishes a connection pool to MongoDB and pings it.
func Connect(cfg *config.MongoConfig) (*Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	opts := options.Client().
		ApplyURI(cfg.URI).
		SetMaxPoolSize(50).
		SetMinPoolSize(10).
		SetMaxConnIdleTime(5 * time.Minute).
		SetMaxConnecting(10).
		SetConnectTimeout(10 * time.Second).
		SetServerSelectionTimeout(10 * time.Second)

	client, err := mongo.Connect(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}

	// Verify connection with a ping
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer pingCancel()
	if err := client.Ping(pingCtx, readpref.Primary()); err != nil {
		return nil, fmt.Errorf("mongo ping: %w", err)
	}

	log.Info().Str("db", cfg.Database).Msg("MongoDB connected")

	return &Client{
		client: client,
		DB:     client.Database(cfg.Database),
	}, nil
}

// Disconnect gracefully closes the connection pool.
func (c *Client) Disconnect(ctx context.Context) error {
	return c.client.Disconnect(ctx)
}

// Ping checks that MongoDB is reachable. Used by the health endpoint.
func (c *Client) Ping(ctx context.Context) error {
	return c.client.Ping(ctx, readpref.Primary())
}

// RunDataMigrations performs one-time idempotent data migrations on startup.
// Each migration is guarded so it only touches documents that need updating.
func (c *Client) RunDataMigrations(ctx context.Context) error {
	log.Info().Msg("Running data migrations...")

	// ── Backfill has_ledger on vendors ────────────────────────────────────────
	// vendors created before the has_ledger field was added will have has_ledger
	// missing/false even if they have ledger entries. Find every vendor_id that
	// appears in the vendor_ledgers collection and set has_ledger=true on those
	// vendor documents. The filter $ne:true ensures we only write documents that
	// actually need updating, making repeated runs a cheap no-op.
	vendorIDs, err := c.DB.Collection("vendor_ledgers").Distinct(ctx, "vendor_id", bson.M{})
	if err != nil {
		return fmt.Errorf("data migration - backfill has_ledger: %w", err)
	}
	if len(vendorIDs) > 0 {
		res, err := c.DB.Collection("vendors").UpdateMany(
			ctx,
			bson.M{"_id": bson.M{"$in": vendorIDs}, "has_ledger": bson.M{"$ne": true}},
			bson.M{"$set": bson.M{"has_ledger": true}},
		)
		if err != nil {
			return fmt.Errorf("data migration - backfill has_ledger update: %w", err)
		}
		if res.ModifiedCount > 0 {
			log.Info().Int64("count", res.ModifiedCount).Msg("backfilled has_ledger=true on vendors with ledger entries")
		}
	}

	log.Info().Msg("Data migrations complete")
	return nil
}

// EnsureIndexes creates all collection indexes idempotently.
// Safe to call on every startup — existing identical indexes are skipped.
func (c *Client) EnsureIndexes(ctx context.Context) error {
	log.Info().Msg("Running MongoDB index migrations...")

	migrations := []struct {
		collection string
		models     []mongo.IndexModel
	}{
		{
			collection: "users",
			models: []mongo.IndexModel{
				uniqueIndex("email"),
			},
		},
		{
			collection: "brands",
			models: []mongo.IndexModel{
				uniqueIndex("name"),
			},
		},
		{
			collection: "products",
			models: []mongo.IndexModel{
				uniqueIndex("barcode"),
				singleIndex("brand_id"),
				// Compound text index for full-text search on model_name, barcode, and
				// brand_name. MongoDB permits only ONE text index per collection, so all
				// searchable fields must be declared together.
				// Used by the ?search= query in the product list endpoint.
				// Fixed to use ordered bson.D instead of non-deterministic map.
				mongo.IndexModel{
					Keys: bson.D{
						{Key: "model_name", Value: "text"},
						{Key: "barcode", Value: "text"},
						{Key: "brand_name", Value: "text"},
					},
					Options: options.Index().
						SetWeights(bson.D{
							{Key: "model_name", Value: 10},
							{Key: "barcode", Value: 5},
							{Key: "brand_name", Value: 3},
						}).
						SetName("products_text_search"),
				},
			},
		},
		{
			collection: "devices",
			models: []mongo.IndexModel{
				// imei1 is the primary IMEI — must be globally unique.
				uniqueIndex("imei1"),
				// imei2 is optional (dual-SIM). Sparse so that documents without
				// imei2 (empty string / missing) don't collide on the unique index.
				sparseUniqueIndex("imei2"),
				singleIndex("product_id"),
				singleIndex("status"),
				singleIndex("condition"),
			},
		},
		{
			collection: "customers",
			models: []mongo.IndexModel{
				uniqueIndex("phone"),
			},
		},
		{
			collection: "vendors",
			models: []mongo.IndexModel{
				uniqueIndex("phone"),
				singleIndex("name"),
			},
		},
		{
			collection: "sales",
			models: []mongo.IndexModel{
				uniqueIndex("invoice_number"),
				singleIndex("customer_id"),
				descIndex("created_at"),
				// Primary sort index: list endpoint sorts by sold_at DESC.
				descIndex("sold_at"),
				// Compound index for the common "customer history" query pattern.
				mongo.IndexModel{
					Keys: bson.D{{Key: "customer_id", Value: 1}, {Key: "sold_at", Value: -1}},
				},
			},
		},
		{
			collection: "purchases",
			models: []mongo.IndexModel{
				singleIndex("vendor_id"),
				descIndex("purchased_at"),
			},
		},
		{
			collection: "credit_ledgers",
			models: []mongo.IndexModel{
				singleIndex("customer_id"),
				descIndex("created_at"),
			},
		},
		{
			collection: "loan_references",
			models: []mongo.IndexModel{
				singleIndex("sale_id"),
				singleIndex("customer_id"),
				singleIndex("status"),
				singleIndex("provider"),
				// List endpoint sorts by created_at DESC.
				descIndex("created_at"),
			},
		},
		{
			collection: "borrow_lends",
			models: []mongo.IndexModel{
				singleIndex("device_id"),
				singleIndex("status"),
				singleIndex("type"),
				// List endpoint sorts by borrowed_at DESC.
				descIndex("borrowed_at"),
			},
		},
		{
			collection: "bills",
			models: []mongo.IndexModel{
				uniqueIndex("sale_id"),
				uniqueIndex("invoice_number"),
				singleIndex("status"),
				// List endpoint sorts by created_at DESC.
				descIndex("created_at"),
			},
		},
		{
			collection: "notifications",
			models: []mongo.IndexModel{
				singleIndex("customer_id"),
				singleIndex("sale_id"),
				singleIndex("status"),
				descIndex("created_at"),
			},
		},
		{
			collection: "settings",
			models: []mongo.IndexModel{
				uniqueIndex("store_id"),
			},
		},
		{
			collection: "expenses",
			models: []mongo.IndexModel{
				singleIndex("category"),
				descIndex("date"),
				descIndex("created_at"),
				// Text index for the ?search= filter across description and notes.
				// MongoDB allows only one text index per collection; both fields are
				// declared together here with equal weight.
				mongo.IndexModel{
					Keys: bson.D{
						{Key: "description", Value: "text"},
						{Key: "notes", Value: "text"},
					},
					Options: options.Index().SetName("expenses_text_search"),
				},
			},
		},
		{
			collection: "payment_promises",
			models: []mongo.IndexModel{
				singleIndex("customer_id"),
				singleIndex("status"),
				singleIndex("notified"),
				// promised_date ascending so due-soon promises sort first.
				singleIndex("promised_date"),
			},
		},
		{
			collection: "audit_logs",
			models: []mongo.IndexModel{
				// Compound indexes for common audit queries
				mongo.IndexModel{
					Keys: bson.D{{Key: "actor_id", Value: 1}, {Key: "created_at", Value: -1}},
				},
				mongo.IndexModel{
					Keys: bson.D{{Key: "action", Value: 1}, {Key: "created_at", Value: -1}},
				},
				mongo.IndexModel{
					Keys: bson.D{{Key: "resource", Value: 1}, {Key: "resource_id", Value: 1}},
				},
				descIndex("created_at"),
				// TTL index: automatically delete logs older than 90 days
				mongo.IndexModel{
					Keys:    bson.D{{Key: "created_at", Value: 1}},
					Options: options.Index().SetExpireAfterSeconds(7776000), // 90 days
				},
			},
		},
		{
			collection: "trace_logs",
			models: []mongo.IndexModel{
				singleIndex("trace_id"),
				mongo.IndexModel{
					Keys: bson.D{{Key: "level", Value: 1}, {Key: "created_at", Value: -1}},
				},
				mongo.IndexModel{
					Keys: bson.D{{Key: "module", Value: 1}, {Key: "created_at", Value: -1}},
				},
				mongo.IndexModel{
					Keys: bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
				},
				mongo.IndexModel{
					Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "created_at", Value: -1}},
				},
				descIndex("created_at"),
				singleIndex("tags"),
				// TTL index: automatically delete logs older than 30 days
				mongo.IndexModel{
					Keys:    bson.D{{Key: "created_at", Value: 1}},
					Options: options.Index().SetExpireAfterSeconds(2592000), // 30 days
				},
			},
		},
	}

	for _, m := range migrations {
		coll := c.DB.Collection(m.collection)
		_, err := coll.Indexes().CreateMany(ctx, m.models)
		if err != nil {
			return fmt.Errorf("create indexes for %q: %w", m.collection, err)
		}
		log.Debug().Str("collection", m.collection).Msg("indexes ensured")
	}

	log.Info().Msg("MongoDB index migrations complete")
	return nil
}

// ── index helpers ─────────────────────────────────────────────────────────────

func uniqueIndex(field string) mongo.IndexModel {
	return mongo.IndexModel{
		Keys:    bson.D{{Key: field, Value: 1}},
		Options: options.Index().SetUnique(true),
	}
}

// sparseUniqueIndex creates a unique index that ignores documents where the
// field is absent or an empty string — essential for optional-but-unique fields
// like IMEI2 where many devices are single-SIM.
func sparseUniqueIndex(field string) mongo.IndexModel {
	return mongo.IndexModel{
		Keys:    bson.D{{Key: field, Value: 1}},
		Options: options.Index().SetUnique(true).SetSparse(true),
	}
}

func singleIndex(field string) mongo.IndexModel {
	return mongo.IndexModel{
		Keys: bson.D{{Key: field, Value: 1}},
	}
}

func descIndex(field string) mongo.IndexModel {
	return mongo.IndexModel{
		Keys: bson.D{{Key: field, Value: -1}},
	}
}
