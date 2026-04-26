package service

import (
	"context"
	"regexp"
	"strings"
	"sync"

	"aman-agency/backend/internal/dto"
	"aman-agency/backend/pkg/apperror"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// SearchService runs parallel queries across customers, products, devices, and
// sales to power the universal search bar in the PWA.
type SearchService interface {
	Search(ctx context.Context, f dto.SearchFilter) (*dto.SearchResponse, error)
}

type searchService struct {
	db *mongo.Database
}

// NewSearchService constructs a SearchService backed by the given database.
func NewSearchService(db *mongo.Database) SearchService {
	return &searchService{db: db}
}

const (
	defaultSearchLimit = 5
	maxSearchLimit     = 20
)

// escapeRegex escapes special regex metacharacters in a user-supplied query so
// it is treated as a literal string match. This prevents ReDoS attacks from
// crafted inputs like "(a+)+" that cause catastrophic backtracking in the DB.
func escapeRegex(q string) string {
	return regexp.QuoteMeta(q)
}

// Search runs concurrent queries for each requested entity type.
func (s *searchService) Search(ctx context.Context, f dto.SearchFilter) (*dto.SearchResponse, error) {
	q := strings.TrimSpace(f.Q)
	if len(q) < 2 {
		return nil, apperror.BadRequest("search query must be at least 2 characters")
	}

	limit := f.Limit
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	if limit > maxSearchLimit {
		limit = maxSearchLimit
	}

	// Determine which entity types to query.
	types := parseSearchTypes(f.Types)

	resp := &dto.SearchResponse{Query: q}
	var wg sync.WaitGroup

	if types["customers"] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp.Customers, _ = s.searchCustomers(ctx, q, limit)
		}()
	}
	if types["products"] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp.Products, _ = s.searchProducts(ctx, q, limit)
		}()
	}
	if types["devices"] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp.Devices, _ = s.searchDevices(ctx, q, limit)
		}()
	}
	if types["sales"] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp.Sales, _ = s.searchSales(ctx, q, limit)
		}()
	}

	wg.Wait()
	return resp, nil
}

// ─── entity-level search queries ─────────────────────────────────────────────

func (s *searchService) searchCustomers(ctx context.Context, q string, limit int) ([]dto.CustomerSearchResult, error) {
	safe := escapeRegex(q)
	// Match on name (case-insensitive regex) OR exact phone prefix.
	filter := bson.M{"$or": bson.A{
		bson.M{"name": bson.M{"$regex": primitive.Regex{Pattern: safe, Options: "i"}}},
		bson.M{"phone": bson.M{"$regex": primitive.Regex{Pattern: "^" + safe, Options: ""}}},
	}}
	opts := options.Find().
		SetLimit(int64(limit)).
		SetProjection(bson.M{"_id": 1, "name": 1, "phone": 1, "email": 1})

	cur, err := s.db.Collection("customers").Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []dto.CustomerSearchResult
	for cur.Next(ctx) {
		var row struct {
			ID    primitive.ObjectID `bson:"_id"`
			Name  string             `bson:"name"`
			Phone string             `bson:"phone"`
			Email string             `bson:"email"`
		}
		if err := cur.Decode(&row); err != nil {
			continue
		}
		results = append(results, dto.CustomerSearchResult{
			ID:    row.ID.Hex(),
			Name:  row.Name,
			Phone: row.Phone,
			Email: row.Email,
		})
	}
	return results, nil
}

func (s *searchService) searchProducts(ctx context.Context, q string, limit int) ([]dto.ProductSearchResult, error) {
	safe := escapeRegex(q)
	filter := bson.M{"$or": bson.A{
		bson.M{"model_name": bson.M{"$regex": primitive.Regex{Pattern: safe, Options: "i"}}},
		bson.M{"brand_name": bson.M{"$regex": primitive.Regex{Pattern: safe, Options: "i"}}},
		bson.M{"barcode": bson.M{"$regex": primitive.Regex{Pattern: "^" + safe, Options: ""}}},
	}}
	opts := options.Find().
		SetLimit(int64(limit)).
		SetProjection(bson.M{"_id": 1, "model_name": 1, "brand_name": 1, "barcode": 1})

	cur, err := s.db.Collection("products").Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []dto.ProductSearchResult
	for cur.Next(ctx) {
		var row struct {
			ID        primitive.ObjectID `bson:"_id"`
			ModelName string             `bson:"model_name"`
			BrandName string             `bson:"brand_name"`
			Barcode   string             `bson:"barcode"`
		}
		if err := cur.Decode(&row); err != nil {
			continue
		}
		results = append(results, dto.ProductSearchResult{
			ID:        row.ID.Hex(),
			ModelName: row.ModelName,
			BrandName: row.BrandName,
			Barcode:   row.Barcode,
		})
	}
	return results, nil
}

func (s *searchService) searchDevices(ctx context.Context, q string, limit int) ([]dto.DeviceSearchResult, error) {
	safe := escapeRegex(q)
	// IMEI prefix search on imei1 or imei2.
	filter := bson.M{"$or": bson.A{
		bson.M{"imei1": bson.M{"$regex": primitive.Regex{Pattern: "^" + safe, Options: ""}}},
		bson.M{"imei2": bson.M{"$regex": primitive.Regex{Pattern: "^" + safe, Options: ""}}},
		bson.M{"product_name": bson.M{"$regex": primitive.Regex{Pattern: safe, Options: "i"}}},
	}}
	opts := options.Find().
		SetLimit(int64(limit)).
		SetProjection(bson.M{"_id": 1, "product_name": 1, "brand_name": 1, "imei1": 1, "imei2": 1, "status": 1})

	cur, err := s.db.Collection("devices").Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []dto.DeviceSearchResult
	for cur.Next(ctx) {
		var row struct {
			ID          primitive.ObjectID `bson:"_id"`
			ProductName string             `bson:"product_name"`
			BrandName   string             `bson:"brand_name"`
			IMEI1       string             `bson:"imei1"`
			IMEI2       string             `bson:"imei2"`
			Status      string             `bson:"status"`
		}
		if err := cur.Decode(&row); err != nil {
			continue
		}
		results = append(results, dto.DeviceSearchResult{
			ID:          row.ID.Hex(),
			ProductName: row.ProductName,
			BrandName:   row.BrandName,
			IMEI1:       row.IMEI1,
			IMEI2:       row.IMEI2,
			Status:      row.Status,
		})
	}
	return results, nil
}

func (s *searchService) searchSales(ctx context.Context, q string, limit int) ([]dto.SaleSearchResult, error) {
	safe := escapeRegex(q)
	// Invoice number prefix or customer name search.
	filter := bson.M{"$or": bson.A{
		bson.M{"invoice_number": bson.M{"$regex": primitive.Regex{Pattern: "^" + safe, Options: "i"}}},
		bson.M{"customer_name":  bson.M{"$regex": primitive.Regex{Pattern: safe, Options: "i"}}},
	}}
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(int64(limit)).
		SetProjection(bson.M{"_id": 1, "invoice_number": 1, "customer_name": 1, "total_amount": 1, "status": 1})

	cur, err := s.db.Collection("sales").Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []dto.SaleSearchResult
	for cur.Next(ctx) {
		var row struct {
			ID            primitive.ObjectID `bson:"_id"`
			InvoiceNumber string             `bson:"invoice_number"`
			CustomerName  string             `bson:"customer_name"`
			TotalAmount   float64            `bson:"total_amount"`
			Status        string             `bson:"status"`
		}
		if err := cur.Decode(&row); err != nil {
			continue
		}
		results = append(results, dto.SaleSearchResult{
			ID:            row.ID.Hex(),
			InvoiceNumber: row.InvoiceNumber,
			CustomerName:  row.CustomerName,
			TotalAmount:   row.TotalAmount,
			Status:        row.Status,
		})
	}
	return results, nil
}

// ─── helper ───────────────────────────────────────────────────────────────────

// parseSearchTypes returns a set of entity type names to query.
// An empty or "all" value enables all four types.
func parseSearchTypes(raw string) map[string]bool {
	all := map[string]bool{
		"customers": true,
		"products":  true,
		"devices":   true,
		"sales":     true,
	}
	if raw == "" || raw == "all" {
		return all
	}
	result := make(map[string]bool)
	for _, t := range strings.Split(raw, ",") {
		t = strings.TrimSpace(t)
		if all[t] {
			result[t] = true
		}
	}
	if len(result) == 0 {
		return all // invalid filter → default to all
	}
	return result
}
