import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import { useInventoryHealth } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { formatDistanceToNow } from 'date-fns'
import type { BrandInventoryEntry, SlowDeviceEntry } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const getDaysColor = (days: number) => {
  if (days < 30)  return 'bg-green-50 text-green-900'
  if (days <= 60) return 'bg-amber-50 text-amber-900'
  if (days <= 90) return 'bg-orange-50 text-orange-900'
  return 'bg-red-50 text-red-900'
}

const getDaysLabel = (days: number) => {
  if (days < 30)  return 'Fresh'
  if (days <= 60) return 'Aging'
  if (days <= 90) return 'Slow'
  return 'Dead'
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InventoryHealthPage() {
  const { data: report, isLoading, isError, dataUpdatedAt, refetch } = useInventoryHealth()

  const proportions = useMemo(() => {
    if (!report) return { fresh: 0, aging: 0, slow: 0, dead: 0 }
    const total = report.fresh + report.aging + report.slow + report.dead || 1
    return {
      fresh: (report.fresh / total) * 100,
      aging: (report.aging / total) * 100,
      slow:  (report.slow  / total) * 100,
      dead:  (report.dead  / total) * 100,
    }
  }, [report])

  // ── Brand inventory columns ─────────────────────────────────────────────────
  const brandColumns: Column<BrandInventoryEntry>[] = [
    {
      key:       'brand_name',
      header:    'Brand',
      sortValue: (b) => b.brand_name,
      cell:      (b) => <span className="font-medium text-sm">{b.brand_name}</span>,
    },
    {
      key:       'units_available',
      header:    'Units Available',
      sortValue: (b) => b.units_available,
      cell:      (b) => <span className="text-sm">{b.units_available.toLocaleString()}</span>,
    },
    {
      key:       'capital_locked',
      header:    'Capital Locked',
      sortValue: (b) => b.capital_locked,
      cell:      (b) => <span className="font-semibold text-sm">{formatCurrency(b.capital_locked)}</span>,
    },
    {
      key:       'avg_days',
      header:    'Avg Days in Stock',
      sortValue: (b) => b.avg_days_in_stock,
      cell:      (b) => (
        <span className={`rounded px-2 py-1 text-xs font-medium ${getDaysColor(b.avg_days_in_stock)}`}>
          {b.avg_days_in_stock.toFixed(1)} days
        </span>
      ),
    },
  ]

  // ── Slow movers columns ────────────────────────────────────────────────────
  const slowColumns: Column<SlowDeviceEntry>[] = [
    {
      key:       'product',
      header:    'Product',
      sortValue: (d) => d.product_name,
      cell:      (d) => <span className="font-medium text-sm">{d.product_name}</span>,
    },
    {
      key:       'brand',
      header:    'Brand',
      sortValue: (d) => d.brand_name,
      cell:      (d) => <span className="text-sm">{d.brand_name}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key:       'imei',
      header:    'IMEI',
      cell:      (d) => <code className="font-mono text-xs text-muted-foreground">{d.imei}</code>,
      className: 'hidden md:table-cell',
    },
    {
      key:       'days_in_stock',
      header:    'Days in Stock',
      sortValue: (d) => d.days_in_stock,
      cell:      (d) => (
        <span className={`rounded px-2 py-1 text-xs font-medium ${getDaysColor(d.days_in_stock)}`}>
          {d.days_in_stock} days ({getDaysLabel(d.days_in_stock)})
        </span>
      ),
    },
    {
      key:       'purchase_price',
      header:    'Purchase Price',
      sortValue: (d) => d.purchase_price,
      cell:      (d) => <span className="font-semibold text-sm">{formatCurrency(d.purchase_price)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Health"
        description="Monitor stock levels, capital locked, and aging inventory"
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-center text-sm text-destructive">
            Failed to load inventory health data. Please try again.
          </CardContent>
        </Card>
      )}

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          Last refreshed {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
        </p>
      )}

      {/* Color Legend */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" /> Fresh (&lt;30 days)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Aging (31–60 days)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-orange-500" /> Slow (61–90 days)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-red-600" /> Dead (&gt;90 days)</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {[
          { label: 'Total Available', value: report?.total_available ?? 0, color: '',              fmt: (v: number) => v.toLocaleString() },
          { label: 'Capital Locked',  value: report?.capital_locked ?? 0,  color: '',              fmt: formatCurrency },
          { label: 'Fresh (<30d)',    value: report?.fresh ?? 0,            color: 'text-green-600', fmt: (v: number) => v.toLocaleString() },
          { label: 'Aging (31-60d)',  value: report?.aging ?? 0,            color: 'text-yellow-600', fmt: (v: number) => v.toLocaleString() },
          { label: 'Slow (61-90d)',   value: report?.slow ?? 0,             color: 'text-orange-600', fmt: (v: number) => v.toLocaleString() },
          { label: 'Dead (>90d)',     value: report?.dead ?? 0,             color: 'text-red-600',   fmt: (v: number) => v.toLocaleString() },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading
                ? <Skeleton className="h-8 w-20" />
                : <div className={`text-2xl font-bold ${s.color}`}>{s.fmt(s.value)}</div>
              }
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inventory Age Breakdown */}
      <Card>
        <CardHeader><CardTitle>Inventory Breakdown by Age</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-4">
              {[
                { label: 'Fresh (<30 days)',      pct: proportions.fresh, color: 'bg-green-500' },
                { label: 'Aging (31–60 days)',    pct: proportions.aging, color: 'bg-yellow-500' },
                { label: 'Slow (61–90 days)',     pct: proportions.slow,  color: 'bg-orange-500' },
                { label: 'Dead Stock (>90 days)', pct: proportions.dead,  color: 'bg-red-500' },
              ].map((bar) => (
                <div key={bar.label}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{bar.label}</span>
                    <span className="text-sm text-muted-foreground">{bar.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-8 w-full overflow-hidden rounded-lg bg-gray-100">
                    <div className={`h-full transition-all ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Inventory Table */}
      <Card>
        <CardHeader><CardTitle>Inventory by Brand</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6">
          <ResponsiveTable
            columns={brandColumns}
            data={report?.by_brand ?? []}
            isLoading={isLoading}
            emptyMessage="No brand inventory data available"
            mobileCard={{
              top:    ['brand_name', 'avg_days'],
              middle: ['capital_locked'],
              bottom: ['units_available'],
            }}
          />
        </CardContent>
      </Card>

      {/* Slow Movers Table */}
      <Card>
        <CardHeader><CardTitle>Slowest Moving Devices</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6">
          <ResponsiveTable
            columns={slowColumns}
            data={report?.slowest ?? []}
            isLoading={isLoading}
            emptyMessage="No slow-moving devices found"
            mobileCard={{
              top:    ['product', 'days_in_stock'],
              middle: ['purchase_price'],
              bottom: ['brand', 'imei'],
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
