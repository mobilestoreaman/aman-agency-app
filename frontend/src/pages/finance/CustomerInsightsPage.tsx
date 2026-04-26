import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import { Link } from 'react-router-dom'
import { useCustomerInsights } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { toApiDate } from '@/utils/date'
import { formatDistanceToNow } from 'date-fns'
import type { CustomerInsightEntry } from '@/types'

type SortField = 'total_spent' | 'total_purchases' | 'total_paid' | 'credit_balance' | 'credit_risk_pct' | 'avg_ticket' | 'customer_name'
type SortDirection = 'asc' | 'desc'

export default function CustomerInsightsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sortField, setSortField] = useState<SortField>('total_spent')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const apiFromDate = fromDate ? toApiDate(fromDate) : undefined
  const apiToDate = toDate ? toApiDate(toDate) : undefined

  const { data: customers, isLoading, isError, dataUpdatedAt, refetch } = useCustomerInsights({
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

  const sortedCustomers = useMemo(() => {
    if (!customers) return []
    const sorted = [...customers].sort((a, b) => {
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
  }, [customers, sortField, sortDirection])

  const chartData = useMemo(() => {
    return sortedCustomers.slice(0, 10).map((c) => ({
      name: c.customer_name || 'Unknown',
      spent: c.total_spent,
      paid: c.total_paid,
      outstanding: c.credit_balance,
    }))
  }, [sortedCustomers])

  const summary = useMemo(() => {
    if (!customers) return { count: 0, totalSpent: 0, totalOutstanding: 0, avgTicket: 0 }
    const totalSpent = customers.reduce((sum, c) => sum + c.total_spent, 0)
    const totalOutstanding = customers.reduce((sum, c) => sum + c.credit_balance, 0)
    const avgTicket = customers.length > 0 ? customers.reduce((sum, c) => sum + c.avg_ticket, 0) / customers.length : 0

    return {
      count: customers.length,
      totalSpent,
      totalOutstanding,
      avgTicket,
    }
  }, [customers])

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const getCreditRiskColor = (risk: number) => {
    if (risk >= 80) return 'bg-red-100 text-red-900 font-bold'
    if (risk < 10) return 'bg-green-50 text-green-900'
    if (risk >= 30) return 'bg-amber-50 text-amber-900'
    return 'bg-red-50 text-red-900'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Insights"
        description="Analyze customer spending, credit health, and transaction patterns"
      />

      {/* Error Card */}
      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-center text-sm text-destructive">
            Failed to load customer insights data. Please try again.
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary.count.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(summary.totalSpent)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Credit</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">{formatCurrency(summary.totalOutstanding)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Ticket Size</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(summary.avgTicket)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spending Chart */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Customers by Total Spent</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <Skeleton className="h-full w-full" />
          </CardContent>
        </Card>
      ) : chartData.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Customers by Total Spent</CardTitle>
          </CardHeader>
          <CardContent className="flex h-80 items-center justify-center text-muted-foreground">
            No customer data available for the selected period
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Customers by Total Spent</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(value as number)} />
                <Legend />
                <Bar dataKey="spent" fill="#3b82f6" name="Total Spent" />
                <Bar dataKey="paid" fill="#10b981" name="Total Paid" />
                <Bar dataKey="outstanding" fill="#ef4444" name="Outstanding Credit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sortedCustomers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No customers found for the selected period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">#</th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('customer_name')}
                    >
                      Customer {getSortIndicator('customer_name')}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-muted-foreground">Phone</th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('total_purchases')}
                    >
                      Purchases {getSortIndicator('total_purchases')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('total_spent')}
                    >
                      Total Spent {getSortIndicator('total_spent')}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('total_paid')}
                    >
                      Paid {getSortIndicator('total_paid')}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground">Outstanding</th>
                    <th
                      className="cursor-pointer px-4 py-3 text-right text-sm font-semibold text-muted-foreground hover:bg-muted/50"
                      onClick={() => handleSort('credit_risk_pct')}
                    >
                      Credit Risk % {getSortIndicator('credit_risk_pct')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedCustomers.map((customer, idx) => (
                    <tr key={customer.customer_id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm">
                        <Link to={`/customers/${customer.customer_id}`} className="hover:underline text-primary">
                          {customer.customer_name || 'Unknown'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">{customer.phone || '-'}</td>
                      <td className="px-4 py-3 text-right text-sm">{customer.total_purchases.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(customer.total_spent)}</td>
                      <td className="px-4 py-3 text-right text-sm text-green-600">{formatCurrency(customer.total_paid)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-amber-600">{formatCurrency(customer.credit_balance)}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className={`rounded px-2 py-1 ${getCreditRiskColor(customer.credit_risk_pct)}`}>
                          {customer.credit_risk_pct.toFixed(2)}%
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
