package repository

import (
	"context"
	"strings"
	"time"

	"aman-agency/backend/internal/dto"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// sensitiveFields is the set of document field names that must be masked
// before any document leaves the DB Explorer API.  Matching is
// case-insensitive and covers both top-level and nested keys.
var sensitiveFields = map[string]struct{}{
	"password":         {},
	"hashed_password":  {},
	"password_hash":    {},
	"refresh_token":    {},
	"access_token":     {},
	"token":            {},
	"secret":           {},
	"api_key":          {},
	"apikey":           {},
	"session_token":    {},
	"auth_token":       {},
	"private_key":      {},
	"client_secret":    {},
	"signing_key":      {},
	"encryption_key":   {},
	"otp":              {},
	"pin":              {},
}

// AdminRepository defines the persistence contract for the DB Explorer.
type AdminRepository interface {
	// ListCollections returns metadata for every collection in the database.
	ListCollections(ctx context.Context) ([]dto.CollectionInfo, error)
	// GetCollectionStats returns stats for one named collection.
	GetCollectionStats(ctx context.Context, name string) (dto.CollectionInfo, error)
	// ListDocuments returns a page of masked documents from a collection.
	ListDocuments(ctx context.Context, collection string, f dto.DocumentFilter) ([]map[string]interface{}, int64, error)
	// GetDocument returns a single masked document by its string _id.
	GetDocument(ctx context.Context, collection, id string) (map[string]interface{}, error)
	// ExportCollection returns all documents in a collection (masked) for dump generation.
	// Results are returned via a channel to support streaming of large collections.
	ExportCollection(ctx context.Context, collection string) ([]map[string]interface{}, error)
	// ListCollectionNames returns just the names of all collections.
	ListCollectionNames(ctx context.Context) ([]string, error)
}

type adminRepository struct {
	db *mongo.Database
}

// NewAdminRepository constructs an AdminRepository backed by the given database.
func NewAdminRepository(db *mongo.Database) AdminRepository {
	return &adminRepository{db: db}
}

// ── ListCollections ───────────────────────────────────────────────────────────

func (r *adminRepository) ListCollections(ctx context.Context) ([]dto.CollectionInfo, error) {
	names, err := r.db.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		return nil, err
	}

	infos := make([]dto.CollectionInfo, 0, len(names))
	for _, name := range names {
		info, err := r.GetCollectionStats(ctx, name)
		if err != nil {
			// Non-fatal: include the collection with zero counts.
			info = dto.CollectionInfo{Name: name}
		}
		infos = append(infos, info)
	}
	return infos, nil
}

// ── ListCollectionNames ───────────────────────────────────────────────────────

func (r *adminRepository) ListCollectionNames(ctx context.Context) ([]string, error) {
	return r.db.ListCollectionNames(ctx, bson.M{})
}

// ── GetCollectionStats ────────────────────────────────────────────────────────

func (r *adminRepository) GetCollectionStats(ctx context.Context, name string) (dto.CollectionInfo, error) {
	// collStats returns size, avgObjSize, count, nindexes, etc.
	result := r.db.RunCommand(ctx, bson.D{{Key: "collStats", Value: name}})
	if result.Err() != nil {
		return dto.CollectionInfo{Name: name}, result.Err()
	}

	var raw bson.M
	if err := result.Decode(&raw); err != nil {
		return dto.CollectionInfo{Name: name}, err
	}

	info := dto.CollectionInfo{Name: name}
	if v, ok := raw["count"]; ok {
		info.Count = toInt64(v)
	}
	if v, ok := raw["size"]; ok {
		info.SizeBytes = toInt64(v)
	}
	if v, ok := raw["avgObjSize"]; ok {
		info.AvgObjSize = toInt64(v)
	}
	if v, ok := raw["nindexes"]; ok {
		info.IndexCount = int(toInt64(v))
	}
	return info, nil
}

// ── ListDocuments ─────────────────────────────────────────────────────────────

func (r *adminRepository) ListDocuments(
	ctx context.Context,
	collection string,
	f dto.DocumentFilter,
) ([]map[string]interface{}, int64, error) {

	col := r.db.Collection(collection)

	// Build filter
	query := r.buildDocumentFilter(f)

	// Pagination defaults
	page := f.Page
	if page < 1 {
		page = 1
	}
	limit := f.Limit
	if limit < 1 || limit > 50 {
		limit = 20
	}

	// Sort
	sortField := f.SortBy
	if sortField == "" {
		sortField = "_id"
	}
	sortDir := -1
	if strings.EqualFold(f.SortDir, "asc") {
		sortDir = 1
	}

	findOpts := options.Find().
		SetSort(bson.D{{Key: sortField, Value: sortDir}}).
		SetSkip(int64((page - 1) * limit)).
		SetLimit(int64(limit))

	// Run find + count in parallel
	type findResult struct {
		docs []map[string]interface{}
		err  error
	}
	type countResult struct {
		n   int64
		err error
	}

	findCh := make(chan findResult, 1)
	cntCh := make(chan countResult, 1)

	go func() {
		cur, err := col.Find(ctx, query, findOpts)
		if err != nil {
			findCh <- findResult{err: err}
			return
		}
		defer cur.Close(ctx)

		var rawDocs []bson.M
		if err := cur.All(ctx, &rawDocs); err != nil {
			findCh <- findResult{err: err}
			return
		}

		docs := make([]map[string]interface{}, 0, len(rawDocs))
		for _, d := range rawDocs {
			docs = append(docs, r.maskSensitiveFields(bsonMToMap(d)))
		}
		findCh <- findResult{docs: docs}
	}()

	go func() {
		n, err := col.CountDocuments(ctx, query)
		cntCh <- countResult{n: n, err: err}
	}()

	fr := <-findCh
	cr := <-cntCh

	if fr.err != nil {
		return nil, 0, fr.err
	}
	if cr.err != nil {
		return nil, 0, cr.err
	}

	return fr.docs, cr.n, nil
}

// ── GetDocument ───────────────────────────────────────────────────────────────

func (r *adminRepository) GetDocument(ctx context.Context, collection, id string) (map[string]interface{}, error) {
	col := r.db.Collection(collection)

	// Try ObjectID first, fall back to string
	var filter bson.M
	if oid, err := primitive.ObjectIDFromHex(id); err == nil {
		filter = bson.M{"_id": oid}
	} else {
		filter = bson.M{"_id": id}
	}

	var raw bson.M
	err := col.FindOne(ctx, filter).Decode(&raw)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return r.maskSensitiveFields(bsonMToMap(raw)), nil
}

// ── ExportCollection ─────────────────────────────────────────────────────────

func (r *adminRepository) ExportCollection(ctx context.Context, collection string) ([]map[string]interface{}, error) {
	col := r.db.Collection(collection)

	// Limit exports to 50 000 documents per collection to prevent OOM.
	const exportLimit = 50_000
	opts := options.Find().SetLimit(exportLimit)

	cur, err := col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var rawDocs []bson.M
	if err := cur.All(ctx, &rawDocs); err != nil {
		return nil, err
	}

	docs := make([]map[string]interface{}, 0, len(rawDocs))
	for _, d := range rawDocs {
		docs = append(docs, r.maskSensitiveFields(bsonMToMap(d)))
	}
	return docs, nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

// buildDocumentFilter constructs a MongoDB query from the given filter params.
func (r *adminRepository) buildDocumentFilter(f dto.DocumentFilter) bson.M {
	query := bson.M{}

	// Field = value filter
	if f.Field != "" && f.Value != "" {
		// Try ObjectID, then boolean, then numeric, then string
		if oid, err := primitive.ObjectIDFromHex(f.Value); err == nil {
			query[f.Field] = oid
		} else {
			query[f.Field] = bson.M{"$regex": primitive.Regex{Pattern: f.Value, Options: "i"}}
		}
	}

	// Free-text search: prefix-regex on _id string representation and common fields.
	// Full $text search would require a text index; we use $regex for flexibility.
	if f.Search != "" {
		searchRegex := primitive.Regex{Pattern: f.Search, Options: "i"}
		query["$or"] = bson.A{
			bson.M{"invoice_number": bson.M{"$regex": searchRegex}},
			bson.M{"name": bson.M{"$regex": searchRegex}},
			bson.M{"phone": bson.M{"$regex": searchRegex}},
			bson.M{"email": bson.M{"$regex": searchRegex}},
			bson.M{"imei1": bson.M{"$regex": searchRegex}},
			bson.M{"description": bson.M{"$regex": searchRegex}},
		}
	}

	// Date range filter
	if f.From != "" || f.To != "" {
		dateField := f.DateField
		if dateField == "" {
			dateField = "created_at"
		}
		df := bson.M{}
		if from, err := time.Parse(time.RFC3339, f.From); err == nil {
			df["$gte"] = from.UTC()
		}
		if to, err := time.Parse(time.RFC3339, f.To); err == nil {
			df["$lte"] = to.UTC()
		}
		if len(df) > 0 {
			query[dateField] = df
		}
	}

	return query
}

// maskSensitiveFields recursively removes sensitive keys from a document map.
// The original map is mutated in place and also returned for convenience.
func (r *adminRepository) maskSensitiveFields(doc map[string]interface{}) map[string]interface{} {
	for k, v := range doc {
		lower := strings.ToLower(k)
		if _, blocked := sensitiveFields[lower]; blocked {
			doc[k] = "••••••••"
			continue
		}
		// Recurse into nested maps
		switch nested := v.(type) {
		case map[string]interface{}:
			doc[k] = r.maskSensitiveFields(nested)
		case []interface{}:
			for i, item := range nested {
				if m, ok := item.(map[string]interface{}); ok {
					nested[i] = r.maskSensitiveFields(m)
				}
			}
		}
	}
	return doc
}

// bsonMToMap converts a bson.M (which may contain primitive.ObjectID, time.Time,
// primitive.DateTime, etc.) into a plain map[string]interface{} with JSON-safe
// representations so it can be marshalled cleanly.
func bsonMToMap(m bson.M) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = convertBSONValue(v)
	}
	return out
}

// convertBSONValue recursively converts BSON-specific types to JSON-safe values.
func convertBSONValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case primitive.ObjectID:
		return val.Hex()
	case primitive.DateTime:
		return val.Time().UTC().Format(time.RFC3339)
	case time.Time:
		return val.UTC().Format(time.RFC3339)
	case primitive.A:
		arr := make([]interface{}, len(val))
		for i, item := range val {
			arr[i] = convertBSONValue(item)
		}
		return arr
	case []interface{}:
		arr := make([]interface{}, len(val))
		for i, item := range val {
			arr[i] = convertBSONValue(item)
		}
		return arr
	case bson.M:
		return bsonMToMap(val)
	case map[string]interface{}:
		out := make(map[string]interface{}, len(val))
		for k, vv := range val {
			out[k] = convertBSONValue(vv)
		}
		return out
	case primitive.Regex:
		return "/" + val.Pattern + "/" + val.Options
	case primitive.Decimal128:
		return val.String()
	default:
		return val
	}
}

// toInt64 safely converts various numeric BSON types to int64.
func toInt64(v interface{}) int64 {
	switch n := v.(type) {
	case int32:
		return int64(n)
	case int64:
		return n
	case float64:
		return int64(n)
	case int:
		return int64(n)
	default:
		return 0
	}
}
