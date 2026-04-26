// ============================================================
// MongoDB Init Script — runs once on first container start
// Creates the app DB user with least-privilege access.
// ============================================================

db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "aman_agency");

// Create app-level user (readWrite only — NOT root)
// Password is injected via MONGO_APP_PASSWORD env var in docker-compose.
// The app's MONGO_URI should use these credentials, not root.
db.createUser({
  user: "aman_app",
  pwd:  process.env.MONGO_APP_PASSWORD,   // required — fails loudly if unset
  roles: [{ role: "readWrite", db: process.env.MONGO_INITDB_DATABASE || "aman_agency" }]
});

// ── Indexes ─────────────────────────────────────────────────
// These are also created by the Go migration on startup,
// but seeding here ensures they exist before first API call.

db.users.createIndex({ email: 1 }, { unique: true });

db.brands.createIndex({ name: 1 }, { unique: true });

db.products.createIndex({ barcode: 1 }, { unique: true });
db.products.createIndex({ brand_id: 1 });

// imei1 is the primary IMEI — must be globally unique.
// imei2 is optional (dual-SIM) — sparse so missing/empty values don't collide.
db.devices.createIndex({ imei1: 1 }, { unique: true });
db.devices.createIndex({ imei2: 1 }, { unique: true, sparse: true });
db.devices.createIndex({ product_id: 1 });
db.devices.createIndex({ status: 1 });

db.customers.createIndex({ phone: 1 }, { unique: true });

db.vendors.createIndex({ phone: 1 }, { unique: true });
db.vendors.createIndex({ name: 1 });

db.sales.createIndex({ invoice_number: 1 }, { unique: true });
db.sales.createIndex({ customer_id: 1 });
db.sales.createIndex({ created_at: -1 });

db.purchases.createIndex({ vendor_id: 1 });
db.purchases.createIndex({ purchased_at: -1 });

db.credit_ledgers.createIndex({ customer_id: 1 });
db.credit_ledgers.createIndex({ created_at: -1 });

db.loan_references.createIndex({ sale_id: 1 });
db.loan_references.createIndex({ customer_id: 1 });

db.borrow_lends.createIndex({ device_id: 1 });
db.borrow_lends.createIndex({ status: 1 });
db.borrow_lends.createIndex({ type: 1 });

db.bills.createIndex({ sale_id: 1 },         { unique: true });
db.bills.createIndex({ invoice_number: 1 },  { unique: true });

db.notifications.createIndex({ customer_id: 1 });
db.notifications.createIndex({ sale_id: 1 });
db.notifications.createIndex({ status: 1 });
db.notifications.createIndex({ created_at: -1 });

db.settings.createIndex({ store_id: 1 }, { unique: true });

// ── Compound indexes for common query patterns ──────────────────
db.sales.createIndex({ customer_id: 1, created_at: -1 });
db.purchases.createIndex({ status: 1, purchased_at: -1 });
db.credit_ledgers.createIndex({ customer_id: 1, created_at: -1 });
db.borrow_lends.createIndex({ customer_id: 1, status: 1 });
db.borrow_lends.createIndex({ status: 1, return_due_date: 1 });
db.bills.createIndex({ status: 1, created_at: -1 });
db.notifications.createIndex({ is_read: 1, created_at: -1 });
db.notifications.createIndex({ user_id: 1, is_read: 1 });
db.devices.createIndex({ created_at: -1 });
db.devices.createIndex({ status: 1, product_id: 1 });
db.expenses.createIndex({ category: 1, recorded_date: -1 });
db.expenses.createIndex({ recorded_date: -1 });

// ── TTL index for notifications older than 90 days ───────────────
db.notifications.createIndex({ created_at: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// ── Audit logs indexes ────────────────────────────────────────────
db.audit_logs.createIndex({ actor_id: 1, created_at: -1 });
db.audit_logs.createIndex({ action: 1, created_at: -1 });
db.audit_logs.createIndex({ resource: 1, resource_id: 1 });
db.audit_logs.createIndex({ created_at: -1 });
db.audit_logs.createIndex({ created_at: 1 }, { expireAfterSeconds: 7776000 }); // 90-day TTL

// ── Trace logs indexes ─────────────────────────────────────────────
db.trace_logs.createIndex({ trace_id: 1 });
db.trace_logs.createIndex({ level: 1, created_at: -1 });
db.trace_logs.createIndex({ module: 1, created_at: -1 });
db.trace_logs.createIndex({ status: 1, created_at: -1 });
db.trace_logs.createIndex({ user_id: 1, created_at: -1 });
db.trace_logs.createIndex({ created_at: -1 });
db.trace_logs.createIndex({ tags: 1 });
db.trace_logs.createIndex({ created_at: 1 }, { expireAfterSeconds: 2592000 }); // 30-day TTL

print("✅ aman_agency database initialized with indexes.");
