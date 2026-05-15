import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TrendingUp, TrendingDown, ArrowUpRight, Search, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import { useVendorLedger } from '@/hooks/useVendorLedger'
import { useVendors } from '@/hooks/useVendors'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import { downloadExport } from '@/utils/export'
import { toast } from 'sonner'
import type { VendorLedgerEntry, VendorLedgerEntryType } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** amount > 0 means business owes vendor more (debit); < 0 means balance reduced (credit). */
const isDebit = (e: VendorLedgerEntry) => e.amount > 0

/** Human-readable label for each backend entry type. */
const TYPE_LABELS: Record<VendorLedgerEntryType, string> = {
  purchase:        'Purchase',
  payment:         'Payment',
  adjustment:      'Adjustment',
  reversal:        'Reversal',
  opening_balance: 'Opening Balance',
}

const TYPE_OPTIONS: { value: VendorLedgerEntryType | 'all'; label: string }[] = [
  { value: 'all',             label: 'All types' },
  { value: 'purchase',        label: 'Purchases' },
  { value: 'payment',         label: 'Payments' },
  { value: 'adjustment',      label: 'Adjustments' },
  { value: 'reversal',        label: 'Reversals' },
  { value: 'opening_balance', label: 'Opening Balances' },
]

/** Badge colour: debit entries are destructive; credit/payment entries are success. */
function EntryTypeBadge({ entry }: { entry: VendorLedgerEntry }) {
  const debit = isDebit(entry)
  return (
    <div className="flex items-center gap-1.5">
      {debit
        ? <TrendingUp  className="h-3.5 w-3.5 text-destructive" />
        : <TrendingDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
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

export default function VendorLedgerPage() {
  const [searchParams] = useSearchParams()

  const [page, setPage]                     = useState(1)
  const [vendorId, setVendorId]             = useState(() => searchParams.get('vendor') ?? '')
  const [typeFilter, setTypeFilter]         = useState<VendorLedgerEntryType | 'all'>('all')
  const [fromDate, setFromDate]             = useState('')
  const [toDate, setToDate]                 = useState('')
  const [search, setSearch]                 = useState('')

  const q = useDebounce(search)

  const { data, isLoading } = useVendorLedger({
    page,
    limit:     20,
    vendor_id: vendorId   || undefined,
    type:      typeFilter !== 'all' ? typeFilter : undefined,
    from_date: toApiDate(fromDate),
    to_date:   toApiDate(toDate),
    search:    q || undefined,
  })

  const { data: vendorsData } = useVendors({ limit: 200 })
  const vendors = vendorsData?.data ?? []

  const pageEntries = data?.data ?? []

  // Actual outstanding balances from live vendor records
  const selectedVendor   = vendors.find((v) => v.id === vendorId) ?? null
  const totalOutstanding = vendors.reduce((s, v) => s + (v.payable_balance > 0 ? v.payable_balance : 0), 0)
  const vendorsWithDebt  = vendors.filter((v) => v.payable_balance > 0).length

  const clearFilters = () => {
    setVendorId(''); setTypeFilter('all'); setFromDate(''); setToDate(''); setSearch(''); setPage(1)
  }
  const hasFilters = !!vendorId || typeFilter !== 'all' || !!fromDate || !!toDate || !!search

  const handleExport = () => {
    const rows = pageEntries.map((e) => ({
      Date:            formatDate(e.created_at),
      Vendor:          e.vendor_name,
      Type:            TYPE_LABELS[e.type] ?? e.type,
      'Amount (₹)':    e.amount,
      'Balance after': e.balance_after,
      Reference:       e.reference ?? '',
      Notes:           e.notes ?? '',
      'Recorded by':   e.created_by,
    }))
    if (!downloadExport(
      'csv',
      vendorId && selectedVendor ? `ledger_${selectedVendor.name}` : 'vendor_ledger',
      ['Date', 'Vendor', 'Type', 'Amount (₹)', 'Balance after', 'Reference', 'Notes', 'Recorded by'],
      rows,
    )) {
      toast.info('No ledger entries to export.')
    }
  }

  // Balance-after column: meaningful only when a single vendor is selected
  const showBalanceAfter = !!vendorId

  const columns: Column<VendorLedgerEntry>[] = [
    {
      key:       'date',
      header:    'Date',
      cell:      (e) => <span className="text-sm text-muted-foreground">{formatDate(e.created_at)}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (e) => e.created_at,
      shrink: true,
    },
    {
      key:       'vendor',
      header:    'Vendor',
      cell:      (e) => <span className="text-sm font-medium">{e.vendor_name}</span>,
      sortValue: (e) => e.vendor_name,
    },
    {
      key:       'type',
      header:    'Type',
      cell:      (e) => <EntryTypeBadge entry={e} />,
      sortValue: (e) => e.type,
      shrink: true,
    },
    {
      key:       'amount',
      header:    'Amount',
      cell:      (e) => {
        const debit = isDebit(e)
        return (
          <span className={`font-mono font-semibold whitespace-nowrap ${debit ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {debit ? '+' : '−'}{formatCurrency(Math.abs(e.amount))}
          </span>
        )
      },
      sortValue: (e) => e.amount,
      shrink: true,
    },
    // Running balance — only visible when a single vendor is filtered
    {
      key:       'balance_after',
      header:    'Balance after',
      cell:      (e) => {
        const owed = e.balance_after > 0
        return (
          <span className={`font-mono text-sm whitespace-nowrap ${owed ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {owed ? '' : '−'}{formatCurrency(Math.abs(e.balance_after))}
            {!owed && e.balance_after < 0 && (
              <span className="ml-1 text-xs font-normal opacity-70">(overpaid)</span>
            )}
          </span>
        )
      },
      // Hide if multi-vendor view — the column is meaningless when rows jump between vendors
      className: showBalanceAfter ? 'hidden md:table-cell' : 'hidden',
      sortValue: (e) => e.balance_after,
      shrink: true,
    },
    {
      key:       'ref',
      header:    'Reference',
      cell:      (e) => <RefBadge entry={e} />,
      className: 'hidden lg:table-cell',
    },
    {
      key:    'notes_by',
      header: 'Notes',
      cell:   (e) => (
        <div className="max-w-[180px]">
          {e.notes && (
            <span className="block truncate text-xs text-muted-foreground italic">{e.notes}</span>
          )}
          <span className="block truncate text-[11px] text-muted-foreground/60">
            by {e.created_by}
          </span>
        </div>
      ),
      className: 'hidden xl:table-cell',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendor Ledger"
        description="Track all purchases on credit from vendors and payments made against those balances."
      />

      {/* Outstanding balance summary — sourced from live vendor balances */}
      {vendors.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {selectedVendor ? (
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              selectedVendor.payable_balance > 0
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
            }`}>
              <TrendingUp className={`h-5 w-5 shrink-0 ${selectedVendor.payable_balance > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`} />
              <div>
                <p className="text-xs text-muted-foreground">Outstanding — {selectedVendor.name}</p>
                <p className={`font-semibold ${selectedVendor.payable_balance > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {selectedVendor.payable_balance > 0 ? formatCurrency(selectedVendor.payable_balance) : 'Nil — fully settled'}
                </p>
              </div>
            </div>
          ) : (
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
              totalOutstanding > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/40'
            }`}>
              <TrendingUp className={`h-5 w-5 shrink-0 ${totalOutstanding > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-xs text-muted-foreground">Total outstanding (all vendors)</p>
                <p className={`font-semibold ${totalOutstanding > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
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

          {/* Payments in current view */}
          {pageEntries.length > 0 && (() => {
            const paid = pageEntries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
            return paid > 0 ? (
              <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20">
                <TrendingDown className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Payments on this page</p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(paid)}</p>
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

        {/* Vendor filter */}
        <Select value={vendorId || 'all'} onValueChange={(v) => { setVendorId(v === 'all' ? '' : v); setPage(1) }}>
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

        {/* Entry type filter */}
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as VendorLedgerEntryType | 'all'); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range with labels */}
        <div className="flex w-full items-end gap-2 sm:w-auto">
          <div className="flex flex-1 flex-col gap-1 sm:flex-none">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date" value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
              className="sm:w-[140px]"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1 sm:flex-none">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date" value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1) }}
              className="sm:w-[140px]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              Clear filters
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" onClick={handleExport} disabled={pageEntries.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
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
          middle:  ['amount', ...(showBalanceAfter ? ['balance_after'] : [])],
          bottom:  ['date', 'ref', 'notes_by'],
          actions: 'actions',
        }}
      />

    </div>
  )
}
