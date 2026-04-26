import { useState } from 'react'
import {
  CheckCircle2, XCircle, Clock, Eye,
  Send, Ban, Printer, MessageCircle, Loader2, Search,
} from 'lucide-react'
import { BillQrLookupDialog } from '@/components/shared/BillQrLookupDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable, type Column } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  useBills, useBill, useIssueBill, useVoidBill, useSendBillWhatsApp,
  useOpenBillInvoice, BILL_STATUS_LABELS,
} from '@/hooks/useBills'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import type { Bill, BillStatus } from '@/types'

// ── Visual maps ───────────────────────────────────────────────────────────────
const STATUS_VARIANT: Record<BillStatus, 'warning' | 'success' | 'destructive'> = {
  draft:   'warning',
  issued:  'success',
  voided:  'destructive',
}

const STATUS_ICON: Record<BillStatus, React.ElementType> = {
  draft:   Clock,
  issued:  CheckCircle2,
  voided:  XCircle,
}

// ── Bill detail drawer ────────────────────────────────────────────────────────
function BillDetailDrawer({ billId, open, onClose }: {
  billId: string | null; open: boolean; onClose: () => void
}) {
  const isAdmin = useIsAdmin()
  const { data: bill, isLoading } = useBill(billId ?? '')
  const issueBill    = useIssueBill()
  const voidBill     = useVoidBill()
  const sendWhatsApp = useSendBillWhatsApp()
  const openInvoice  = useOpenBillInvoice()

  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false)
  const [voidReason, setVoidReason]           = useState('')

  const handleVoid = () => {
    if (!billId) return
    voidBill.mutate(
      { id: billId, reason: voidReason || 'Voided by admin' },
      { onSuccess: () => { setVoidConfirmOpen(false); onClose() } },
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base">
                {isLoading ? <Skeleton className="h-5 w-32" /> : `Bill #${bill?.bill_number}`}
              </DialogTitle>
              {!isLoading && bill && (
                <Badge variant={STATUS_VARIANT[bill.status]} className="text-xs gap-1">
                  {BILL_STATUS_LABELS[bill.status]}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-3 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : bill ? (
              <div className="space-y-4 p-1">
                {/* Header info */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer</span>
                    <span className="font-medium">{bill.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{bill.customer_phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sale ID</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{bill.sale_id}</code>
                  </div>
                  {bill.issued_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Issued at</span>
                      <span>{formatDate(bill.issued_at)}</span>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Items */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Items ({bill.items?.length ?? 0})
                  </p>
                  <div className="divide-y rounded-md border">
                    {(bill.items ?? []).map((item, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.product_name}</p>
                          {item.imei1 && (
                            <p className="font-mono text-xs text-muted-foreground">{item.imei1}</p>
                          )}
                        </div>
                        <span className="shrink-0 font-mono font-semibold">{formatCurrency(item.unit_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCurrency(bill.subtotal)}</span>
                  </div>
                  {bill.discount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span>
                      <span className="font-mono">− {formatCurrency(bill.discount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span className="font-mono">{formatCurrency(bill.total_amount)}</span>
                  </div>
                  {bill.balance > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Balance due</span>
                      <span className="font-mono">{formatCurrency(bill.balance)}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {bill.notes && (
                  <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground">
                    {bill.notes}
                  </p>
                )}

                {/* Voided info */}
                {bill.status === 'voided' && bill.voided_at && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Voided at: {formatDate(bill.voided_at)}
                  </div>
                )}
              </div>
            ) : null}
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t pt-4 gap-2 flex-wrap">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>

            {/* Print / View Invoice */}
            {bill && billId && (
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => billId && openInvoice(billId)}
              >
                <Printer className="h-4 w-4" /> Print Invoice
              </Button>
            )}

            {/* Send via WhatsApp */}
            {bill && bill.customer_phone && (
              <Button
                variant="outline"
                className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                disabled={sendWhatsApp.isPending}
                onClick={() => sendWhatsApp.mutate(bill.id)}
              >
                {sendWhatsApp.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <MessageCircle className="h-4 w-4" />
                }
                WhatsApp
              </Button>
            )}

            {isAdmin && bill?.status === 'draft' && (
              <Button
                onClick={() => issueBill.mutate(bill.id, { onSuccess: onClose })}
                disabled={issueBill.isPending}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" /> Issue Bill
              </Button>
            )}
            {isAdmin && bill?.status === 'issued' && (
              <Button
                variant="destructive"
                onClick={() => setVoidConfirmOpen(true)}
                className="gap-1.5"
              >
                <Ban className="h-4 w-4" /> Void
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirmation with reason input */}
      <Dialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Void this bill?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This bill will be marked as void and cannot be reversed.
            </p>
            <Input
              placeholder="Reason (optional)"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voidBill.isPending}>
              Void bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillsPage() {
  const [page, setPage]           = useState(1)
  const [statusFilter, setStatus] = useState<BillStatus | ''>('')
  const [search, setSearch]       = useState('')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const [viewId, setViewId]       = useState<string | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useBills({
    page,
    limit:     15,
    status:    (statusFilter as BillStatus) || undefined,
    search:    q           || undefined,
    from_date: toApiDate(fromDate),
    to_date:   toApiDate(toDate),
  })

  const bills = data?.data ?? []
  const hasFilters = !!search || !!statusFilter || !!fromDate || !!toDate
  const clearFilters = () => { setSearch(''); setStatus(''); setFromDate(''); setToDate(''); setPage(1) }

  const columns: Column<Bill>[] = [
    {
      key:    'bill_number',
      header: 'Bill',
      cell:   (b) => (
        <div>
          <button
            type="button"
            className="font-mono text-sm font-medium underline-offset-4 hover:underline"
            onClick={() => setViewId(b.id)}
          >
            #{b.bill_number}
          </button>
          <p className="text-xs text-muted-foreground font-mono">
            Sale: {b.sale_id.slice(-8)}
          </p>
        </div>
      ),
      sortValue: (b) => b.bill_number,
    },
    {
      key:    'customer',
      header: 'Customer',
      cell:   (b) => (
        <div className="text-sm">
          <p className="font-medium">{b.customer_name}</p>
          <p className="text-xs text-muted-foreground">{b.customer_phone ?? '—'}</p>
        </div>
      ),
      className: 'hidden sm:table-cell',
      sortValue: (b) => b.customer_name,
    },
    {
      key:    'amount',
      header: 'Amount',
      cell:   (b) => (
        <span className="font-mono font-semibold text-sm">{formatCurrency(b.total_amount)}</span>
      ),
      sortValue: (b) => b.total_amount,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (b) => {
        const Icon = STATUS_ICON[b.status]
        return (
          <Badge variant={STATUS_VARIANT[b.status]} className="gap-1 text-xs">
            <Icon className="h-3 w-3" />
            {BILL_STATUS_LABELS[b.status]}
          </Badge>
        )
      },
      sortValue: (b) => b.status,
    },
    {
      key:    'date',
      header: 'Created',
      cell:   (b) => (
        <span className="text-xs text-muted-foreground">{formatDate(b.created_at)}</span>
      ),
      className: 'hidden md:table-cell',
      sortValue: (b) => b.created_at,
    },
    {
      key:    'actions',
      header: '',
      cell:   (b) => (
        <Button
          variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"
          onClick={() => setViewId(b.id)}
        >
          <Eye className="h-3 w-3" /> View
        </Button>
      ),
      className: 'w-20',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bills"
        description="View and manage customer bills — draft, issued, and voided."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by bill #, customer, phone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        {/* QR lookup */}
        <BillQrLookupDialog
          mode="bill"
          onFound={(billId) => setViewId(billId)}
        />

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatus((v === 'all' ? '' : v) as BillStatus | ''); setPage(1) }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input
            type="date" value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="w-[150px]" title="From date"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date" value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="w-[150px]" title="To date"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear filters
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={bills}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No bills found. Bills are generated from completed sales."
      />

      <BillDetailDrawer
        billId={viewId}
        open={!!viewId}
        onClose={() => setViewId(null)}
      />
    </div>
  )
}
