import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import { useProductPerformance } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { toApiDate } from '@/utils/date'
import { formatDistanceToNow } from 'date-fns'
import type { ProductPerformanceEntry } from '@/types'

type SortField = 'total_revenue' | 'units_sold' | 'gross_profit' | 'margin_pct' | 'brand_name' | 'product_name'
type SortDirection = 'asc' | 'desc'

export default function ProductPerformancePage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sortField, setSortField] = useState<SortField>('total_revenue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const apiFromDate = fromDate ? toApiDate(fromDate) : undefined
  const apiToDate = toDate ? toApiDate(toDate) : undefined

  const { data: products, isLoading, isError, dataUpdatedAt, refetch } = useProductPerformance({
    from: apiFromDate,
    to: apiToDate,
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const sortedProducts = useMemo(() => {
    if (!products) return []
    const sorted = [...products].sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = (bVal as string).toLowerCase()
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [products, sortField, sortDirection])

  const chartData = useMemo(() => {
    return sortedProducts.slice(0, 10).map((p) => ({
      name: `${p.brand_name} - ${p.product_name}`,
      revenue: p.total_revenue,
      cogs: p.total_cogs,
      profit: p.gross_profit,
    }))
  }, [sortedProducts])

  const summary = useMemo(() => {
    if (!products) return { units: 0, revenue: 0, profit: 0, margin: 0 }
    const totalUnits = products.reduce((sum, p) => sum + p.units_sold, 0)
    const totalRevenue = products.reduce((sum, p) => sum + p.total_revenue, 0)
    const totalProfit = products.reduce((sum, p) => sum + p.gross_profit, 0)
    const avgMargin = products.length > 0 ? products.reduce((sum, p) => sum + p.margin_pct, 0) / products.length : 0

    return {
      units: totalUnits,
      revenue: totalRevenue,
      profit: totalProfit,
      margin: avgMargin,
    }
  }, [products])

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const getMarginColor = (margin: number) => {
    if (margin > 20) return 'bg-green-50 text-green-900'
    if (margin >= 10) return 'bg-amber-50 text-amber-900'
    return 'bg-red-50 text-red-900'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Performance"
        description="Track revenue, profitability, and margins across all products"
      />

      {/* Error Card */}
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
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate || undefined}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined}
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Units Sold</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary.units.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(summary.revenue)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(summary.profit)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Margin %</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary.margin.toFixed(2)}%</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Products by Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>
      ) : chartData.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Products by Revenue</CardTitle>
          </CardHeader>
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
                <Bar dataKey="cogs" fill="#ef4444" name="COGS" />
                <Bar dataKey="profit" fill="#10b981" name="Gross Profit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Products</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No products found for the selected period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">#</th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('brand_name')}
                    >
                      Brand {getSortIndicator('brand_name')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('product_name')}
                    >
                      Product {getSortIndicator('product_name')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('units_sold')}
                    >
                      Units {getSortIndicator('units_sold')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('total_revenue')}
                    >
                      Revenue {getSortIndicator('total_revenue')}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">COGS</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">Gross Profit</th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('margin_pct')}
                    >
                      Margin % {getSortIndicator('margin_pct')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedProducts.map((product, idx) => (
                    <tr key={`${product.brand_name}-${product.product_name}`} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm">{product.brand_name}</td>
                      <td className="px-4 py-3 text-sm">{product.product_name}</td>
                      <td className="px-4 py-3 text-right text-sm">{product.units_sold.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(product.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatCurrency(product.total_cogs)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{formatCurrency(product.gross_profit)}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className={`rounded px-2 py-1 ${getMarginColor(product.margin_pct)}`}>
                          {product.margin_pct.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
