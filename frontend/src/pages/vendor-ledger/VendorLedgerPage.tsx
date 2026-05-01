import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, TrendingUp, TrendingDown, ArrowUpRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import VendorLedgerEntryModal from '@/components/vendorLedger/VendorLedgerEntryModal'
import { useVendorLedger } from '@/hooks/useVendorLedger'
import { useVendors } from '@/hooks/useVendors'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import type { VendorLedgerEntry, VendorLedgerEntryType } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** amount > 0 means business owes vendor more (debit); < 0 means balance reduced (credit). */
const isDebit = (e: VendorLedgerEntry) => e.amount > 0

/** Human-readable label for each backend entry type. */
const TYPE_LABELS: Record<VendorLedgerEntryType, string> = {
  purchase:   'Purchase',
  payment:    'Payment',
  adjustment: 'Adjustment',
  reversal:   'Reversal',
}

/** Badge colour: debit entries are destructive; credit/payment entries are success. */
function EntryTypeBadge({ entry }: { entry: VendorLedgerEntry }) {
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

/** Reference pill — links to purchases list for purchase/reversal entries. */
function RefBadge({ entry }: { entry: VendorLedgerEntry }) {
  if ((entry.type === 'purchase' || entry.type === 'reversal') && entry.purchase_id) {
    return (
      <Link
        to="/purchases"
        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:underline"
        title={`Purchase ID: ${entry.purchase_id}`}
      >
        purchase
        <ArrowUpRight className="h-2.5 w-2.5" />
      </Link>
    )
  }
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

interface ActiveVendor {
  id:   string
  name: string
}

export default function VendorLedgerPage() {
  const isAdmin = useIsAdmin()
  const [searchParams] = useSearchParams()

  const [page, setPage]                     = useState(1)
  const [vendorId, setVendorId]             = useState(() => searchParams.get('vendor') ?? '')
  const [fromDate, setFromDate]             = useState('')
  const [toDate, setToDate]                 = useState('')
  const [search, setSearch]                 = useState('')
  const [activeVendor, setActiveVendor]     = useState<ActiveVendor | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useVendorLedger({
    page,
    limit:     20,
    vendor_id: vendorId   || undefined,
    from_date: toApiDate(fromDate),
    to_date:   toApiDate(toDate),
    search:    q || undefined,
  })

  const { data: vendorsData } = useVendors({ limit: 200 })
  const vendors = vendorsData?.data ?? []

  const pageEntries = data?.data ?? []

  // Actual outstanding balances from the vendor records (not page aggregates)
  const selectedVendor   = vendors.find((v) => v.id === vendorId) ?? null
  const totalOutstanding = vendors.reduce((s, v) => s + (v.payable_balance > 0 ? v.payable_balance : 0), 0)
  const vendorsWithDebt  = vendors.filter((v) => v.payable_balance > 0).length

  const clearFilters = () => { setVendorId(''); setFromDate(''); setToDate(''); setSearch(''); setPage(1) }
  const hasFilters   = !!vendorId || !!fromDate || !!toDate || !!search

  const columns: Column<VendorLedgerEntry>[] = [
    {
      key:    'date',
      header: 'Date',
      cell:   (e) => <span className="text-sm text-muted-foreground">{formatDate(e.created_at)}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (e) => e.created_at,
    },
    {
      key:    'vendor',
      header: 'Vendor',
      cell:   (e) => <span className="text-sm font-medium">{e.vendor_name}</span>,
      sortValue: (e) => e.vendor_name,
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
              <span className="ml-1 text-xs font-normal opacity-70">(overpaid)</span>
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
    // Pay button — admin only, one per row
    ...(isAdmin ? [{
      key:    'actions',
      header: '',
      cell:   (e: VendorLedgerEntry) => (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 whitespace-nowrap"
          onClick={() => setActiveVendor({ id: e.vendor_id, name: e.vendor_name })}
        >
          <Plus className="h-3 w-3" /> Pay
        </Button>
      ),
      className: 'w-20 whitespace-nowrap',
    }] as Column<VendorLedgerEntry>[] : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendor Ledger"
        description="Track all purchases on credit from vendors and payments made against those balances."
      />

      {/* Outstanding balance summary — sourced from live vendor balances, not page aggregates */}
      {vendors.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* If a specific vendor is selected → show their current balance */}
          {selectedVendor ? (
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              selectedVendor.payable_balance > 0
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-border bg-muted/40'
            }`}>
              <TrendingUp className={`h-5 w-5 shrink-0 ${selectedVendor.payable_balance > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-xs text-muted-foreground">
                  Outstanding — {selectedVendor.name}
                </p>
                <p className={`font-semibold ${selectedVendor.payable_balance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {selectedVendor.payable_balance > 0 ? formatCurrency(selectedVendor.payable_balance) : 'Nil'}
                </p>
              </div>
            </div>
          ) : (
            /* No vendor filter → show total across all vendors */
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              totalOutstanding > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/40'
            }`}>
              <TrendingUp className={`h-5 w-5 shrink-0 ${totalOutstanding > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-xs text-muted-foreground">Total outstanding (all vendors)</p>
                <p className={`font-semibold ${totalOutstanding > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {totalOutstanding > 0 ? formatCurrency(totalOutstanding) : 'Nil'}
                  {vendorsWithDebt > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      across {vendorsWithDebt} vendor{vendorsWithDebt !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Payments made — from page entries (useful context) */}
          {pageEntries.length > 0 && (() => {
            const paid = pageEntries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
            return paid > 0 ? (
              <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20">
                <TrendingDown className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Payments on this page</p>
                  <p className="font-semibold text-emerald-600">{formatCurrency(paid)}</p>
                </div>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by vendor or reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={vendorId} onValueChange={(v) => { setVendorId(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
                {v.payable_balance > 0 && (
                  <span className="ml-2 text-xs text-destructive">({formatCurrency(v.payable_balance)})</span>
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

      <ResponsiveTable
        columns={columns}
        data={pageEntries}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No vendor ledger entries found. Purchase entries are created automatically when purchases are received."
        mobileCard={{
          top:     ['vendor', 'type'],
          middle:  ['amount', 'balance_after'],
          bottom:  ['date', 'ref', 'notes'],
          actions: 'actions',
        }}
      />

      <VendorLedgerEntryModal
        open={!!activeVendor}
        onClose={() => setActiveVendor(null)}
        vendorId={activeVendor?.id ?? ''}
        vendorName={activeVendor?.name}
        payableBalance={
          vendors.find((v) => v.id === activeVendor?.id)?.payable_balance ?? 0
        }
      />
    </div>
  )
}
