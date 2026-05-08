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

import { useState, useMemo, useCallback } from 'react'
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

import {
  Database,
  RefreshCw,
  Search,
  ChevronRight,
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
      alert('Download failed. The dump may have expired.')
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

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
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

  const activeFilters = [
    debouncedSearch && `search: "${debouncedSearch}"`,
    field && value && `${field} = "${value}"`,
    dateFrom && `from: ${dateFrom}`,
    dateTo && `to: ${dateTo}`,
  ].filter(Boolean).length

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 gap-0">
      {/* Table toolbar */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Collection name */}
          <div className="flex items-center gap-1.5 mr-2">
            <Database className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{collection}</span>
            {meta && (
              <Badge variant="secondary" className="text-xs">
                {(meta.total ?? 0).toLocaleString()} docs
              </Badge>
            )}
            {(isLoading || isFetching) && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage() }}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Filters toggle */}
          <Button
            variant={filtersOpen || activeFilters > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="gap-1.5 h-8 text-xs"
          >
            <Filter className="h-3 w-3" />
            Filters
            {activeFilters > 0 && (
              <Badge className="h-4 w-4 p-0 text-[10px] flex items-center justify-center rounded-full">
                {activeFilters}
              </Badge>
            )}
          </Button>

          {/* Sort selector */}
          <div className="flex items-center gap-1">
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); resetPage() }}>
              <SelectTrigger className="h-8 text-xs w-auto min-w-[120px]">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['_id', 'created_at', 'updated_at', 'sold_at', 'name', 'status'].map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
                {columns.filter(c => !['_id', 'created_at', 'updated_at', 'sold_at', 'name', 'status'].includes(c)).map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            >
              {sortDir === 'asc' ? <SortAsc className="h-3.5 w-3.5" /> : <SortDesc className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Expanded filters panel */}
        {filtersOpen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Field</label>
              <Input
                placeholder="e.g. status"
                value={field}
                onChange={(e) => { setField(e.target.value); resetPage() }}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Value</label>
              <Input
                placeholder="e.g. active"
                value={value}
                onChange={(e) => { setValue(e.target.value); resetPage() }}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">
                Date From (ISO)
              </label>
              <Input
                type="datetime-local"
                value={dateFrom ? dateFrom.slice(0, 16) : ''}
                onChange={(e) => { setDateFrom(e.target.value ? new Date(e.target.value).toISOString() : ''); resetPage() }}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">
                Date To (ISO)
              </label>
              <Input
                type="datetime-local"
                value={dateTo ? dateTo.slice(0, 16) : ''}
                onChange={(e) => { setDateTo(e.target.value ? new Date(e.target.value).toISOString() : ''); resetPage() }}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 min-w-0">
        {isLoading ? (
          <div className="flex flex-col gap-0">
            <div className="h-10 bg-slate-100 dark:bg-slate-800 border-b" />
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 border-b animate-pulse">
                <div className="h-3 bg-slate-100 dark:bg-slate-800 m-3 rounded-md" />
              </div>
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
            <Database className="h-8 w-8 opacity-40" />
            <p className="text-sm">No documents found</p>
            {(search || field) && (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setField(''); setValue('') }}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <table className="min-w-max w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-slate-800 border-b">
                <th className="w-8 px-2 py-2.5 text-left text-slate-500 font-medium whitespace-nowrap">#</th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors select-none min-w-[120px]"
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center gap-1">
                      <span>{col}</span>
                      {sortBy === col ? (
                        sortDir === 'asc'
                          ? <ChevronUp className="h-3 w-3 text-blue-600" />
                          : <ChevronDown className="h-3 w-3 text-blue-600" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-slate-300" />
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-16 px-2 py-2.5 text-center text-slate-500 font-medium whitespace-nowrap sticky right-0 bg-slate-100 dark:bg-slate-800 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">View</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, rowIdx) => {
                const docId = getDocId(doc)
                return (
                  <tr
                    key={docId || rowIdx}
                    className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="px-2 py-2.5 text-slate-300 text-[10px] whitespace-nowrap">
                      {(page - 1) * limit + rowIdx + 1}
                    </td>
                    {columns.map((col) => {
                      const val = doc[col]
                      const kind = getValueKind(val)
                      const display = renderValue(val)
                      const cellKey = `${docId}-${col}`
                      return (
                        <td
                          key={col}
                          className="px-3 py-2.5 group/cell min-w-[120px] max-w-[260px]"
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span className={cn('truncate block max-w-[220px]', kindClass[kind])}>
                              {display}
                            </span>
                            {val !== null && val !== undefined && (
                              <button
                                className="opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0 text-slate-300 hover:text-slate-600"
                                onClick={() => handleCopyCell(cellKey, display)}
                                title="Copy value"
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
                    <td className="px-2 py-2.5 text-center sticky right-0 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] transition-colors">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setViewDocId(docId)}
                        disabled={!docId}
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

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-white dark:bg-slate-950 shrink-0">
          <p className="text-xs text-slate-500">
            Showing {((meta.page ?? 1) - 1) * (meta.limit ?? 20) + 1}–{Math.min((meta.page ?? 1) * (meta.limit ?? 20), meta.total ?? 0)} of {(meta.total ?? 0).toLocaleString()} documents
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >«</Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >‹</Button>
            {/* Page window */}
            {Array.from({ length: Math.min(5, meta.total_pages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, meta.total_pages - 4))
              const p = start + i
              if (p > meta.total_pages) return null
              return (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 w-7 text-xs p-0"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={page >= meta.total_pages}
              onClick={() => setPage(p => p + 1)}
            >›</Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={page >= meta.total_pages}
              onClick={() => setPage(meta.total_pages)}
            >»</Button>
          </div>
        </div>
      )}

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DatabaseExplorerPage() {
  const [activeCollection, setActiveCollection] = useState('')
  const [dumpOpen, setDumpOpen] = useState(false)
  const { data: collections = [] } = useCollections()

  const collectionNames = useMemo(() => collections.map((c) => c.name), [collections])

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0 gap-0 -mx-4 -mt-4">
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-20 bg-white dark:bg-slate-950 border-b px-6 py-3 flex items-center justify-between shrink-0">
          <PageHeader
            title="Database Explorer"
            description="Browse MongoDB collections and documents. All sensitive fields are masked."
          />
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <Badge
              variant="outline"
              className="text-xs gap-1 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30"
            >
              <Shield className="h-3 w-3" />
              Read-only · Sensitive fields masked
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDumpOpen(true)}
            >
              <Download className="h-4 w-4" />
              Export Dump
            </Button>
          </div>
        </div>

        {/* ── Two-panel layout ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Collections sidebar */}
          <aside className="w-60 shrink-0 border-r flex flex-col min-h-0 bg-white dark:bg-slate-950">
            <CollectionsSidebar
              activeCollection={activeCollection}
              onSelect={(name) => setActiveCollection(name)}
            />
          </aside>

          {/* Right: Documents panel */}
          <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-white dark:bg-slate-950">
            {activeCollection ? (
              <DocumentsTable collection={activeCollection} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                  <Database className="h-8 w-8 text-blue-500 opacity-80" />
                </div>
                <div className="text-center">
                  <p className="text-base font-medium text-slate-600 dark:text-slate-300">
                    Select a collection
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    Choose a collection from the sidebar to explore documents
                  </p>
                </div>
                {collections.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 max-w-md mt-2">
                    {collections.slice(0, 8).map((c) => (
                      <button
                        key={c.name}
                        onClick={() => setActiveCollection(c.name)}
                        className="px-3 py-1.5 rounded-full border text-xs font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        {c.name}
                        <span className="ml-1.5 text-slate-400">{c.count.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
