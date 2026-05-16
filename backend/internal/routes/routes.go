// Package routes registers all API route groups onto the Fiber app.
// Dependencies are instantiated here and injected downward.
package routes

import (
	"context"
	"time"

	"aman-agency/backend/internal/config"
	"aman-agency/backend/internal/controller"
	"aman-agency/backend/internal/middleware"
	"aman-agency/backend/internal/repository"
	"aman-agency/backend/internal/service"
	appjwt "aman-agency/backend/pkg/jwt"
	"aman-agency/backend/platform/database"
	"aman-agency/backend/platform/whatsapp"

	"github.com/gofiber/fiber/v2"
	fiberlimiter "github.com/gofiber/fiber/v2/middleware/limiter"
	fiberswagger "github.com/gofiber/swagger"
	"github.com/rs/zerolog/log"
)

// Setup wires all dependencies and registers every route on the Fiber app.
func Setup(app *fiber.App, db *database.Client, cfg *config.Config) {

	// ── Shared dependencies ──────────────────────────────────────────
	jwtManager := appjwt.NewManager(&cfg.JWT)

	// ── Global middleware (applied to every request) ─────────────────
	app.Use(middleware.Recovery())
	app.Use(middleware.RequestID())     // X-Request-ID trace ID
	app.Use(middleware.RequestLogger()) // structured per-request log
	app.Use(middleware.CORS(&cfg.CORS))
	app.Use(middleware.SecurityHeaders())

	// ── Trace logging (MongoDB persistence) ────────────────────────
	traceLogRepo := repository.NewTraceLogRepository(db.DB)
	app.Use(middleware.TraceLogger(traceLogRepo, cfg))

	// ── Static file serving ──────────────────────────────────────────
	// Serves uploaded product images (and any other static assets) from
	// the local storage directory at the /static/ URL prefix.
	app.Static("/static", cfg.Upload.StoragePath)

	// ── Swagger UI — development only ────────────────────────────────
	if cfg.IsDevelopment() {
		app.Get("/api/swagger/*", fiberswagger.HandlerDefault)
	}

	// ── Health check (unauthenticated) ───────────────────────────────
	healthCtrl := controller.NewHealthController(&cfg.App, db)
	app.Get("/api/health", healthCtrl.Check)
	app.Get("/api/health/live", healthCtrl.Live)
	app.Get("/api/health/ready", healthCtrl.Ready)

	// ── WhatsApp provider setup (before routes that use it) ──────────
	// Startup is not aborted if provider config is missing; a noop is used instead.
	var waProvider whatsapp.MessageProvider
	waProvider, waErr := whatsapp.NewProvider()
	if waErr != nil {
		// Log the error but continue with a noop provider so the app still starts.
		log.Warn().Err(waErr).Str("provider", cfg.WhatsApp.Provider).
			Msg("WhatsApp provider failed to initialise — bill delivery will be disabled. Check WA_PROVIDER / WA_API_KEY env vars.")
		waProvider = &whatsapp.NoopProvider{}
	}

	// ── Public health status endpoint ────────────────────────────────
	app.Get("/health", func(c *fiber.Ctx) error {
		waStatus := "ok"
		if _, isNoop := waProvider.(*whatsapp.NoopProvider); isNoop {
			waStatus = "disabled"
		}
		return c.JSON(fiber.Map{
			"status":    "ok",
			"whatsapp":  waStatus,
		})
	})

	// ── API v1 ───────────────────────────────────────────────────────
	v1 := app.Group("/api/v1")

	// ── Auth routes ───────────────────────────────────────────────────
	authRepo := repository.NewUserRepository(db.DB)
	authSvc := service.NewAuthService(authRepo, jwtManager, &cfg.JWT)
	// Create audit service early so it can be passed to auth controller
	auditLogRepo := repository.NewAuditLogRepository(db.DB)
	auditSvc := service.NewAuditService(auditLogRepo)
	authCtrl := controller.NewAuthController(authSvc, auditSvc)

	// Rate limiter: max 10 auth attempts per minute per IP
	authLimiter := fiberlimiter.New(fiberlimiter.Config{
		Max:          10,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"error":   "too many requests — please wait before trying again",
			})
		},
	})

	// Rate limiter for write operations: max 120 mutations per minute per IP.
	// This prevents spam-creation of sales, purchases, expenses, etc.
	writeLimiter := fiberlimiter.New(fiberlimiter.Config{
		Max:          120,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() + ":" + c.Method() },
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"error":   "too many write requests — please slow down",
			})
		},
	})

	// Rate limiter for expensive read-only endpoints (reports, global search).
	// These run heavy MongoDB aggregation pipelines — limit to 30 req/min per IP
	// to prevent a single user from monopolising the DB under load.
	readLimiter := fiberlimiter.New(fiberlimiter.Config{
		Max:          30,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"error":   "too many requests — please wait before trying again",
			})
		},
	})

	auth := v1.Group("/auth")
	auth.Post("/login", authLimiter, authCtrl.Login)
	auth.Post("/refresh", authLimiter, authCtrl.Refresh)
	auth.Post("/logout", middleware.Authenticate(jwtManager), authCtrl.Logout)
	auth.Get("/me", middleware.Authenticate(jwtManager), authCtrl.Me)
	auth.Post("/change-password",
		middleware.Authenticate(jwtManager),
		authCtrl.ChangePassword,
	)

	// ── User management (admin only) ──────────────────────────────────
	users := v1.Group("/users",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
	)
	users.Get("", authCtrl.ListUsers)
	users.Post("", authCtrl.CreateUser)
	users.Patch("/:id", authCtrl.UpdateUser)

	// ── File uploads ─────────────────────────────────────────────────
	uploadCtrl := controller.NewUploadController(cfg.Upload.StoragePath, cfg.Upload.StaticBaseURL)
	v1.Post("/upload/product-image",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		uploadCtrl.UploadProductImage,
	)

	// ── Step 5: Brands & Products ────────────────────────────────────
	brandRepo := repository.NewBrandRepository(db.DB)
	productRepo := repository.NewProductRepository(db.DB)

	brandSvc := service.NewBrandService(brandRepo, productRepo)
	productSvc := service.NewProductService(productRepo, brandRepo)

	// Brand controller receives productSvc to serve nested /brands/:id/products
	brandCtrl := controller.NewBrandController(brandSvc, productSvc)
	productCtrl := controller.NewProductController(productSvc)

	// Brands — staff read, admin write
	brandsPublic := v1.Group("/brands", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	brandsPublic.Get("", brandCtrl.List)
	brandsPublic.Get("/:id", brandCtrl.GetByID)
	brandsPublic.Get("/:id/products", brandCtrl.GetProducts) // nested list

	brandsAdmin := v1.Group("/brands", middleware.Authenticate(jwtManager), middleware.AdminOnly(), writeLimiter)
	brandsAdmin.Post("", brandCtrl.Create)
	brandsAdmin.Put("/:id", brandCtrl.Update)
	brandsAdmin.Delete("/:id", brandCtrl.Delete)

	// Products — barcode MUST be before /:id to avoid route shadowing
	productsAuth := v1.Group("/products", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	productsAuth.Get("/barcode/:barcode", productCtrl.GetByBarcode)
	productsAuth.Get("", productCtrl.List)
	productsAuth.Get("/:id", productCtrl.GetByID)

	productsAdmin := v1.Group("/products", middleware.Authenticate(jwtManager), middleware.AdminOnly(), writeLimiter)
	productsAdmin.Post("", productCtrl.Create)
	productsAdmin.Put("/:id", productCtrl.Update)
	productsAdmin.Delete("/:id", productCtrl.Delete)

	// ── Step 6: Inventory (Devices + Stock) ─────────────────────────
	deviceRepo := repository.NewDeviceRepository(db.DB)
	deviceSvc := service.NewDeviceService(deviceRepo, productRepo)
	deviceCtrl := controller.NewDeviceController(deviceSvc)

	// Devices — IMEI lookup must be before /:id to avoid route shadowing
	devicesAuth := v1.Group("/devices", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	devicesAuth.Get("/imei/:imei", deviceCtrl.GetByIMEI)
	devicesAuth.Get("", deviceCtrl.List)
	devicesAuth.Get("/:id", deviceCtrl.GetByID)

	devicesAdmin := v1.Group("/devices", middleware.Authenticate(jwtManager), middleware.AdminOnly(), writeLimiter)
	devicesAdmin.Post("", deviceCtrl.Create)
	devicesAdmin.Put("/:id", deviceCtrl.Update)
	devicesAdmin.Patch("/:id/status", deviceCtrl.ChangeStatus)
	devicesAdmin.Delete("/:id", deviceCtrl.Delete)

	// Stock summary — staff can read, admin writes nothing here
	stock := v1.Group("/stock", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	stock.Get("/summary", deviceCtrl.StockSummary)

	// ── Step 7: Vendors & Purchases ─────────────────────────────────
	vendorRepo := repository.NewVendorRepository(db.DB)
	purchaseRepo := repository.NewPurchaseRepository(db.DB)
	vendorLedgerRepo := repository.NewVendorLedgerRepository(db.DB)

	vendorSvc := service.NewVendorService(vendorRepo, purchaseRepo, vendorLedgerRepo)
	vendorLedgerSvc := service.NewVendorLedgerService(vendorLedgerRepo, vendorRepo)
	purchaseSvc := service.NewPurchaseService(purchaseRepo, vendorRepo, productRepo, deviceRepo, vendorLedgerSvc)

	vendorCtrl := controller.NewVendorController(vendorSvc)
	purchaseCtrl := controller.NewPurchaseController(purchaseSvc)
	vendorLedgerCtrl := controller.NewVendorLedgerController(vendorLedgerSvc, auditSvc)

	// Vendors — staff read, admin write
	// IMPORTANT: ALL sub-path routes (/:id/something) must be registered in this
	// group BEFORE /:id. Fiber's trie resolves the /:id node first, so any sub-path
	// route in a separate group never gets matched. Admin-only sub-paths carry an
	// extra inline AdminOnly() middleware instead of relying on a separate group.
	vendorsPublic := v1.Group("/vendors", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	vendorsPublic.Get("", vendorCtrl.List)
	vendorsPublic.Get("/:id/ledger", vendorLedgerCtrl.ListByVendor)
	vendorsPublic.Post("/:id/payments", middleware.AdminOnly(), vendorLedgerCtrl.RecordPayment)
	vendorsPublic.Post("/:id/adjustments", middleware.AdminOnly(), vendorLedgerCtrl.RecordAdjustment)
	vendorsPublic.Post("/:id/opening_balance", middleware.AdminOnly(), vendorLedgerCtrl.RecordOpeningBalance)
	vendorsPublic.Get("/:id", vendorCtrl.GetByID)

	vendorsAdmin := v1.Group("/vendors", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	vendorsAdmin.Post("", vendorCtrl.Create)
	vendorsAdmin.Put("/:id", vendorCtrl.Update)
	vendorsAdmin.Delete("/:id", vendorCtrl.Delete)

	// Vendor ledger aging — must be BEFORE /vendor-ledger to avoid shadowing
	v1.Get("/vendor-ledger/aging",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		vendorLedgerCtrl.Aging,
	)

	// Global vendor ledger listing (any staff can read across all vendors)
	v1.Get("/vendor-ledger",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		vendorLedgerCtrl.List,
	)

	// Purchases — staff read, admin write + receive
	purchasesPublic := v1.Group("/purchases", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	purchasesPublic.Get("", purchaseCtrl.List)
	purchasesPublic.Get("/:id", purchaseCtrl.GetByID)

	purchasesAdmin := v1.Group("/purchases", middleware.Authenticate(jwtManager), middleware.AdminOnly(), writeLimiter)
	purchasesAdmin.Post("", purchaseCtrl.Create)
	purchasesAdmin.Put("/:id", purchaseCtrl.Update)
	purchasesAdmin.Patch("/:id/receive", purchaseCtrl.Receive)
	purchasesAdmin.Delete("/:id", purchaseCtrl.Delete)

	// ── Step 8: Customers & Sales ────────────────────────────────────
	customerRepo := repository.NewCustomerRepository(db.DB)
	saleRepo := repository.NewSaleRepository(db.DB)
	userRepo := repository.NewUserRepository(db.DB)

	// Credit ledger repo declared here (was previously Step 9) so it can be
	// injected into both customerSvc (deletion guard) and saleSvc.
	creditLedgerRepo := repository.NewCreditLedgerRepository(db.DB)

	customerSvc := service.NewCustomerService(customerRepo, saleRepo)

	// Bill repo declared here so it can be injected into saleSvc for handling orphaned bills on cancellation.
	billRepo := repository.NewBillRepository(db.DB)

	// loanRefRepo declared here (before saleSvc) so it can be injected into saleSvc
	// for auto-creating LoanReference records when payment_mode == "emi".
	loanRefRepo := repository.NewLoanReferenceRepository(db.DB)

	saleSvc := service.NewSaleService(saleRepo, customerRepo, deviceRepo, userRepo, creditLedgerRepo, billRepo, loanRefRepo)

	customerCtrl := controller.NewCustomerController(customerSvc)
	saleCtrl := controller.NewSaleController(saleSvc, auditSvc)

	// Customers — any staff can read + create; only admin can delete
	customersAny := v1.Group("/customers", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	customersAny.Get("", customerCtrl.List)
	customersAny.Get("/:id", customerCtrl.GetByID)
	customersAny.Post("", customerCtrl.Create)
	customersAny.Put("/:id", customerCtrl.Update)

	customersAdmin := v1.Group("/customers", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	customersAdmin.Delete("/:id", customerCtrl.Delete)

	// Sales — any staff can create + read; only admin can cancel
	salesAny := v1.Group("/sales", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	salesAny.Get("", saleCtrl.List)
	salesAny.Get("/:id", saleCtrl.GetByID)
	salesAny.Post("", writeLimiter, saleCtrl.Create)

	salesAdmin := v1.Group("/sales", middleware.Authenticate(jwtManager), middleware.AdminOnly(), writeLimiter)
	salesAdmin.Patch("/:id/cancel", saleCtrl.Cancel)

	// ── Step 9: Credit Ledger ────────────────────────────────────────
	// creditLedgerRepo is declared in Step 8 (shared with customerSvc + saleSvc).
	creditLedgerSvc := service.NewCreditLedgerService(creditLedgerRepo, customerRepo, saleRepo)
	creditLedgerCtrl := controller.NewCreditLedgerController(creditLedgerSvc, auditSvc)

	// Global ledger listing (any staff can read across all customers)
	v1.Get("/credit-ledger",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		creditLedgerCtrl.List,
	)

	// Per-customer ledger history + payments: any authenticated staff
	// Adjustments: admin only
	customersAny.Get("/:id/ledger", creditLedgerCtrl.ListByCustomer)
	customersAny.Post("/:id/payments", creditLedgerCtrl.RecordPayment)
	customersAdmin.Post("/:id/adjustments", creditLedgerCtrl.RecordAdjustment)

	// ── Step 10: Loan References ─────────────────────────────────────
	// loanRefRepo is already declared in Step 8 (injected into saleSvc for EMI auto-creation).
	loanRefSvc := service.NewLoanReferenceService(loanRefRepo, customerRepo, saleRepo)
	loanRefCtrl := controller.NewLoanReferenceController(loanRefSvc)

	// Any staff can read + create + update; admin-only for status change + delete
	loanRefsAny := v1.Group("/loan-references", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	loanRefsAny.Get("", loanRefCtrl.List)
	loanRefsAny.Get("/:id", loanRefCtrl.GetByID)
	loanRefsAny.Post("", loanRefCtrl.Create)
	loanRefsAny.Put("/:id", loanRefCtrl.Update)

	loanRefsAdmin := v1.Group("/loan-references", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	loanRefsAdmin.Patch("/:id/status", loanRefCtrl.ChangeStatus)
	loanRefsAdmin.Delete("/:id", loanRefCtrl.Delete)

	// ── Step 11: Borrow / Lend ───────────────────────────────────────
	borrowLendRepo := repository.NewBorrowLendRepository(db.DB)
	borrowLendSvc := service.NewBorrowLendService(borrowLendRepo, deviceRepo, customerRepo)
	borrowLendCtrl := controller.NewBorrowLendController(borrowLendSvc)

	// Any staff: read + create + update + return
	// Admin only: mark overdue + delete
	blAny := v1.Group("/borrow-lends", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	blAny.Get("", borrowLendCtrl.List)
	blAny.Get("/:id", borrowLendCtrl.GetByID)
	blAny.Post("", borrowLendCtrl.Create)
	blAny.Put("/:id", borrowLendCtrl.Update)
	blAny.Patch("/:id/return", borrowLendCtrl.Return)

	blAdmin := v1.Group("/borrow-lends", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	blAdmin.Patch("/:id/overdue", borrowLendCtrl.MarkOverdue)
	blAdmin.Delete("/:id", borrowLendCtrl.Delete)

	// ── Settings repo (needed by both Step 12 billing and Step 15 settings) ──
	settingsRepo := repository.NewSettingsRepository(db.DB)

	// ── Step 12: Billing ────────────────────────────────────────────
	// billRepo is already declared in Step 8 for use in saleSvc.
	billSvc := service.NewBillService(billRepo, saleRepo)

	billCtrl := controller.NewBillController(
		billSvc,
		auditSvc,
		settingsRepo,
		waProvider,
		cfg.PDF.StoragePath,
		cfg.PDF.StaticBaseURL,
	)

	// Any staff can read + create + issue; admin only can void
	// IMPORTANT: /sale/:sale_id MUST be registered before /:id to prevent shadowing
	// IMPORTANT: /invoice and /whatsapp MUST be registered before /:id
	billsAny := v1.Group("/bills", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	billsAny.Get("/sale/:sale_id", billCtrl.GetBySaleID)
	billsAny.Get("", billCtrl.List)
	billsAny.Get("/:id/invoice", billCtrl.Invoice)
	billsAny.Get("/:id", billCtrl.GetByID)
	billsAny.Post("", billCtrl.Create)
	billsAny.Patch("/:id/issue", billCtrl.Issue)
	billsAny.Post("/:id/whatsapp", billCtrl.SendWhatsApp)

	billsAdmin := v1.Group("/bills", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	billsAdmin.Patch("/:id/void", billCtrl.Void)

	// ── Step 13: Reports (admin-only, read-only) ─────────────────────
	reportRepo := repository.NewReportRepository(db.DB)
	reportSvc := service.NewReportService(reportRepo)
	reportCtrl := controller.NewReportController(reportSvc)

	reports := v1.Group("/reports",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		readLimiter,
	)
	reports.Get("/revenue", reportCtrl.RevenueSummary)
	reports.Get("/stock-valuation", reportCtrl.StockValuation)
	reports.Get("/credit-summary", reportCtrl.CreditSummary)
	reports.Get("/sales-by-period", reportCtrl.SalesByPeriod)
	reports.Get("/profit-loss", reportCtrl.ProfitLoss)
	reports.Get("/product-performance", reportCtrl.ProductPerformance)
	reports.Get("/customer-insights", reportCtrl.CustomerInsights)
	reports.Get("/inventory-health", reportCtrl.InventoryHealth)
	reports.Get("/cash-flow", reportCtrl.CashFlow)

	// ── Step 14: Notifications ────────────────────────────────────────
	notifRepo := repository.NewNotificationRepository(db.DB)
	notifSvc := service.NewNotificationService(notifRepo)
	notifCtrl := controller.NewNotificationController(notifSvc)

	// Any staff can read + mark; only admin can create + delete.
	// IMPORTANT: static segments (unread-count, read-all) BEFORE /:id
	notifsAny := v1.Group("/notifications", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	notifsAny.Get("/unread-count", notifCtrl.UnreadCount) // before /:id
	notifsAny.Patch("/read-all", notifCtrl.MarkAllRead)   // before /:id
	notifsAny.Get("", notifCtrl.List)
	notifsAny.Patch("/:id/read", notifCtrl.MarkRead)
	notifsAny.Patch("/:id/dismiss", notifCtrl.Dismiss)

	notifsAdmin := v1.Group("/notifications", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	notifsAdmin.Post("", notifCtrl.Create)
	notifsAdmin.Delete("/:id", notifCtrl.Delete)

	// ── Step 15: Settings ────────────────────────────────────────────
	// settingsRepo was already declared above for billing; reuse it here.
	settingsSvc := service.NewSettingsService(settingsRepo)
	settingsCtrl := controller.NewSettingsController(settingsSvc, auditSvc)

	// Any staff can read; only admin can write.
	v1.Get("/settings",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		settingsCtrl.Get,
	)
	v1.Put("/settings",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		settingsCtrl.Update,
	)
	// Logo upload/removal — admin only, separate endpoints to avoid sending
	// the full base64 payload through the general settings PUT.
	v1.Post("/settings/logo",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		settingsCtrl.UploadLogo,
	)
	v1.Delete("/settings/logo",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		settingsCtrl.DeleteLogo,
	)

	// ── Step 16: Expenses ────────────────────────────────────────────
	expenseRepo := repository.NewExpenseRepository(db.DB)
	expenseSvc := service.NewExpenseService(expenseRepo)
	expenseCtrl := controller.NewExpenseController(expenseSvc)

	// Any staff can read; only admin can write + delete.
	// IMPORTANT: /summary must be before /:id to prevent route shadowing.
	expensesAny := v1.Group("/expenses", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	expensesAny.Get("/summary", expenseCtrl.Summary) // before /:id
	expensesAny.Get("", expenseCtrl.List)
	expensesAny.Get("/:id", expenseCtrl.GetByID)

	expensesAdmin := v1.Group("/expenses", middleware.Authenticate(jwtManager), middleware.AdminOnly(), writeLimiter)
	expensesAdmin.Post("", expenseCtrl.Create)
	expensesAdmin.Put("/:id", expenseCtrl.Update)
	expensesAdmin.Delete("/:id", expenseCtrl.Delete)

	// ── Step 17: Dashboard + Global Search ──────────────────────────
	dashboardRepo := repository.NewDashboardRepository(db.DB)
	dashboardSvc := service.NewDashboardService(dashboardRepo, settingsRepo)
	dashboardCtrl := controller.NewDashboardController(dashboardSvc)

	v1.Get("/dashboard",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		dashboardCtrl.Get,
	)
	v1.Get("/dashboard/closing",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		dashboardCtrl.DailyClosing,
	)
	v1.Get("/dashboard/my-performance",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		dashboardCtrl.StaffPerformance,
	)

	searchSvc := service.NewSearchService(db.DB)
	searchCtrl := controller.NewSearchController(searchSvc)

	v1.Get("/search",
		middleware.Authenticate(jwtManager),
		middleware.AnyStaff(),
		readLimiter,
		searchCtrl.Search,
	)

	// ── Step 18: Payment Promises ────────────────────────────────────
	promiseRepo := repository.NewPaymentPromiseRepository(db.DB)
	promiseSvc := service.NewPaymentPromiseService(promiseRepo, customerRepo, saleRepo, notifSvc)
	promiseCtrl := controller.NewPaymentPromiseController(promiseSvc)

	// Any staff can create + view + mark paid/reschedule.
	// Admin-only: mark broken.
	// IMPORTANT: static segments before /:id
	promisesAny := v1.Group("/payment-promises", middleware.Authenticate(jwtManager), middleware.AnyStaff())
	promisesAny.Get("", promiseCtrl.List)
	promisesAny.Post("", promiseCtrl.Create)
	promisesAny.Post("/bulk-paid", promiseCtrl.BulkMarkPaid)
	promisesAny.Patch("/:id/reschedule", promiseCtrl.Reschedule)
	promisesAny.Patch("/:id/paid", promiseCtrl.MarkPaid)

	promisesAdmin := v1.Group("/payment-promises", middleware.Authenticate(jwtManager), middleware.AdminOnly())
	promisesAdmin.Patch("/:id/broken", promiseCtrl.MarkBroken)

	// ── Step 19: Audit Logs (admin-only read) ────────────────────────
	// auditLogRepo and auditSvc already created in Step 2 (auth routes)
	auditCtrl := controller.NewAuditLogController(auditSvc)

	// Admin only: view audit logs for compliance and debugging
	auditLogs := v1.Group("/admin/audit-logs",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
	)
	auditLogs.Get("", auditCtrl.List)

	// ── Step 20: Trace Logs (admin-only read) ──────────────────────
	// traceLogRepo already created in global middleware section
	traceLogSvc := service.NewTraceLogService(traceLogRepo)
	traceLogCtrl := controller.NewTraceLogController(traceLogSvc)

	// Admin only: view trace logs for debugging and monitoring
	traceLogs := v1.Group("/admin/logs",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
	)
	traceLogs.Get("", traceLogCtrl.List)
	traceLogs.Get("/export", traceLogCtrl.Export)      // BEFORE /:id to avoid conflict
	traceLogs.Get("/trace/:traceID", traceLogCtrl.GetTrace)
	traceLogs.Get("/:id", traceLogCtrl.GetByID)

	// ── Step 21: DB Explorer (admin-only) ───────────────────────
	// Provides secure read-only introspection of all MongoDB collections
	// with sensitive field masking and dump generation.
	adminDBRepo := repository.NewAdminRepository(db.DB)
	adminSvc := service.NewAdminService(adminDBRepo)
	adminCtrl := controller.NewAdminController(adminSvc, auditSvc)

	// Rate-limit: expensive read operations — 20 requests/minute per IP.
	dbExplorerLimiter := fiberlimiter.New(fiberlimiter.Config{
		Max:          20,
		Expiration:   1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string { return c.IP() },
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"success": false,
				"error":   "too many DB explorer requests — please slow down",
			})
		},
	})

	// All DB explorer routes require admin role.
	adminDB := v1.Group("/admin/db",
		middleware.Authenticate(jwtManager),
		middleware.AdminOnly(),
		dbExplorerLimiter,
	)

	// Collections
	adminDB.Get("/collections", adminCtrl.ListCollections)
	adminDB.Get("/collections/:collection/stats", adminCtrl.GetCollectionStats)

	// Documents — static sub-paths BEFORE /:id
	adminDB.Get("/collections/:collection/documents", adminCtrl.ListDocuments)
	adminDB.Get("/collections/:collection/documents/:id", adminCtrl.GetDocument)

	// Dumps — static paths BEFORE /:id
	adminDB.Get("/dump/history", adminCtrl.ListDumpHistory)
	adminDB.Post("/dump/generate", adminCtrl.GenerateDump)
	adminDB.Get("/dump/:id/download", adminCtrl.DownloadDump)

	// ── Background: Payment promise due-date notifications ───────────
	// Runs every hour. On each tick, any promise whose date is today
	// and has not yet been notified will trigger a credit_due alert.
	// The goroutine uses the Fiber shutdown signal to stop cleanly.
	notifyCtx, notifyCancel := context.WithCancel(context.Background())
	go func() {
		defer notifyCancel()
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		// Run once immediately at startup, then on each tick.
		// Wrap each call with a 30-second timeout to prevent long-running operations.
		callCtx, callCancel := context.WithTimeout(notifyCtx, 30*time.Second)
		promiseSvc.NotifyDueToday(callCtx)
		callCancel()
		for {
			select {
			case <-ticker.C:
				callCtx, callCancel := context.WithTimeout(notifyCtx, 30*time.Second)
				promiseSvc.NotifyDueToday(callCtx)
				callCancel()
			case <-notifyCtx.Done():
				return
			}
		}
	}()
	// Cancel the background goroutine when the app is shutting down.
	app.Hooks().OnShutdown(func() error {
		notifyCancel()
		return nil
	})

	// ── 404 catch-all (must be last) ─────────────────────────────────
	app.Use(func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"success": false,
			"error":   "route not found",
		})
	})
}
