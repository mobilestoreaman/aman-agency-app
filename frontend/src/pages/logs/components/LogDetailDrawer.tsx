import { Copy, Globe, Monitor, Search, FileText } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import LogLevelBadge from './LogLevelBadge'
import JsonViewer from './JsonViewer'
import { useLogDetail } from '@/hooks/useLogs'
import { formatDateTime } from '@/utils/date'

interface LogDetailDrawerProps {
  open: boolean
  onClose: () => void
  logId: string | null
  onViewTrace?: (traceId: string) => void
}

// Keys that must never be shown even if present in payloads
const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'pass', 'pwd',
  'token', 'access_token', 'refresh_token', 'id_token',
  'secret', 'api_key', 'apikey', 'api_secret',
  'authorization', 'auth', 'credential', 'credentials',
  'private_key', 'privatekey', 'signing_key',
  'otp', 'pin', 'cvv', 'card_number', 'ssn',
])

/**
 * Deep-clones a value while redacting any key matching SENSITIVE_KEYS.
 * Unwraps the BSON wrapper `{ data: <actual payload> }` automatically.
 */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  // Unwrap BSON wrapper: the backend stores payloads as { data: <original> }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value as object).length === 1 &&
    'data' in (value as object)
  ) {
    return sanitize((value as Record<string, unknown>).data)
  }

  if (Array.isArray(value)) {
    return value.map(sanitize)
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '••••••••'
    } else {
      out[k] = sanitize(v)
    }
  }
  return out
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  toast.success('Copied to clipboard')
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''} break-all`}>{value}</p>
    </div>
  )
}

function LatencyBar({ ms }: { ms: number }) {
  const pct = Math.min((ms / 2000) * 100, 100)
  const color =
    ms < 100 ? 'bg-green-500' :
    ms < 500 ? 'bg-yellow-500' :
    ms < 1000 ? 'bg-orange-500' :
    'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-semibold ${
        ms < 100 ? 'text-green-600' :
        ms < 500 ? 'text-yellow-600' :
        ms < 1000 ? 'text-orange-600' :
        'text-red-600'
      }`}>{ms}ms</span>
    </div>
  )
}

export default function LogDetailDrawer({ open, onClose, logId, onViewTrace }: LogDetailDrawerProps) {
  const { data: log, isLoading } = useLogDetail(open ? logId : null)

  if (!open) return null

  const metadata = (log?.metadata ?? {}) as Record<string, unknown>
  const userAgent = metadata.user_agent as string | undefined
  const referer   = metadata.referer   as string | undefined
  const query     = metadata.query     as string | undefined
  const contentType = metadata.content_type as string | undefined

  const sanitizedRequest  = log?.request_payload  != null ? sanitize(log.request_payload)  : null
  const sanitizedResponse = log?.response_payload != null ? sanitize(log.response_payload) : null

  // Extra metadata keys beyond the well-known ones
  const extraMeta = Object.entries(metadata).filter(
    ([k]) => !['user_agent', 'referer', 'query', 'content_type'].includes(k)
  )

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log Details</SheetTitle>
          {log && <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>}
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !log ? (
          <div className="text-center py-8 text-muted-foreground">No log found</div>
        ) : (
          <div className="space-y-5 mt-6">

            {/* Status badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <LogLevelBadge level={log.level} />
              <Badge variant="outline">{log.module}</Badge>
              <Badge variant={log.status === 'success' ? 'success' : 'destructive'} className="ml-auto">
                {log.status === 'success' ? '✓ Success' : '✗ Failure'}
              </Badge>
            </div>

            <Separator />

            {/* Overview grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <InfoRow label="Method" value={log.method} mono />
              <InfoRow label="Path" value={
                <span className="truncate block font-mono text-sm" title={log.path}>{log.path}</span>
              } />
              <InfoRow label="Status Code" value={
                <span className={`font-semibold ${
                  log.status_code >= 500 ? 'text-red-600' :
                  log.status_code >= 400 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>{log.status_code}</span>
              } />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Latency</p>
                <LatencyBar ms={log.latency_ms} />
              </div>
              <InfoRow label="IP Address" value={log.ip_address} mono />
              <InfoRow label="User" value={log.user_email || log.user_id || '—'} />
            </div>

            {/* IDs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Trace ID</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="text-sm font-mono text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                    onClick={() => { onViewTrace?.(log.trace_id); onClose() }}
                    title="Click to view full trace"
                  >
                    {log.trace_id.substring(0, 8)}…
                  </button>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(log.trace_id)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Span ID</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono">{log.span_id.substring(0, 8)}…</span>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(log.span_id)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            {/* Message */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Message</p>
              <p className="text-sm text-foreground break-words">{log.message}</p>
            </div>

            {/* Request context strip */}
            {(userAgent || referer || query || contentType) && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Request Context</p>
                {userAgent && (
                  <div className="flex items-start gap-2 text-xs">
                    <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                    <span className="text-foreground/80 break-all">{userAgent}</span>
                  </div>
                )}
                {referer && (
                  <div className="flex items-start gap-2 text-xs">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                    <span className="text-foreground/80 break-all">{referer}</span>
                  </div>
                )}
                {query && (
                  <div className="flex items-start gap-2 text-xs">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                    <span className="font-mono text-foreground/80 break-all">{decodeURIComponent(query)}</span>
                  </div>
                )}
                {contentType && (
                  <div className="flex items-start gap-2 text-xs">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                    <span className="text-foreground/80">{contentType}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {log.error_message && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Error</p>
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded p-3">
                  <p className="text-sm text-red-900 dark:text-red-100 font-mono break-words">{log.error_message}</p>
                </div>
                {log.stack_trace && (
                  <div className="mt-3 bg-gray-50 dark:bg-gray-950 border border-border/50 rounded p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Stack Trace</p>
                    <pre className="text-xs overflow-x-auto text-foreground/70">{log.stack_trace}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Request Payload */}
            {sanitizedRequest != null && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Request Payload</p>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">sanitized</Badge>
                </div>
                <JsonViewer data={sanitizedRequest} maxHeight={250} />
              </div>
            )}

            {/* Response Payload */}
            {sanitizedResponse != null && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Response Payload</p>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">sanitized</Badge>
                </div>
                <JsonViewer data={sanitizedResponse} maxHeight={250} />
              </div>
            )}

            {/* Tags */}
            {log.tags && log.tags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {log.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Extra metadata */}
            {extraMeta.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Metadata</p>
                <div className="rounded bg-gray-50 dark:bg-gray-950 border border-border/50 p-3 text-xs space-y-1">
                  {extraMeta.map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <span className="font-semibold text-purple-600">{key}:</span>
                      <span className="text-foreground/70 break-words text-right flex-1">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View Trace */}
            <Button
              onClick={() => { onViewTrace?.(log.trace_id); onClose() }}
              className="w-full"
            >
              View Full Trace
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
