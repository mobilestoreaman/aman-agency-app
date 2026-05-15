package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/pkg/apperror"
	"aman-agency/backend/pkg/pagination"
	"aman-agency/backend/pkg/response"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// dumpTTL is how long a generated dump file is retained before being considered expired.
const dumpTTL = 1 * time.Hour

// dumpDir is the temporary directory where dump files are stored.
const dumpDir = "/tmp/aman-dumps"

// ── Interface ─────────────────────────────────────────────────────────────────

// AdminService defines the business-logic contract for the DB Explorer feature.
type AdminService interface {
	// Collections
	ListCollections(ctx context.Context) ([]dto.CollectionInfo, error)
	GetCollectionStats(ctx context.Context, name string) (dto.CollectionInfo, error)

	// Documents
	ListDocuments(ctx context.Context, collection string, f dto.DocumentFilter) ([]map[string]interface{}, *response.Meta, error)
	GetDocument(ctx context.Context, collection, id string) (map[string]interface{}, error)

	// Dumps
	GenerateDump(ctx context.Context, req dto.DumpRequest, userEmail, ip string) (*dto.DumpRecord, error)
	GetDumpRecord(ctx context.Context, dumpID string) (*dto.DumpRecord, error)
	GetDumpFilePath(ctx context.Context, dumpID string) (string, error)
	ListDumpHistory(ctx context.Context) ([]dto.DumpRecord, error)
}

// ── Implementation ────────────────────────────────────────────────────────────

type adminService struct {
	repo repository.AdminRepository

	// In-memory dump history (production would use a persistent store).
	mu      sync.RWMutex
	history []dto.DumpRecord
}

// NewAdminService constructs an AdminService.
func NewAdminService(repo repository.AdminRepository) AdminService {
	if err := os.MkdirAll(dumpDir, 0700); err != nil {
		log.Warn().Err(err).Str("dir", dumpDir).Msg("could not create dump directory")
	}
	cleanupExpiredDumps()
	return &adminService{repo: repo}
}

// cleanupExpiredDumps removes dump files older than dumpTTL left by a
// previous process (in-memory history is lost on restart, files are not).
func cleanupExpiredDumps() {
	entries, err := os.ReadDir(dumpDir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-dumpTTL)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			path := filepath.Join(dumpDir, e.Name())
			if removeErr := os.Remove(path); removeErr == nil {
				log.Info().Str("file", e.Name()).Msg("removed expired dump file")
			}
		}
	}
}

// ── Collections ───────────────────────────────────────────────────────────────

func (s *adminService) ListCollections(ctx context.Context) ([]dto.CollectionInfo, error) {
	infos, err := s.repo.ListCollections(ctx)
	if err != nil {
		return nil, fmt.Errorf("list collections: %w", err)
	}
	// Sort alphabetically for consistent display.
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].Name < infos[j].Name
	})
	return infos, nil
}

func (s *adminService) GetCollectionStats(ctx context.Context, name string) (dto.CollectionInfo, error) {
	if name == "" {
		return dto.CollectionInfo{}, apperror.BadRequest("collection name is required")
	}
	return s.repo.GetCollectionStats(ctx, name)
}

// ── Documents ─────────────────────────────────────────────────────────────────

func (s *adminService) ListDocuments(
	ctx context.Context,
	collection string,
	f dto.DocumentFilter,
) ([]map[string]interface{}, *response.Meta, error) {

	if collection == "" {
		return nil, nil, apperror.BadRequest("collection name is required")
	}

	// Enforce safe pagination limits.
	if f.Limit < 1 || f.Limit > 50 {
		f.Limit = 20
	}
	if f.Page < 1 {
		f.Page = 1
	}

	docs, total, err := s.repo.ListDocuments(ctx, collection, f)
	if err != nil {
		return nil, nil, fmt.Errorf("list documents: %w", err)
	}

	pg := pagination.Params{Page: f.Page, Limit: f.Limit}
	meta := pagination.ToMeta(pg, total)

	return docs, meta, nil
}

func (s *adminService) GetDocument(ctx context.Context, collection, id string) (map[string]interface{}, error) {
	if collection == "" {
		return nil, apperror.BadRequest("collection name is required")
	}
	if id == "" {
		return nil, apperror.BadRequest("document id is required")
	}
	doc, err := s.repo.GetDocument(ctx, collection, id)
	if err != nil {
		return nil, err
	}
	return doc, nil
}

// ── Dumps ─────────────────────────────────────────────────────────────────────

// GenerateDump creates a dump file (JSON or ZIP) for the specified collection
// or the entire database, records the event in history, and returns the record.
func (s *adminService) GenerateDump(
	ctx context.Context,
	req dto.DumpRequest,
	userEmail, ip string,
) (*dto.DumpRecord, error) {

	// Validate format.
	req.Format = strings.ToLower(req.Format)
	if req.Format != "json" && req.Format != "zip" {
		return nil, apperror.BadRequest("format must be 'json' or 'zip'")
	}

	now := time.Now().UTC()
	dumpID := uuid.New().String()
	ts := now.Format("2006_01_02_15_04")

	// Determine which collections to include.
	var collectionsToExport []string
	if req.Collection != "" {
		collectionsToExport = []string{req.Collection}
	} else {
		names, err := s.repo.ListCollectionNames(ctx)
		if err != nil {
			return nil, fmt.Errorf("list collection names: %w", err)
		}
		collectionsToExport = names
	}

	// Build the dump content.
	var (
		fileData []byte
		fileName string
		err      error
	)

	suffix := req.Collection
	if suffix == "" {
		suffix = "full_db"
	}

	if req.Format == "json" {
		fileName = fmt.Sprintf("mongodb_dump_%s_%s.json", suffix, ts)
		fileData, err = s.buildJSONDump(ctx, collectionsToExport)
	} else {
		fileName = fmt.Sprintf("mongodb_dump_%s_%s.zip", suffix, ts)
		fileData, err = s.buildZIPDump(ctx, collectionsToExport)
	}
	if err != nil {
		return nil, fmt.Errorf("build dump: %w", err)
	}

	// Write to disk.
	filePath := filepath.Join(dumpDir, dumpID+"_"+fileName)
	if err := os.WriteFile(filePath, fileData, 0600); err != nil {
		return nil, fmt.Errorf("write dump file: %w", err)
	}

	record := dto.DumpRecord{
		ID:          dumpID,
		Collection:  req.Collection,
		Format:      req.Format,
		FileName:    fileName,
		SizeBytes:   int64(len(fileData)),
		GeneratedBy: userEmail,
		IP:          ip,
		CreatedAt:   now.Format(time.RFC3339),
		ExpiresAt:   now.Add(dumpTTL).Format(time.RFC3339),
		Expired:     false,
	}

	s.mu.Lock()
	// Prepend so newest is first.
	s.history = append([]dto.DumpRecord{record}, s.history...)
	// Purge stale history entries > 50.
	if len(s.history) > 50 {
		s.history = s.history[:50]
	}
	s.mu.Unlock()

	log.Info().
		Str("dump_id", dumpID).
		Str("file", fileName).
		Str("user", userEmail).
		Str("ip", ip).
		Int64("bytes", int64(len(fileData))).
		Msg("MongoDB dump generated")

	return &record, nil
}

// GetDumpRecord returns the in-memory record for a given dump ID.
func (s *adminService) GetDumpRecord(ctx context.Context, dumpID string) (*dto.DumpRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.history {
		if s.history[i].ID == dumpID {
			r := s.history[i]
			r.Expired = time.Now().UTC().After(parseRFC3339(r.ExpiresAt))
			return &r, nil
		}
	}
	return nil, apperror.NotFound("dump")
}

// GetDumpFilePath returns the on-disk path for a dump, validating TTL and existence.
func (s *adminService) GetDumpFilePath(ctx context.Context, dumpID string) (string, error) {
	rec, err := s.GetDumpRecord(ctx, dumpID)
	if err != nil {
		return "", err
	}
	if rec.Expired {
		return "", apperror.BadRequest("dump has expired — please generate a new one")
	}

	pattern := filepath.Join(dumpDir, dumpID+"_*")
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		return "", apperror.NotFound("dump file not found on disk")
	}
	return matches[0], nil
}

// ListDumpHistory returns all in-memory dump records.
func (s *adminService) ListDumpHistory(ctx context.Context) ([]dto.DumpRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	now := time.Now().UTC()
	out := make([]dto.DumpRecord, len(s.history))
	for i, r := range s.history {
		r.Expired = now.After(parseRFC3339(r.ExpiresAt))
		out[i] = r
	}
	return out, nil
}

// ── private helpers ───────────────────────────────────────────────────────────

// buildJSONDump serialises all specified collections into a single JSON object.
// { "collection_name": [ {...}, {...} ], ... }
func (s *adminService) buildJSONDump(ctx context.Context, collections []string) ([]byte, error) {
	result := make(map[string]interface{}, len(collections))
	for _, col := range collections {
		docs, err := s.repo.ExportCollection(ctx, col)
		if err != nil {
			log.Warn().Err(err).Str("collection", col).Msg("dump: could not export collection")
			docs = []map[string]interface{}{}
		}
		result[col] = docs
	}
	return json.MarshalIndent(result, "", "  ")
}

// buildZIPDump creates a ZIP archive with one JSON file per collection.
func (s *adminService) buildZIPDump(ctx context.Context, collections []string) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, col := range collections {
		docs, err := s.repo.ExportCollection(ctx, col)
		if err != nil {
			log.Warn().Err(err).Str("collection", col).Msg("dump: could not export collection")
			docs = []map[string]interface{}{}
		}

		data, err := json.MarshalIndent(docs, "", "  ")
		if err != nil {
			continue
		}

		fw, err := zw.Create(col + ".json")
		if err != nil {
			continue
		}
		if _, err := fw.Write(data); err != nil {
			continue
		}
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("zip close: %w", err)
	}
	return buf.Bytes(), nil
}

func parseRFC3339(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}
