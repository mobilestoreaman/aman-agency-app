import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Search, ArrowUpRight, ArrowDownLeft,
  CheckCircle2, AlertTriangle, Clock, RotateCcw, Banknote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable, type Column } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import BorrowLendFormModal from '@/components/borrowLends/BorrowLendFormModal'
import ReturnSettleModal from '@/components/borrowLends/ReturnSettleModal'
import {
  useBorrowLends, useMarkOverdue, useDeleteBorrowLend,
  BORROW_LEND_TYPE_LABELS, BORROW_LEND_STATUS_LABELS,
} from '@/hooks/useBorrowLends'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import type { BorrowLend, BorrowLendType, BorrowLendStatus } from '@/types'

// ── Visual maps ──────────────────────────────────────────────────────────────
const STATUS_VARIANT: Record<BorrowLendStatus, 'warning' | 'success' | 'destructive'> = {
  active:   'warning',
  returned: 'success',
  overdue:  'destructive',
}

const STATUS_ICON: Record<BorrowLendStatus, React.ElementType> = {
  active:   Clock,
  returned: CheckCircle2,
  overdue:  AlertTriangle,
}


export default function BorrowLendsPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [typeFilter, setType]     = useState<BorrowLendType | ''>('')
  const [statusFilter, setStatus] = useState<BorrowLendStatus | ''>('')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')

  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<BorrowLend | null>(null)
  const [resolving, setResolving] = useState<BorrowLend | null>(null)
  const [deleting, setDeleting]   = useState<BorrowLend | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useBorrowLends({
    page,
    limit:     15,
    search:    q                                  || undefined,
    type:      (typeFilter as BorrowLendType)      || undefined,
    status:    (statusFilter as BorrowLendStatus)  || undefined,
    from_date: toApiDate(fromDate),
    to_date:   toApiDate(toDate),
  })

  const markOverdue = useMarkOverdue()
  const deleteEntry = useDeleteBorrowLend()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (e: BorrowLend) => { setEditing(e); setFormOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteEntry.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const clearFilters = () => { setSearch(''); setType(''); setStatus(''); setFromDate(''); setToDate(''); setPage(1) }
  const hasFilters   = !!search || !!typeFilter || !!statusFilter || !!fromDate || !!toDate

  // Page summary
  const entries      = data?.data ?? []
  const activeLent   = entries.filter((e) => e.type === 'lend'   && e.status === 'active').length
  const activeBorrow = entries.filter((e) => e.type === 'borrow' && e.status === 'active').length
  const overdue      = entries.filter((e) => e.status === 'overdue').length

  const columns: Column<BorrowLend>[] = [
    {
      key:    'type_device',
      header: 'Device',
      cell:   (e) => (
        <div className="flex items-start gap-2">
          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            e.type === 'lend'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}>
            {e.type === 'lend'
              ? <ArrowUpRight className="h-3.5 w-3.5" />
              : <ArrowDownLeft className="h-3.5 w-3.5" />
            }
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate max-w-[180px]">{e.device_desc}</p>
          </div>
        </div>
      ),
      sortValue: (e) => e.device_desc,
    },
    {
      key:    'party',
      header: 'Party',
      cell:   (e) => (
        <div className="text-sm">
          <p className="font-medium">{e.party_name}</p>
          {e.party_phone && (
            <a href={`tel:${e.party_phone}`} className="text-xs text-muted-foreground hover:underline">
              {e.party_phone}
            </a>
          )}
          {e.customer_name && (
            <p className="text-xs text-muted-foreground">↳ {e.customer_name}</p>
          )}
        </div>
      ),
      sortValue: (e) => e.party_name,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (e) => {
        const Icon = STATUS_ICON[e.status]
        return (
          <div className="space-y-1">
            <Badge variant={STATUS_VARIANT[e.status]} className="gap-1 text-xs">
              <Icon className="h-3 w-3" />
              {BORROW_LEND_STATUS_LABELS[e.status]}
            </Badge>
            {/* Resolution pill — only when closed */}
            {e.status === 'returned' && e.resolution_type && (
              <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                e.resolution_type === 'payment'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              }`}>
                {e.resolution_type === 'payment'
                  ? <><Banknote className="h-3 w-3" /> Paid {e.settlement_amount ? formatCurrency(e.settlement_amount) : ''}</>
                  : <><RotateCcw className="h-3 w-3" /> Device back</>
                }
              </div>
            )}
          </div>
        )
      },
      sortValue: (e) => e.status,
    },
    {
      key:    'dates',
      header: 'Dates',
      cell:   (e) => (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>{e.type === 'lend' ? 'Lent:' : 'Borrowed:'} {formatDate(e.borrow_date)}</p>
          {e.expected_return_date && (
            <p>Due: {formatDate(e.expected_return_date)}</p>
          )}
          {e.actual_return_date && (
            <p className="text-emerald-600">Closed: {formatDate(e.actual_return_date)}</p>
          )}
        </div>
      ),
      className: 'hidden md:table-cell',
      sortValue: (e) => e.borrow_date,
    },
    {
      key:    'actions',
      header: '',
      cell:   (e) => (
        <div className="flex items-center justify-end gap-1">
          {/* Resolve button — device returned OR paid */}
          {e.status !== 'returned' && isAdmin && (
            <Button
              variant="ghost" size="sm"
              className="h-8 gap-1 px-2 text-xs text-emerald-600 hover:text-emerald-700"
              onClick={() => setResolving(e)}
            >
              <RotateCcw className="h-3 w-3" /> Resolve
            </Button>
          )}
          {/* Mark overdue for active */}
          {e.status === 'active' && isAdmin && (
            <Button
              variant="ghost" size="sm"
              className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => markOverdue.mutate(e.id)}
              disabled={markOverdue.isPending}
            >
              <AlertTriangle className="h-3 w-3" /> Overdue
            </Button>
          )}
          {isAdmin && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => openEdit(e)} aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(e)} aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
      className: 'w-44 whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Borrow / Lend"
        description="Track devices lent to parties or borrowed from others — resolved by return or payment."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
          )
        }
      />

      {/* Summary chips */}
      {!isLoading && entries.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-full border bg-blue-50 px-3 py-1.5 text-sm dark:bg-blue-950/20">
            <ArrowUpRight className="h-4 w-4 text-blue-600" />
            <span className="text-muted-foreground">Active lent:</span>
            <span className="font-semibold text-blue-700 dark:text-blue-400">{activeLent}</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-amber-50 px-3 py-1.5 text-sm dark:bg-amber-950/20">
            <ArrowDownLeft className="h-4 w-4 text-amber-600" />
            <span className="text-muted-foreground">Active borrowed:</span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">{activeBorrow}</span>
          </div>
          {overdue > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-semibold text-destructive">{overdue} overdue</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search party, IMEI, product…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => { setType((v === 'all' ? '' : v) as BorrowLendType | ''); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="lend">Lent out</SelectItem>
            <SelectItem value="borrow">Borrowed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatus((v === 'all' ? '' : v) as BorrowLendStatus | ''); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="returned">Closed</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date" value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="From borrow date"
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input
            type="date" value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="To borrow date"
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
        data={entries}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No entries yet. Record when a device is lent out or borrowed."
      />

      <BorrowLendFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        entry={editing}
      />

      {/* Resolution modal — return device OR pay money */}
      <ReturnSettleModal
        open={!!resolving}
        onClose={() => setResolving(null)}
        entry={resolving}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteEntry.isPending}
        title="Delete this entry?"
        description={`${deleting?.device_desc} — ${deleting?.type === 'lend' ? 'lent to' : 'borrowed from'} ${deleting?.party_name}.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
