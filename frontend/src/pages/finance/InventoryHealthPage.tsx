import { useState, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import { useInventoryHealth } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { formatDistanceToNow } from 'date-fns'
import type { BrandInventoryEntry, SlowDeviceEntry } from '@/types'

type BrandSortField = 'brand_name' | 'units_available' | 'capital_locked' | 'avg_days_in_stock'
type BrandSortDirection = 'asc' | 'desc'
type SlowSortField = 'product_name' | 'brand_name' | 'days_in_stock' | 'purchase_price'
type SlowSortDirection = 'asc' | 'desc'

export default function InventoryHealthPage() {
  const [brandSortField, setBrandSortField] = useState<BrandSortField>('avg_days_in_stock')
  const [brandSortDirection, setBrandSortDirection] = useState<BrandSortDirection>('desc')
  const [slowSortField, setSlowSortField] = useState<SlowSortField>('days_in_stock')
  const [slowSortDirection, setSlowSortDirection] = useState<SlowSortDirection>('desc')

  const { data: report, isLoading, isError, dataUpdatedAt, refetch } = useInventoryHealth()

  const handleBrandSort = (field: BrandSortField) => {
    if (brandSortField === field) {
      setBrandSortDirection(brandSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setBrandSortField(field)
      setBrandSortDirection('desc')
    }
  }

  const handleSlowSort = (field: SlowSortField) => {
    if (slowSortField === field) {
      setSlowSortDirection(slowSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSlowSortField(field)
      setSlowSortDirection('desc')
    }
  }

  const sortedBrands = useMemo(() => {
    if (!report?.by_brand) return []
    const sorted = [...report.by_brand].sort((a, b) => {
      let aVal = a[brandSortField]
      let bVal = b[brandSortField]

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = (bVal as string).toLowerCase()
      }

      if (aVal < bVal) return brandSortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return brandSortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [report?.by_brand, brandSortField, brandSortDirection])

  const sortedSlowMovers = useMemo(() => {
    if (!report?.slowest) return []
    const sorted = [...report.slowest].sort((a, b) => {
      let aVal = a[slowSortField]
      let bVal = b[slowSortField]

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = (bVal as string).toLowerCase()
      }

      if (aVal < bVal) return slowSortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return slowSortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [report?.slowest, slowSortField, slowSortDirection])

  const getBrandSortIndicator = (field: BrandSortField) => {
    if (brandSortField !== field) return null
    return brandSortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const getSlowSortIndicator = (field: SlowSortField) => {
    if (slowSortField !== field) return null
    return slowSortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const getDaysColor = (days: number) => {
    if (days < 30) return 'bg-green-50 text-green-900'
    if (days <= 60) return 'bg-amber-50 text-amber-900'
    if (days <= 90) return 'bg-orange-50 text-orange-900'
    return 'bg-red-50 text-red-900'
  }

  const getDaysLabel = (days: number) => {
    if (days < 30) return 'Fresh'
    if (days <= 60) return 'Aging'
    if (days <= 90) return 'Slow'
    return 'Dead'
  }

  const getProgressBarColor = (category: string) => {
    switch (category) {
      case 'fresh':
        return 'bg-green-500'
      case 'aging':
        return 'bg-yellow-500'
      case 'slow':
        return 'bg-orange-500'
      case 'dead':
        return 'bg-red-500'
      default:
        return 'bg-gray-300'
    }
  }

  const calculateProportions = () => {
    if (!report) return { fresh: 0, aging: 0, slow: 0, dead: 0 }
    const total = report.fresh + report.aging + report.slow + report.dead || 1
    return {
      fresh: (report.fresh / total) * 100,
      aging: (report.aging / total) * 100,
      slow: (report.slow / total) * 100,
      dead: (report.dead / total) * 100,
    }
  }

  const proportions = calculateProportions()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Health"
        description="Monitor stock levels, capital locked, and aging inventory"
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Error Card */}
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

      {/* Color Legend Card */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500"></span> Fresh (&lt;30 days)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-400"></span> Aging (31–60 days)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-orange-500"></span> Slow (61–90 days)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-red-600"></span> Dead (&gt;90 days)</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Available</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{report?.total_available.toLocaleString() || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Capital Locked</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(report?.capital_locked || 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fresh (&lt;30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{report?.fresh.toLocaleString() || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Aging (31-60d)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-yellow-600">{report?.aging.toLocaleString() || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Slow (61-90d)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-orange-600">{report?.slow.toLocaleString() || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dead (&gt;90d)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-red-600">{report?.dead.toLocaleString() || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventory Breakdown Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Breakdown by Age</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-4">
              {/* Fresh */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Fresh (&lt;30 days)</span>
                  <span className="text-sm text-muted-foreground">{proportions.fresh.toFixed(1)}%</span>
                </div>
                <div className="h-8 w-full overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${proportions.fresh}%` }}
                  />
                </div>
              </div>

              {/* Aging */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Aging (31-60 days)</span>
                  <span className="text-sm text-muted-foreground">{proportions.aging.toFixed(1)}%</span>
                </div>
                <div className="h-8 w-full overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className="h-full bg-yellow-500 transition-all"
                    style={{ width: `${proportions.aging}%` }}
                  />
                </div>
              </div>

              {/* Slow */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Slow (61-90 days)</span>
                  <span className="text-sm text-muted-foreground">{proportions.slow.toFixed(1)}%</span>
                </div>
                <div className="h-8 w-full overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className="h-full bg-orange-500 transition-all"
                    style={{ width: `${proportions.slow}%` }}
                  />
                </div>
              </div>

              {/* Dead */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Dead Stock (&gt;90 days)</span>
                  <span className="text-sm text-muted-foreground">{proportions.dead.toFixed(1)}%</span>
                </div>
                <div className="h-8 w-full overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${proportions.dead}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Brand Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory by Brand</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedBrands.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No brand inventory data available</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleBrandSort('brand_name')}
                    >
                      Brand {getBrandSortIndicator('brand_name')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleBrandSort('units_available')}
                    >
                      Units Available {getBrandSortIndicator('units_available')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleBrandSort('capital_locked')}
                    >
                      Capital Locked {getBrandSortIndicator('capital_locked')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleBrandSort('avg_days_in_stock')}
                    >
                      Avg Days in Stock {getBrandSortIndicator('avg_days_in_stock')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedBrands.map((brand) => (
                    <tr key={brand.brand_name} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">{brand.brand_name}</td>
                      <td className="px-4 py-3 text-right text-sm">{brand.units_available.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(brand.capital_locked)}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className={`rounded px-2 py-1 ${getDaysColor(brand.avg_days_in_stock)}`}>
                          {brand.avg_days_in_stock.toFixed(1)} days
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

      {/* Slowest Movers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Slowest Moving Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedSlowMovers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No slow-moving devices found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSlowSort('product_name')}
                    >
                      Product {getSlowSortIndicator('product_name')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSlowSort('brand_name')}
                    >
                      Brand {getSlowSortIndicator('brand_name')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">IMEI</th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSlowSort('days_in_stock')}
                    >
                      Days in Stock {getSlowSortIndicator('days_in_stock')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSlowSort('purchase_price')}
                    >
                      Purchase Price {getSlowSortIndicator('purchase_price')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedSlowMovers.map((device) => (
                    <tr key={device.device_id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">{device.product_name}</td>
                      <td className="px-4 py-3 text-sm">{device.brand_name}</td>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{device.imei}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className={`rounded px-2 py-1 ${getDaysColor(device.days_in_stock)}`}>
                          {device.days_in_stock} days ({getDaysLabel(device.days_in_stock)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(device.purchase_price)}</td>
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
