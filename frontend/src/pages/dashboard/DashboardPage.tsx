import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  TrendingUp,
  CalendarDays,
  CreditCard,
  Smartphone,
  ArrowLeftRight,
  AlertCircle,
  Bell,
  ClipboardList,
  BarChart2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { useDashboard, useClosingSummary, useStaffPerformance } from '@/hooks/useDashboard'
import PageHeader from '@/components/shared/PageHeader'
import KpiCard from '@/components/dashboard/KpiCard'
import LowStockAlerts from '@/components/dashboard/LowStockAlerts'
import RecentSales from '@/components/dashboard/RecentSales'
import QuickActions from '@/components/dashboard/QuickActions'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/store/authStore'

export default function DashboardPage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const { data, isLoading, isError, refetch, isFetching } = useDashboard()
  const { data: closing, isLoading: closingLoading } = useClosingSummary()
  const { data: performance, isLoading: perfLoading } = useStaffPerformance()

  const today = formatDate(new Date())

  return (
    <div className="flex flex-col gap-4 sm:gap-5">

      {/* ── Header row — title + refresh always inline ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground leading-tight">
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Today · {today}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 gap-1.5 mt-0.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden xs:inline">Refresh</span>
        </Button>
      </div>

      {/* ── Error state ──────────────────────────────────── */}
      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load dashboard data. Please refresh.
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────── */}
      <QuickActions />

      {/* ── My Performance (staff only) ──────────────────── */}
      {!isAdmin && (
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">My Performance</span>
          </div>
          {perfLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : performance ? (
            <div className="space-y-2">
              {[
                { label: 'Today',      count: performance.today_sales,  revenue: performance.today_revenue },
                { label: 'This Week',  count: performance.week_sales,   revenue: performance.week_revenue },
                { label: 'This Month', count: performance.month_sales,  revenue: performance.month_revenue },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">
                    {row.count} sale{row.count !== 1 ? 's' : ''} · <span className="font-mono">{formatCurrency(row.revenue)}</span>
                  </span>
                </div>
              ))}
              {performance.customers_with_dues > 0 && (
                <div className="mt-1 flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    Customers with dues: {performance.customers_with_dues} · <span className="font-mono">{formatCurrency(performance.total_dues_amount)}</span>
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Tier 1: Today's numbers ───────────────────────── */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-0.5">
          Today
        </p>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Sales"
            value={isLoading ? '…' : data?.today_sales.count ?? 0}
            icon={ShoppingCart}
            iconColor="text-blue-600"
            iconBg="bg-blue-50 dark:bg-blue-950/40"
            isLoading={isLoading}
            onClick={() => navigate('/sales')}
          />
          <KpiCard
            label="Revenue"
            value={isLoading ? '…' : formatCurrency(data?.today_sales.revenue)}
            icon={TrendingUp}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50 dark:bg-emerald-950/40"
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* ── Today's Closing (admin only) ─────────────────── */}
      {isAdmin && (
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Today's Closing</span>
          </div>
          {closingLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : closing ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Cash Received</p>
                <p className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(closing.cash_received)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-400">Credit Issued</p>
                <p className="mt-0.5 font-mono font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(closing.credit_issued)}</p>
              </div>
              <div className="rounded-lg bg-destructive/10 px-3 py-2.5">
                <p className="text-xs text-destructive">Expenses Paid</p>
                <p className="mt-0.5 font-mono font-semibold text-destructive">{formatCurrency(closing.expenses_paid)}</p>
              </div>
              <div className={`rounded-lg px-3 py-2.5 ${closing.net_cash >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-destructive/10'}`}>
                <p className={`text-xs ${closing.net_cash >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>Net Cash</p>
                <p className={`mt-0.5 font-mono font-semibold ${closing.net_cash >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>{formatCurrency(closing.net_cash)}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Tier 2: Store overview ────────────────────────── */}
      <div>
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-0.5">
          Overview
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Month Expenses"
            value={isLoading ? '…' : formatCurrency(data?.month_expenses)}
            icon={CalendarDays}
            iconColor="text-violet-600"
            iconBg="bg-violet-50 dark:bg-violet-950/40"
            isLoading={isLoading}
          />
          <KpiCard
            label="Outstanding Credit"
            value={isLoading ? '…' : formatCurrency(data?.total_credit_outstanding)}
            icon={CreditCard}
            iconColor="text-warning"
            iconBg="bg-warning/10"
            trend={data?.total_credit_outstanding && data.total_credit_outstanding > 0 ? 'down' : 'neutral'}
            trendLabel={data?.total_credit_outstanding && data.total_credit_outstanding > 0 ? 'Needs collection' : undefined}
            isLoading={isLoading}
            onClick={() => navigate('/customers')}
          />
          <KpiCard
            label="Available Devices"
            value={isLoading ? '…' : data?.stock.available ?? 0}
            icon={Smartphone}
            iconColor="text-sky-600"
            iconBg="bg-sky-50 dark:bg-sky-950/40"
            isLoading={isLoading}
            onClick={() => navigate('/devices')}
          />
          <KpiCard
            label="Active Borrows"
            value={isLoading ? '…' : data?.active_borrow_lends ?? 0}
            icon={ArrowLeftRight}
            iconColor="text-teal-600"
            iconBg="bg-teal-50 dark:bg-teal-950/40"
            isLoading={isLoading}
            onClick={() => navigate('/borrow-lends')}
          />
          <KpiCard
            label="Overdue Borrows"
            value={isLoading ? '…' : data?.overdue_borrow_lends ?? 0}
            icon={AlertCircle}
            iconColor={data?.overdue_borrow_lends ? 'text-destructive' : 'text-muted-foreground'}
            iconBg={data?.overdue_borrow_lends ? 'bg-destructive/10' : 'bg-muted'}
            trend={data?.overdue_borrow_lends ? 'down' : 'neutral'}
            trendLabel={data?.overdue_borrow_lends ? 'Action required' : undefined}
            isLoading={isLoading}
            onClick={() => navigate('/borrow-lends')}
          />
          <KpiCard
            label="Notifications"
            value={isLoading ? '…' : data?.unread_notifications ?? 0}
            icon={Bell}
            iconColor="text-rose-600"
            iconBg="bg-rose-50 dark:bg-rose-950/40"
            isLoading={isLoading}
            onClick={() => navigate('/notifications')}
          />
        </div>
      </div>

      {/* ── Low Stock ────────────────────────────────────── */}
      <LowStockAlerts
        alerts={data?.low_stock_alerts ?? []}
        isLoading={isLoading}
      />

      {/* ── Recent Sales ──────────────────────────────────── */}
      <RecentSales
        sales={data?.recent_sales ?? []}
        isLoading={isLoading}
      />
    </div>
  )
}
