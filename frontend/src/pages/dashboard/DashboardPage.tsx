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
} from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import PageHeader from '@/components/shared/PageHeader'
import KpiCard from '@/components/dashboard/KpiCard'
import LowStockAlerts from '@/components/dashboard/LowStockAlerts'
import RecentSales from '@/components/dashboard/RecentSales'
import QuickActions from '@/components/dashboard/QuickActions'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch, isFetching } = useDashboard()

  const today = formatDate(new Date())

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* ── Header ──────────────────────────────────────── */}
      <PageHeader
        title="Dashboard"
        description={`Today · ${today}`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* ── Error state ──────────────────────────────────── */}
      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Failed to load dashboard data. Please refresh.
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────── */}
      <QuickActions />

      {/* ── KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={isLoading ? '…' : data?.today_sales.count ?? 0}
          icon={ShoppingCart}
          iconColor="text-blue-600"
          iconBg="bg-blue-50 dark:bg-blue-950/40"
          isLoading={isLoading}
          onClick={() => navigate('/sales')}
        />
        <KpiCard
          label="Today's Revenue"
          value={isLoading ? '…' : formatCurrency(data?.today_sales.revenue)}
          icon={TrendingUp}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50 dark:bg-emerald-950/40"
          isLoading={isLoading}
        />
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
          label="Unread Notifications"
          value={isLoading ? '…' : data?.unread_notifications ?? 0}
          icon={Bell}
          iconColor="text-rose-600"
          iconBg="bg-rose-50 dark:bg-rose-950/40"
          isLoading={isLoading}
          onClick={() => navigate('/notifications')}
        />
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
