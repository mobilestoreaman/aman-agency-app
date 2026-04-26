import { TrendingUp, TrendingDown, AlertTriangle, Clock, CheckCircle2, XCircle, Activity } from 'lucide-react'
import type { TraceLog } from '@/types/logs'

interface Meta {
  total: number
  page: number
  limit: number
  total_pages: number
}

interface LogAnalyticsBarProps {
  logs: TraceLog[]
  meta?: Meta
  isLoading?: boolean
}

function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.95) - 1
  return sorted[Math.max(0, idx)]
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function fmtLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: string
  pulse?: boolean
}

function StatCard({ icon, label, value, sub, color = 'text-foreground', pulse }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm min-w-[130px] flex-1">
      <div className={`shrink-0 ${color} ${pulse ? 'animate-pulse' : ''}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">{label}</p>
        <p className={`text-sm font-bold leading-tight ${color}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
      </div>
    </div>
  )
}

export default function LogAnalyticsBar({ logs, meta, isLoading }: LogAnalyticsBarProps) {
  // Compute stats from current page data
  const latencies = logs.map(l => l.latency_ms).filter(Boolean)
  const errorCount = logs.filter(l => l.level === 'ERROR').length
  const warnCount = logs.filter(l => l.level === 'WARN').length
  const failureCount = logs.filter(l => l.status === 'failure').length
  const successCount = logs.filter(l => l.status === 'success').length
  const avgLatency = avg(latencies)
  const p95Latency = p95(latencies)
  const total = meta?.total ?? logs.length
  const successRate = logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(0) : '—'
  const errorRate = logs.length > 0 ? ((errorCount / logs.length) * 100).toFixed(1) : '0'

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[62px] flex-1 min-w-[130px] rounded-lg border border-border/60 bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {/* Total */}
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="Total Logs"
        value={total.toLocaleString()}
        sub={`${logs.length} on page`}
        color="text-blue-600 dark:text-blue-400"
      />

      {/* Success rate */}
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Success Rate"
        value={`${successRate}%`}
        sub={`${successCount} success`}
        color={
          successRate === '—' ? 'text-muted-foreground' :
          Number(successRate) >= 95 ? 'text-green-600 dark:text-green-400' :
          Number(successRate) >= 80 ? 'text-yellow-600 dark:text-yellow-400' :
          'text-red-600 dark:text-red-400'
        }
      />

      {/* Errors */}
      <StatCard
        icon={<XCircle className="h-4 w-4" />}
        label="Errors"
        value={errorCount.toString()}
        sub={`${errorRate}% rate`}
        color={
          errorCount === 0 ? 'text-muted-foreground' :
          errorCount > 10 ? 'text-red-600 dark:text-red-400' :
          'text-orange-600 dark:text-orange-400'
        }
        pulse={errorCount > 0}
      />

      {/* Warnings */}
      <StatCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Warnings"
        value={warnCount.toString()}
        sub={failureCount > 0 ? `${failureCount} failed` : 'all OK'}
        color={warnCount === 0 ? 'text-muted-foreground' : 'text-yellow-600 dark:text-yellow-400'}
      />

      {/* Avg latency */}
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="Avg Latency"
        value={latencies.length ? fmtLatency(avgLatency) : '—'}
        sub="mean response"
        color={
          !latencies.length ? 'text-muted-foreground' :
          avgLatency < 100 ? 'text-green-600 dark:text-green-400' :
          avgLatency < 500 ? 'text-yellow-600 dark:text-yellow-400' :
          'text-red-600 dark:text-red-400'
        }
      />

      {/* P95 latency */}
      <StatCard
        icon={
          p95Latency > avgLatency * 2
            ? <TrendingUp className="h-4 w-4" />
            : <TrendingDown className="h-4 w-4" />
        }
        label="P95 Latency"
        value={latencies.length ? fmtLatency(p95Latency) : '—'}
        sub="95th percentile"
        color={
          !latencies.length ? 'text-muted-foreground' :
          p95Latency < 200 ? 'text-green-600 dark:text-green-400' :
          p95Latency < 1000 ? 'text-yellow-600 dark:text-yellow-400' :
          'text-red-600 dark:text-red-400'
        }
      />
    </div>
  )
}
