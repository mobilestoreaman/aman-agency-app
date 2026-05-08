import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import { useProductPerformance } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { toApiDate } from '@/utils/date'
import { formatDistanceToNow } from 'date-fns'
import type { ProductPerformanceEntry } from '@/types'

const getMarginColor = (margin: number) => {
  if (margin > 20) return 'bg-green-50 text-green-900'
  if (margin >= 10) return 'bg-amber-50 text-amber-900'
  return 'bg-red-50 text-red-900'
}

export default function ProductPerformancePage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  const apiFromDate = fromDate ? toApiDate(fromDate) : undefined
  const apiToDate   = toDate   ? toApiDate(toDate)   : undefined

  const { data: products, isLoading, isError, dataUpdatedAt, refetch } = useProductPerformance({
    from: apiFromDate,
    to:   apiToDate,
  })

  // Chart: always top-10 by revenue, independent of table sort
  const chartData = useMemo(() => {
    if (!products) return []
    return [...products]
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10)
      .map((p) => ({
        name:    `${p.brand_name} – ${p.product_name}`,
        revenue: p.total_revenue,
        cogs:    p.total_cogs,
        profit:  p.gross_profit,
      }))
  }, [products])

  const summary = useMemo(() => {
    if (!products) return { units: 0, revenue: 0, profit: 0, margin: 0 }
    const totalUnits   = products.reduce((s, p) => s + p.units_sold,    0)
    const totalRevenue = products.reduce((s, p) => s + p.total_revenue, 0)
    const totalProfit  = products.reduce((s, p) => s + p.gross_profit,  0)
    // Use revenue-weighted margin: total gross profit ÷ total revenue.
    // An arithmetic mean of per-product margin_pct values is misleading because
    // a ₹5 product with 80% margin skews the average as much as a ₹1 lakh product.
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
    return { units: totalUnits, revenue: totalRevenue, profit: totalProfit, margin: avgMargin }
  }, [products])

  const columns: Column<ProductPerformanceEntry>[] = [
    {
      key:       'product',
      header:    'Product',
      sortValue: (p) => p.product_name,
      cell:      (p) => (
        <div>
          <p className="font-medium text-sm">{p.product_name}</p>
        </div>
      ),
    },
    {
      key:       'brand',
      header:    'Brand',
      sortValue: (p) => p.brand_name,
      cell:      (p) => <span className="text-sm">{p.brand_name}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key:       'units',
      header:    'Units',
      sortValue: (p) => p.units_sold,
      cell:      (p) => <span className="text-sm">{p.units_sold.toLocaleString()}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key:       'revenue',
      header:    'Revenue',
      sortValue: (p) => p.total_revenue,
      cell:      (p) => <span className="font-semibold text-sm">{formatCurrency(p.total_revenue)}</span>,
    },
    {
      key:       'cogs',
      header:    'COGS',
      cell:      (p) => <span className="text-sm text-muted-foreground">{formatCurrency(p.total_cogs)}</span>,
      className: 'hidden lg:table-cell',
    },
    {
      key:       'profit',
      header:    'Gross Profit',
      sortValue: (p) => p.gross_profit,
      cell:      (p) => <span className="font-semibold text-sm text-green-600">{formatCurrency(p.gross_profit)}</span>,
      className: 'hidden lg:table-cell',
    },
    {
      key:       'margin',
      header:    'Margin %',
      sortValue: (p) => p.margin_pct,
      cell:      (p) => (
        <span className={`rounded px-2 py-1 text-xs font-medium ${getMarginColor(p.margin_pct)}`}>
          {p.margin_pct.toFixed(2)}%
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Performance"
        description="Track revenue, profitability, and margins across all products"
      />

      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-center text-sm text-destructive">
            Failed to load product performance data. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Filter Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date" value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate || undefined} className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date" value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined} className="w-full"
              />
            </div>
            <div>
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          Last refreshed {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
        </p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Units Sold</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{summary.units.toLocaleString()}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrency(summary.revenue)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrency(summary.profit)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Margin %</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{summary.margin.toFixed(2)}%</div>}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      {isLoading ? (
        <Card>
          <CardHeader><CardTitle>Top 10 Products by Revenue</CardTitle></CardHeader>
          <CardContent className="h-80"><Skeleton className="h-full w-full" /></CardContent>
        </Card>
      ) : chartData.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>Top 10 Products by Revenue</CardTitle></CardHeader>
          <CardContent className="flex h-80 items-center justify-center text-muted-foreground">
            No data available for the selected period
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Products by Revenue</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Always ranked by revenue</p>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(value as number)} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
                <Bar dataKey="cogs"    fill="#ef4444" name="COGS" />
                <Bar dataKey="profit"  fill="#10b981" name="Gross Profit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Products Table */}
      <Card>
        <CardHeader><CardTitle>All Products</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6">
          <ResponsiveTable
            columns={columns}
            data={products ?? []}
            isLoading={isLoading}
            emptyMessage="No products found for the selected period"
            mobileCard={{
              top:    ['product', 'margin'],
              middle: ['revenue', 'profit'],
              bottom: ['brand', 'units'],
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
