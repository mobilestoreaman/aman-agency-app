package dto

// ── Collections Explorer DTOs ─────────────────────────────────────────────────

// CollectionInfo holds metadata for a single MongoDB collection.
type CollectionInfo struct {
	Name       string `json:"name"`
	Count      int64  `json:"count"`
	SizeBytes  int64  `json:"size_bytes"`
	AvgObjSize int64  `json:"avg_obj_size"`
	IndexCount int    `json:"index_count"`
}

// DocumentFilter controls pagination, search, and sorting for the document explorer.
// All filter parameters are optional and independent.
type DocumentFilter struct {
	// Pagination
	Page  int `query:"page"`
	Limit int `query:"limit"` // capped at 50 for performance

	// Free-text search applied across all string fields via $where / text scan.
	// For safety this uses a simple prefix-regex on _id or common string fields.
	Search string `query:"search"`

	// Explicit field filter: ?field=status&value=active
	Field string `query:"field"`
	Value string `query:"value"`

	// Sorting
	SortBy  string `query:"sort_by"`  // field name, default "_id"
	SortDir string `query:"sort_dir"` // "asc" | "desc", default "desc"

	// Date range on a specific field (ISO 8601)
	DateField string `query:"date_field"` // e.g. "created_at", default "created_at"
	From      string `query:"from"`       // ISO8601 lower bound (inclusive)
	To        string `query:"to"`         // ISO8601 upper bound (inclusive)
}

// DocumentResponse wraps a single MongoDB document for the API.
// The document itself is returned as a map[string]interface{} so the
// frontend can render dynamic columns without schema knowledge.
type DocumentResponse struct {
	// ID is the hex string of the document's _id (ObjectID or string).
	ID string `json:"id"`
	// Doc contains the full (masked) document as a generic map.
	Doc map[string]interface{} `json:"doc"`
}

// ── Dump DTOs ─────────────────────────────────────────────────────────────────

// DumpRequest specifies what to export and in what format.
type DumpRequest struct {
	// Collection is the collection to dump. Leave empty for a full-database dump.
	Collection string `json:"collection" validate:"omitempty,max=100"`
	// Format controls the archive type: "json" or "zip".
	Format string `json:"format" validate:"required,oneof=json zip"`
}

// DumpRecord is a log entry for a generated dump file.
// Returned from the history and generate endpoints.
type DumpRecord struct {
	ID          string `json:"id"`
	Collection  string `json:"collection"`  // empty = full DB
	Format      string `json:"format"`      // "json" | "zip"
	FileName    string `json:"file_name"`
	SizeBytes   int64  `json:"size_bytes"`
	GeneratedBy string `json:"generated_by"` // user email
	IP          string `json:"ip"`
	CreatedAt   string `json:"created_at"`  // RFC3339
	ExpiresAt   string `json:"expires_at"`  // RFC3339 (1 hour TTL)
	Expired     bool   `json:"expired"`
}
