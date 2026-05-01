import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import { Link } from 'react-router-dom'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import { useCustomerInsights } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { toApiDate } from '@/utils/date'
import { formatDistanceToNow } from 'date-fns'
import type { CustomerInsightEntry } from '@/types'

const getCreditRiskColor = (risk: number) => {
  if (risk >= 80) return 'bg-red-100 text-red-900 font-bold'
  if (risk >= 30) return 'bg-amber-50 text-amber-900'
  if (risk < 10)  return 'bg-green-50 text-green-900'
  return 'bg-red-50 text-red-900'
}

export default function CustomerInsightsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  const apiFromDate = fromDate ? toApiDate(fromDate) : undefined
  const apiToDate   = toDate   ? toApiDate(toDate)   : undefined

  const { data: customers, isLoading, isError, dataUpdatedAt, refetch } = useCustomerInsights({
    from: apiFromDate,
    to:   apiToDate,
  })

  // Chart: always top-10 by total spent, independent of table sort
  const chartData = useMemo(() => {
    if (!customers) return []
    return [...customers]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
      .map((c) => ({
        name:        c.customer_name || 'Unknown',
        spent:       c.total_spent,
        paid:        c.total_paid,
        outstanding: c.credit_balance,
      }))
  }, [customers])

  const summary = useMemo(() => {
    if (!customers) return { count: 0, totalSpent: 0, totalOutstanding: 0, avgTicket: 0 }
    const totalSpent       = customers.reduce((s, c) => s + c.total_spent,     0)
    const totalOutstanding = customers.reduce((s, c) => s + c.credit_balance,  0)
    const avgTicket        = customers.length > 0
      ? customers.reduce((s, c) => s + c.avg_ticket, 0) / customers.length
      : 0
    return { count: customers.length, totalSpent, totalOutstanding, avgTicket }
  }, [customers])

  const columns: Column<CustomerInsightEntry>[] = [
    {
      key:       'customer',
      header:    'Customer',
      sortValue: (c) => c.customer_name,
      cell:      (c) => (
        <Link
          to={`/customers/${c.customer_id}`}
          className="text-sm font-medium hover:underline text-primary"
        >
          {c.customer_name || 'Unknown'}
        </Link>
      ),
    },
    {
      key:       'phone',
      header:    'Phone',
      cell:      (c) => <span className="text-sm text-muted-foreground">{c.phone || '—'}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key:       'purchases',
      header:    'Purchases',
      sortValue: (c) => c.total_purchases,
      cell:      (c) => <span className="text-sm">{c.total_purchases.toLocaleString()}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key:       'spent',
      header:    'Total Spent',
      sortValue: (c) => c.total_spent,
      cell:      (c) => <span className="font-semibold text-sm">{formatCurrency(c.total_spent)}</span>,
    },
    {
      key:       'paid',
      header:    'Paid',
      sortValue: (c) => c.total_paid,
      cell:      (c) => <span className="text-sm text-green-600">{formatCurrency(c.total_paid)}</span>,
      className: 'hidden lg:table-cell',
    },
    {
      key:       'outstanding',
      header:    'Outstanding',
      sortValue: (c) => c.credit_balance,
      cell:      (c) => (
        <span className={`font-semibold text-sm ${c.credit_balance > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {formatCurrency(c.credit_balance)}
        </span>
      ),
    },
    {
      key:       'risk',
      header:    'Credit Risk %',
      sortValue: (c) => c.credit_risk_pct,
      cell:      (c) => (
        <span className={`rounded px-2 py-1 text-xs font-medium ${getCreditRiskColor(c.credit_risk_pct)}`}>
          {c.credit_risk_pct.toFixed(2)}%
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Insights"
        description="Analyze customer spending, credit health, and transaction patterns"
      />

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
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : <div className="text-2xl font-bold">{summary.count.toLocaleString()}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrency(summary.totalSpent)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Credit</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold text-amber-600">{formatCurrency(summary.totalOutstanding)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Ticket Size</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrency(summary.avgTicket)}</div>}
          </CardContent>
        </Card>
      </div>

      {/* Spending Chart */}
      {isLoading ? (
        <Card>
          <CardHeader><CardTitle>Top 10 Customers by Total Spent</CardTitle></CardHeader>
          <CardContent className="h-80"><Skeleton className="h-full w-full" /></CardContent>
        </Card>
      ) : chartData.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>Top 10 Customers by Total Spent</CardTitle></CardHeader>
          <CardContent className="flex h-80 items-center justify-center text-muted-foreground">
            No customer data available for the selected period
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Top 10 Customers by Total Spent</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(value: any) => formatCurrency(value as number)} />
                <Legend />
                <Bar dataKey="spent"       fill="#3b82f6" name="Total Spent" />
                <Bar dataKey="paid"        fill="#10b981" name="Total Paid" />
                <Bar dataKey="outstanding" fill="#ef4444" name="Outstanding Credit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Customers Table */}
      <Card>
        <CardHeader><CardTitle>Customer Rankings</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6">
          <ResponsiveTable
            columns={columns}
            data={customers ?? []}
            isLoading={isLoading}
            emptyMessage="No customers found for the selected period"
            mobileCard={{
              top:    ['customer', 'risk'],
              middle: ['spent', 'outstanding'],
              bottom: ['purchases', 'paid'],
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
