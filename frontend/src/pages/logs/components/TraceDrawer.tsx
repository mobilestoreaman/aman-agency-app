import { Copy } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import LogLevelBadge from './LogLevelBadge'
import { useTraceTimeline } from '@/hooks/useLogs'
import { formatDateTime } from '@/utils/date'
import type { TraceLog } from '@/types/logs'

interface TraceDrawerProps {
  open: boolean
  onClose: () => void
  traceId: string | null
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  toast.success('Copied to clipboard')
}

function formatRelativeTime(startTime: string, endTime: string): string {
  try {
    const diff = new Date(endTime).getTime() - new Date(startTime).getTime()
    if (diff < 1000) return `+${diff}ms`
    return `+${(diff / 1000).toFixed(2)}s`
  } catch {
    return '—'
  }
}

function calculateTraceDuration(logs: TraceLog[]): number {
  if (logs.length === 0) return 0
  const timestamps = logs.map(l => new Date(l.created_at).getTime())
  const latencies  = logs.map(l => l.latency_ms ?? 0)
  // Trace ends at the latest (start + latency) across all spans
  const ends = logs.map((l, i) => timestamps[i] + latencies[i])
  return Math.max(...ends) - Math.min(...timestamps)
}

function fmtDuration(ms: number): string {
  if (ms === 0) return '0ms'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function latencyColor(ms: number) {
  if (ms < 100) return 'bg-green-500'
  if (ms < 500) return 'bg-yellow-500'
  if (ms < 1000) return 'bg-orange-500'
  return 'bg-red-500'
}

function statusDotColor(log: TraceLog) {
  if (log.status === 'failure') return 'bg-red-600'
  if (log.level === 'ERROR')    return 'bg-red-500'
  if (log.level === 'WARN')     return 'bg-yellow-500'
  if (log.level === 'INFO')     return 'bg-blue-500'
  return 'bg-gray-400'
}

interface WaterfallBarProps {
  log: TraceLog
  t0: number
  totalDuration: number
}

function WaterfallBar({ log, t0, totalDuration }: WaterfallBarProps) {
  const spanStart  = new Date(log.created_at).getTime()
  const latencyMs  = log.latency_ms ?? 0

  // Guard against zero total duration (single-span trace)
  const safeTotal = totalDuration > 0 ? totalDuration : Math.max(latencyMs, 1)

  const offsetPct = Math.max(0, Math.min(((spanStart - t0) / safeTotal) * 100, 98))
  const widthPct  = Math.max(((latencyMs / safeTotal) * 100), 1.5) // at least 1.5% so it's visible

  return (
    <div className="relative h-3 w-full bg-muted/40 rounded-full overflow-hidden">
      <div
        className={`absolute top-0 h-full rounded-full ${
          log.status === 'failure' ? 'bg-red-500/80' : latencyColor(latencyMs)
        } opacity-80`}
        style={{
          left:  `${offsetPct}%`,
          width: `${Math.min(widthPct, 100 - offsetPct)}%`,
        }}
      />
    </div>
  )
}

export default function TraceDrawer({ open, onClose, traceId }: TraceDrawerProps) {
  const { data: logs, isLoading } = useTraceTimeline(open ? traceId : null)

  if (!open) return null

  const totalDuration = logs ? calculateTraceDuration(logs) : 0
  const t0 = logs && logs.length > 0
    ? Math.min(...logs.map(l => new Date(l.created_at).getTime()))
    : 0
  const startTime   = logs?.[0]?.created_at
  const hasFailure  = logs?.some(log => log.status === 'failure')
  const errorCount  = logs?.filter(l => l.level === 'ERROR').length ?? 0
  const warnCount   = logs?.filter(l => l.level === 'WARN').length ?? 0

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[calc(100%-1rem)] sm:w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Request Trace
            {traceId && (
              <span className="text-xs font-mono text-muted-foreground">
                {traceId.substring(0, 8)}…
              </span>
            )}
          </SheetTitle>
          {traceId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-fit px-2 text-xs gap-1"
              onClick={() => copyToClipboard(traceId)}
            >
              <Copy className="h-3 w-3" />
              Copy Trace ID
            </Button>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No trace data found</div>
        ) : (
          <div className="space-y-5 mt-6">

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center sm:gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Duration</p>
                  <p className="text-base font-bold font-mono">{fmtDuration(totalDuration)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Spans</p>
                  <p className="text-base font-bold">{logs.length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Started</p>
                  <p className="text-xs font-mono text-foreground/80 leading-tight pt-1">
                    {startTime ? formatDateTime(startTime) : '—'}
                  </p>
                </div>
              </div>

              {/* Quick badges */}
              <div className="flex flex-wrap gap-2 pt-1">
                {hasFailure && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 px-2 py-0.5 text-[10px] font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-600 inline-block" />
                    {errorCount} error{errorCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-400 px-2 py-0.5 text-[10px] font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 inline-block" />
                    {warnCount} warning{warnCount !== 1 ? 's' : ''}
                  </span>
                )}
                {!hasFailure && errorCount === 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400 px-2 py-0.5 text-[10px] font-semibold">
                    ✓ All spans succeeded
                  </span>
                )}
              </div>
            </div>

            {/* Waterfall header scale */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-muted-foreground font-mono px-0.5 mb-2">
                <span>0</span>
                <span>{fmtDuration(Math.round(totalDuration * 0.25))}</span>
                <span>{fmtDuration(Math.round(totalDuration * 0.5))}</span>
                <span>{fmtDuration(Math.round(totalDuration * 0.75))}</span>
                <span>{fmtDuration(totalDuration)}</span>
              </div>

              {/* Spans */}
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border px-3 py-3 transition-colors ${
                    log.status === 'failure'
                      ? 'border-red-200 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20'
                      : 'border-border/50 bg-card hover:bg-muted/30'
                  }`}
                >
                  {/* Top row: dot + level + module + offset */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDotColor(log)}`} />
                    <LogLevelBadge level={log.level} />
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{log.module}</Badge>
                    <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                      {formatRelativeTime(startTime || log.created_at, log.created_at)}
                    </span>
                  </div>

                  {/* Method + path + status */}
                  <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                    <span className="font-semibold font-mono text-muted-foreground">{log.method}</span>
                    <span className="font-mono text-foreground/80 truncate max-w-[120px] sm:max-w-[200px]" title={log.path}>
                      {log.path}
                    </span>
                    <span className={`ml-auto font-bold text-xs ${
                      log.status_code >= 500 ? 'text-red-600 dark:text-red-400' :
                      log.status_code >= 400 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {log.status_code}
                    </span>
                    <span className={`text-xs font-semibold ${
                      log.latency_ms < 100 ? 'text-green-600 dark:text-green-400' :
                      log.latency_ms < 500 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {log.latency_ms}ms
                    </span>
                  </div>

                  {/* Waterfall bar */}
                  <WaterfallBar log={log} t0={t0} totalDuration={totalDuration} />

                  {/* Error message */}
                  {log.error_message && (
                    <div className="mt-2 text-[11px] text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded px-2 py-1.5 break-words font-mono">
                      {log.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 pb-2 text-[10px] text-muted-foreground">
              <span className="font-semibold">Latency:</span>
              {[
                { color: 'bg-green-500',  label: '< 100ms' },
                { color: 'bg-yellow-500', label: '< 500ms' },
                { color: 'bg-orange-500', label: '< 1s' },
                { color: 'bg-red-500',    label: '≥ 1s' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className={`h-2 w-3 rounded-sm inline-block ${color} opacity-80`} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
