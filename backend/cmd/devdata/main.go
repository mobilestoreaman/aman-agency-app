// devdata — inserts realistic sample data for development / testing.
//
// Run from the backend directory:
//
//	go run ./cmd/devdata
//
// Required env vars (same as the server — reads backend/.env automatically):
//
//	MONGO_URI, MONGO_DB
//
// What it inserts:
//   - 7 brands  (Samsung, Apple, Xiaomi, OnePlus, Realme, Vivo, Oppo)
//   - 18 products (various models + variants)
//   - 4 vendors
//   - 12 customers
//   - 4 purchases (received, with device records created)
//   - 36 devices in stock
//
// The command is safe to run multiple times only if the DB is empty.
// It will exit early if brands already exist.
package main

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/internal/models"
	"aman-agency/backend/platform/database"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func main() {
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: "15:04:05"})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	db, err := database.Connect(&cfg.Mongo)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to MongoDB")
	}
	defer func() {
		dctx, dcancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer dcancel()
		_ = db.Disconnect(dctx)
	}()

	// hasData returns true if the given collection already has documents.
	hasData := func(collection string) bool {
		n, _ := db.DB.Collection(collection).CountDocuments(ctx, bson.M{})
		return n > 0
	}

	now := time.Now()
	rng := rand.New(rand.NewSource(42)) // fixed seed → deterministic IMEIs

	// ── 1. Brands ────────────────────────────────────────────────────────────
	brandNames := []string{
		"Samsung", "Apple", "Xiaomi", "OnePlus", "Realme", "Vivo", "Oppo",
	}
	brandIDs := make(map[string]primitive.ObjectID, len(brandNames))

	if hasData("brands") {
		log.Warn().Msg("brands: already have data — loading existing IDs instead of inserting")
		// Load existing brand IDs so downstream collections can reference them
		cursor, err := db.DB.Collection("brands").Find(ctx, bson.M{})
		must(err, "load existing brands")
		var existingBrands []models.Brand
		must(cursor.All(ctx, &existingBrands), "decode existing brands")
		for _, b := range existingBrands {
			brandIDs[b.Name] = b.ID
		}
	} else {
		log.Info().Msg("inserting brands…")
		for _, name := range brandNames {
			id := primitive.NewObjectID()
			brandIDs[name] = id
			_, err := db.DB.Collection("brands").InsertOne(ctx, models.Brand{
				ID:        id,
				Name:      name,
				CreatedAt: now,
				UpdatedAt: now,
			})
			must(err, "insert brand "+name)
		}
		log.Info().Msgf("  inserted %d brands", len(brandNames))
	}

	// ── 2. Products ──────────────────────────────────────────────────────────
	type productSpec struct {
		Brand       string
		Model       string
		RAM         string
		Storage     string
		Color       string
		ScreenSize  string
		Barcode     string
		BarcodeType models.BarcodeType
		HasCharger  bool
		HasBox      bool
		HasCable    bool
	}

	specs := []productSpec{
		// Samsung
		{"Samsung", "Galaxy S24 Ultra", "12GB", "256GB", "Titanium Black", "6.8\"", "8806095071817", models.BarcodeEAN13, true, true, true},
		{"Samsung", "Galaxy S24 Ultra", "12GB", "512GB", "Titanium Gray", "6.8\"", "8806095071824", models.BarcodeEAN13, true, true, true},
		{"Samsung", "Galaxy A55 5G", "8GB", "128GB", "Awesome Navy", "6.6\"", "8806095271019", models.BarcodeEAN13, true, true, true},
		{"Samsung", "Galaxy A55 5G", "8GB", "256GB", "Awesome Lilac", "6.6\"", "8806095271026", models.BarcodeEAN13, true, true, true},
		{"Samsung", "Galaxy F15 5G", "6GB", "128GB", "Jazzy Green", "6.5\"", "8806095366570", models.BarcodeEAN13, true, true, false},
		// Apple
		{"Apple", "iPhone 15 Pro Max", "8GB", "256GB", "Black Titanium", "6.7\"", "194253743699", models.BarcodeEAN13, true, true, true},
		{"Apple", "iPhone 15 Pro Max", "8GB", "512GB", "Natural Titanium", "6.7\"", "194253743705", models.BarcodeEAN13, true, true, true},
		{"Apple", "iPhone 15", "6GB", "128GB", "Black", "6.1\"", "194253710676", models.BarcodeEAN13, true, true, true},
		{"Apple", "iPhone 15", "6GB", "256GB", "Blue", "6.1\"", "194253710683", models.BarcodeEAN13, true, true, true},
		// Xiaomi
		{"Xiaomi", "Redmi Note 13 Pro+", "12GB", "256GB", "Midnight Black", "6.67\"", "6941812756997", models.BarcodeEAN13, true, true, true},
		{"Xiaomi", "Redmi Note 13 Pro+", "8GB", "256GB", "Aurora Purple", "6.67\"", "6941812757000", models.BarcodeEAN13, true, true, true},
		{"Xiaomi", "POCO X6 Pro", "12GB", "256GB", "Black", "6.67\"", "6941812756799", models.BarcodeEAN13, true, true, false},
		// OnePlus
		{"OnePlus", "OnePlus 12", "16GB", "512GB", "Silky Black", "6.82\"", "6921815624904", models.BarcodeEAN13, true, true, true},
		{"OnePlus", "OnePlus Nord CE4", "8GB", "256GB", "Dark Chrome", "6.7\"", "6921815625062", models.BarcodeEAN13, true, true, true},
		// Realme
		{"Realme", "Realme 12 Pro+", "12GB", "256GB", "Navigator Beige", "6.7\"", "6941399093636", models.BarcodeEAN13, true, true, true},
		// Vivo
		{"Vivo", "Vivo V30 Pro", "12GB", "256GB", "Starlight Black", "6.78\"", "6935117883387", models.BarcodeEAN13, true, true, true},
		// Oppo
		{"Oppo", "Oppo Reno 11 Pro", "12GB", "256GB", "Rock Grey", "6.74\"", "6932169335459", models.BarcodeEAN13, true, true, true},
		{"Oppo", "Oppo F27 Pro+", "8GB", "256GB", "Amber Orange", "6.67\"", "6932169335466", models.BarcodeEAN13, true, false, true},
	}

	type productEntry struct {
		id          primitive.ObjectID
		productName string
		brandName   string
	}
	productMap := make(map[string]productEntry) // barcode → entry

	if hasData("products") {
		log.Warn().Msg("products: already have data — loading existing entries")
		cursor, err := db.DB.Collection("products").Find(ctx, bson.M{})
		must(err, "load existing products")
		var existingProducts []models.Product
		must(cursor.All(ctx, &existingProducts), "decode existing products")
		for _, p := range existingProducts {
			displayName := fmt.Sprintf("%s %s %s/%s %s", p.BrandName, p.ModelName, p.Variant.RAM, p.Variant.Storage, p.Color)
			productMap[p.Barcode] = productEntry{id: p.ID, productName: displayName, brandName: p.BrandName}
		}
	} else {
		log.Info().Msg("inserting products…")
		for _, s := range specs {
			id := primitive.NewObjectID()
			displayName := fmt.Sprintf("%s %s %s/%s %s", s.Brand, s.Model, s.RAM, s.Storage, s.Color)
			_, err := db.DB.Collection("products").InsertOne(ctx, models.Product{
				ID:          id,
				BrandID:     brandIDs[s.Brand],
				BrandName:   s.Brand,
				ModelName:   s.Model,
				Variant:     models.Variant{RAM: s.RAM, Storage: s.Storage},
				Color:       s.Color,
				ScreenSize:  s.ScreenSize,
				Barcode:     s.Barcode,
				BarcodeType: s.BarcodeType,
				Accessories: models.Accessories{
					HasCharger:   s.HasCharger,
					HasBox:       s.HasBox,
					HasCable:     s.HasCable,
					HasEarphones: false,
				},
				CreatedAt: now,
				UpdatedAt: now,
			})
			must(err, "insert product "+displayName)
			productMap[s.Barcode] = productEntry{id: id, productName: displayName, brandName: s.Brand}
		}
		log.Info().Msgf("  inserted %d products", len(specs))
	}

	// Helper: lookup product by barcode
	productByBarcode := func(barcode string) productEntry {
		return productMap[barcode]
	}

	// ── 3. Vendors ───────────────────────────────────────────────────────────
	type vendorData struct {
		id   primitive.ObjectID
		name string
	}
	vendorDefs := []struct {
		Name    string
		Phone   string
		Address string
	}{
		{"Tech Imports Pvt Ltd", "+911140001234", "45 Nehru Place, New Delhi - 110019"},
		{"Mobile Bazaar Distributors", "+912222345678", "Shop 12, Lamington Road, Mumbai - 400008"},
		{"Digital Hub Suppliers", "+918022987654", "88 Brigade Road, Bengaluru - 560025"},
		{"Prime Mobile Wholesale", "+914442123456", "15 Anna Salai, Chennai - 600002"},
	}
	vendors := make([]vendorData, len(vendorDefs))

	if hasData("vendors") {
		log.Warn().Msg("vendors: already have data — loading existing IDs")
		cursor, err := db.DB.Collection("vendors").Find(ctx, bson.M{})
		must(err, "load existing vendors")
		var existingVendors []models.Vendor
		must(cursor.All(ctx, &existingVendors), "decode existing vendors")
		for i := range vendors {
			if i < len(existingVendors) {
				vendors[i] = vendorData{id: existingVendors[i].ID, name: existingVendors[i].Name}
			}
		}
	} else {
		log.Info().Msg("inserting vendors…")
		for i, v := range vendorDefs {
			id := primitive.NewObjectID()
			vendors[i] = vendorData{id: id, name: v.Name}
			_, err := db.DB.Collection("vendors").InsertOne(ctx, models.Vendor{
				ID:        id,
				Name:      v.Name,
				Phone:     v.Phone,
				Address:   v.Address,
				CreatedAt: now,
				UpdatedAt: now,
			})
			must(err, "insert vendor "+v.Name)
		}
		log.Info().Msgf("  inserted %d vendors", len(vendors))
	}

	// ── 4. Customers ─────────────────────────────────────────────────────────
	customerDefs := []struct {
		Name    string
		Phone   string
		Address string
	}{
		{"Arjun Sharma", "+919876543210", "12 MG Road, Bengaluru - 560001"},
		{"Priya Mehta", "+919823456789", "7 Linking Road, Mumbai - 400054"},
		{"Rahul Verma", "+919934567891", "23 Civil Lines, Delhi - 110054"},
		{"Ananya Reddy", "+918765432109", "45 Banjara Hills, Hyderabad - 500034"},
		{"Vikram Singh", "+919988776655", "8 Sector 17, Chandigarh - 160017"},
		{"Kavya Nair", "+919870123456", "33 Ernakulam North, Kochi - 682018"},
		{"Rohan Gupta", "+919811234567", "56 Park Street, Kolkata - 700016"},
		{"Sneha Patel", "+917802345678", "14 CG Road, Ahmedabad - 380009"},
		{"Amit Kumar", "+919922334455", "90 Hazratganj, Lucknow - 226001"},
		{"Divya Iyer", "+918800998877", "11 T Nagar, Chennai - 600017"},
		{"Manish Joshi", "+917700112233", "5 FC Road, Pune - 411005"},
		{"Sunita Bhatia", "+919990887766", "22 Sadar Bazar, Jaipur - 302001"},
	}

	if hasData("customers") {
		log.Warn().Msg("customers: already have data — skipping")
	} else {
		log.Info().Msg("inserting customers…")
		for _, c := range customerDefs {
			_, err := db.DB.Collection("customers").InsertOne(ctx, models.Customer{
				ID:            primitive.NewObjectID(),
				Name:          c.Name,
				Phone:         c.Phone,
				Address:       c.Address,
				CreditBalance: 0,
				CreatedAt:     now,
				UpdatedAt:     now,
			})
			must(err, "insert customer "+c.Name)
		}
		log.Info().Msgf("  inserted %d customers", len(customerDefs))
	}

	// ── 5. Purchases + Devices ───────────────────────────────────────────────
	// Each purchase is already received, so we create both the Purchase doc
	// (status=received) and the corresponding Device docs (status=in_stock).

	// IMEI generator — 15 digit string; deterministic via fixed rng seed
	var imeiCounter int64 = 860000000000000 + int64(rng.Intn(99999999))
	nextIMEI := func() string {
		imeiCounter++
		return fmt.Sprintf("%015d", imeiCounter)
	}

	type purchaseSpec struct {
		VendorIdx   int
		DaysAgo     int
		Items       []struct {
			Barcode       string
			PurchasePrice float64
			Condition     models.DeviceCondition
			Color         string
		}
	}

	purchases := []purchaseSpec{
		{
			VendorIdx: 0, DaysAgo: 30,
			Items: []struct {
				Barcode       string
				PurchasePrice float64
				Condition     models.DeviceCondition
				Color         string
			}{
				{"8806095071817", 92000, models.ConditionNew, "Titanium Black"},
				{"8806095071817", 92000, models.ConditionNew, "Titanium Black"},
				{"8806095071824", 95000, models.ConditionNew, "Titanium Gray"},
				{"194253743699", 125000, models.ConditionNew, "Black Titanium"},
				{"194253743699", 125000, models.ConditionNew, "Black Titanium"},
				{"194253743705", 140000, models.ConditionNew, "Natural Titanium"},
				{"8806095271019", 28000, models.ConditionNew, "Awesome Navy"},
				{"8806095271019", 28000, models.ConditionNew, "Awesome Navy"},
				{"8806095271026", 30000, models.ConditionNew, "Awesome Lilac"},
				{"8806095271026", 30000, models.ConditionNew, "Awesome Lilac"},
			},
		},
		{
			VendorIdx: 1, DaysAgo: 20,
			Items: []struct {
				Barcode       string
				PurchasePrice float64
				Condition     models.DeviceCondition
				Color         string
			}{
				{"6941812756997", 31000, models.ConditionNew, "Midnight Black"},
				{"6941812756997", 31000, models.ConditionNew, "Midnight Black"},
				{"6941812757000", 28000, models.ConditionNew, "Aurora Purple"},
				{"6941812757000", 28000, models.ConditionNew, "Aurora Purple"},
				{"6941812756799", 25000, models.ConditionNew, "Black"},
				{"6941812756799", 25000, models.ConditionNew, "Black"},
				{"6921815624904", 56000, models.ConditionNew, "Silky Black"},
				{"6921815624904", 56000, models.ConditionNew, "Silky Black"},
				{"6921815625062", 22000, models.ConditionNew, "Dark Chrome"},
			},
		},
		{
			VendorIdx: 2, DaysAgo: 15,
			Items: []struct {
				Barcode       string
				PurchasePrice float64
				Condition     models.DeviceCondition
				Color         string
			}{
				{"6941399093636", 33000, models.ConditionNew, "Navigator Beige"},
				{"6941399093636", 33000, models.ConditionNew, "Navigator Beige"},
				{"6935117883387", 38000, models.ConditionNew, "Starlight Black"},
				{"6935117883387", 38000, models.ConditionNew, "Starlight Black"},
				{"6932169335459", 34000, models.ConditionNew, "Rock Grey"},
				{"6932169335459", 34000, models.ConditionNew, "Rock Grey"},
				{"6932169335466", 22000, models.ConditionNew, "Amber Orange"},
				{"6932169335466", 22000, models.ConditionNew, "Amber Orange"},
			},
		},
		{
			VendorIdx: 3, DaysAgo: 7,
			Items: []struct {
				Barcode       string
				PurchasePrice float64
				Condition     models.DeviceCondition
				Color         string
			}{
				{"194253710676", 68000, models.ConditionNew, "Black"},
				{"194253710676", 68000, models.ConditionNew, "Black"},
				{"194253710683", 75000, models.ConditionNew, "Blue"},
				{"8806095366570", 16000, models.ConditionNew, "Jazzy Green"},
				{"8806095366570", 16000, models.ConditionNew, "Jazzy Green"},
				{"8806095366570", 16000, models.ConditionNew, "Jazzy Green"},
				{"8806095366570", 16000, models.ConditionUsed, "Jazzy Green"},
				{"8806095366570", 16000, models.ConditionUsed, "Jazzy Green"},
			},
		},
	}

	totalDevices := 0

	purchasesExist := hasData("purchases")
	devicesExist   := hasData("devices")

	if purchasesExist || devicesExist {
		log.Warn().Msg("purchases/devices: already have data — skipping")
		n, _ := db.DB.Collection("devices").CountDocuments(ctx, bson.M{})
		totalDevices = int(n)
	} else {
		log.Info().Msg("inserting purchases and devices…")
		for _, ps := range purchases {
			purchasedAt := now.AddDate(0, 0, -ps.DaysAgo)
			receivedAt := purchasedAt.Add(24 * time.Hour)
			purchaseID := primitive.NewObjectID()
			vendor := vendors[ps.VendorIdx]

			var purchaseItems []models.PurchaseItem
			var deviceDocs []interface{}
			var totalCost float64

			for _, item := range ps.Items {
				p := productByBarcode(item.Barcode)
				imei1 := nextIMEI()
				deviceID := primitive.NewObjectID()
				dID := deviceID

				purchaseItems = append(purchaseItems, models.PurchaseItem{
					ProductID:     p.id,
					ProductName:   p.productName,
					BrandName:     p.brandName,
					IMEI1:         imei1,
					Condition:     item.Condition,
					Color:         item.Color,
					PurchasePrice: item.PurchasePrice,
					DeviceID:      &dID,
				})

				deviceDocs = append(deviceDocs, models.Device{
					ID:            deviceID,
					ProductID:     p.id,
					ProductName:   p.productName,
					BrandName:     p.brandName,
					IMEI1:         imei1,
					Status:        models.DeviceStatusAvailable,
					Condition:     item.Condition,
					Color:         item.Color,
					PurchasePrice: item.PurchasePrice,
					CreatedAt:     receivedAt,
					UpdatedAt:     receivedAt,
				})

				totalCost += item.PurchasePrice
			}

			_, err = db.DB.Collection("purchases").InsertOne(ctx, models.Purchase{
				ID:          purchaseID,
				VendorID:    vendor.id,
				VendorName:  vendor.name,
				Items:       purchaseItems,
				Status:      models.PurchaseStatusReceived,
				TotalCost:   totalCost,
				PurchasedAt: purchasedAt,
				ReceivedAt:  &receivedAt,
				CreatedAt:   purchasedAt,
				UpdatedAt:   receivedAt,
			})
			must(err, "insert purchase")

			_, err = db.DB.Collection("devices").InsertMany(ctx, deviceDocs)
			must(err, "insert devices for purchase")

			totalDevices += len(deviceDocs)
			log.Info().
				Str("vendor", vendor.name).
				Int("items", len(ps.Items)).
				Float64("total_cost", totalCost).
				Msg("  purchase inserted")
		}
		log.Info().Msgf("  inserted %d devices into inventory", totalDevices)
	}

	// ── Done ─────────────────────────────────────────────────────────────────
	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════════════════╗")
	fmt.Println("║          Aman Agency — Dev Data Seeded               ║")
	fmt.Println("╠══════════════════════════════════════════════════════╣")
	fmt.Printf( "║  Brands    : %-38d║\n", len(brandNames))
	fmt.Printf( "║  Products  : %-38d║\n", len(specs))
	fmt.Printf( "║  Vendors   : %-38d║\n", len(vendors))
	fmt.Printf( "║  Customers : %-38d║\n", len(customerDefs))
	fmt.Printf( "║  Purchases : %-38d║\n", len(purchases))
	fmt.Printf( "║  Devices   : %-38d║\n", totalDevices)
	fmt.Println("╚══════════════════════════════════════════════════════╝")
	fmt.Println()
}

func must(err error, context string) {
	if err != nil {
		log.Fatal().Err(err).Msgf("failed: %s", context)
	}
}
