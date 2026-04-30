import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { RefreshCw, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import PageHeader from '@/components/shared/PageHeader'
import { useProfitLoss } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { toApiDate } from '@/utils/date'
import { formatDistanceToNow } from 'date-fns'

function MetricCard({
  title, value, sub, positive,
}: { title: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold font-mono ${positive === true ? 'text-emerald-600' : positive === false ? 'text-destructive' : ''}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default function ProfitLossPage() {
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [groupBy, setGroupBy] = useState('monthly')

  const { data, isLoading, refetch, isError, dataUpdatedAt } = useProfitLoss({
    from: toApiDate(from), to: toApiDate(to), group_by: groupBy,
  })

  const grossPct  = data?.gross_margin_pct ?? 0
  const netPct    = data?.net_margin_pct   ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profit & Loss"
        description="Revenue, cost of goods, expenses and net profit over time."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 sm:w-[140px] sm:flex-none" max={to || undefined} />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   className="flex-1 sm:w-[140px] sm:flex-none" min={from || undefined} />
        </div>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="h-9 w-full sm:w-[110px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }}
            className="text-muted-foreground">Clear</Button>
        )}
      </div>

      {/* Error message */}
      {isError && (
        <Card className="border-destructive">
          <CardContent className="py-6 text-center text-sm text-destructive">
            Failed to load profit & loss data. Please try again.
          </CardContent>
        </Card>
      )}

      {/* Last refreshed */}
      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          Last refreshed {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
        </p>
      )}

      {/* Summary cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16" /></CardContent></Card>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <MetricCard title="Revenue"      value={formatCurrency(data.revenue)}      />
          <MetricCard title="COGS"         value={formatCurrency(data.cogs)}         positive={false} />
          <MetricCard title="Gross Profit" value={formatCurrency(data.gross_profit)} positive={data.gross_profit >= 0}
            sub={`${grossPct.toFixed(1)}% margin`} />
          <MetricCard title="Expenses"     value={formatCurrency(data.expenses)}     positive={false} />
          <MetricCard title="Net Profit"   value={formatCurrency(data.net_profit)}   positive={data.net_profit >= 0}
            sub={`${netPct.toFixed(1)}% margin`} />
        </div>
      ) : null}

      {/* Margin indicator bar */}
      {data && data.revenue > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Margin Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Gross Margin</span>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${grossPct >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                    {grossPct.toFixed(1)}%
                  </span>
                  {grossPct > 100 && <span className="font-bold text-emerald-600">⚡ {grossPct.toFixed(1)}%</span>}
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(Math.max(grossPct, 0), 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Net Margin</span>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${netPct >= 0 ? 'text-blue-600' : 'text-destructive'}`}>
                    {netPct.toFixed(1)}%
                  </span>
                  {netPct > 100 && <span className="font-bold text-emerald-600">⚡ {netPct.toFixed(1)}%</span>}
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${netPct >= 0 ? 'bg-blue-500' : 'bg-destructive'}`}
                  style={{ width: `${Math.min(Math.max(netPct, 0), 100)}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period chart */}
      {isLoading ? (
        <Card><CardContent className="pt-4"><Skeleton className="h-56" /></CardContent></Card>
      ) : data?.by_period && data.by_period.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Revenue vs Profit by Period</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.by_period} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n.replace(/_/g, ' ')]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"      name="Revenue"       fill="hsl(var(--primary))"   radius={[3,3,0,0]} />
                <Bar dataKey="gross_profit" name="Gross Profit"  fill="#10b981"               radius={[3,3,0,0]} />
                <Bar dataKey="net_profit"   name="Net Profit"    fill="#3b82f6"               radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* Expenses area chart */}
      {data?.by_period && data.by_period.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Expenses Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.by_period} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Expenses']} />
                <Area dataKey="expenses" stroke="#f59e0b" fill="url(#expGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
