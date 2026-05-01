import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import PageLoader from '@/components/shared/PageLoader'

// ── Eager load: auth (tiny, always needed) ───────────────────
import LoginPage from '@/pages/auth/LoginPage'

// ── Lazy load: all other pages ────────────────────────────────
const AppShell         = lazy(() => import('@/components/shared/AppShell'))
const DashboardPage    = lazy(() => import('@/pages/dashboard/DashboardPage'))
const BrandsPage       = lazy(() => import('@/pages/brands/BrandsPage'))
const ProductsPage     = lazy(() => import('@/pages/products/ProductsPage'))
const DevicesPage      = lazy(() => import('@/pages/devices/DevicesPage'))
const VendorsPage      = lazy(() => import('@/pages/vendors/VendorsPage'))
const PurchasesPage    = lazy(() => import('@/pages/purchases/PurchasesPage'))
const CustomersPage    = lazy(() => import('@/pages/customers/CustomersPage'))
const CustomerDetail   = lazy(() => import('@/pages/customers/CustomerDetailPage'))
const SalesPage        = lazy(() => import('@/pages/sales/SalesPage'))
const SaleDetailPage   = lazy(() => import('@/pages/sales/SaleDetailPage'))
const LoanRefsPage     = lazy(() => import('@/pages/loan-references/LoanReferencesPage'))
const BorrowLendsPage  = lazy(() => import('@/pages/borrow-lends/BorrowLendsPage'))
const BillsPage        = lazy(() => import('@/pages/bills/BillsPage'))
const ReportsPage      = lazy(() => import('@/pages/reports/ReportsPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const SettingsPage     = lazy(() => import('@/pages/settings/SettingsPage'))
const ExpensesPage      = lazy(() => import('@/pages/expenses/ExpensesPage'))
const CreditLedgerPage      = lazy(() => import('@/pages/credit-ledger/CreditLedgerPage'))
const VendorLedgerPage      = lazy(() => import('@/pages/vendor-ledger/VendorLedgerPage'))
const PaymentPromisesPage   = lazy(() => import('@/pages/payment-promises/PaymentPromisesPage'))
const LogsPage              = lazy(() => import('@/pages/logs/LogsPage'))
const NotFoundPage          = lazy(() => import('@/pages/NotFoundPage'))
const ProfitLossPage        = lazy(() => import('@/pages/finance/ProfitLossPage'))
const ProductPerformancePage = lazy(() => import('@/pages/finance/ProductPerformancePage'))
const CustomerInsightsPage  = lazy(() => import('@/pages/finance/CustomerInsightsPage'))
const InventoryHealthPage   = lazy(() => import('@/pages/finance/InventoryHealthPage'))
const CashFlowPage          = lazy(() => import('@/pages/finance/CashFlowPage'))

// ── Route guards ──────────────────────────────────────────────
function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireAdmin() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

function AlreadyAuthed() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<PageLoader />}>{element}</Suspense>
)

export const router = createBrowserRouter([
  // ── Public routes ──────────────────────────────────────────
  {
    element: <AlreadyAuthed />,
    children: [
      { path: '/login', element: <LoginPage /> },
    ],
  },

  // ── Protected routes ──────────────────────────────────────
  {
    element: <RequireAuth />,
    children: [
      {
        element: withSuspense(<AppShell />),
        children: [
          { index: true, element: withSuspense(<DashboardPage />) },
          { path: 'brands',          element: withSuspense(<BrandsPage />) },
          { path: 'products',        element: withSuspense(<ProductsPage />) },
          { path: 'devices',         element: withSuspense(<DevicesPage />) },
          { path: 'vendors',         element: withSuspense(<VendorsPage />) },
          { path: 'purchases',       element: withSuspense(<PurchasesPage />) },
          { path: 'customers',       element: withSuspense(<CustomersPage />) },
          { path: 'customers/:id',   element: withSuspense(<CustomerDetail />) },
          { path: 'sales',           element: withSuspense(<SalesPage />) },
          { path: 'sales/new',       element: <Navigate to="/sales?new=1" replace /> },
          { path: 'sales/:id',       element: withSuspense(<SaleDetailPage />) },
          { path: 'loan-references', element: withSuspense(<LoanRefsPage />) },
          { path: 'borrow-lends',    element: withSuspense(<BorrowLendsPage />) },
          { path: 'bills',           element: withSuspense(<BillsPage />) },
          { path: 'notifications',   element: withSuspense(<NotificationsPage />) },
          { path: 'expenses',        element: withSuspense(<ExpensesPage />) },
          { path: 'credit-ledger',    element: withSuspense(<CreditLedgerPage />) },
          { path: 'vendor-ledger',    element: withSuspense(<VendorLedgerPage />) },
          { path: 'payment-promises', element: withSuspense(<PaymentPromisesPage />) },

          // Admin-only routes
          {
            element: <RequireAdmin />,
            children: [
              { path: 'logs',     element: withSuspense(<LogsPage />) },
              { path: 'reports',  element: withSuspense(<ReportsPage />) },
              { path: 'settings', element: withSuspense(<SettingsPage />) },
              // Finance analytics
              { path: 'finance/profit-loss', element: withSuspense(<ProfitLossPage />) },
              { path: 'finance/products',    element: withSuspense(<ProductPerformancePage />) },
              { path: 'finance/customers',   element: withSuspense(<CustomerInsightsPage />) },
              { path: 'finance/inventory',   element: withSuspense(<InventoryHealthPage />) },
              { path: 'finance/cash-flow',   element: withSuspense(<CashFlowPage />) },
            ],
          },
        ],
      },
    ],
  },

  // ── 404 ───────────────────────────────────────────────────
  { path: '*', element: withSuspense(<NotFoundPage />) },
])
