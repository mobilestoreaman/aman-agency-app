import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, TrendingUp, TrendingDown, ArrowUpRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DataTable, type Column } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
import CreditEntryModal from '@/components/creditLedger/CreditEntryModal'
import { useCreditLedger } from '@/hooks/useCreditLedger'
import { useCustomers } from '@/hooks/useCustomers'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import type { CreditLedgerEntry, LedgerEntryType } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────


/** amount > 0 means the customer owes more (debit); < 0 means balance reduced (credit). */
const isDebit = (e: CreditLedgerEntry) => e.amount > 0

/** Human-readable label for each backend entry type. */
const TYPE_LABELS: Record<LedgerEntryType, string> = {
  sale:         'Sale credit',
  payment:      'Payment',
  adjustment:   'Adjustment',
  cancellation: 'Cancellation',
}

/** Badge colour: debit entries are destructive, credit/payment entries are success. */
function EntryTypeBadge({ entry }: { entry: CreditLedgerEntry }) {
  const debit = isDebit(entry)
  return (
    <div className="flex items-center gap-1.5">
      {debit
        ? <TrendingUp  className="h-3.5 w-3.5 text-destructive" />
        : <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
      }
      <Badge
        variant={debit ? 'destructive' : 'success'}
        className="text-xs"
      >
        {TYPE_LABELS[entry.type] ?? entry.type}
      </Badge>
    </div>
  )
}

/** Reference pill — links to sales page for sale/cancellation entries. */
function RefBadge({ entry }: { entry: CreditLedgerEntry }) {
  // Sale or cancellation entries: link directly to the sale detail modal via ?sale_id=
  if ((entry.type === 'sale' || entry.type === 'cancellation') && entry.sale_id) {
    return (
      <Link
        to={`/sales?sale_id=${entry.sale_id}`}
        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline"
        title={entry.reference ?? entry.sale_id}
      >
        {entry.reference ?? 'sale'}
        <ArrowUpRight className="h-2.5 w-2.5" />
      </Link>
    )
  }
  // Free-text reference present (e.g. adjustment with a ref).
  if (entry.reference) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
        {entry.reference}
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground italic">manual</span>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CreditLedgerPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]           = useState(1)
  const [customerId, setCustomer] = useState('')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const [search, setSearch]       = useState('')
  const [entryOpen, setEntryOpen] = useState(false)

  const q = useDebounce(search)

  const { data, isLoading } = useCreditLedger({
    page,
    limit:       20,
    customer_id: customerId  || undefined,
    from_date:   toApiDate(fromDate),
    to_date:     toApiDate(toDate),
    search:      q || undefined,
  })

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  const pageEntries = data?.data ?? []

  // Total debits on this page (amount > 0 → customer owes more)
  const totalDebit = pageEntries
    .filter((e) => e.amount > 0)
    .reduce((s, e) => s + e.amount, 0)

  // Total credits/payments (amount < 0 → balance reduced — display as positive)
  const totalCredit = pageEntries
    .filter((e) => e.amount < 0)
    .reduce((s, e) => s + Math.abs(e.amount), 0)

  const clearFilters = () => { setCustomer(''); setFromDate(''); setToDate(''); setSearch(''); setPage(1) }
  const hasFilters   = !!customerId || !!fromDate || !!toDate || !!search

  const columns: Column<CreditLedgerEntry>[] = [
    {
      key:    'date',
      header: 'Date',
      cell:   (e) => <span className="text-sm text-muted-foreground">{formatDate(e.created_at)}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (e) => e.created_at,
    },
    {
      key:    'customer',
      header: 'Customer',
      cell:   (e) => <span className="text-sm font-medium">{e.customer_name}</span>,
      sortValue: (e) => e.customer_name,
    },
    {
      key:    'type',
      header: 'Type',
      cell:   (e) => <EntryTypeBadge entry={e} />,
      sortValue: (e) => e.type,
    },
    {
      key:    'amount',
      header: 'Amount',
      cell:   (e) => {
        const debit = isDebit(e)
        return (
          <span className={`font-mono font-semibold whitespace-nowrap ${debit ? 'text-destructive' : 'text-emerald-600'}`}>
            {debit ? '+' : '−'}{formatCurrency(Math.abs(e.amount))}
          </span>
        )
      },
      sortValue: (e) => e.amount,
    },
    {
      key:    'balance_after',
      header: 'Balance after',
      cell:   (e) => {
        const owed = e.balance_after > 0
        return (
          <span className={`font-mono text-sm whitespace-nowrap ${owed ? 'text-destructive' : 'text-emerald-600'}`}>
            {owed ? '' : '−'}{formatCurrency(Math.abs(e.balance_after))}
            {!owed && e.balance_after < 0 && (
              <span className="ml-1 text-xs font-normal opacity-70">(credit)</span>
            )}
          </span>
        )
      },
      className: 'hidden md:table-cell',
      sortValue: (e) => e.balance_after,
    },
    {
      key:    'ref',
      header: 'Reference',
      cell:   (e) => <RefBadge entry={e} />,
      className: 'hidden lg:table-cell',
    },
    {
      key:    'notes',
      header: 'Notes',
      cell:   (e) => (
        <span className="max-w-[180px] truncate text-xs text-muted-foreground italic">
          {e.notes ?? '—'}
        </span>
      ),
      className: 'hidden xl:table-cell',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Credit Ledger"
        description="Track all credit given to customers and payments received against those balances."
        action={
          isAdmin && (
            <Button onClick={() => setEntryOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
          )
        }
      />

      {/* Page summary */}
      {!isLoading && pageEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border bg-destructive/5 px-4 py-3">
            <TrendingUp className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Credit given (page)</p>
              <p className="font-semibold text-destructive">{formatCurrency(totalDebit)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20">
            <TrendingDown className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">Payments received (page)</p>
              <p className="font-semibold text-emerald-600">{formatCurrency(totalCredit)}</p>
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 sm:col-span-1">
            <div>
              <p className="text-xs text-muted-foreground">Net outstanding (page)</p>
              {(() => {
                const net = totalDebit - totalCredit
                return (
                  <p className={`font-semibold ${net > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(Math.abs(net))}
                    <span className="ml-1 text-xs font-normal">
                      {net > 0 ? 'owed' : net < 0 ? 'surplus' : ''}
                    </span>
                  </p>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by customer or reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={customerId} onValueChange={(v) => { setCustomer(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.credit_balance > 0 && (
                  <span className="ml-2 text-xs text-destructive">({formatCurrency(c.credit_balance)})</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date" value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none" title="From date"
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input
            type="date" value={toDate}
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

      <DataTable
        columns={columns}
        data={pageEntries}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No credit entries found. Entries are created automatically when credit sales are made, or added manually."
      />

      <CreditEntryModal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        customerId={customerId || undefined}
      />
    </div>
  )
}
