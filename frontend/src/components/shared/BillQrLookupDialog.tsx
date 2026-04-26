/**
 * BillQrLookupDialog
 * ------------------
 * Dialog that resolves a scanned or manually-entered code into a Bill ID
 * (mode='bill') or Sale ID (mode='sale').
 *
 * Accepted inputs:
 *  • QR URL  — e.g. "http://domain/static/invoices/<billId>.html"
 *  • Bill #  — e.g. "BILL-01-01-2025-AB12CD" (any text searched via the list API)
 *  • Hex ID  — 24-char MongoDB ObjectID (tried as bill ID first)
 *
 * Usage (Bills page):
 *   <BillQrLookupDialog mode="bill" onFound={(billId) => setViewId(billId)} />
 *
 * Usage (Sales page):
 *   <BillQrLookupDialog mode="sale" onFound={(saleId) => setDetailId(saleId)} />
 */
import { useState, useCallback } from 'react'
import {
  QrCode, Camera, Keyboard, Loader2, CheckCircle2, AlertCircle, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BarcodeScanner } from '@/components/shared/BarcodeScanner'
import { billsApi } from '@/api/bills'
import { toast } from 'sonner'

// ── types ─────────────────────────────────────────────────────────────────────

export type QrLookupMode = 'bill' | 'sale'

interface BillQrLookupDialogProps {
  mode: QrLookupMode
  /** Called with the resolved bill ID (mode=bill) or sale ID (mode=sale) */
  onFound: (id: string) => void
  /** Optional custom trigger; if omitted a default button is rendered */
  trigger?: React.ReactNode
}

interface ResolvedResult {
  billId:     string
  saleId:     string
  billNumber: string
  customer:   string
}

// ── resolution logic ──────────────────────────────────────────────────────────

async function resolveCode(raw: string): Promise<ResolvedResult> {
  const code = raw.trim()
  if (!code) throw new Error('Please enter a bill number or scan a QR code.')

  // 1. Extract any 24-char hex ObjectID from a URL path or query string.
  //    Handles: /invoices/<id>.html, /invoices/<id>, ?id=<id>, etc.
  //    We scan ALL 24-char hex segments and try each one until one resolves.
  if (code.includes('/') || code.startsWith('http')) {
    const hexMatches = [...code.matchAll(/[^a-f0-9]([a-f0-9]{24})(?:[^a-f0-9]|$)/gi)]
    for (const m of hexMatches) {
      try {
        return await fetchBillById(m[1])
      } catch {
        // try next match
      }
    }
    // If no hex segment resolved, fall through to text search
  }

  // 2. Bare 24-char hex ObjectID — try as bill ID directly
  if (/^[a-f0-9]{24}$/i.test(code)) {
    try {
      return await fetchBillById(code)
    } catch {
      // fall through to text search
    }
  }

  // 3. Text search (bill number, customer name, etc.)
  const list = await billsApi.list({ search: code, limit: 5 })
  const bills = list.data.data ?? []
  if (bills.length === 0) throw new Error(`No bill found for "${code}"`)
  // If there are multiple matches, pick the closest match to the raw code
  const exact = bills.find(
    (b) => b.bill_number.toLowerCase() === code.toLowerCase(),
  )
  const bill = exact ?? bills[0]
  return {
    billId:     bill.id,
    saleId:     bill.sale_id,
    billNumber: bill.bill_number,
    customer:   bill.customer_name,
  }
}

async function fetchBillById(id: string): Promise<ResolvedResult> {
  const res  = await billsApi.getById(id)
  const bill = res.data.data
  return {
    billId:     bill.id,
    saleId:     bill.sale_id,
    billNumber: bill.bill_number,
    customer:   bill.customer_name,
  }
}

// ── main component ────────────────────────────────────────────────────────────

export function BillQrLookupDialog({ mode, onFound, trigger }: BillQrLookupDialogProps) {
  const [open,       setOpen]       = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [found,      setFound]      = useState<ResolvedResult | null>(null)

  const reset = () => {
    setInput('')
    setError(null)
    setFound(null)
    setLoading(false)
  }

  const handleOpen = () => { reset(); setOpen(true) }
  const handleClose = () => { setOpen(false); reset() }

  const handleCode = useCallback(async (code: string) => {
    setCameraOpen(false)
    setError(null)
    setFound(null)
    setLoading(true)
    try {
      const result = await resolveCode(code)
      setFound(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lookup failed — please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleConfirm = () => {
    if (!found) return
    const id = mode === 'sale' ? found.saleId : found.billId
    if (!id) {
      toast.error('Could not determine the record ID.')
      return
    }
    onFound(id)
    handleClose()
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) handleCode(input.trim())
  }

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────────── */}
      {trigger
        ? <span onClick={handleOpen}>{trigger}</span>
        : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpen}>
            <QrCode className="h-4 w-4" />
            Scan QR
          </Button>
        )
      }

      {/* ── Main lookup dialog ───────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              {mode === 'sale' ? 'Find Sale by QR' : 'Find Bill by QR'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* ── Camera scan button ─────────────────────────────────── */}
            <button
              type="button"
              onClick={() => { reset(); setCameraOpen(true) }}
              className="w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-colors p-6 cursor-pointer"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Camera className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Scan QR Code</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Point camera at the QR code on the invoice
                </p>
              </div>
            </button>

            {/* ── Divider ────────────────────────────────────────────── */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium">or enter manually</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* ── Manual input ───────────────────────────────────────── */}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Keyboard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setError(null); setFound(null) }}
                  placeholder="Bill # or ID…"
                  className="pl-9 font-mono text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <Button type="submit" disabled={!input.trim() || loading} size="default">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
              </Button>
            </form>

            {/* ── Loading ─────────────────────────────────────────────── */}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking up…
              </div>
            )}

            {/* ── Error ───────────────────────────────────────────────── */}
            {error && !loading && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
                <button type="button" onClick={() => setError(null)}>
                  <X className="h-3.5 w-3.5 opacity-50 hover:opacity-100" />
                </button>
              </div>
            )}

            {/* ── Found result ─────────────────────────────────────────── */}
            {found && !loading && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Bill found
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-muted-foreground">Bill #</span>
                  <span className="font-mono font-semibold">{found.billNumber}</span>
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{found.customer}</span>
                  {mode === 'sale' && (
                    <>
                      <span className="text-muted-foreground">Sale ID</span>
                      <span className="font-mono text-[10px] text-muted-foreground truncate">
                        {found.saleId}
                      </span>
                    </>
                  )}
                </div>
                <Button
                  className="w-full gap-1.5"
                  onClick={handleConfirm}
                >
                  Open {mode === 'sale' ? 'Sale' : 'Bill'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Camera scanner (nested, rendered in its own portal) ──────── */}
      <BarcodeScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetect={(code) => {
          setCameraOpen(false)
          handleCode(code)
        }}
        hint="Scan the QR code on the invoice"
      />
    </>
  )
}

export default BillQrLookupDialog
