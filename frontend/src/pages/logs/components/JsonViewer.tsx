import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface JsonViewerProps {
  data: unknown
  maxHeight?: number
}

function JsonRenderer({ data, depth = 0 }: { data: unknown, depth?: number }): React.ReactNode {
  if (data === null) {
    return <span className="text-orange-600 dark:text-orange-400 font-semibold">null</span>
  }

  if (data === undefined) {
    return <span className="text-gray-500 dark:text-gray-400 italic">undefined</span>
  }

  if (typeof data === 'boolean') {
    return <span className="text-orange-600 dark:text-orange-400 font-semibold">{String(data)}</span>
  }

  if (typeof data === 'number') {
    return <span className="text-blue-600 dark:text-blue-400 font-semibold">{data}</span>
  }

  if (typeof data === 'string') {
    return <span className="text-green-600 dark:text-green-400">"{data}"</span>
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">[]</span>
    }
    return (
      <CollapsibleArray items={data} depth={depth} />
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">{'{}'}</span>
    }
    return (
      <CollapsibleObject entries={entries} depth={depth} />
    )
  }

  return <span>{String(data)}</span>
}

function CollapsibleArray({ items, depth }: { items: unknown[], depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 font-mono text-sm"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-gray-600">[</span>
        <span className="text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-600">]</span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-gray-300 pl-2 py-1">
          {items.map((item, idx) => (
            <div key={idx} className="font-mono text-sm py-0.5">
              <span className="text-gray-500">[{idx}]:</span> <JsonRenderer data={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CollapsibleObject({ entries, depth }: { entries: [string, unknown][], depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 font-mono text-sm"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-gray-600">{'{'}</span>
        <span className="text-gray-400">{entries.length} field{entries.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-600">{'}'}</span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-gray-300 pl-2 py-1">
          {entries.map(([key, value]) => (
            <div key={key} className="font-mono text-sm py-0.5">
              <span className="text-purple-600 font-semibold">{key}:</span> <JsonRenderer data={value} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function JsonViewer({ data, maxHeight = 300 }: JsonViewerProps) {
  const handleCopy = () => {
    try {
      const jsonStr = JSON.stringify(data, null, 2)
      navigator.clipboard.writeText(jsonStr)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  if (!data || (typeof data === 'object' && Object.keys(data as Record<string, unknown>).length === 0)) {
    return <div className="text-sm text-muted-foreground">No data</div>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">JSON</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={handleCopy}
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
      </div>
      <div
        className="rounded bg-gray-50 dark:bg-gray-950 p-3 text-xs overflow-y-auto border border-border/50"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <JsonRenderer data={data} />
      </div>
    </div>
  )
}
