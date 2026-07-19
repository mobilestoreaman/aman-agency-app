/**
 * PurchaseDetailSheet
 * -------------------
 * Slides in from the right when a purchase row is clicked.
 * Shows all items (devices) in the purchase with full details —
 * IMEI, product, color, storage, condition, purchase/selling price.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Badge }   from '@/components/ui/badge'
import { Button }  from '@/components/ui/button'
import {
  Building2, CalendarDays, Hash, Smartphone, Tag, Layers,
  StickyNote, PackageCheck, Clock, IndianRupee, ImageIcon,
  ExternalLink, Loader2, Eye,
} from 'lucide-react'
import { formatCurrency }         from '@/utils/currency'
import { formatDate }             from '@/utils/date'
import { useInvoiceByPurchaseId } from '@/hooks/useVendorInvoices'
import { apiClient }              from '@/api/client'
import type { Purchase }          from '@/types'

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'received':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300">
          <PackageCheck className="mr-1 h-3 w-3" />Received
        </Badge>
      )
    case 'pending':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300">
          <Clock className="mr-1 h-3 w-3" />Pending
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-300">
          Cancelled
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// ─── Condition pill ───────────────────────────────────────────────────────────

function ConditionPill({ condition }: { condition: string }) {
  const map: Record<string, string> = {
    new:         'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    used:        'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    refurbished: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[condition] ?? 'bg-muted text-muted-foreground'}`}>
      {condition}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Reference photo viewer ───────────────────────────────────────────────────

/**
 * Fetches the invoice file as an authenticated blob (JWT header required)
 * and returns a temporary object URL suitable for <img src> or window.open().
 */
function useInvoiceBlobUrl(invoiceId: string | undefined) {
  const [blobUrl,  setBlobUrl]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [fetched,  setFetched]  = useState(false)

  const load = useCallback(async () => {
    if (!invoiceId || fetched) return
    setLoading(true)
    try {
      const res = await apiClient.get<Blob>(`/vendor-invoices/${invoiceId}/file`, {
        responseType: 'blob',
      })
      setBlobUrl(URL.createObjectURL(res.data))
      setFetched(true)
    } finally {
      setLoading(false)
    }
  }, [invoiceId, fetched])

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [blobUrl])

  return { blobUrl, loading, load }
}

function ReferencePhotoSection({ purchaseId }: { purchaseId: string }) {
  const { data: invoice, isLoading } = useInvoiceByPurchaseId(purchaseId)
  const [expanded, setExpanded] = useState(false)
  const { blobUrl, loading: blobLoading, load } = useInvoiceBlobUrl(invoice?.id)

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Checking for reference photo…
    </div>
  )

  if (!invoice) return null

  const isImage = invoice.mime_type?.startsWith('image/')
  const isPdf   = invoice.mime_type === 'application/pdf'

  const handlePreview = async () => {
    await load()
    setExpanded(true)
  }

  const handleOpenInTab = async () => {
    await load()
    if (blobUrl) window.open(blobUrl, '_blank')
  }

  return (
    <div className="rounded-lg border overflow-hidden mb-5">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/40 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          Reference Photo
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
            onClick={handleOpenInTab} disabled={blobLoading}>
            {blobLoading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <ExternalLink className="h-3 w-3" />}
            {isPdf ? 'Open PDF' : 'Open full size'}
          </Button>
          {isImage && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs"
              onClick={expanded ? () => setExpanded(false) : handlePreview}
              disabled={blobLoading}>
              <Eye className="h-3 w-3" />
              {expanded ? 'Hide' : 'Preview'}
            </Button>
          )}
        </div>
      </div>

      {/* Inline image preview */}
      {isImage && expanded && blobUrl && (
        <div className="p-2 bg-muted/10">
          <img
            src={blobUrl}
            alt={invoice.original_name}
            className="w-full rounded object-contain max-h-80"
          />
        </div>
      )}

      {/* File info */}
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {invoice.original_name} · {(invoice.file_size_bytes / 1024).toFixed(0)} KB
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  purchase: Purchase | null
  onClose:  () => void
}

export default function PurchaseDetailSheet({ purchase, onClose }: Props) {
  if (!purchase) return null

  const total = purchase.items.reduce((s, it) => s + it.purchase_price, 0)

  return (
    <Sheet open={!!purchase} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4 text-primary" />
            Purchase Details
          </SheetTitle>
        </SheetHeader>

        {/* ── Purchase meta ──────────────────────────────────────────────── */}
        <div className="rounded-lg border bg-muted/30 divide-y text-sm mb-5">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{purchase.vendor_name}</span>
            <StatusBadge status={purchase.status} />
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>Purchased: {formatDate(purchase.purchased_at)}</span>
            {purchase.received_at && (
              <span className="ml-auto text-xs">Received: {formatDate(purchase.received_at)}</span>
            )}
          </div>

          {purchase.notes && (
            <div className="flex items-start gap-2 px-3 py-2.5 text-muted-foreground">
              <StickyNote className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="text-xs">{purchase.notes}</span>
            </div>
          )}
        </div>

        {/* ── Reference photo (if uploaded during wizard) ───────────────── */}
        <ReferencePhotoSection purchaseId={purchase.id} />

        {/* ── Device list header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">
            {purchase.items.length} Device{purchase.items.length !== 1 ? 's' : ''}
          </h3>
          <span className="text-sm font-bold text-foreground">
            Total: {formatCurrency(total)}
          </span>
        </div>

        {/* ── Device cards ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          {purchase.items.map((item, i) => (
            <div key={i} className="rounded-lg border bg-card overflow-hidden">
              {/* Device number header */}
              <div className="flex items-center justify-between bg-muted/40 border-b px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    #{i + 1}
                  </span>
                  <span className="text-sm font-medium">
                    {item.brand_name} {item.product_name}
                  </span>
                </div>
                <ConditionPill condition={item.condition} />
              </div>

              {/* Device fields */}
              <div className="px-3 py-2.5 space-y-2 text-sm">
                {/* IMEI */}
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground w-20 shrink-0">IMEI 1</span>
                  <span className="font-mono text-xs tracking-wider">{item.imei1}</span>
                </div>

                {item.imei2 && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground w-20 shrink-0">IMEI 2</span>
                    <span className="font-mono text-xs tracking-wider">{item.imei2}</span>
                  </div>
                )}

                {/* Color + Storage on one row */}
                {(item.color || item.storage) && (
                  <div className="flex items-center gap-4">
                    {item.color && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground w-20 shrink-0">Color</span>
                        <span className="text-xs">{item.color}</span>
                      </div>
                    )}
                    {item.storage && (
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground w-16 shrink-0">Storage</span>
                        <span className="text-xs">{item.storage}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Prices */}
                <div className="flex items-center justify-between border-t border-border/50 pt-2 mt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <IndianRupee className="h-3 w-3" />
                    Purchase price
                  </div>
                  <span className="font-semibold text-sm">
                    {formatCurrency(item.purchase_price)}
                  </span>
                </div>

                {item.selling_price != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Selling price</span>
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {formatCurrency(item.selling_price)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer total ───────────────────────────────────────────────── */}
        <div className="mt-4 flex justify-between rounded-lg border bg-muted/30 px-4 py-3 font-semibold">
          <span>{purchase.items.length} device{purchase.items.length !== 1 ? 's' : ''} · {formatCurrency(purchase.total_cost)}</span>
          {purchase.status === 'received' && (
            <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400 self-center">
              Stock added to inventory
            </span>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
