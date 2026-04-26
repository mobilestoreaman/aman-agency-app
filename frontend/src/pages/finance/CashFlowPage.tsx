import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { RefreshCw, Calendar, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import PageHeader from '@/components/shared/PageHeader'
import { useCashFlow } from '@/hooks/useReports'
import { formatCurrency } from '@/utils/currency'
import { toApiDate } from '@/utils/date'
import { formatDistanceToNow } from 'date-fns'
import type { CashFlowEntry } from '@/types'

function SummaryCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-bold font-mono ${color}`}>{formatCurrency(value)}</p>
      </CardContent>
    </Card>
  )
}

export default function CashFlowPage() {
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [groupBy, setGroupBy] = useState('monthly')

  const { data, isLoading, refetch, isError, dataUpdatedAt } = useCashFlow({
    from: toApiDate(from), to: toApiDate(to), group_by: groupBy,
  })

  const entries = data ?? []
  const totalIn   = entries.reduce((s, e) => s + e.money_in,   0)
  const totalOut  = entries.reduce((s, e) => s + e.money_out,  0)
  const netTotal  = entries.reduce((s, e) => s + e.net_cash_flow, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cash Flow"
        description="Money collected vs money spent on purchases and expenses."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" max={to || undefined} />
          <span className="text-muted-foreground">–</span>
          <Input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   className="w-[150px]" min={from || undefined} />
        </div>
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue /></SelectTrigger>
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
            Failed to load cash flow data. Please try again.
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0,1,2].map(i => <Card key={i}><CardContent className="pt-4"><Skeleton className="h-14" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Total Money In"  value={totalIn}  icon={TrendingUp}   color="text-emerald-600" />
          <SummaryCard label="Total Money Out" value={totalOut} icon={TrendingDown}  color="text-destructive" />
          <SummaryCard label="Net Cash Flow"   value={netTotal} icon={DollarSign}    color={netTotal >= 0 ? 'text-blue-600' : 'text-destructive'} />
        </div>
      )}

      {/* Main chart */}
      {isLoading ? (
        <Card><CardContent className="pt-4"><Skeleton className="h-64" /></CardContent></Card>
      ) : entries.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Cash Flow by Period</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={entries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="money_in"      name="Money In"       fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="purchase_cost" name="Purchases"      fill="#f87171" radius={[3,3,0,0]} />
                <Bar dataKey="expense_cost"  name="Expenses"       fill="#fb923c" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No cash flow data for the selected date range. Try expanding the range or clearing the filters.
          </CardContent>
        </Card>
      )}

      {/* Net cash flow line */}
      {entries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Net Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {entries.map((e: CashFlowEntry) => (
                <div key={e.period} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{e.period}</span>
                  <div className="flex items-center gap-6 text-xs">
                    <span className="text-emerald-600">+{formatCurrency(e.money_in)}</span>
                    <span className="text-destructive">-{formatCurrency(e.money_out)}</span>
                    <span className={`font-bold font-mono ${e.net_cash_flow >= 0 ? 'text-blue-600' : 'text-destructive'}`}>
                      {e.net_cash_flow >= 0 ? '+' : ''}{formatCurrency(e.net_cash_flow)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
