import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Package, CreditCard, Users, RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/shared/PageHeader'
import {
  useRevenueReport, useStockValuation, useCreditSummary, useSalesByPeriod,
} from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

export default function ReportsPage() {
  const [from, setFrom]   = useState('')
  const [to, setTo]       = useState('')
  const [groupBy, setGroupBy] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  const apiFrom = toApiDate(from)
  const apiTo   = toApiDate(to)

  const { data: revenue,   isLoading: loadRevenue,   refetch: refetchRevenue }   = useRevenueReport({ from: apiFrom, to: apiTo })
  const { data: stock,     isLoading: loadStock,     refetch: refetchStock }     = useStockValuation()
  const { data: credit,    isLoading: loadCredit,    refetch: refetchCredit }    = useCreditSummary()
  const { data: byPeriod,  isLoading: loadByPeriod,  refetch: refetchByPeriod }  = useSalesByPeriod({ from: apiFrom, to: apiTo, group_by: groupBy })

  const refreshAll = () => {
    refetchRevenue(); refetchStock(); refetchCredit(); refetchByPeriod()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Financial overview, stock valuation, and credit analysis."
        action={
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date" value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-[150px]" title="From date"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date" value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-[150px]" title="To date"
          />
        </div>
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }} className="text-muted-foreground">
            Clear
          </Button>
        )}
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadRevenue ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : revenue ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Total Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono">{formatCurrency(revenue.total_revenue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{revenue.total_sales} sale{revenue.total_sales !== 1 ? 's' : ''}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono text-emerald-600">{formatCurrency(revenue.total_collected)}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg sale: {formatCurrency(revenue.avg_sale_value)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding Credit</CardTitle>
              </CardHeader>
              <CardContent>
                {loadCredit ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <p className={`text-2xl font-bold font-mono ${(credit?.total_outstanding_credit ?? 0) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {formatCurrency(credit?.total_outstanding_credit ?? 0)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Across all customers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Cancelled</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${revenue.cancelled_count > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {revenue.cancelled_count}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Cancelled sales</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Sales by period chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Sales by Period</CardTitle>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'daily' | 'weekly' | 'monthly')}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loadByPeriod ? (
            <Skeleton className="h-48 w-full" />
          ) : byPeriod && byPeriod.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byPeriod} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'revenue' ? [formatCurrency(value), 'Revenue'] : [value, 'Count']
                  }
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for selected range.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Stock valuation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Package className="h-4 w-4" /> Stock Valuation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadStock ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : stock ? (
              <div className="space-y-2">
                <MetricRow label="Total units"         value={stock.total_units} />
                <MetricRow label="Available"           value={<span className="text-emerald-600">{stock.available_units}</span>} />
                <MetricRow label="Sold"                value={stock.sold_units} />
                <Separator />
                <MetricRow label="Purchase cost"       value={<span className="font-mono">{formatCurrency(stock.total_purchase_cost)}</span>} />
                <MetricRow label="Potential revenue"   value={<span className="font-mono">{formatCurrency(stock.total_potential_revenue)}</span>} />
                <MetricRow label="Estimated profit"    value={<span className={`font-mono ${stock.estimated_profit > 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatCurrency(stock.estimated_profit)}</span>} />
                {stock.by_status?.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-wrap gap-2">
                      {stock.by_status.map((s) => (
                        <div key={s.status} className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs">
                          <span className="capitalize text-muted-foreground">{s.status}</span>
                          <span className="font-semibold">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data.</p>}
          </CardContent>
        </Card>

        {/* Credit summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4" /> Credit Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadCredit ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : credit ? (
              <div className="space-y-2">
                <MetricRow label="Total customers"      value={credit.total_customers} />
                <MetricRow label="With balance"         value={<span className="text-amber-600">{credit.customers_with_balance}</span>} />
                <MetricRow label="Total outstanding"    value={<span className="font-mono text-amber-700">{formatCurrency(credit.total_outstanding_credit)}</span>} />
                {credit.top_debtors?.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top Debtors</p>
                    {credit.top_debtors.map((d) => (
                      <div key={d.customer_id} className="flex justify-between text-sm">
                        <span className="truncate">{d.customer_name}</span>
                        <span className="ml-2 shrink-0 font-mono text-destructive">{formatCurrency(d.balance)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : <p className="text-sm text-muted-foreground">No data.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
