import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, isToday, isPast } from 'date-fns'
import {
  CalendarClock, CheckCircle2, XCircle, RefreshCw, Search,
  Phone, AlertTriangle, ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import {
  usePaymentPromises,
  useReschedulePromise,
  useMarkPromisePaid,
  useMarkPromiseBroken,
} from '@/hooks/usePaymentPromises'
import { useCustomers } from '@/hooks/useCustomers'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { toApiDate } from '@/utils/date'
import { formatCurrency } from '@/utils/currency'
import { cn } from '@/lib/utils'
import type { PaymentPromise, PromiseStatus } from '@/types'

// ── Status display helpers ────────────────────────────────────────────────────
const STATUS_LABELS: Record<PromiseStatus, string> = {
  pending:     'Pending',
  paid:        'Paid',
  rescheduled: 'Rescheduled',
  broken:      'Broken',
}

const STATUS_VARIANT: Record<PromiseStatus, 'warning' | 'success' | 'secondary' | 'destructive'> = {
  pending:     'warning',
  paid:        'success',
  rescheduled: 'secondary',
  broken:      'destructive',
}

function dateLabel(isoDate: string): { text: string; urgent: boolean } {
  try {
    const d = parseISO(isoDate)
    if (isToday(d)) return { text: 'Today', urgent: true }
    if (isPast(d))  return { text: format(d, 'd MMM yyyy') + ' (overdue)', urgent: true }
    return { text: format(d, 'd MMM yyyy'), urgent: false }
  } catch {
    return { text: isoDate, urgent: false }
  }
}

// ── Summary strip ─────────────────────────────────────────────────────────────
function SummaryStrip({ promises }: { promises: PaymentPromise[] }) {
  const pending  = promises.filter((p) => p.status === 'pending' && !p.is_overdue)
  const overdue  = promises.filter((p) => p.is_overdue || (p.status === 'pending' && isPast(parseISO(p.promised_date)) && !isToday(parseISO(p.promised_date))))
  const dueToday = promises.filter((p) => p.status === 'pending' && isToday(parseISO(p.promised_date)))
  const totalAmt = promises.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount_promised, 0)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: 'Pending',      value: pending.length,  color: 'text-amber-600' },
        { label: 'Due Today',    value: dueToday.length, color: 'text-orange-600' },
        { label: 'Overdue',      value: overdue.length,  color: 'text-destructive' },
        { label: 'Total Pending', value: formatCurrency(totalAmt), color: 'text-foreground' },
      ].map((s) => (
        <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className={cn('text-xl font-bold mt-0.5', s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Reschedule modal ──────────────────────────────────────────────────────────
function RescheduleModal({
  promise,
  onClose,
}: {
  promise: PaymentPromise | null
  onClose: () => void
}) {
  const [newDate,  setNewDate]  = useState('')
  const [newAmt,   setNewAmt]   = useState('')
  const [notes,    setNotes]    = useState('')
  const reschedule = useReschedulePromise()

  if (!promise) return null

  const handleSubmit = () => {
    if (!newDate) return
    if (newAmt && Number(newAmt) <= 0) return
    reschedule.mutate(
      { id: promise.id, new_date: newDate, amount_promised: newAmt ? Number(newAmt) : undefined, notes },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!promise} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Reschedule Promise</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <p className="font-medium">{promise.customer_name}</p>
            <p className="text-muted-foreground text-xs">{promise.customer_phone}</p>
            <p className="text-muted-foreground text-xs mt-1">
              Original promise: {formatCurrency(promise.amount_promised)} by {dateLabel(promise.promised_date).text}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">New Payment Date <span className="text-destructive">*</span></Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (₹) <span className="text-muted-foreground font-normal">— leave blank to keep {formatCurrency(promise.amount_promised)}</span></Label>
            <Input
              type="number"
              value={newAmt}
              onChange={(e) => setNewAmt(e.target.value)}
              min={0.01}
              step="0.01"
              placeholder={String(promise.amount_promised)}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Customer asked for more time due to…"
              className="resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={reschedule.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!newDate || reschedule.isPending}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Mark Paid modal ───────────────────────────────────────────────────────────
function MarkPaidModal({
  promise,
  onClose,
}: {
  promise: PaymentPromise | null
  onClose: () => void
}) {
  const [notes, setNotes] = useState('')
  const markPaid = useMarkPromisePaid()

  if (!promise) return null

  const handleSubmit = () => {
    markPaid.mutate(
      { id: promise.id, notes },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog open={!!promise} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Mark as Paid</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <p className="font-medium">{promise.customer_name}</p>
            <p className="text-muted-foreground text-xs">{promise.customer_phone}</p>
            <p className="text-muted-foreground text-xs mt-1">
              Promised: {formatCurrency(promise.amount_promised)}
              {promise.invoice_number ? ` · ${promise.invoice_number}` : ''}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Paid via UPI, reference #…"
              className="resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={markPaid.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={markPaid.isPending}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirm Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function PaymentPromisesPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]               = useState(1)
  const [statusFilter, setStatus]     = useState('pending')
  const [search, setSearch]           = useState('')
  const [customerId, setCustomerId]   = useState('')
  const [fromDate, setFromDate]       = useState('')
  const [toDate, setToDate]           = useState('')
  const [rescheduling, setRescheduling]   = useState<PaymentPromise | null>(null)
  const [markingPaid, setMarkingPaid]     = useState<PaymentPromise | null>(null)
  const [breakingPromise, setBreakingPromise] = useState<PaymentPromise | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = usePaymentPromises({
    status:      statusFilter || undefined,
    search:      q            || undefined,
    customer_id: customerId   || undefined,
    from_date:   toApiDate(fromDate),
    to_date:     toApiDate(toDate),
    page,
    limit: 20,
  })

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  const markBroken = useMarkPromiseBroken()

  const promises = data?.data ?? []

  const clearFilters = () => { setSearch(''); setCustomerId(''); setFromDate(''); setToDate(''); setStatus('pending'); setPage(1) }
  const hasFilters   = !!search || !!customerId || !!fromDate || !!toDate || statusFilter !== 'pending'

  const columns: Column<PaymentPromise>[] = [
    {
      key:    'customer',
      header: 'Customer',
      cell:   (p) => (
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{p.customer_name}</p>
          <a
            href={`tel:${p.customer_phone}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Phone className="h-3 w-3" />
            {p.customer_phone}
          </a>
        </div>
      ),
      sortValue: (p) => p.customer_name,
    },
    {
      key:    'amount',
      header: 'Amount',
      shrink: true,
      cell:   (p) => (
        <span className="font-mono text-sm font-semibold whitespace-nowrap">{formatCurrency(p.amount_promised)}</span>
      ),
      sortValue: (p) => p.amount_promised,
    },
    {
      key:    'date',
      header: 'Promised Date',
      shrink: true,
      cell:   (p) => {
        const { text, urgent } = dateLabel(p.promised_date)
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            {urgent && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            <span className={cn('text-sm', urgent ? 'text-destructive font-medium' : 'text-foreground')}>
              {text}
            </span>
          </div>
        )
      },
      sortValue: (p) => p.promised_date,
    },
    {
      key:      'invoice',
      header:   'Sale',
      shrink:   true,
      cell:     (p) => p.invoice_number && p.sale_id
        ? (
          <Link
            to={`/sales?sale_id=${p.sale_id}`}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline whitespace-nowrap"
            title="View sale"
          >
            {p.invoice_number}
            <ArrowUpRight className="h-2.5 w-2.5" />
          </Link>
        )
        : p.invoice_number
          ? <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{p.invoice_number}</code>
          : <span className="text-muted-foreground text-xs">—</span>,
      className: 'hidden md:table-cell',
    },
    {
      key:    'status',
      header: 'Status',
      shrink: true,
      cell:   (p) => (
        <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABELS[p.status]}</Badge>
      ),
      sortValue: (p) => p.status,
    },
    {
      key:    'actions',
      header: '',
      shrink: true,
      cell:   (p) => {
        if (p.status !== 'pending') return null
        return (
          <div className="flex items-center justify-end gap-1">
            {/* Mark paid */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-green-700 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-400 dark:hover:bg-green-900/20"
              onClick={() => setMarkingPaid(p)}
              title="Mark as paid"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Paid</span>
            </Button>
            {/* Reschedule */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setRescheduling(p)}
              title="Reschedule payment"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reschedule</span>
            </Button>
            {/* Mark broken — admin only */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                onClick={() => setBreakingPromise(p)}
                disabled={markBroken.isPending}
                title="Mark as broken promise"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Broken</span>
              </Button>
            )}
          </div>
        )
      },
      className: 'whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payment Promises"
        description="Track outstanding balances and promised payment dates."
      />

      {/* Summary strip (only meaningful when looking at pending) */}
      {statusFilter === 'pending' && !isLoading && promises.length > 0 && (
        <SummaryStrip promises={promises} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customer name, phone, invoice…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        {/* Customer filter */}
        <Select value={customerId} onValueChange={(v) => { setCustomerId(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rescheduled">Rescheduled</SelectItem>
            <SelectItem value="broken">Broken</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date" value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="From date"
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input
            type="date" value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="To date"
          />
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear filters
          </Button>
        )}
      </div>

      {/* Empty state for pending with no data */}
      {!isLoading && promises.length === 0 && statusFilter === 'pending' && !search && !customerId && !fromDate && !toDate && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <CalendarClock className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">No pending promises</p>
            <p className="text-sm text-muted-foreground/70">
              All payments are up to date. Promises are created automatically when a sale has an outstanding balance.
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {(promises.length > 0 || isLoading || hasFilters) && (
        <ResponsiveTable
          columns={columns}
          data={promises}
          isLoading={isLoading}
          meta={data?.meta}
          onPageChange={setPage}
          emptyMessage="No payment promises match the current filters."
          mobileCard={{
            top:     ['customer', 'status'],
            middle:  ['amount', 'date'],
            bottom:  ['invoice'],
            actions: 'actions',
          }}
        />
      )}

      {/* Modals */}
      <RescheduleModal promise={rescheduling} onClose={() => setRescheduling(null)} />
      <MarkPaidModal   promise={markingPaid}  onClose={() => setMarkingPaid(null)} />

      {/* Mark broken confirmation */}
      <ConfirmDialog
        open={!!breakingPromise}
        onClose={() => setBreakingPromise(null)}
        onConfirm={() => {
          if (!breakingPromise) return
          markBroken.mutate(breakingPromise.id, { onSuccess: () => setBreakingPromise(null) })
        }}
        isPending={markBroken.isPending}
        title="Mark promise as broken?"
        description={`${breakingPromise?.customer_name} promised ${breakingPromise ? formatCurrency(breakingPromise.amount_promised) : ''}. Marking as broken flags this customer for follow-up.`}
        confirmLabel="Mark broken"
      />
    </div>
  )
}
