package repository

import (
	"context"
	"sync"
	"time"

	"aman-agency/backend/internal/dto"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// DashboardRepository runs all the parallel read queries needed for the
// dashboard endpoint. It holds *mongo.Database directly because it spans
// multiple collections in a single request.
type DashboardRepository interface {
	TodaySales(ctx context.Context, dayStart, dayEnd time.Time) (*dto.TodaySalesSummary, error)
	StockSummary(ctx context.Context) (*dto.StockDashboardSummary, error)
	TotalCreditOutstanding(ctx context.Context) (float64, error)
	BorrowLendCounts(ctx context.Context) (active, overdue int64, err error)
	UnreadNotificationCount(ctx context.Context) (int64, error)
	MonthExpenses(ctx context.Context, monthStart, monthEnd time.Time) (float64, error)
	RecentSales(ctx context.Context, limit int) ([]dto.RecentSaleEntry, error)
	LowStockAlerts(ctx context.Context, threshold int) ([]dto.LowStockAlert, error)
}

type dashboardRepository struct {
	db *mongo.Database
}

// NewDashboardRepository constructs a DashboardRepository.
func NewDashboardRepository(db *mongo.Database) DashboardRepository {
	return &dashboardRepository{db: db}
}

// ─── TodaySales ───────────────────────────────────────────────────────────────

func (r *dashboardRepository) TodaySales(ctx context.Context, dayStart, dayEnd time.Time) (*dto.TodaySalesSummary, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": dayStart, "$lte": dayEnd},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":         nil,
			"count":       bson.M{"$sum": 1},
			"revenue":     bson.M{"$sum": "$total_amount"},
			"collected":   bson.M{"$sum": "$amount_paid"},
			"outstanding": bson.M{"$sum": "$balance"},
		}}},
	}

	cur, err := r.db.Collection("sales").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	summary := &dto.TodaySalesSummary{}
	if cur.Next(ctx) {
		var row struct {
			Count       int64   `bson:"count"`
			Revenue     float64 `bson:"revenue"`
			Collected   float64 `bson:"collected"`
			Outstanding float64 `bson:"outstanding"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		summary.Count = row.Count
		summary.Revenue = row.Revenue
		summary.Collected = row.Collected
		summary.Outstanding = row.Outstanding
	}
	return summary, nil
}

// ─── StockSummary ─────────────────────────────────────────────────────────────

func (r *dashboardRepository) StockSummary(ctx context.Context) (*dto.StockDashboardSummary, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$group", Value: bson.M{
			"_id":   "$status",
			"count": bson.M{"$sum": 1},
		}}},
	}

	cur, err := r.db.Collection("devices").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	summary := &dto.StockDashboardSummary{}
	for cur.Next(ctx) {
		var row struct {
			Status string `bson:"_id"`
			Count  int64  `bson:"count"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		summary.TotalUnits += row.Count
		switch row.Status {
		case "available", "in_stock": // "in_stock" is the legacy value
			summary.Available += row.Count
		case "sold":
			summary.Sold = row.Count
		case "returned":
			summary.Reserved = row.Count
		case "repair":
			summary.UnderRepair = row.Count
		}
	}
	return summary, nil
}

// ─── TotalCreditOutstanding ───────────────────────────────────────────────────

func (r *dashboardRepository) TotalCreditOutstanding(ctx context.Context) (float64, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"credit_balance": bson.M{"$gt": 0}}}},
		{{Key: "$group", Value: bson.M{
			"_id":   nil,
			"total": bson.M{"$sum": "$credit_balance"},
		}}},
	}

	cur, err := r.db.Collection("customers").Aggregate(ctx, pipeline)
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	if cur.Next(ctx) {
		var row struct {
			Total float64 `bson:"total"`
		}
		if err := cur.Decode(&row); err != nil {
			return 0, err
		}
		return row.Total, nil
	}
	return 0, nil
}

// ─── BorrowLendCounts ─────────────────────────────────────────────────────────

func (r *dashboardRepository) BorrowLendCounts(ctx context.Context) (active, overdue int64, err error) {
	col := r.db.Collection("borrow_lends")

	var wg sync.WaitGroup
	var aErr, oErr error
	wg.Add(2)
	go func() {
		defer wg.Done()
		active, aErr = col.CountDocuments(ctx, bson.M{"status": "active"})
	}()
	go func() {
		defer wg.Done()
		overdue, oErr = col.CountDocuments(ctx, bson.M{"status": "overdue"})
	}()
	wg.Wait()

	if aErr != nil {
		return 0, 0, aErr
	}
	return active, overdue, oErr
}

// ─── UnreadNotificationCount ─────────────────────────────────────────────────

func (r *dashboardRepository) UnreadNotificationCount(ctx context.Context) (int64, error) {
	return r.db.Collection("notifications").CountDocuments(ctx, bson.M{"status": "unread"})
}

// ─── MonthExpenses ────────────────────────────────────────────────────────────

func (r *dashboardRepository) MonthExpenses(ctx context.Context, monthStart, monthEnd time.Time) (float64, error) {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": monthStart, "$lte": monthEnd},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":   nil,
			"total": bson.M{"$sum": "$amount"},
		}}},
	}

	cur, err := r.db.Collection("expenses").Aggregate(ctx, pipeline)
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	if cur.Next(ctx) {
		var row struct {
			Total float64 `bson:"total"`
		}
		if err := cur.Decode(&row); err != nil {
			return 0, err
		}
		return row.Total, nil
	}
	return 0, nil
}

// ─── RecentSales ─────────────────────────────────────────────────────────────

func (r *dashboardRepository) RecentSales(ctx context.Context, limit int) ([]dto.RecentSaleEntry, error) {
	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetLimit(int64(limit)).
		SetProjection(bson.M{
			"_id":            1,
			"invoice_number": 1,
			"customer_name":  1,
			"total_amount":   1,
			"status":         1,
			"created_at":     1,
		})

	// Exclude cancelled sales — the dashboard "Recent Sales" feed should only
	// show completed transactions, not reversals.
	cur, err := r.db.Collection("sales").Find(ctx, bson.M{"status": bson.M{"$ne": "cancelled"}}, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []dto.RecentSaleEntry
	for cur.Next(ctx) {
		var row struct {
			ID            interface{} `bson:"_id"`
			InvoiceNumber string      `bson:"invoice_number"`
			CustomerName  string      `bson:"customer_name"`
			TotalAmount   float64     `bson:"total_amount"`
			Status        string      `bson:"status"`
			CreatedAt     time.Time   `bson:"created_at"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		idStr := ""
		if oid, ok := row.ID.(interface{ Hex() string }); ok {
			idStr = oid.Hex()
		}
		results = append(results, dto.RecentSaleEntry{
			SaleID:        idStr,
			InvoiceNumber: row.InvoiceNumber,
			CustomerName:  row.CustomerName,
			TotalAmount:   row.TotalAmount,
			Status:        row.Status,
			CreatedAt:     row.CreatedAt,
		})
	}
	return results, nil
}

// ─── LowStockAlerts ──────────────────────────────────────────────────────────

func (r *dashboardRepository) LowStockAlerts(ctx context.Context, threshold int) ([]dto.LowStockAlert, error) {
	if threshold <= 0 {
		return nil, nil // disabled
	}

	// Group available devices by product, then filter where count < threshold.
	// Match both "available" and legacy "in_stock" documents.
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"status": bson.M{"$in": bson.A{"available", "in_stock"}}}}},
		{{Key: "$group", Value: bson.M{
			"_id":          "$product_id",
			"product_name": bson.M{"$first": "$product_name"},
			"brand_name":   bson.M{"$first": "$brand_name"},
			"available":    bson.M{"$sum": 1},
		}}},
		{{Key: "$match", Value: bson.M{
			"available": bson.M{"$lt": threshold},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "available", Value: 1}}}},
	}

	cur, err := r.db.Collection("devices").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var alerts []dto.LowStockAlert
	for cur.Next(ctx) {
		var row struct {
			ProductID   interface{} `bson:"_id"`
			ProductName string      `bson:"product_name"`
			BrandName   string      `bson:"brand_name"`
			Available   int64       `bson:"available"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		idStr := ""
		if oid, ok := row.ProductID.(interface{ Hex() string }); ok {
			idStr = oid.Hex()
		}
		alerts = append(alerts, dto.LowStockAlert{
			ProductID:   idStr,
			ProductName: row.ProductName,
			BrandName:   row.BrandName,
			Available:   row.Available,
			Threshold:   threshold,
		})
	}
	return alerts, nil
}
