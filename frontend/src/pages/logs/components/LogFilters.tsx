import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { TraceLogFilters, LogLevel, LogModule } from '@/types/logs'

const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR']
const LOG_MODULES: LogModule[] = ['Auth', 'Sales', 'Inventory', 'Billing', 'Payments', 'Notifications', 'Reports', 'System', 'Upload']

const LEVEL_COLORS: Record<LogLevel, string> = {
  DEBUG: 'bg-muted text-muted-foreground border-border',
  INFO:  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400',
  WARN:  'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400',
  ERROR: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400',
}

// Quick time-range presets — sets from_date/to_date relative to now
const TIME_PRESETS = [
  { label: '30m',  minutes: 30 },
  { label: '1h',   minutes: 60 },
  { label: '6h',   minutes: 360 },
  { label: '24h',  minutes: 1440 },
  { label: '7d',   minutes: 10080 },
]

function toDateStr(date: Date) {
  return date.toISOString().split('T')[0]
}

interface LogFiltersProps {
  filters: TraceLogFilters
  onChange: (filters: Partial<TraceLogFilters>) => void
  onReset: () => void
  hasFilters: boolean
}

export default function LogFilters({ filters, onChange, onReset, hasFilters }: LogFiltersProps) {
  const applyPreset = (minutes: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - minutes * 60_000)
    onChange({ from_date: toDateStr(from), to_date: toDateStr(now), page: 1 })
  }

  // Detect which preset is active (best-effort match by from_date only)
  const activePreset = (() => {
    if (!filters.from_date) return null
    const from = new Date(filters.from_date)
    const now = new Date()
    const diffMinutes = (now.getTime() - from.getTime()) / 60_000
    return TIME_PRESETS.find(p => Math.abs(diffMinutes - p.minutes) < p.minutes * 0.2)?.label ?? null
  })()

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
      {/* Row 1: search + quick presets */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-44">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search message, path, email, trace ID…"
            value={filters.search ?? ''}
            onChange={(e) => onChange({ search: e.target.value, page: 1 })}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* Quick time presets */}
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          <span className="px-2 text-xs text-muted-foreground font-medium">Last</span>
          {TIME_PRESETS.map(({ label, minutes }) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(minutes)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activePreset === label
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: dropdowns + date range + clear */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Level — pill-style quick select */}
        <div className="flex items-center gap-1">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onChange({ level: filters.level === level ? '' : level as LogLevel, page: 1 })}
              className={`px-2 py-0.5 rounded-full border text-xs font-semibold transition-all ${
                filters.level === level
                  ? LEVEL_COLORS[level] + ' shadow-sm scale-105'
                  : 'border-border/50 text-muted-foreground hover:border-border'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border/60" />

        {/* Module */}
        <Select
          value={filters.module || 'all'}
          onValueChange={(v) => onChange({ module: v === 'all' ? '' : v as LogModule, page: 1 })}
        >
          <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {LOG_MODULES.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={filters.status || 'all'}
          onValueChange={(v) => onChange({ status: v === 'all' ? '' : v as 'success' | 'failure', page: 1 })}
        >
          <SelectTrigger className="h-8 w-full sm:w-[120px] text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">✓ Success</SelectItem>
            <SelectItem value="failure">✗ Failure</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range — stacks cleanly on mobile */}
        <div className="flex w-full items-center gap-1 sm:w-auto">
          <Input
            type="date"
            value={filters.from_date ?? ''}
            onChange={(e) => onChange({ from_date: e.target.value, page: 1 })}
            className="h-8 flex-1 sm:w-[130px] sm:flex-none text-xs"
            title="From date"
          />
          <span className="shrink-0 text-muted-foreground text-xs">→</span>
          <Input
            type="date"
            value={filters.to_date ?? ''}
            onChange={(e) => onChange({ to_date: e.target.value, page: 1 })}
            className="h-8 flex-1 sm:w-[130px] sm:flex-none text-xs"
            title="To date"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
