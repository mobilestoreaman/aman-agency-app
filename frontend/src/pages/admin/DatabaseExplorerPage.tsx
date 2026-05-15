/**
 * DatabaseExplorerPage — Admin > Database Explorer
 *
 * A secure, read-only MongoDB Collections Explorer that lets admins:
 *   • Browse all collections with document counts + sizes
 *   • Inspect documents with dynamic columns, search, sort, filter, pagination
 *   • View individual documents in a JSON viewer modal
 *   • Generate and download secure database dumps (JSON or ZIP)
 *
 * All routes are protected by AdminOnly middleware on the backend;
 * the frontend also wraps this page in <RequireAdmin />.
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuthStore } from '@/store/authStore'
import {
  useCollections,
  useCollectionDocuments,
  useDocument,
  useDumpHistory,
  useGenerateDump,
} from '@/hooks/useAdminDb'
import { getDumpDownloadUrl } from '@/api/admin'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  Database,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronLeft,
  Download,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileJson,
  Archive,
  Clock,
  AlertCircle,
  Loader2,
  Eye,
  Filter,
  SortAsc,
  SortDesc,
  ArrowUpDown,
  History,
  Shield,
  Menu,
  ArrowLeft,
  LayoutGrid,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import PageHeader from '@/components/shared/PageHeader'
import { usePageTitle } from '@/hooks/usePageTitle'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Format a byte count as a human-readable string (KB, MB, GB). */
function fmtBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

/** Render an arbitrary MongoDB value as a concise, human-readable string. */
function renderValue(val: unknown, depth = 0): string {
  if (val === null || val === undefined) return 'null'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'string') {
    // Truncate long strings in the table cells
    if (depth === 0 && val.length > 80) return val.slice(0, 80) + '…'
    return val
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    return `[${val.length} item${val.length !== 1 ? 's' : ''}]`
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val as object)
    if (keys.length === 0) return '{}'
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}}`
  }
  return String(val)
}

/** Detect the semantic type of a value for badge colouring. */
type ValueKind = 'id' | 'date' | 'bool' | 'null' | 'number' | 'array' | 'object' | 'masked' | 'string'
function getValueKind(val: unknown): ValueKind {
  if (val === null || val === undefined) return 'null'
  if (typeof val === 'string') {
    if (val === '••••••••') return 'masked'
    // MongoDB ObjectID hex
    if (/^[0-9a-f]{24}$/.test(val)) return 'id'
    // ISO date
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return 'date'
    return 'string'
  }
  if (typeof val === 'boolean') return 'bool'
  if (typeof val === 'number') return 'number'
  if (Array.isArray(val)) return 'array'
  if (typeof val === 'object') return 'object'
  return 'string'
}

const kindClass: Record<ValueKind, string> = {
  id: 'font-mono text-xs text-violet-600 dark:text-violet-400',
  date: 'text-sky-600 dark:text-sky-400 text-xs',
  bool: 'text-amber-600 dark:text-amber-400 font-medium',
  null: 'text-slate-400 italic text-xs',
  number: 'font-mono text-emerald-700 dark:text-emerald-400',
  array: 'text-slate-500 text-xs',
  object: 'text-slate-500 text-xs',
  masked: 'text-slate-400 tracking-widest',
  string: 'text-slate-800 dark:text-slate-200',
}

/** Get the top-level column keys from a list of documents. */
function getColumns(docs: Record<string, unknown>[]): string[] {
  const seen = new Map<string, number>()
  for (const doc of docs) {
    for (const key of Object.keys(doc)) {
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  // Always surface _id / id first, then sort by frequency (most common first).
  const priority = ['_id', 'id']
  const sorted = [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => !priority.includes(k))
  return [...priority.filter((p) => seen.has(p)), ...sorted].slice(0, 12)
}

// ── JSON Viewer ───────────────────────────────────────────────────────────────

interface JSONNodeProps {
  value: unknown
  depth?: number
  defaultExpanded?: boolean
}

function JSONNode({ value, depth = 0, defaultExpanded = true }: JSONNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded && depth < 2)

  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">null</span>
  }
  if (typeof value === 'boolean') {
    return <span className="text-amber-500 font-medium">{String(value)}</span>
  }
  if (typeof value === 'number') {
    return <span className="text-emerald-600 dark:text-emerald-400 font-mono">{value}</span>
  }
  if (typeof value === 'string') {
    const kind = getValueKind(value)
    if (kind === 'masked') return <span className="text-slate-400">••••••••</span>
    if (kind === 'id') return <span className="text-violet-600 dark:text-violet-400 font-mono text-xs">"{value}"</span>
    if (kind === 'date') return <span className="text-sky-500">{value}</span>
    return <span className="text-rose-600 dark:text-rose-400">"{value}"</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">[]</span>
    return (
      <span>
        <button
          className="inline-flex items-center gap-0.5 hover:text-blue-600 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-slate-500 text-xs">[{value.length}]</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-slate-200 dark:border-slate-700 pl-3 mt-0.5">
            {value.map((item, i) => (
              <div key={i} className="flex gap-1.5 py-0.5">
                <span className="text-slate-400 text-xs shrink-0">{i}:</span>
                <JSONNode value={item} depth={depth + 1} defaultExpanded={false} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-slate-400">{'{}'}</span>
    return (
      <span>
        <button
          className="inline-flex items-center gap-0.5 hover:text-blue-600 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-slate-500 text-xs">{'{' + entries.length + ' fields}'}</span>
        </button>
        {expanded && (
          <div className="ml-4 border-l border-slate-200 dark:border-slate-700 pl-3 mt-0.5">
            {entries.map(([k, v]) => (
              <div key={k} className="flex gap-1.5 py-0.5 min-w-0">
                <span className="text-blue-600 dark:text-blue-400 text-xs shrink-0 font-medium">{k}:</span>
                <JSONNode value={v} depth={depth + 1} defaultExpanded={depth < 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    )
  }
  return <span>{String(value)}</span>
}

// ── Document Viewer Modal ─────────────────────────────────────────────────────

interface DocumentViewerProps {
  collection: string
  docId: string
  onClose: () => void
}

function DocumentViewer({ collection, docId, onClose }: DocumentViewerProps) {
  const { data: doc, isLoading } = useDocument(collection, docId)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!doc) return
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [doc])

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-600" />
                Document Viewer
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                <span className="font-mono text-blue-600">{collection}</span>
                {' · '}
                <span className="font-mono text-slate-500 break-all">{docId}</span>
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleCopy} disabled={!doc}>
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied!' : 'Copy JSON'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy document as JSON</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading document…</span>
            </div>
          ) : !doc ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-400">
              <AlertCircle className="h-6 w-6" />
              <span className="text-sm">Document not found</span>
            </div>
          ) : (
            <div className="font-mono text-sm leading-relaxed">
              <JSONNode value={doc} depth={0} defaultExpanded />
            </div>
          )}
        </div>

        {/* Metadata footer */}
        {doc && (
          <div className="px-5 py-3 border-t bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 flex flex-wrap gap-4 shrink-0">

            {doc['_id'] != null && (
              <span>
                <strong>_id:</strong>{' '}
                <span className="font-mono">
                  {String(doc['_id'])}
                </span>
              </span>
            )}

            {doc['created_at'] != null && (
              <span>
                <strong>created_at:</strong>{' '}
                {String(doc['created_at'])}
              </span>
            )}

            {doc['updated_at'] != null && (
              <span>
                <strong>updated_at:</strong>{' '}
                {String(doc['updated_at'])}
              </span>
            )}

            <span className="ml-auto flex items-center gap-1 text-amber-600">
              <Shield className="h-3 w-3" />
              Sensitive fields are masked
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Dump Modal ────────────────────────────────────────────────────────────────

interface DumpModalProps {
  collections: string[]
  onClose: () => void
}

function DumpModal({ collections, onClose }: DumpModalProps) {
  const [tab, setTab] = useState<'generate' | 'history'>('generate')
  const [collection, setCollection] = useState('')
  const [format, setFormat] = useState<'json' | 'zip'>('zip')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const generateMutation = useGenerateDump()
  const { data: history = [], isLoading: histLoading, refetch } = useDumpHistory()

  const handleGenerate = useCallback(() => {
    generateMutation.mutate(
      { collection: collection || undefined, format },
      {
        onSuccess: () => {
          setTab('history')
          refetch()
          setConfirmOpen(false)
        },
      },
    )
  }, [generateMutation, collection, format, refetch])

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-blue-600" />
              MongoDB Dump Export
            </DialogTitle>
            <DialogDescription>
              Generate a secure, masked export of your MongoDB data.
              Sensitive fields (passwords, tokens) are always excluded.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b shrink-0">
            {(['generate', 'history'] as const).map((t) => (
              <button
                key={t}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium transition-colors',
                  tab === t
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-slate-500 hover:text-slate-700',
                )}
                onClick={() => setTab(t)}
              >
                {t === 'generate' ? 'Generate Dump' : 'Download History'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto px-5 py-5 min-h-0">
            {tab === 'generate' && (
              <div className="flex flex-col gap-5">
                {/* Security notice */}
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <Shield className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800 dark:text-amber-300">
                    <strong>Security Notice:</strong> All dumps automatically mask sensitive fields
                    including passwords, tokens, API keys, and secrets.
                    Dumps expire after 1 hour and are stored server-side only.
                  </div>
                </div>

                {/* Collection selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Collection
                  </label>
                  <Select value={collection || '__all__'} onValueChange={(v) => setCollection(v === '__all__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">
                        <span className="font-medium">Entire Database</span>
                        <span className="ml-2 text-xs text-slate-400">All collections</span>
                      </SelectItem>
                      {collections.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Format selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Format</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['zip', 'json'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border p-4 text-left transition-all',
                          format === f
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                            : 'border-slate-200 hover:border-slate-300',
                        )}
                      >
                        {f === 'zip' ? <Archive className="h-5 w-5 text-blue-600 shrink-0" /> : <FileJson className="h-5 w-5 text-slate-500 shrink-0" />}
                        <div>
                          <p className="font-medium text-sm">.{f.toUpperCase()}</p>
                          <p className="text-xs text-slate-500">
                            {f === 'zip' ? 'One file per collection (recommended)' : 'Single JSON object'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* File name preview */}
                <div className="rounded-md border bg-slate-50 dark:bg-slate-900 px-4 py-3">
                  <p className="text-xs text-slate-500 mb-1">Output filename (preview)</p>
                  <p className="font-mono text-sm text-slate-700 dark:text-slate-300">
                    mongodb_dump_{collection || 'full_db'}_{new Date().toISOString().slice(0, 10).replace(/-/g, '_')}.{format}
                  </p>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={() => setConfirmOpen(true)}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                    : <><Download className="h-4 w-4" /> Generate Dump</>
                  }
                </Button>
              </div>
            )}

            {tab === 'history' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    {history.length} dump{history.length !== 1 ? 's' : ''} generated this session
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={histLoading}>
                    <RefreshCw className={cn('h-4 w-4', histLoading && 'animate-spin')} />
                  </Button>
                </div>
                {histLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-slate-400 gap-2">
                    <History className="h-6 w-6" />
                    <p className="text-sm">No dumps generated yet</p>
                  </div>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {history.map((rec) => (
                      <div key={rec.id} className="flex items-center gap-3 px-4 py-3">
                        {rec.format === 'zip'
                          ? <Archive className="h-4 w-4 text-blue-500 shrink-0" />
                          : <FileJson className="h-4 w-4 text-slate-500 shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{rec.file_name}</p>
                          <p className="text-xs text-slate-500">
                            {fmtBytes(rec.size_bytes)} · {new Date(rec.created_at).toLocaleString()}
                            {rec.collection && <span className="ml-2">Collection: <strong>{rec.collection}</strong></span>}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {rec.expired ? (
                            <Badge variant="outline" className="text-xs text-slate-400">
                              <Clock className="h-3 w-3 mr-1" />Expired
                            </Badge>
                          ) : (
                            <DownloadButton dumpId={rec.id} fileName={rec.file_name} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Dump Generation</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to generate a{' '}
              <strong>{format.toUpperCase()}</strong> dump of{' '}
              <strong>{collection ? `the "${collection}" collection` : 'the entire database'}</strong>.
              This action is logged. Sensitive fields will be masked automatically.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? 'Generating…' : 'Generate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Small inline download button that uses a token-authenticated fetch + blob approach
 *  because the backend requires a Bearer token on the download endpoint. */
function DownloadButton({ dumpId, fileName }: { dumpId: string; fileName: string }) {
  const url = getDumpDownloadUrl(dumpId)
  const token = useAuthStore.getState().accessToken

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      toast.error('Download failed. The dump may have expired.')
    }
  }, [url, token, fileName])

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
      <Download className="h-3.5 w-3.5" />
      Download
    </Button>
  )
}

// ── Collections Sidebar ───────────────────────────────────────────────────────

interface CollectionsSidebarProps {
  activeCollection: string
  onSelect: (name: string) => void
}

function CollectionsSidebar({ activeCollection, onSelect }: CollectionsSidebarProps) {
  const [search, setSearch] = useState('')
  const { data: collections = [], isLoading, refetch, isFetching } = useCollections()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? collections.filter((c) => c.name.toLowerCase().includes(q)) : collections
  }, [collections, search])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Database className="h-4 w-4 text-blue-600" />
          Collections
          <Badge variant="secondary" className="text-xs">{collections.length}</Badge>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh collections</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Search */}
      <div className="px-2.5 py-2 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search collections…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setSearch('')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* List — explicit max-h so the list itself scrolls, not the page */}
      <div className="overflow-y-auto max-h-[calc(100dvh-180px)]">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
            <Database className="h-5 w-5" />
            <p className="text-xs">{search ? 'No matches' : 'No collections'}</p>
          </div>
        ) : (
          <div className="py-1">
            {filtered.map((col) => (
              <button
                key={col.name}
                onClick={() => onSelect(col.name)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                  activeCollection === col.name
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-r-2 border-blue-600'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                )}
              >
                <div className="mt-0.5 shrink-0">
                  <div className={cn(
                    'h-2 w-2 rounded-full',
                    col.count > 0 ? 'bg-emerald-500' : 'bg-slate-300',
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-xs font-medium truncate',
                    activeCollection === col.name ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300',
                  )}>
                    {col.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {col.count.toLocaleString()} docs
                    {col.size_bytes > 0 && <span className="ml-1">· {fmtBytes(col.size_bytes)}</span>}
                  </p>
                </div>
                {activeCollection === col.name && (
                  <ChevronRight className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Documents Table ───────────────────────────────────────────────────────────

interface DocumentsTableProps {
  collection: string
}

function DocumentsTable({ collection }: DocumentsTableProps) {
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('_id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateField, setDateField] = useState('created_at')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewDocId, setViewDocId] = useState<string | null>(null)
  const [copiedCell, setCopiedCell] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  // Reset to page 1 whenever collection or filters change.
  const resetPage = useCallback(() => setPage(1), [])

  const params = useMemo(() => ({
    page,
    limit,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    field: field || undefined,
    value: value || undefined,
    date_field: dateField || undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  }), [page, limit, debouncedSearch, sortBy, sortDir, field, value, dateField, dateFrom, dateTo])

  const { data, isLoading, isFetching } = useCollectionDocuments(collection, params)
  const docs = data?.data ?? []
  const meta = data?.meta

  const columns = useMemo(() => getColumns(docs), [docs])

  const handleSort = useCallback((col: string) => {
    if (sortBy === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    resetPage()
  }, [sortBy, resetPage])

  const handleCopyCell = useCallback((key: string, val: string) => {
    navigator.clipboard.writeText(val)
    setCopiedCell(key)
    setTimeout(() => setCopiedCell(null), 1200)
  }, [])

  const getDocId = (doc: Record<string, unknown>): string => {
    return String(doc['_id'] ?? doc['id'] ?? '')
  }

  // Scroll-shadow: show a subtle shadow under the sticky thead when scrolled
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [theadShadow, setTheadShadow] = useState(false)
  const handleTableScroll = useCallback(() => {
    setTheadShadow((tableScrollRef.current?.scrollTop ?? 0) > 2)
  }, [])

  const activeFilters = [
    debouncedSearch && `search: "${debouncedSearch}"`,
    field && value && `${field} = "${value}"`,
    dateFrom && `from: ${dateFrom}`,
    dateTo && `to: ${dateTo}`,
  ].filter(Boolean).length

  return (
    <div className="flex flex-col w-full h-full min-h-0 min-w-0">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-2 px-3 sm:px-4 py-2.5 border-b shrink-0">

        {/* Row 1: collection name + loading indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{collection}</span>
          {meta && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {(meta.total ?? 0).toLocaleString()} docs
            </Badge>
          )}
          {(isLoading || isFetching) && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0 ml-auto" />
          )}
        </div>

        {/* Row 2: search + filter toggle + sort */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Search — grows to fill available space */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage() }}
              className="pl-8 h-8 text-xs"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => { setSearch(''); resetPage() }}
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filters toggle */}
          <Button
            variant={filtersOpen || activeFilters > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="h-8 gap-1.5 text-xs shrink-0"
            aria-expanded={filtersOpen}
          >
            <Filter className="h-3 w-3" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                {activeFilters}
              </span>
            )}
          </Button>

          {/* Sort — field selector + direction toggle */}
          <div className="flex items-center gap-1 shrink-0">
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); resetPage() }}>
              <SelectTrigger className="h-8 text-xs w-auto max-w-[130px]">
                <ArrowUpDown className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['_id', 'created_at', 'updated_at', 'sold_at', 'name', 'status'].map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
                {columns
                  .filter((c) => !['_id', 'created_at', 'updated_at', 'sold_at', 'name', 'status'].includes(c))
                  .map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              title={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
            >
              {sortDir === 'asc'
                ? <SortAsc className="h-3.5 w-3.5" />
                : <SortDesc className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Expanded filter panel */}
        {filtersOpen && (
          <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Field</label>
              <Input placeholder="e.g. status" value={field}
                onChange={(e) => { setField(e.target.value); resetPage() }} className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Value</label>
              <Input placeholder="e.g. active" value={value}
                onChange={(e) => { setValue(e.target.value); resetPage() }} className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">From (ISO)</label>
              <Input type="datetime-local" value={dateFrom ? dateFrom.slice(0, 16) : ''}
                onChange={(e) => { setDateFrom(e.target.value ? new Date(e.target.value).toISOString() : ''); resetPage() }}
                className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">To (ISO)</label>
              <Input type="datetime-local" value={dateTo ? dateTo.slice(0, 16) : ''}
                onChange={(e) => { setDateTo(e.target.value ? new Date(e.target.value).toISOString() : ''); resetPage() }}
                className="h-8 text-xs" />
            </div>
          </div>
        )}
      </div>

      {/* ── Table card — matches Log Tracing page visual style ──────────────
           • rounded-xl border card with overflow-hidden clips rounded corners
           • Scroll container uses explicit max-h (not flex-1) so it scrolls
             independently of the page — same technique as Log Tracing page.
             The page lives inside AppShell's <ScrollArea>, so flex-1/h-full
             chains don't create bounded heights; only an explicit max-h works.
           • Sticky thead is relative to the scroll container so headers stay
             pinned vertically while moving horizontally with the table body.  */}
      {/* min-w-0 is critical: without it the card expands to fit table content,
          the scroll container expands with it, and horizontal scroll never fires */}
      <div className="m-3 rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">

        {/* w-full ensures the scroll container is exactly as wide as the card,
            not wider (which would also prevent the horizontal scroll) */}
        <div
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="overflow-auto min-h-[180px] max-h-[calc(100dvh-320px)]"
        >
          {isLoading ? (
            /* ── Skeleton ────────────────────────────────────────────────── */
            <table className="min-w-full border-collapse text-xs" style={{ minWidth: '700px' }}>
              <thead className="sticky top-0 z-10 border-b border-border/60">
                <tr>
                  {['#', 'Field 1', 'Field 2', 'Field 3', 'Field 4', 'Field 5', ''].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap bg-slate-100 dark:bg-slate-800">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className={cn(i % 2 === 1 && 'bg-muted/15')}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${50 + (j * 17 + i * 11) % 45}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : docs.length === 0 ? (
            /* ── Empty state ─────────────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Database className="h-6 w-6 opacity-40" />
              </div>
              <p className="text-sm font-medium">No documents found</p>
              {(search || field) && (
                <Button variant="outline" size="sm" onClick={() => { setSearch(''); setField(''); setValue('') }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            /* ── Data table ──────────────────────────────────────────────── */
            <table className="min-w-full border-collapse text-xs" style={{ minWidth: `${columns.length * 140 + 80}px` }}>
              {/* Sticky header — MUST use a fully opaque solid bg.
                  bg-muted/40 is 40% opacity → body rows show through when scrolled. */}
              <thead
                className={cn(
                  'sticky top-0 z-10 border-b border-border/60 transition-shadow duration-150',
                  theadShadow
                    ? 'shadow-[0_2px_8px_0_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_0_rgba(0,0,0,0.3)]'
                    : '',
                )}
              >
                <tr>
                  {/* Row number */}
                  <th
                    scope="col"
                    className="w-10 px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap bg-slate-100 dark:bg-slate-800 select-none"
                  >
                    #
                  </th>

                  {/* Dynamic document columns */}
                  {columns.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className={cn(
                        'group px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap min-w-[130px]',
                        'cursor-pointer select-none bg-slate-100 dark:bg-slate-800',
                        'hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-foreground transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                        sortBy === col
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                          : 'text-slate-500 dark:text-slate-400',
                      )}
                      onClick={() => handleSort(col)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col) } }}
                      tabIndex={0}
                      aria-sort={sortBy === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col}
                        {sortBy === col
                          ? sortDir === 'asc'
                            ? <ChevronUp className="h-3 w-3 shrink-0" />
                            : <ChevronDown className="h-3 w-3 shrink-0" />
                          : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                        }
                      </span>
                    </th>
                  ))}

                  {/* Sticky "View" column pinned to the right — solid bg matches header row */}
                  <th
                    scope="col"
                    className="w-14 px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap bg-slate-100 dark:bg-slate-800 sticky right-0 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.25)]"
                  >
                    View
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {docs.map((doc, rowIdx) => {
                  const docId  = getDocId(doc)
                  const isEven = rowIdx % 2 === 1

                  return (
                    <tr
                      key={docId || rowIdx}
                      className={cn(
                        'transition-colors group',
                        isEven
                          ? 'bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/80 dark:hover:bg-blue-900/20'
                          : 'bg-white dark:bg-slate-950 hover:bg-blue-50/50 dark:hover:bg-blue-900/10',
                      )}
                    >
                      {/* Row number */}
                      <td className="px-2 py-2 text-muted-foreground/50 text-[10px] tabular-nums whitespace-nowrap">
                        {(page - 1) * limit + rowIdx + 1}
                      </td>

                      {/* Data cells */}
                      {columns.map((col) => {
                        const val     = doc[col]
                        const kind    = getValueKind(val)
                        const display = renderValue(val)
                        const cellKey = `${docId}-${col}`

                        return (
                          <td key={col} className="px-3 py-2 align-middle group/cell">
                            <div className="flex items-center gap-1 min-w-0 max-w-[240px]">
                              <span
                                className={cn('truncate text-xs', kindClass[kind])}
                                title={typeof display === 'string' ? display : undefined}
                              >
                                {display}
                              </span>
                              {val !== null && val !== undefined && (
                                <button
                                  className="opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground"
                                  onClick={() => handleCopyCell(cellKey, display)}
                                  title="Copy value"
                                  aria-label={`Copy ${col} value`}
                                >
                                  {copiedCell === cellKey
                                    ? <Check className="h-2.5 w-2.5 text-green-500" />
                                    : <Copy className="h-2.5 w-2.5" />
                                  }
                                </button>
                              )}
                            </div>
                          </td>
                        )
                      })}

                      {/* View button — sticky right, solid bg mirrors row stripe */}
                      <td
                        className={cn(
                          'px-2 py-2 text-center sticky right-0 transition-colors',
                          'shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.04)] dark:shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.2)]',
                          isEven
                            ? 'bg-slate-50 dark:bg-slate-800/40 group-hover:bg-blue-50/80 dark:group-hover:bg-blue-900/20'
                            : 'bg-white dark:bg-slate-950 group-hover:bg-blue-50/50 dark:group-hover:bg-blue-900/10',
                        )}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setViewDocId(docId)}
                          disabled={!docId}
                          aria-label="View document"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer: record count + pagination (inside card, matches Logs page) */}
        {meta && (meta.total ?? 0) > 0 && (
          <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-4 py-2 text-xs text-muted-foreground shrink-0">
            <span>
              {(meta.total_pages ?? 1) > 1
                ? `${((meta.page ?? 1) - 1) * (meta.limit ?? 20) + 1}–${Math.min((meta.page ?? 1) * (meta.limit ?? 20), meta.total ?? 0)} of ${(meta.total ?? 0).toLocaleString()} documents`
                : `${(meta.total ?? 0).toLocaleString()} document${(meta.total ?? 0) !== 1 ? 's' : ''}`}
            </span>
            {(meta.total_pages ?? 1) > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7 border-border/60"
                  disabled={page <= 1} onClick={() => setPage(1)}>
                  <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-1.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7 border-border/60"
                  disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {/* Page window (up to 5 pages) */}
                {Array.from({ length: Math.min(5, meta.total_pages ?? 1) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, (meta.total_pages ?? 1) - 4))
                  const p = start + i
                  if (p > (meta.total_pages ?? 1)) return null
                  return (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="icon"
                      className="h-7 w-7 text-xs border-border/60"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
                <Button variant="outline" size="icon" className="h-7 w-7 border-border/60"
                  disabled={page >= (meta.total_pages ?? 1)} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7 border-border/60"
                  disabled={page >= (meta.total_pages ?? 1)} onClick={() => setPage(meta.total_pages ?? 1)}>
                  <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-1.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document viewer modal */}
      {viewDocId && (
        <DocumentViewer
          collection={collection}
          docId={viewDocId}
          onClose={() => setViewDocId(null)}
        />
      )}
    </div>
  )
}

// ── Mobile collection picker ───────────────────────────────────────────────────
// Shown on < md screens instead of the sidebar. Renders collections as a
// tappable card grid so users can pick one without a cramped sidebar column.

interface MobileCollectionPickerProps {
  collections: import('@/api/admin').CollectionInfo[]
  activeCollection: string
  onSelect: (name: string) => void
  onDump: () => void
}

function MobileCollectionPicker({
  collections,
  activeCollection,
  onSelect,
  onDump,
}: MobileCollectionPickerProps) {
  const [search, setSearch] = useState('')
  const { isFetching, refetch } = useCollections()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? collections.filter((c) => c.name.toLowerCase().includes(q)) : collections
  }, [collections, search])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mobile picker header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search collections…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setSearch('')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0"
          onClick={onDump}>
          <Download className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">Export</span>
        </Button>
      </div>

      {/* Collection cards grid — explicit max-h so only this area scrolls */}
      <div className="overflow-y-auto max-h-[calc(100dvh-160px)] p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
            <Database className="h-6 w-6 opacity-40" />
            <p className="text-sm">{search ? 'No matches' : 'No collections'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filtered.map((col) => (
              <button
                key={col.name}
                onClick={() => onSelect(col.name)}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-3 text-left transition-all',
                  'hover:border-blue-400 hover:shadow-sm active:scale-[0.98]',
                  activeCollection === col.name
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                    : 'border-border bg-card',
                )}
              >
                {/* Status dot + name */}
                <div className="flex items-start gap-2">
                  <div className={cn(
                    'mt-0.5 h-2 w-2 rounded-full shrink-0',
                    col.count > 0 ? 'bg-emerald-500' : 'bg-slate-300',
                  )} />
                  <p className={cn(
                    'text-xs font-semibold leading-tight break-all',
                    activeCollection === col.name
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-slate-800 dark:text-slate-200',
                  )}>
                    {col.name}
                  </p>
                </div>
                {/* Stats */}
                <div className="flex flex-col gap-0.5 pl-4">
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    {col.count.toLocaleString()} docs
                  </span>
                  {col.size_bytes > 0 && (
                    <span className="text-[10px] text-slate-400">{fmtBytes(col.size_bytes)}</span>
                  )}
                </div>
                {/* Tap hint */}
                {activeCollection === col.name && (
                  <div className="flex items-center gap-1 pl-4">
                    <span className="text-[10px] text-blue-600 font-medium">Tap to view →</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
//
// RESPONSIVE LAYOUT
// ─────────────────
//  Mobile  (< md / 768px):
//    • mobileView = 'collections' → full-screen MobileCollectionPicker grid
//    • mobileView = 'documents'   → full-screen DocumentsTable with ← back button
//    • Sidebar hidden; Export Dump accessible from collection picker header
//
//  Tablet  (md – lg / 768–1024px):
//    • Collapsible sidebar (240px) toggleable via ☰ button in header
//    • Overlay (backdrop) closes sidebar on outside click
//    • DocumentsTable fills remaining width
//
//  Desktop (≥ lg / 1024px):
//    • Permanent 240px sidebar always visible on the left
//    • Full two-panel split layout

export default function DatabaseExplorerPage() {
  usePageTitle('Database Explorer')
  const [activeCollection, setActiveCollection] = useState('')
  const [dumpOpen, setDumpOpen]               = useState(false)
  // Tablet: sidebar overlay open/closed
  const [tabletSidebarOpen, setTabletSidebarOpen] = useState(false)
  // Mobile: which "screen" is active
  const [mobileView, setMobileView] = useState<'collections' | 'documents'>('collections')

  const { data: collections = [] } = useCollections()
  const collectionNames = useMemo(() => collections.map((c) => c.name), [collections])

  const handleSelectCollection = useCallback((name: string) => {
    setActiveCollection(name)
    setTabletSidebarOpen(false)   // close tablet overlay
    setMobileView('documents')    // switch mobile to document view
  }, [])

  const handleBackToCollections = useCallback(() => {
    setMobileView('collections')
  }, [])

  // Desktop empty-state quick-select
  const EmptyDocPanel = (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-5 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Database className="h-8 w-8 text-blue-500 opacity-80" />
      </div>
      <div className="text-center max-w-xs">
        <p className="text-base font-semibold text-slate-600 dark:text-slate-300">
          Select a collection
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Choose a collection from the sidebar to browse and inspect documents.
        </p>
      </div>
      {collections.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 max-w-sm mt-1">
          {collections.slice(0, 9).map((c) => (
            <button
              key={c.name}
              onClick={() => handleSelectCollection(c.name)}
              className="px-3 py-1.5 rounded-full border text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {c.name}
              <span className="ml-1.5 text-slate-400">{c.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-0 gap-0">

        {/* ── Page header ──────────────────────────────────────────────────────
            Mobile:  back button (in docs view) + title + [Export icon]
            Tablet:  sidebar toggle + title + badge + [Export]
            Desktop: title + badge + [Export Dump button]              */}
        <header className="sticky top-0 z-20 bg-white dark:bg-slate-950 border-b shrink-0">
          <div className="flex items-center gap-2 px-3 sm:px-4 lg:px-6 py-3">

            {/* Mobile: ← back button when in document view */}
            <button
              onClick={handleBackToCollections}
              className={cn(
                'md:hidden flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0',
                mobileView === 'documents' ? 'flex' : 'hidden',
              )}
              aria-label="Back to collections"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {/* Tablet: sidebar toggle button */}
            <button
              onClick={() => setTabletSidebarOpen((o) => !o)}
              className="hidden md:flex lg:hidden items-center justify-center h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              aria-label={tabletSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              aria-expanded={tabletSidebarOpen}
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Title block */}
            <div className="flex-1 min-w-0">
              {/* Mobile docs view: show collection name as subtitle */}
              {mobileView === 'documents' && activeCollection ? (
                <div className="md:hidden">
                  <p className="text-xs text-slate-400 font-medium">Database Explorer</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    {activeCollection}
                  </p>
                </div>
              ) : null}
              <div className={cn(mobileView === 'documents' && activeCollection ? 'hidden md:block' : 'block')}>
                <PageHeader
                  title="Database Explorer"
                  description="Browse MongoDB collections and documents."
                />
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Security badge — hidden on mobile */}
              <Badge
                variant="outline"
                className="hidden sm:flex text-xs gap-1.5 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700"
              >
                <Shield className="h-3 w-3" />
                <span className="hidden lg:inline">Read-only · </span>Sensitive fields masked
              </Badge>

              {/* Export Dump button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => setDumpOpen(true)}
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export Dump</span>
              </Button>
            </div>
          </div>

          {/* Tablet/Mobile: active collection breadcrumb shown below header bar */}
          {activeCollection && mobileView === 'documents' && (
            <div className="md:hidden flex items-center gap-1.5 px-4 pb-2 -mt-1">
              <button
                onClick={handleBackToCollections}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 transition-colors"
              >
                <LayoutGrid className="h-3 w-3" />
                All collections
              </button>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                {activeCollection}
              </span>
            </div>
          )}
        </header>

        {/* ── Content area ─────────────────────────────────────────────────── */}
        {/* Explicit min-h so the split panel has a bounded height without relying
            on flex-1/h-full chains that don't work inside AppShell's ScrollArea */}
        <div className="flex overflow-hidden relative min-h-[calc(100dvh-220px)]">

          {/* ── Tablet: backdrop overlay for sidebar ──── */}
          {tabletSidebarOpen && (
            <div
              className="hidden md:block lg:hidden absolute inset-0 bg-black/20 dark:bg-black/40 z-10 backdrop-blur-[1px]"
              onClick={() => setTabletSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* ── Sidebar: desktop (permanent) + tablet (overlay) ── */}

          {/* Desktop: always visible, fixed width */}
          <aside className="hidden lg:flex w-60 shrink-0 border-r flex-col min-h-0 bg-white dark:bg-slate-950 z-0">
            <CollectionsSidebar
              activeCollection={activeCollection}
              onSelect={handleSelectCollection}
            />
          </aside>

          {/* Tablet: slide-in overlay panel */}
          <aside
            className={cn(
              'hidden md:flex lg:hidden flex-col min-h-0 bg-white dark:bg-slate-950',
              'absolute left-0 top-0 bottom-0 z-20 w-64 border-r shadow-2xl',
              'transition-transform duration-200 ease-in-out',
              tabletSidebarOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <CollectionsSidebar
              activeCollection={activeCollection}
              onSelect={handleSelectCollection}
            />
          </aside>

          {/* ── Mobile: full-screen collection picker ─────── */}
          <div
            className={cn(
              'md:hidden flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-950',
              mobileView === 'collections' ? 'flex' : 'hidden',
            )}
          >
            <MobileCollectionPicker
              collections={collections}
              activeCollection={activeCollection}
              onSelect={handleSelectCollection}
              onDump={() => setDumpOpen(true)}
            />
          </div>

          {/* ── Document panel ──────────────────────────────
              Mobile  : visible only when mobileView = 'documents'
              Tablet+ : always visible (sidebar is an overlay above it)  */}
          <main
            className={cn(
              'flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-white dark:bg-slate-950',
              // mobile
              'hidden md:flex',
              mobileView === 'documents' && 'flex',
            )}
          >
            {activeCollection ? (
              <DocumentsTable collection={activeCollection} />
            ) : (
              EmptyDocPanel
            )}
          </main>
        </div>
      </div>

      {/* Dump modal */}
      {dumpOpen && (
        <DumpModal
          collections={collectionNames}
          onClose={() => setDumpOpen(false)}
        />
      )}
    </TooltipProvider>
  )
}
