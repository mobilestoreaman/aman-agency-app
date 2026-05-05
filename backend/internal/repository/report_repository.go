package repository

import (
	"context"
	"math"
	"sort"
	"time"

	"aman-agency/backend/internal/dto"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ReportRepository runs read-only aggregation queries that span one or more
// collections. It holds a *mongo.Database directly because aggregation
// pipelines are collection-specific but the service layer doesn't need to
// know which collection backs each computation.
type ReportRepository interface {
	RevenueSummary(ctx context.Context, from, to time.Time) (*dto.RevenueSummaryResponse, error)
	StockValuation(ctx context.Context) (*dto.StockValuationResponse, error)
	CreditSummary(ctx context.Context) (*dto.CreditSummaryResponse, error)
	SalesByPeriod(ctx context.Context, from, to time.Time, groupBy string) ([]dto.SalesByPeriodEntry, error)
	ProfitLoss(ctx context.Context, from, to time.Time, groupBy string) (*dto.ProfitLossResponse, error)
	ProductPerformance(ctx context.Context, from, to time.Time) ([]dto.ProductPerformanceEntry, error)
	CustomerInsights(ctx context.Context, from, to time.Time) ([]dto.CustomerInsightEntry, error)
	InventoryHealth(ctx context.Context) (*dto.InventoryHealthResponse, error)
	CashFlow(ctx context.Context, from, to time.Time, groupBy string) ([]dto.CashFlowEntry, error)
}

type reportRepository struct {
	db *mongo.Database
}

// NewReportRepository returns a ReportRepository backed by the given database.
func NewReportRepository(db *mongo.Database) ReportRepository {
	return &reportRepository{db: db}
}

// ─── Revenue Summary ─────────────────────────────────────────────────────────

func (r *reportRepository) RevenueSummary(ctx context.Context, from, to time.Time) (*dto.RevenueSummaryResponse, error) {
	col := r.db.Collection("sales")

	dateFilter := bson.M{"created_at": bson.M{"$gte": from, "$lte": to}}

	// Aggregate non-cancelled sales
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": from, "$lte": to},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":              nil,
			"total_sales":      bson.M{"$sum": 1},
			"total_revenue":    bson.M{"$sum": "$total_amount"},
			"total_collected":  bson.M{"$sum": "$amount_paid"},
			"total_outstanding": bson.M{"$sum": "$balance"},
		}}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	resp := &dto.RevenueSummaryResponse{From: from, To: to}

	if cur.Next(ctx) {
		var agg struct {
			TotalSales      int64   `bson:"total_sales"`
			TotalRevenue    float64 `bson:"total_revenue"`
			TotalCollected  float64 `bson:"total_collected"`
			TotalOutstanding float64 `bson:"total_outstanding"`
		}
		if err := cur.Decode(&agg); err != nil {
			return nil, err
		}
		resp.TotalSales = agg.TotalSales
		resp.TotalRevenue = agg.TotalRevenue
		resp.TotalCollected = agg.TotalCollected
		resp.TotalOutstanding = agg.TotalOutstanding
		if agg.TotalSales > 0 {
			resp.AvgSaleValue = agg.TotalRevenue / float64(agg.TotalSales)
		}
	}

	// Count cancelled sales in same window
	cancelledCount, err := col.CountDocuments(ctx, bson.M{
		"status":     "cancelled",
		"created_at": dateFilter["created_at"],
	})
	if err != nil {
		return nil, err
	}
	resp.CancelledCount = cancelledCount

	return resp, nil
}

// ─── Stock Valuation ─────────────────────────────────────────────────────────

func (r *reportRepository) StockValuation(ctx context.Context) (*dto.StockValuationResponse, error) {
	col := r.db.Collection("devices")

	// Group by status — accumulate counts and purchase/sale cost per bucket
	pipeline := mongo.Pipeline{
		{{Key: "$group", Value: bson.M{
			"_id":   "$status",
			"count": bson.M{"$sum": 1},
			"purchase_cost": bson.M{"$sum": "$purchase_price"},
			"sale_value":    bson.M{"$sum": "$sale_price"},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	resp := &dto.StockValuationResponse{}

	type bucket struct {
		Status       string  `bson:"_id"`
		Count        int64   `bson:"count"`
		PurchaseCost float64 `bson:"purchase_cost"`
		SaleValue    float64 `bson:"sale_value"`
	}

	for cur.Next(ctx) {
		var b bucket
		if err := cur.Decode(&b); err != nil {
			return nil, err
		}
		resp.ByStatus = append(resp.ByStatus, dto.StockStatusBreakdown{
			Status: b.Status,
			Count:  b.Count,
		})
		resp.TotalUnits += b.Count
		resp.TotalPurchaseCost += b.PurchaseCost

		switch b.Status {
		case "available":
			resp.AvailableUnits = b.Count
			resp.TotalPotentialRevenue = b.SaleValue
			resp.EstimatedProfit = b.SaleValue - b.PurchaseCost
		case "sold":
			resp.SoldUnits = b.Count
		}
	}

	return resp, nil
}

// ─── Credit Summary ───────────────────────────────────────────────────────────

func (r *reportRepository) CreditSummary(ctx context.Context) (*dto.CreditSummaryResponse, error) {
	col := r.db.Collection("customers")

	// Total customers
	totalCustomers, err := col.CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, err
	}

	// Customers with outstanding balance + total outstanding
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"credit_balance": bson.M{"$gt": 0}}}},
		{{Key: "$group", Value: bson.M{
			"_id":               nil,
			"customers_with_balance": bson.M{"$sum": 1},
			"total_outstanding": bson.M{"$sum": "$credit_balance"},
		}}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	resp := &dto.CreditSummaryResponse{TotalCustomers: totalCustomers}

	if cur.Next(ctx) {
		var agg struct {
			CustomersWithBalance int64   `bson:"customers_with_balance"`
			TotalOutstanding     float64 `bson:"total_outstanding"`
		}
		if err := cur.Decode(&agg); err != nil {
			return nil, err
		}
		resp.CustomersWithBalance = agg.CustomersWithBalance
		resp.TotalOutstanding = agg.TotalOutstanding
	}
	cur.Close(ctx)

	// Top 10 debtors by balance descending
	findOpts := options.Find().
		SetSort(bson.D{{Key: "credit_balance", Value: -1}}).
		SetLimit(10).
		SetProjection(bson.M{
			"_id":            1,
			"name":           1,
			"phone":          1,
			"credit_balance": 1,
		})

	debtorCur, err := col.Find(ctx, bson.M{"credit_balance": bson.M{"$gt": 0}}, findOpts)
	if err != nil {
		return nil, err
	}
	defer debtorCur.Close(ctx)

	for debtorCur.Next(ctx) {
		var d struct {
			ID      interface{} `bson:"_id"`
			Name    string      `bson:"name"`
			Phone   string      `bson:"phone"`
			Balance float64     `bson:"credit_balance"`
		}
		if err := debtorCur.Decode(&d); err != nil {
			return nil, err
		}
		idStr := ""
		if oid, ok := d.ID.(interface{ Hex() string }); ok {
			idStr = oid.Hex()
		}
		resp.TopDebtors = append(resp.TopDebtors, dto.DebtorEntry{
			CustomerID:   idStr,
			CustomerName: d.Name,
			Phone:        d.Phone,
			Balance:      d.Balance,
		})
	}

	return resp, nil
}

// ─── Sales by Period ─────────────────────────────────────────────────────────

func (r *reportRepository) SalesByPeriod(ctx context.Context, from, to time.Time, groupBy string) ([]dto.SalesByPeriodEntry, error) {
	col := r.db.Collection("sales")

	// Choose date format string based on groupBy
	var dateFormat string
	switch groupBy {
	case "monthly":
		dateFormat = "%Y-%m"
	case "weekly":
		dateFormat = "%Y-W%V" // ISO week number
	default:
		dateFormat = "%Y-%m-%d" // daily
	}

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": from, "$lte": to},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format": dateFormat,
					"date":   "$created_at",
				},
			},
			"sale_count": bson.M{"$sum": 1},
			"revenue":    bson.M{"$sum": "$total_amount"},
			"collected":  bson.M{"$sum": "$amount_paid"},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var results []dto.SalesByPeriodEntry
	for cur.Next(ctx) {
		var row struct {
			Period    string  `bson:"_id"`
			SaleCount int64   `bson:"sale_count"`
			Revenue   float64 `bson:"revenue"`
			Collected float64 `bson:"collected"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		results = append(results, dto.SalesByPeriodEntry{
			Period:    row.Period,
			SaleCount: row.SaleCount,
			Revenue:   row.Revenue,
			Collected: row.Collected,
		})
	}

	return results, nil
}

// ─── Profit & Loss ───────────────────────────────────────────────────────────

func (r *reportRepository) ProfitLoss(ctx context.Context, from, to time.Time, groupBy string) (*dto.ProfitLossResponse, error) {
	salesCol := r.db.Collection("sales")
	expensesCol := r.db.Collection("expenses")

	// Choose date format string based on groupBy
	var dateFormat string
	switch groupBy {
	case "monthly":
		dateFormat = "%Y-%m"
	case "weekly":
		dateFormat = "%Y-W%V"
	default:
		dateFormat = "%Y-%m-%d"
	}

	// Aggregate sales for revenue + COGS by period
	salesPipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": from, "$lte": to},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$unwind", Value: "$items"}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format": dateFormat,
					"date":   "$created_at",
				},
			},
			"revenue":       bson.M{"$sum": "$total_amount"},
			"cogs":          bson.M{"$sum": "$items.purchase_price"},
			"sale_count":    bson.M{"$sum": 1},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
	}

	salesCur, err := salesCol.Aggregate(ctx, salesPipeline)
	if err != nil {
		return nil, err
	}
	defer salesCur.Close(ctx)

	type salesBucket struct {
		Period    string  `bson:"_id"`
		Revenue   float64 `bson:"revenue"`
		COGS      float64 `bson:"cogs"`
		SaleCount int64   `bson:"sale_count"`
	}

	salesByPeriod := make(map[string]*dto.PLPeriodEntry)
	totalRevenue := 0.0
	totalCOGS := 0.0

	for salesCur.Next(ctx) {
		var sb salesBucket
		if err := salesCur.Decode(&sb); err != nil {
			return nil, err
		}
		entry := &dto.PLPeriodEntry{
			Period:      sb.Period,
			Revenue:     sb.Revenue,
			COGS:        sb.COGS,
			GrossProfit: sb.Revenue - sb.COGS,
			Expenses:    0,
		}
		salesByPeriod[sb.Period] = entry
		totalRevenue += sb.Revenue
		totalCOGS += sb.COGS
	}

	// Aggregate expenses by period
	expensePipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": from, "$lte": to},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format": dateFormat,
					"date":   "$date",
				},
			},
			"total_expenses": bson.M{"$sum": "$amount"},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "_id", Value: 1}}}},
	}

	expenseCur, err := expensesCol.Aggregate(ctx, expensePipeline)
	if err != nil {
		return nil, err
	}
	defer expenseCur.Close(ctx)

	type expenseBucket struct {
		Period   string  `bson:"_id"`
		Expenses float64 `bson:"total_expenses"`
	}

	totalExpenses := 0.0

	for expenseCur.Next(ctx) {
		var eb expenseBucket
		if err := expenseCur.Decode(&eb); err != nil {
			return nil, err
		}
		if entry, exists := salesByPeriod[eb.Period]; exists {
			entry.Expenses = eb.Expenses
		} else {
			salesByPeriod[eb.Period] = &dto.PLPeriodEntry{
				Period:   eb.Period,
				Expenses: eb.Expenses,
			}
		}
		totalExpenses += eb.Expenses
	}

	// Build response
	resp := &dto.ProfitLossResponse{
		From:        from,
		To:          to,
		Revenue:     totalRevenue,
		COGS:        totalCOGS,
		GrossProfit: totalRevenue - totalCOGS,
		Expenses:    totalExpenses,
		NetProfit:   (totalRevenue - totalCOGS) - totalExpenses,
	}

	if totalRevenue > 0 {
		resp.GrossMarginPct = (resp.GrossProfit / totalRevenue) * 100
		resp.NetMarginPct = (resp.NetProfit / totalRevenue) * 100
	}

	// Populate ByPeriod and finalize each entry
	for _, entry := range salesByPeriod {
		entry.NetProfit = entry.GrossProfit - entry.Expenses
		resp.ByPeriod = append(resp.ByPeriod, *entry)
	}

	// Sort by period ascending
	sort.Slice(resp.ByPeriod, func(i, j int) bool {
		return resp.ByPeriod[i].Period < resp.ByPeriod[j].Period
	})

	return resp, nil
}

// ─── Product Performance ─────────────────────────────────────────────────────

func (r *reportRepository) ProductPerformance(ctx context.Context, from, to time.Time) ([]dto.ProductPerformanceEntry, error) {
	col := r.db.Collection("sales")

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": from, "$lte": to},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$unwind", Value: "$items"}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"brand_name":   "$items.brand_name",
				"product_name": "$items.product_name",
			},
			"units_sold":           bson.M{"$sum": 1},
			"total_revenue":        bson.M{"$sum": "$items.sale_price"},
			"total_cogs":           bson.M{"$sum": "$items.purchase_price"},
			"sum_sale_price":       bson.M{"$sum": "$items.sale_price"},
			"sum_purchase_price":   bson.M{"$sum": "$items.purchase_price"},
		}}},
		{{Key: "$addFields", Value: bson.M{
			"gross_profit":      bson.M{"$subtract": []interface{}{"$total_revenue", "$total_cogs"}},
			"margin_pct":        bson.M{"$cond": bson.M{"if": bson.M{"$eq": []interface{}{"$total_revenue", 0}}, "then": 0, "else": bson.M{"$multiply": []interface{}{bson.M{"$divide": []interface{}{bson.M{"$subtract": []interface{}{"$total_revenue", "$total_cogs"}}, "$total_revenue"}}, 100}}}},
			"avg_sale_price":    bson.M{"$divide": []interface{}{"$sum_sale_price", "$units_sold"}},
			"avg_purchase_price": bson.M{"$divide": []interface{}{"$sum_purchase_price", "$units_sold"}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "total_revenue", Value: -1}}}},
		{{Key: "$limit", Value: 50}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type aggregated struct {
		ID                bson.M  `bson:"_id"`
		UnitsSold         int64   `bson:"units_sold"`
		TotalRevenue      float64 `bson:"total_revenue"`
		TotalCOGS         float64 `bson:"total_cogs"`
		GrossProfit       float64 `bson:"gross_profit"`
		MarginPct         float64 `bson:"margin_pct"`
		AvgSalePrice      float64 `bson:"avg_sale_price"`
		AvgPurchasePrice  float64 `bson:"avg_purchase_price"`
	}

	var results []dto.ProductPerformanceEntry
	for cur.Next(ctx) {
		var agg aggregated
		if err := cur.Decode(&agg); err != nil {
			return nil, err
		}

		brandName := ""
		productName := ""
		if agg.ID["brand_name"] != nil {
			brandName, _ = agg.ID["brand_name"].(string)
		}
		if agg.ID["product_name"] != nil {
			productName, _ = agg.ID["product_name"].(string)
		}

		results = append(results, dto.ProductPerformanceEntry{
			BrandName:        brandName,
			ProductName:      productName,
			UnitsSold:        agg.UnitsSold,
			TotalRevenue:     agg.TotalRevenue,
			TotalCOGS:        agg.TotalCOGS,
			GrossProfit:      agg.GrossProfit,
			MarginPct:        agg.MarginPct,
			AvgSalePrice:     agg.AvgSalePrice,
			AvgPurchasePrice: agg.AvgPurchasePrice,
		})
	}

	return results, nil
}

// ─── Customer Insights ───────────────────────────────────────────────────────

func (r *reportRepository) CustomerInsights(ctx context.Context, from, to time.Time) ([]dto.CustomerInsightEntry, error) {
	col := r.db.Collection("sales")

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": from, "$lte": to},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id":           "$customer_id",
			"customer_name": bson.M{"$first": "$customer_name"},
			"customer_phone": bson.M{"$first": "$customer_phone"},
			"total_purchases": bson.M{"$sum": 1},
			"total_spent":    bson.M{"$sum": "$total_amount"},
			"total_paid":     bson.M{"$sum": "$amount_paid"},
			"last_purchase":  bson.M{"$max": "$created_at"},
		}}},
		{{Key: "$addFields", Value: bson.M{
			"avg_ticket": bson.M{"$cond": bson.M{"if": bson.M{"$eq": []interface{}{"$total_purchases", 0}}, "then": 0, "else": bson.M{"$divide": []interface{}{"$total_spent", "$total_purchases"}}}},
		}}},
		{{Key: "$lookup", Value: bson.M{
			"from":     "customers",
			"localField": "_id",
			"foreignField": "_id",
			"as":       "customer_doc",
			"pipeline": mongo.Pipeline{
				{{Key: "$project", Value: bson.M{
					"credit_balance": 1,
				}}},
			},
		}}},
		{{Key: "$addFields", Value: bson.M{
			"credit_balance": bson.M{"$cond": bson.M{
				"if":   bson.M{"$eq": []interface{}{bson.M{"$size": "$customer_doc"}, 0}},
				"then": 0,
				"else": bson.M{"$arrayElemAt": []interface{}{"$customer_doc.credit_balance", 0}},
			}},
		}}},
		{{Key: "$addFields", Value: bson.M{
			"credit_risk_pct": bson.M{"$cond": bson.A{
				bson.M{"$gt": bson.A{"$total_spent", 0}},
				bson.M{"$multiply": bson.A{bson.M{"$divide": bson.A{"$credit_balance", "$total_spent"}}, 100}},
				bson.M{"$cond": bson.A{
					bson.M{"$gt": bson.A{"$credit_balance", 0}},
					100,
					0,
				}},
			}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "total_spent", Value: -1}}}},
		{{Key: "$limit", Value: 50}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type customerAgg struct {
		ID             interface{} `bson:"_id"`
		CustomerName   string      `bson:"customer_name"`
		CustomerPhone  string      `bson:"customer_phone"`
		TotalPurchases int64       `bson:"total_purchases"`
		TotalSpent     float64     `bson:"total_spent"`
		TotalPaid      float64     `bson:"total_paid"`
		AvgTicket      float64     `bson:"avg_ticket"`
		CreditBalance  float64     `bson:"credit_balance"`
		CreditRiskPct  float64     `bson:"credit_risk_pct"`
		LastPurchase   time.Time   `bson:"last_purchase"`
	}

	var results []dto.CustomerInsightEntry
	for cur.Next(ctx) {
		var agg customerAgg
		if err := cur.Decode(&agg); err != nil {
			return nil, err
		}

		idStr := ""
		if oid, ok := agg.ID.(interface{ Hex() string }); ok {
			idStr = oid.Hex()
		}

		entry := dto.CustomerInsightEntry{
			CustomerID:     idStr,
			CustomerName:   agg.CustomerName,
			Phone:          agg.CustomerPhone,
			TotalPurchases: agg.TotalPurchases,
			TotalSpent:     agg.TotalSpent,
			TotalPaid:      agg.TotalPaid,
			AvgTicket:      agg.AvgTicket,
			CreditBalance:  agg.CreditBalance,
			CreditRiskPct:  agg.CreditRiskPct,
			LastPurchaseAt: &agg.LastPurchase,
		}
		results = append(results, entry)
	}

	return results, nil
}

// ─── Inventory Health ────────────────────────────────────────────────────────

func (r *reportRepository) InventoryHealth(ctx context.Context) (*dto.InventoryHealthResponse, error) {
	col := r.db.Collection("devices")

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"$or": []bson.M{
				{"status": "available"},
				{"status": "in_stock"},
			},
		}}},
		{{Key: "$addFields", Value: bson.M{
			"days_in_stock": bson.M{"$divide": []interface{}{
				bson.M{"$subtract": []interface{}{"$$NOW", "$created_at"}},
				86400000, // milliseconds per day
			}},
		}}},
		{{Key: "$sort", Value: bson.D{{Key: "created_at", Value: 1}}}},
	}

	cur, err := col.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	type deviceAgg struct {
		ID            interface{} `bson:"_id"`
		BrandName     string      `bson:"brand_name"`
		ProductName   string      `bson:"product_name"`
		IMEI1         string      `bson:"imei1"`
		PurchasePrice float64     `bson:"purchase_price"`
		DaysInStock   float64     `bson:"days_in_stock"`
	}

	resp := &dto.InventoryHealthResponse{
		ByBrand: []dto.BrandInventoryEntry{},
		Slowest: []dto.SlowDeviceEntry{},
	}

	brandMap := make(map[string]*dto.BrandInventoryEntry)
	slowestCount := 0

	for cur.Next(ctx) {
		var dev deviceAgg
		if err := cur.Decode(&dev); err != nil {
			return nil, err
		}

		resp.TotalAvailable++
		resp.CapitalLocked += dev.PurchasePrice
		daysInt := int64(math.Round(dev.DaysInStock))

		// Categorize by age
		if daysInt <= 30 {
			resp.Fresh++
		} else if daysInt <= 60 {
			resp.Aging++
		} else if daysInt <= 90 {
			resp.Slow++
		} else {
			resp.Dead++
		}

		// Accumulate by brand
		if _, exists := brandMap[dev.BrandName]; !exists {
			brandMap[dev.BrandName] = &dto.BrandInventoryEntry{
				BrandName:      dev.BrandName,
				UnitsAvailable: 0,
				CapitalLocked:  0,
				AvgDaysInStock: 0,
			}
		}
		entry := brandMap[dev.BrandName]
		entry.UnitsAvailable++
		entry.CapitalLocked += dev.PurchasePrice
		entry.AvgDaysInStock += dev.DaysInStock

		// Track slowest 50
		if slowestCount < 50 {
			idStr := ""
			if oid, ok := dev.ID.(interface{ Hex() string }); ok {
				idStr = oid.Hex()
			}
			resp.Slowest = append(resp.Slowest, dto.SlowDeviceEntry{
				DeviceID:      idStr,
				ProductName:   dev.ProductName,
				BrandName:     dev.BrandName,
				IMEI:          dev.IMEI1,
				DaysInStock:   daysInt,
				PurchasePrice: dev.PurchasePrice,
			})
			slowestCount++
		}
	}

	// Finalize brand entries
	for _, entry := range brandMap {
		if entry.UnitsAvailable > 0 {
			entry.AvgDaysInStock = entry.AvgDaysInStock / float64(entry.UnitsAvailable)
		}
		resp.ByBrand = append(resp.ByBrand, *entry)
	}

	// Sort by brand name for consistency
	sort.Slice(resp.ByBrand, func(i, j int) bool {
		return resp.ByBrand[i].BrandName < resp.ByBrand[j].BrandName
	})

	return resp, nil
}

// ─── Cash Flow ───────────────────────────────────────────────────────────────

func (r *reportRepository) CashFlow(ctx context.Context, from, to time.Time, groupBy string) ([]dto.CashFlowEntry, error) {
	salesCol := r.db.Collection("sales")
	purchasesCol := r.db.Collection("purchases")
	expensesCol := r.db.Collection("expenses")

	// Choose date format string based on groupBy
	var dateFormat string
	switch groupBy {
	case "monthly":
		dateFormat = "%Y-%m"
	case "weekly":
		dateFormat = "%Y-W%V"
	default:
		dateFormat = "%Y-%m-%d"
	}

	// Money in: sales amount_paid by period
	salesPipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"created_at": bson.M{"$gte": from, "$lte": to},
			"status":     bson.M{"$ne": "cancelled"},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format": dateFormat,
					"date":   "$created_at",
				},
			},
			"money_in": bson.M{"$sum": "$amount_paid"},
		}}},
	}

	salesCur, err := salesCol.Aggregate(ctx, salesPipeline)
	if err != nil {
		return nil, err
	}
	defer salesCur.Close(ctx)

	type salesBucket struct {
		Period  string  `bson:"_id"`
		MoneyIn float64 `bson:"money_in"`
	}

	cashFlowMap := make(map[string]*dto.CashFlowEntry)

	for salesCur.Next(ctx) {
		var sb salesBucket
		if err := salesCur.Decode(&sb); err != nil {
			return nil, err
		}
		if _, exists := cashFlowMap[sb.Period]; !exists {
			cashFlowMap[sb.Period] = &dto.CashFlowEntry{Period: sb.Period}
		}
		cashFlowMap[sb.Period].MoneyIn = sb.MoneyIn
	}

	// Money out (part 1): purchases with status=received by period
	purchasesPipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"purchased_at": bson.M{"$gte": from, "$lte": to},
			"status":       "received",
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format": dateFormat,
					"date":   "$purchased_at",
				},
			},
			"purchase_cost": bson.M{"$sum": "$total_cost"},
		}}},
	}

	purchasesCur, err := purchasesCol.Aggregate(ctx, purchasesPipeline)
	if err != nil {
		return nil, err
	}
	defer purchasesCur.Close(ctx)

	type purchaseBucket struct {
		Period       string  `bson:"_id"`
		PurchaseCost float64 `bson:"purchase_cost"`
	}

	for purchasesCur.Next(ctx) {
		var pb purchaseBucket
		if err := purchasesCur.Decode(&pb); err != nil {
			return nil, err
		}
		if _, exists := cashFlowMap[pb.Period]; !exists {
			cashFlowMap[pb.Period] = &dto.CashFlowEntry{Period: pb.Period}
		}
		cashFlowMap[pb.Period].PurchaseCost = pb.PurchaseCost
	}

	// Money out (part 2): expenses by period
	expensePipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{
			"date": bson.M{"$gte": from, "$lte": to},
		}}},
		{{Key: "$group", Value: bson.M{
			"_id": bson.M{
				"$dateToString": bson.M{
					"format": dateFormat,
					"date":   "$date",
				},
			},
			"expense_cost": bson.M{"$sum": "$amount"},
		}}},
	}

	expenseCur, err := expensesCol.Aggregate(ctx, expensePipeline)
	if err != nil {
		return nil, err
	}
	defer expenseCur.Close(ctx)

	type expenseBucket struct {
		Period      string  `bson:"_id"`
		ExpenseCost float64 `bson:"expense_cost"`
	}

	for expenseCur.Next(ctx) {
		var eb expenseBucket
		if err := expenseCur.Decode(&eb); err != nil {
			return nil, err
		}
		if _, exists := cashFlowMap[eb.Period]; !exists {
			cashFlowMap[eb.Period] = &dto.CashFlowEntry{Period: eb.Period}
		}
		cashFlowMap[eb.Period].ExpenseCost = eb.ExpenseCost
	}

	// Build results and finalize calculations
	var results []dto.CashFlowEntry
	for _, entry := range cashFlowMap {
		entry.MoneyOut = entry.PurchaseCost + entry.ExpenseCost
		entry.NetCashFlow = entry.MoneyIn - entry.MoneyOut
		results = append(results, *entry)
	}

	// Sort by period ascending
	sort.Slice(results, func(i, j int) bool {
		return results[i].Period < results[j].Period
	})

	return results, nil
}
