import { useState } from 'react'
import {
  Plus, Pencil, Trash2, Search, Banknote, CheckCircle, AlertTriangle, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import LoanReferenceFormModal from '@/components/loanReferences/LoanReferenceFormModal'
import {
  useLoanReferences, useChangeLoanStatus, useDeleteLoanReference,
  LOAN_PROVIDERS, PROVIDER_LABELS, LOAN_STATUSES, LOAN_STATUS_LABELS,
} from '@/hooks/useLoanReferences'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'
import type { LoanReference, LoanStatus, LoanProvider } from '@/types'

const STATUS_VARIANT: Record<LoanStatus, 'success' | 'destructive' | 'warning'> = {
  active:  'warning',
  closed:  'success',
  overdue: 'destructive',
}

const STATUS_ICON: Record<LoanStatus, React.ElementType> = {
  active:  Clock,
  closed:  CheckCircle,
  overdue: AlertTriangle,
}

/** Provider colour pill */
const PROVIDER_COLOURS: Record<LoanProvider, string> = {
  bajaj:         'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  tata_capital:  'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  hdb_financial: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  home_credit:   'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
  hdfc:          'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  icici:         'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
  axis:          'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  idfc:          'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  tvs_credit:    'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  other:         'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export default function LoanReferencesPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<LoanStatus | ''>('')
  const [providerFilter, setProvider] = useState<LoanProvider | ''>('')

  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<LoanReference | null>(null)
  const [deleting, setDeleting]   = useState<LoanReference | null>(null)
  // { ref, targetStatus } when a status change is pending confirmation
  const [pendingStatus, setPendingStatus] = useState<{ ref: LoanReference; status: LoanStatus } | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useLoanReferences({
    page,
    limit: 15,
    search:    q                            || undefined,
    status:    (statusFilter as LoanStatus) || undefined,
    provider:  (providerFilter as LoanProvider) || undefined,
  })

  const changeStatus   = useChangeLoanStatus()
  const deleteLoanRef  = useDeleteLoanReference()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (r: LoanReference) => { setEditing(r); setFormOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteLoanRef.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const clearFilters = () => { setSearch(''); setStatus(''); setProvider(''); setPage(1) }
  const hasFilters   = !!search || !!statusFilter || !!providerFilter

  // Summary stats
  const entries      = data?.data ?? []
  const totalActive  = entries.filter((r) => r.status === 'active').reduce((s, r) => s + r.loan_amount, 0)
  const totalOverdue = entries.filter((r) => r.status === 'overdue').reduce((s, r) => s + r.loan_amount, 0)
  const countActive  = entries.filter((r) => r.status === 'active').length
  const countOverdue = entries.filter((r) => r.status === 'overdue').length

  const columns: Column<LoanReference>[] = [
    {
      key:    'customer',
      header: 'Customer',
      cell:   (r) => (
        <div>
          <p className="font-medium">{r.customer_name}</p>
          {r.invoice_number && (
            <p className="text-xs text-muted-foreground">Invoice #{r.invoice_number}</p>
          )}
        </div>
      ),
      sortValue: (r) => r.customer_name,
    },
    {
      key:    'provider',
      header: 'Provider',
      cell:   (r) => (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PROVIDER_COLOURS[r.provider]}`}>
          {PROVIDER_LABELS[r.provider]}
        </span>
      ),
      sortValue: (r) => r.provider,
    },
    {
      key:    'account',
      header: 'Account no.',
      cell:   (r) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.loan_account_number}</code>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key:    'loan_amount',
      header: 'Loan amt.',
      cell:   (r) => <span className="font-mono font-semibold">{formatCurrency(r.loan_amount)}</span>,
      sortValue: (r) => r.loan_amount,
    },
    {
      key:    'emi',
      header: 'EMI / Tenure',
      cell:   (r) => (
        <div className="text-sm text-muted-foreground">
          {r.emi_amount ? formatCurrency(r.emi_amount) : '—'}
          {r.tenure_months && <span className="ml-1 text-xs">× {r.tenure_months}m</span>}
        </div>
      ),
      className: 'hidden lg:table-cell',
      sortValue: (r) => r.emi_amount ?? 0,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (r) => {
        const Icon = STATUS_ICON[r.status]
        return (
          <Badge variant={STATUS_VARIANT[r.status]} className="gap-1 text-xs">
            <Icon className="h-3 w-3" />
            {LOAN_STATUS_LABELS[r.status]}
          </Badge>
        )
      },
      sortValue: (r) => r.status,
      shrink: true,
    },
    {
      key:    'disbursed',
      header: 'Disbursed',
      cell:   (r) => (
        <span className="text-sm text-muted-foreground">
          {r.disbursed_date ? formatDate(r.disbursed_date) : '—'}
        </span>
      ),
      className: 'hidden lg:table-cell',
      sortValue: (r) => r.disbursed_date ?? '',
    },
    {
      key:    'actions',
      header: '',
      cell:   (r) =>
        isAdmin ? (
          <div className="flex items-center justify-end gap-1">
            {/* Status change dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  Status ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {LOAN_STATUSES.filter((s) => s !== r.status).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setPendingStatus({ ref: r, status: s })}
                  >
                    Mark as {LOAN_STATUS_LABELS[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => openEdit(r)} aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleting(r)} aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null,
      className: 'whitespace-nowrap',
      shrink: true,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Loan References"
        description="Track consumer EMI loans processed through finance partners."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Loan Reference
            </Button>
          )
        }
      />

      {/* Summary cards */}
      {!isLoading && entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3 rounded-lg border bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-xs text-muted-foreground">Active (page)</p>
              <p className="font-semibold">{countActive} loans</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">{formatCurrency(totalActive)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-destructive/5 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Overdue (page)</p>
              <p className="font-semibold">{countOverdue} loans</p>
              <p className="text-xs text-destructive">{formatCurrency(totalOverdue)}</p>
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <Banknote className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total disbursed (page)</p>
              <p className="font-semibold">{formatCurrency(entries.reduce((s, r) => s + r.loan_amount, 0))}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search customer, account no…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatus((v === 'all' ? '' : v) as LoanStatus | ''); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LOAN_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{LOAN_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={providerFilter} onValueChange={(v) => { setProvider((v === 'all' ? '' : v) as LoanProvider | ''); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {LOAN_PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear filters
          </Button>
        )}
      </div>

      <ResponsiveTable
        columns={columns}
        data={entries}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No loan references found. Add one when a customer takes a device on EMI."
        mobileCard={{
          top:     ['customer', 'status'],
          middle:  ['loan_amount', 'emi'],
          bottom:  ['provider', 'disbursed'],
          actions: 'actions',
        }}
      />

      <LoanReferenceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        loanRef={editing}
      />
      {/* Status change confirmation */}
      <ConfirmDialog
        open={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => {
          if (!pendingStatus) return
          changeStatus.mutate(
            { id: pendingStatus.ref.id, status: pendingStatus.status },
            { onSuccess: () => setPendingStatus(null) },
          )
        }}
        isPending={changeStatus.isPending}
        title={`Mark as ${pendingStatus ? LOAN_STATUS_LABELS[pendingStatus.status] : ''}?`}
        description={`Loan account ${pendingStatus?.ref.loan_account_number} for ${pendingStatus?.ref.customer_name} will be updated to "${pendingStatus ? LOAN_STATUS_LABELS[pendingStatus.status] : ''}".`}
        confirmLabel={`Mark ${pendingStatus ? LOAN_STATUS_LABELS[pendingStatus.status] : ''}`}
        variant={pendingStatus?.status === 'overdue' ? 'destructive' : 'default'}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteLoanRef.isPending}
        title="Delete this loan reference?"
        description={`Loan account ${deleting?.loan_account_number} for ${deleting?.customer_name} will be permanently removed.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
