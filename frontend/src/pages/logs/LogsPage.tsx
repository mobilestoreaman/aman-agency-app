import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Download, Activity, RefreshCw, AlertCircle,
  ChevronLeft, ChevronRight, Inbox,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import PageHeader from '@/components/shared/PageHeader'
import LogFilters from './components/LogFilters'
import LogAnalyticsBar from './components/LogAnalyticsBar'
import LogDetailDrawer from './components/LogDetailDrawer'
import TraceDrawer from './components/TraceDrawer'
import { useLogs } from '@/hooks/useLogs'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime } from '@/utils/date'
import { logsApi } from '@/api/logs'
import { toast } from 'sonner'
import type { TraceLog, TraceLogFilters, LogLevel } from '@/types/logs'

// ── Styling maps ──────────────────────────────────────────────────────────────

const LEVEL_ROW: Record<LogLevel, string> = {
  ERROR: 'border-l-red-500    bg-red-50/30    dark:bg-red-950/10  hover:bg-red-50/60  dark:hover:bg-red-950/20',
  WARN:  'border-l-yellow-400 bg-yellow-50/20 dark:bg-yellow-950/10 hover:bg-yellow-50/50 dark:hover:bg-yellow-950/20',
  INFO:  'border-l-blue-400   bg-transparent  hover:bg-muted/30',
  DEBUG: 'border-l-slate-300  bg-transparent  hover:bg-muted/20  opacity-80',
}

const LEVEL_BADGE: Record<LogLevel, string> = {
  ERROR: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400',
  WARN:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-400',
  INFO:  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
  DEBUG: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const METHOD_BADGE: Record<string, string> = {
  GET:    'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  POST:   'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  PUT:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
  PATCH:  'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
}

function formatTs(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return { date, time, full: formatDateTime(iso) }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

// ── Sort state ────────────────────────────────────────────────────────────────

type SortKey = 'time' | 'level' | 'module' | 'method' | 'status_code' | 'latency' | 'status'
type SortDir = 'asc' | 'desc'

function sortLogs(logs: TraceLog[], key: SortKey | null, dir: SortDir) {
  if (!key) return logs
  return [...logs].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'time':        cmp = a.created_at.localeCompare(b.created_at); break
      case 'level': {
        const order: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
        cmp = (order[a.level as LogLevel] ?? 0) - (order[b.level as LogLevel] ?? 0); break
      }
      case 'module':      cmp = a.module.localeCompare(b.module); break
      case 'method':      cmp = (a.method ?? '').localeCompare(b.method ?? ''); break
      case 'status_code': cmp = (a.status_code ?? 0) - (b.status_code ?? 0); break
      case 'latency':     cmp = (a.latency_ms ?? 0) - (b.latency_ms ?? 0); break
      case 'status':      cmp = a.status.localeCompare(b.status); break
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [filters, setFilters] = useState<TraceLogFilters>({
    page: 1,
    limit: 50,
    search: searchParams.get('search') ?? '',
    level:     (searchParams.get('level') as any)  ?? '',
    module:    (searchParams.get('module') as any)  ?? '',
    status:    (searchParams.get('status') as any)  ?? '',
    from_date: searchParams.get('from_date') ?? '',
    to_date:   searchParams.get('to_date')   ?? '',
  })

  const [detailId,      setDetailId]      = useState<string | null>(null)
  const [traceId,       setTraceId]       = useState<string | null>(null)
  const [isExporting,   setExporting]     = useState(false)
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  // default: latest first (matches backend default DESC sort)
  const [sortKey, setSortKey] = useState<SortKey | null>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const q = useDebounce(filters.search ?? '')

  const handleFilterChange = (newFilters: Partial<TraceLogFilters>) =>
    setFilters(prev => ({ ...prev, ...newFilters }))

  const handleReset = () => {
    setFilters({ page: 1, limit: 50, search: '', level: '', module: '', status: '', from_date: '', to_date: '' })
    setSearchParams({})
  }

  const hasFilters = !!(q || filters.level || filters.module || filters.status || filters.from_date || filters.to_date)

  const { data, isLoading, isError } = useLogs({
    ...filters,
    search:    q               || undefined,
    level:     filters.level   || undefined,
    module:    filters.module  || undefined,
    status:    filters.status  || undefined,
    from_date: filters.from_date || undefined,
    to_date:   filters.to_date   || undefined,
  }, isAutoRefresh)

  const logs = useMemo(
    () => sortLogs(data?.data ?? [], sortKey, sortDir),
    [data?.data, sortKey, sortDir],
  )

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true)
    try {
      const res = await logsApi.list({
        page: 1, limit: 10000,
        search:    q               || undefined,
        level:     filters.level   || undefined,
        module:    filters.module  || undefined,
        status:    filters.status  || undefined,
        from_date: filters.from_date || undefined,
        to_date:   filters.to_date   || undefined,
      })
      const rows = res.data.data ?? []

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
        download(blob, `logs-${today()}.json`)
      } else {
        const headers = ['Timestamp','Level','Module','Method','Path','Status Code','Latency (ms)','Status','User Email','IP','Trace ID']
        const csv = [
          headers.join(','),
          ...rows.map(l => [
            formatDateTime(l.created_at), l.level, l.module, l.method, l.path,
            l.status_code, l.latency_ms, l.status, l.user_email ?? '', l.ip_address, l.trace_id,
          ].map(v => JSON.stringify(String(v ?? ''))).join(',')),
        ].join('\n')
        download(new Blob([csv], { type: 'text/csv' }), `logs-${today()}.csv`)
      }
      toast.success(`Exported ${rows.length} logs as ${format.toUpperCase()}`)
    } catch {
      toast.error('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const meta = data?.meta

  function ColHead({ label, sk }: { label: string; sk: SortKey }) {
    const active = sortKey === sk
    return (
      <th
        className="group cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => handleSort(sk)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Log Tracing"
        description="Real-time application logs and request traces."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsAutoRefresh(r => !r)}
              title={isAutoRefresh ? 'Auto-refresh on — click to pause' : 'Auto-refresh paused'}
            >
              <RefreshCw className={`h-4 w-4 transition-colors ${isAutoRefresh ? 'text-green-600' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={isExporting}>
                  <Download className="h-4 w-4" />
                  {isExporting ? 'Exporting…' : 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>Export as JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {/* Live pulse */}
      {isAutoRefresh && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200/60 bg-blue-50/40 dark:border-blue-800/30 dark:bg-blue-950/10 px-3 py-1.5 text-xs">
          <Activity className="h-3.5 w-3.5 text-blue-500 animate-pulse shrink-0" />
          <span className="text-blue-600 dark:text-blue-400 font-medium">Live</span>
          <span className="text-muted-foreground">— refreshing every 30 s</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load logs. Check your connection or verify the backend is running.</span>
        </div>
      )}

      {/* Filters */}
      <LogFilters filters={filters} onChange={handleFilterChange} onReset={handleReset} hasFilters={hasFilters} />

      {/* Analytics bar */}
      <LogAnalyticsBar logs={logs} meta={meta} isLoading={isLoading} />

      {/* Log table */}
      <div className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
        {/* Scrollable container — horizontal + vertical */}
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-370px)] min-h-[320px]">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border/60">
              <tr>
                <th className="w-[160px] whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('time')}>
                    Timestamp
                    <SortIcon active={sortKey === 'time'} dir={sortDir} />
                  </span>
                </th>
                <ColHead label="Level"   sk="level" />
                <ColHead label="Method"  sk="method" />
                <ColHead label="Code"    sk="status_code" />
                <ColHead label="Module"  sk="module" />
                <th className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Path / Message
                </th>
                <ColHead label="Latency" sk="latency" />
                <ColHead label="Status"  sk="status" />
                <th className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Trace ID
                </th>
                <th className="w-[90px]" />
              </tr>
            </thead>

            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-l-2 border-l-transparent">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2">
                        <Skeleton className="h-3.5 w-full max-w-[100px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Inbox className="h-6 w-6 opacity-40" />
                      </div>
                      <span className="text-sm font-medium">No logs found — try adjusting filters or wait for traffic.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const ts = formatTs(log.created_at)
                  const level = log.level as LogLevel
                  return (
                    <tr
                      key={log.id}
                      className={`border-l-2 transition-colors ${LEVEL_ROW[level] ?? 'border-l-transparent hover:bg-muted/20'}`}
                    >
                      {/* Timestamp */}
                      <td className="px-3 py-1.5 whitespace-nowrap font-mono" title={ts.full}>
                        <div className="text-foreground/80">{ts.time}</div>
                        <div className="text-muted-foreground text-[10px]">{relativeTime(log.created_at)}</div>
                      </td>

                      {/* Level */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${LEVEL_BADGE[level]}`}>
                          {log.level}
                        </span>
                      </td>

                      {/* Method */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${METHOD_BADGE[log.method] ?? 'bg-muted text-muted-foreground'}`}>
                          {log.method || '—'}
                        </span>
                      </td>

                      {/* Status code */}
                      <td className="px-3 py-1.5 whitespace-nowrap font-mono">
                        <span className={
                          !log.status_code ? 'text-muted-foreground' :
                          log.status_code >= 500 ? 'text-red-600 font-semibold dark:text-red-400' :
                          log.status_code >= 400 ? 'text-yellow-600 font-semibold dark:text-yellow-400' :
                          'text-green-600 dark:text-green-400'
                        }>
                          {log.status_code || '—'}
                        </span>
                      </td>

                      {/* Module */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px] h-5 font-normal">
                          {log.module}
                        </Badge>
                      </td>

                      {/* Path + message */}
                      <td className="px-3 py-1.5 max-w-[300px]">
                        <div className="font-mono text-muted-foreground truncate" title={log.path}>
                          {log.path}
                        </div>
                        {log.message && log.message !== `${log.method} ${log.path}` && (
                          <div className="truncate text-foreground/70 mt-0.5" title={log.message}>
                            {log.message}
                          </div>
                        )}
                        {log.error_message && (
                          <div className="truncate text-red-600 dark:text-red-400 mt-0.5 text-[10px]" title={log.error_message}>
                            ✕ {log.error_message}
                          </div>
                        )}
                      </td>

                      {/* Latency */}
                      <td className="px-3 py-1.5 whitespace-nowrap font-mono">
                        <span className={
                          !log.latency_ms ? 'text-muted-foreground' :
                          log.latency_ms >= 1000 ? 'text-red-600 font-semibold dark:text-red-400' :
                          log.latency_ms >= 500  ? 'text-orange-600 font-semibold dark:text-orange-400' :
                          log.latency_ms >= 100  ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-green-600 dark:text-green-400'
                        }>
                          {log.latency_ms ? `${log.latency_ms}ms` : '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`text-[10px] font-medium ${
                          log.status === 'success'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {log.status === 'success' ? '✓' : '✗'}
                        </span>
                      </td>

                      {/* Trace ID */}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setTraceId(log.trace_id)}
                          className="font-mono text-blue-600 hover:underline dark:text-blue-400 text-[10px]"
                          title={log.trace_id}
                        >
                          {log.trace_id.substring(0, 8)}…
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => setDetailId(log.id)}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => setTraceId(log.trace_id)}
                          >
                            Trace
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: record count + pagination */}
        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <span>
              {meta.total_pages > 1
                ? `${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total.toLocaleString()} entries`
                : `${meta.total.toLocaleString()} entr${meta.total !== 1 ? 'ies' : 'y'}`}
            </span>
            {meta.total_pages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 border-border/60"
                  disabled={meta.page <= 1}
                  onClick={() => handleFilterChange({ page: meta.page - 1 })}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="px-2 font-medium text-foreground">
                  {meta.page} / {meta.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 border-border/60"
                  disabled={meta.page >= meta.total_pages}
                  onClick={() => handleFilterChange({ page: meta.page + 1 })}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawers */}
      <LogDetailDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        logId={detailId}
        onViewTrace={(tid) => setTraceId(tid)}
      />
      <TraceDrawer
        open={!!traceId}
        onClose={() => setTraceId(null)}
        traceId={traceId}
      />
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split('T')[0] }

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
