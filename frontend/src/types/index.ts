// =============================================================
// Aman Agency — TypeScript types mirroring the backend DTOs
// =============================================================

// ── Pagination ────────────────────────────────────────────────
export interface PaginationMeta {
  page:        number
  limit:       number   // backend sends "limit", not "page_size"
  total:       number
  total_pages: number
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  meta: PaginationMeta
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

// ── Auth ──────────────────────────────────────────────────────
export type UserRole = 'admin' | 'staff'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'Bearer'
}

export interface LoginResponse {
    user: User
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: 'Bearer'
}

export interface LoginRequest {
  email: string
  password: string
}

// ── Brand ────────────────────────────────────────────────────
export interface Brand {
  id: string
  name: string
  logo_url?: string
  created_at: string
  updated_at: string
}

// ── Product ──────────────────────────────────────────────────
export interface ProductVariant {
  ram: string
  storage: string
}

export interface ProductAccessories {
  has_charger: boolean
  has_earphones: boolean
  has_cable: boolean
  has_box: boolean
}

export interface Product {
  id: string
  brand_id: string
  brand_name: string
  model_name: string
  display_name: string
  variant: ProductVariant
  color: string
  screen_size?: string
  barcode: string
  barcode_type?: string
  accessories: ProductAccessories
  images?: string[]  // up to 3 product photo URLs
  created_at: string
  updated_at: string
}

// ── Device (Inventory) ────────────────────────────────────────
export type DeviceStatus = 'available' | 'sold' | 'repair' | 'returned' | 'defective'
export type DeviceCondition = 'new' | 'used' | 'refurbished'

export interface Device {
  id: string
  product_id: string
  product_name: string
  brand_name: string
  imei1: string
  imei2?: string
  condition: DeviceCondition
  status: DeviceStatus
  color?: string
  storage?: string
  purchase_price: number
  selling_price: number
  notes?: string
  created_at: string
  updated_at: string
}

// One row per product in the stock summary aggregation
export interface StockSummaryRow {
  product_id:   string
  product_name: string
  brand_name:   string
  in_stock:     number  // available + legacy in_stock counts
  sold:         number
  repair:       number
  returned:     number
  defective:    number
  total:        number
}

// Response shape from GET /stock/summary
export interface StockSummary {
  rows:           StockSummaryRow[]
  total_in_stock: number
  total_units:    number
}

// ── Vendor ───────────────────────────────────────────────────
export interface Vendor {
  id: string
  name: string
  phone: string
  address?: string
  notes?: string
  /** Running total of what the business owes this vendor. Positive = owes vendor. */
  payable_balance: number
  /** True once any ledger entry has been recorded for this vendor. Used to gate
   *  the "Set opening balance" button — that action is only valid before any
   *  financial history exists. */
  has_ledger: boolean
  created_at: string
  updated_at: string
}

// ── Purchase ─────────────────────────────────────────────────
export type PurchaseStatus = 'pending' | 'received' | 'cancelled'

export interface PurchaseItem {
  product_id: string
  product_name: string
  brand_name: string
  imei1: string
  imei2?: string
  condition: string
  color?: string
  storage?: string
  purchase_price: number
  selling_price?: number
  device_id?: string
}

export interface Purchase {
  id: string
  vendor_id: string
  vendor_name: string
  status: PurchaseStatus
  items: PurchaseItem[]
  total_cost: number
  notes?: string
  purchased_at: string
  received_at?: string
  created_at: string
  updated_at: string
}

// ── Customer ─────────────────────────────────────────────────
export interface Customer {
  id: string
  name: string
  phone: string
  address?: string
  credit_balance: number
  credit_ceiling?: number
  notes?: string
  created_at: string
  updated_at: string
}

// ── Sale ─────────────────────────────────────────────────────
export type SaleStatus = 'completed' | 'cancelled'

export interface SaleItem {
  device_id:      string
  product_name:   string
  brand_name?:    string
  /** Primary IMEI / serial number (from backend). */
  imei1:          string
  /** Secondary IMEI for dual-SIM devices (from backend). */
  imei2?:         string
  /** Agreed sale price (from backend). */
  sale_price:     number
  purchase_price: number
  // ── Backward-compat aliases used by form/display code ──────
  /** @deprecated use sale_price */
  selling_price?: number
  /** @deprecated use imei1 */
  imei?:          string
  color?:         string
  storage?:       string
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit' | 'emi'

export interface Sale {
  id:             string
  invoice_number: string
  customer_id:    string
  customer_name:  string
  customer_phone: string
  staff_id:       string
  staff_name:     string
  status:         SaleStatus
  items:          SaleItem[]
  total_amount:   number
  amount_paid:    number
  balance:        number
  payment_mode?:       PaymentMode
  finance_provider?:   string
  finance_company_name?: string
  notes?:              string
  sold_at:             string
  cancelled_at?:  string
  created_at:     string
  updated_at:     string
  // ── Extended fields (from detail API) ───────────────────────
  subtotal?:      number
  discount?:      number
  // ── Backward-compat aliases ──────────────────────────────────
  /** @deprecated use total_amount */
  total?:         number
  /** @deprecated use staff_name */
  sold_by_name?:  string
  /** @deprecated use sold_at */
  sale_date?:     string
}

// ── Credit Ledger ─────────────────────────────────────────────
// Backend types: sale | payment | adjustment | cancellation
// Amount sign: > 0 = debit (customer owes more), < 0 = credit (balance reduced)
export type LedgerEntryType = 'sale' | 'payment' | 'adjustment' | 'cancellation'

export interface CreditLedgerEntry {
  id: string
  customer_id: string
  customer_name: string
  type: LedgerEntryType
  /** Positive = debit (customer owes more). Negative = credit (balance reduced). */
  amount: number
  balance_after: number
  /** Invoice number or free-text reference (present for sale/cancellation entries). */
  reference?: string
  /** Sale ObjectID — present when type is 'sale' or 'cancellation'. */
  sale_id?: string
  notes?: string
  created_by: string
  created_at: string
}

// ── Loan Reference ────────────────────────────────────────────
export type LoanStatus = 'active' | 'closed' | 'overdue'
export type LoanProvider = 'bajaj' | 'tata_capital' | 'hdb_financial' | 'home_credit' | 'hdfc' | 'icici' | 'axis' | 'idfc' | 'tvs_credit' | 'other'

export interface LoanReference {
  id: string
  customer_id: string
  customer_name: string
  sale_id?: string
  invoice_number?: string
  provider: LoanProvider
  /** Free-text name used when provider === 'other'. */
  finance_company_name?: string
  loan_account_number: string
  loan_amount: number
  emi_amount?: number
  tenure_months?: number
  status: LoanStatus
  disbursed_date?: string
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
}

// ── Borrow / Lend ─────────────────────────────────────────────
export type BorrowLendType = 'borrow' | 'lend'
export type BorrowLendStatus = 'active' | 'returned' | 'overdue'
/**
 * How the borrow/lend was closed out:
 * - 'device'  → the physical device was returned
 * - 'payment' → instead of returning, the party paid the agreed amount
 */
export type BorrowLendResolution = 'device' | 'payment'

export interface BorrowLend {
  id: string
  type: BorrowLendType
  device_id?: string
  /** Human-readable device description stored at entry time, e.g. "Samsung S21 – IMEI: 352099001761481" */
  device_desc: string
  customer_id?: string
  customer_name?: string
  party_name: string
  party_phone?: string
  status: BorrowLendStatus
  borrow_date: string           // DD-MM-YYYY IST
  expected_return_date?: string // DD-MM-YYYY IST
  actual_return_date?: string   // DD-MM-YYYY IST
  /** How the entry was resolved once status = 'returned' */
  resolution_type?: BorrowLendResolution
  /** Amount paid when resolution_type = 'payment' */
  settlement_amount?: number
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
}

// ── Bill ─────────────────────────────────────────────────────
export type BillStatus = 'draft' | 'issued' | 'voided'

export interface BillItem {
  device_id:      string
  product_name:   string
  brand_name:     string
  imei1:          string
  imei2?:         string
  unit_price:     number
  purchase_price: number
}

export interface Bill {
  id:             string
  bill_number:    string
  sale_id:        string
  customer_id:    string
  customer_name:  string
  customer_phone: string
  items:          BillItem[]
  subtotal:       number
  discount:       number
  discount_pct:   number
  tax:            number
  tax_pct:        number
  total_amount:   number
  amount_paid:    number
  balance:        number
  status:         BillStatus
  notes?:         string
  issued_at?:     string
  voided_at?:     string
  created_by:     string
  created_at:     string
  updated_at:     string
}

// ── Reports ──────────────────────────────────────────────────
export interface PaymentModeBreakdown {
  mode: string  // "cash" | "credit" | "emi" | "other"
  count: number
  revenue: number
  collected: number
}

export interface RevenueSummary {
  from: string
  to: string
  total_sales: number
  total_revenue: number
  total_collected: number
  total_outstanding: number
  avg_sale_value: number
  cancelled_count: number
  by_payment_mode?: PaymentModeBreakdown[]
}

export interface StockValuation {
  total_units: number
  available_units: number
  sold_units: number
  total_purchase_cost: number
  total_potential_revenue: number
  estimated_profit: number
  by_status: { status: string; count: number }[]
}

export interface CreditSummary {
  total_customers: number
  customers_with_balance: number
  total_outstanding_credit: number   // backend JSON key is "total_outstanding_credit"
  top_debtors: { customer_id: string; customer_name: string; balance: number }[]
}

export interface SalesByPeriodPoint {
  period: string
  sale_count: number   // backend JSON key is "sale_count"
  revenue: number
}

// ── Notification ─────────────────────────────────────────────
export type NotificationType = 'low_stock' | 'overdue' | 'credit_due' | 'sale_cancel' | 'general'
export type NotificationStatus = 'unread' | 'read' | 'dismissed'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  status: NotificationStatus
  recipient_email?: string
  customer_id?: string
  sale_id?: string
  ref_id?: string
  created_by: string
  created_at: string
  read_at?: string
}

// ── Settings ─────────────────────────────────────────────────
export interface Settings {
  id: string
  store_id: string
  store_name: string
  store_tagline?: string
  store_address?: string
  store_phone?: string
  store_email?: string
  currency: string
  default_tax_pct: number
  low_stock_threshold: number
  credit_ceiling: number
  bill_header_text?: string
  bill_footer_text?: string
  receipt_footer?: string
  /** Base64 data URL of the store logo ("data:image/png;base64,...").
   *  Absent when no logo has been configured. */
  logo_base64?: string
  updated_by: string
  updated_at: string
}

// ── Expense ──────────────────────────────────────────────────
export type ExpenseCategory =
  | 'rent'
  | 'salary'
  | 'utilities'
  | 'maintenance'
  | 'marketing'
  | 'miscellaneous'

export interface Expense {
  id: string
  category: ExpenseCategory
  amount: number
  description: string
  date: string
  receipt_ref?: string
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface ExpenseSummary {
  from?: string
  to?: string
  total_amount: number
  total_count: number
  by_category: { category: ExpenseCategory; amount: number; count: number }[]
}

// ── Dashboard ────────────────────────────────────────────────
export interface DailyClosingResponse {
  date: string
  cash_received: number
  credit_issued: number
  expenses_paid: number
  net_cash: number
  total_sales: number
  cancelled_sales: number
}

export interface StaffPerformanceResponse {
  staff_id: string
  staff_name: string
  today_sales: number
  today_revenue: number
  week_sales: number
  week_revenue: number
  month_sales: number
  month_revenue: number
  customers_with_dues: number
  total_dues_amount: number
}

export interface RecentSaleEntry {
  sale_id:        string
  invoice_number: string
  customer_name:  string
  total_amount:   number
  status:         string
  created_at:     string
}

export interface LowStockAlert {
  product_id:   string
  product_name: string
  brand_name:   string
  available:    number
  threshold:    number
}

export interface DashboardData {
  generated_at: string
  today_sales: {
    count:       number
    revenue:     number
    collected:   number
    outstanding: number
  }
  stock: {
    total_units:  number
    available:    number
    sold:         number
    reserved:     number
    under_repair: number
  }
  total_credit_outstanding: number
  active_borrow_lends:      number
  overdue_borrow_lends:     number
  unread_notifications:     number
  month_expenses:           number
  recent_sales:             RecentSaleEntry[]
  low_stock_alerts:         LowStockAlert[]
}

// ── Payment Promise ───────────────────────────────────────────
export type PromiseStatus = 'pending' | 'paid' | 'rescheduled' | 'broken'

export interface PaymentPromise {
  id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  sale_id?: string
  invoice_number?: string
  amount_promised: number
  promised_date: string   // ISO 8601
  status: PromiseStatus
  notes?: string
  notified: boolean
  is_overdue: boolean     // computed by backend: pending + date < today
  created_by: string
  created_at: string
  updated_at: string
}

// ── Global Search ────────────────────────────────────────────
export interface SearchResult {
  type: 'customer' | 'product' | 'device' | 'sale'
  id: string
  title: string
  subtitle?: string
  meta?: string
}

// ── Analytics Reports ─────────────────────────────────────────
export interface PLPeriodEntry {
  period: string
  revenue: number
  cogs: number
  gross_profit: number
  expenses: number
  net_profit: number
}

export interface ProfitLossReport {
  from: string
  to: string
  revenue: number
  cogs: number
  gross_profit: number
  expenses: number
  net_profit: number
  gross_margin_pct: number
  net_margin_pct: number
  by_period: PLPeriodEntry[]
}

export interface ProductPerformanceEntry {
  brand_name: string
  product_name: string
  units_sold: number
  total_revenue: number
  total_cogs: number
  gross_profit: number
  margin_pct: number
  avg_sale_price: number
  avg_purchase_price: number
}

export interface CustomerInsightEntry {
  customer_id: string
  customer_name: string
  phone: string
  total_purchases: number
  total_spent: number
  total_paid: number
  avg_ticket: number
  credit_balance: number
  credit_risk_pct: number
  last_purchase_at?: string
}

export interface BrandInventoryEntry {
  brand_name: string
  units_available: number
  capital_locked: number
  avg_days_in_stock: number
}

export interface SlowDeviceEntry {
  device_id: string
  product_name: string
  brand_name: string
  imei: string
  days_in_stock: number
  purchase_price: number
}

export interface InventoryHealthReport {
  total_available: number
  capital_locked: number
  fresh: number
  aging: number
  slow: number
  dead: number
  by_brand: BrandInventoryEntry[]
  slowest: SlowDeviceEntry[]
}

export interface CashFlowEntry {
  period: string
  money_in: number
  purchase_cost: number
  expense_cost: number
  money_out: number
  net_cash_flow: number
}

// ── Vendor Ledger Aging ───────────────────────────────────────
export interface VendorAgingBucket {
  label: string
  vendor_count: number
  total_owed: number
}
export interface VendorAgingEntry {
  vendor_id: string
  vendor_name: string
  balance: number
  age_days: number
  bucket: string
}
export interface VendorAgingResponse {
  as_of: string
  buckets: VendorAgingBucket[]
  vendors: VendorAgingEntry[]
}

// ── Payment Promises ──────────────────────────────────────────
export interface BulkMarkPaidResponse {
  updated: number
  failed?: string[]
}

// ── Vendor Ledger ─────────────────────────────────────────────
// Backend types: purchase | payment | adjustment | reversal
// Amount sign: > 0 = debit (business owes vendor more), < 0 = credit (balance reduced)
export type VendorLedgerEntryType = 'purchase' | 'payment' | 'adjustment' | 'reversal' | 'opening_balance'

export interface VendorLedgerEntry {
  id: string
  vendor_id: string
  vendor_name: string
  type: VendorLedgerEntryType
  /** Positive = debit (business owes vendor more). Negative = credit (balance reduced). */
  amount: number
  balance_after: number
  /** Purchase ID or free-text reference (present for purchase/reversal entries). */
  reference?: string
  /** Purchase ObjectID — present when type is 'purchase' or 'reversal'. */
  purchase_id?: string
  notes?: string
  created_by: string
  created_at: string
}
