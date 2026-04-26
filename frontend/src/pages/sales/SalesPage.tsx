import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, TrendingUp, Download } from 'lucide-react'
import { BillQrLookupDialog } from '@/components/shared/BillQrLookupDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DataTable, type Column } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
import SaleFormModal from '@/components/sales/SaleFormModal'
import SaleDetailModal from '@/components/sales/SaleDetailModal'
import { useSales, SALE_STATUS_LABELS } from '@/hooks/useSales'
import { useCustomers } from '@/hooks/useCustomers'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import { downloadExport, type ExportFormat } from '@/utils/export'
import { salesApi } from '@/api/sales'
import { toast } from 'sonner'
import type { Sale, SaleStatus } from '@/types'

const STATUS_VARIANT: Record<SaleStatus, 'success' | 'destructive'> = {
  completed: 'success',
  cancelled: 'destructive',
}


export default function SalesPage() {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()

  // Filters
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<SaleStatus | ''>('')
  const [customerId, setCustomer] = useState(searchParams.get('customer_id') ?? '')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')

  // Modals
  const [formOpen, setFormOpen]   = useState(false)
  const [detailId, setDetailId]   = useState<string | null>(null)
  const [isExporting, setExporting] = useState(false)

  // Pre-fill customer_id from URL (linked from CustomersPage)
  useEffect(() => {
    const cid = searchParams.get('customer_id')
    if (cid) setCustomer(cid)
  }, [searchParams])

  // Open the new-sale modal when navigated here with ?new=1
  // (e.g. from the Dashboard Quick Actions tile)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setFormOpen(true)
      setSearchParams((p) => { p.delete('new'); return p }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Open a specific sale detail modal when navigated here with ?sale_id=<id>
  // (e.g. clicking an invoice link from the Credit Ledger)
  useEffect(() => {
    const sid = searchParams.get('sale_id')
    if (sid) {
      setDetailId(sid)
      setSearchParams((p) => { p.delete('sale_id'); return p }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const q = useDebounce(search)

  const handleExport = async (format: ExportFormat) => {
    setExporting(true)
    try {
      const res = await salesApi.list({
        page: 1, limit: 10000,
        search:      q                                  || undefined,
        status:      (statusFilter as SaleStatus)        || undefined,
        customer_id: customerId                          || undefined,
        from_date:   toApiDate(fromDate),
        to_date:     toApiDate(toDate),
      })
      const sales = res.data.data ?? []

      const headers = [
        'Invoice #', 'Customer', 'Phone', 'Status',
        'Product', 'Brand', 'IMEI 1', 'IMEI 2', 'Color', 'Storage',
        'Sale Price', 'Total Amount', 'Amount Paid', 'Balance',
        'Payment Mode', 'Date', 'Staff', 'Notes',
      ]

      // One row per sale item — repeat invoice-level fields
      const rows = sales.flatMap((s) =>
        (s.items ?? []).map((item) => ({
          'Invoice #':    s.invoice_number,
          'Customer':     s.customer_name,
          'Phone':        s.customer_phone ?? '',
          'Status':       SALE_STATUS_LABELS[s.status],
          'Product':      item.product_name,
          'Brand':        item.brand_name ?? '',
          'IMEI 1':       item.imei1 ?? item.imei ?? '',
          'IMEI 2':       item.imei2 ?? '',
          'Color':        item.color ?? '',
          'Storage':      item.storage ?? '',
          'Sale Price':   item.sale_price ?? item.selling_price ?? 0,
          'Total Amount': s.total_amount,
          'Amount Paid':  s.amount_paid,
          'Balance':      s.balance,
          'Payment Mode': s.payment_mode ?? '',
          'Date':         formatDate(s.sold_at),
          'Staff':        s.staff_name ?? '',
          'Notes':        s.notes ?? '',
        }))
      )

      downloadExport(format, 'Sales', headers, rows)
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const { data, isLoading } = useSales({
    page,
    limit:   15,
    search:      q               || undefined,
    status:      (statusFilter as SaleStatus) || undefined,
    customer_id: customerId      || undefined,
    from_date:   toApiDate(fromDate),
    to_date:     toApiDate(toDate),
  })

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  const clearFilters = () => {
    setSearch(''); setStatus(''); setCustomer(''); setFromDate(''); setToDate(''); setPage(1)
  }
  const hasFilters = !!search || !!statusFilter || !!customerId || !!fromDate || !!toDate

  // Page revenue
  const pageRevenue = (data?.data ?? [])
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + (s.total_amount ?? s.total), 0)

  const columns: Column<Sale>[] = [
    {
      key:    'invoice',
      header: 'Invoice',
      cell:   (s) => (
        <div>
          <button
            type="button"
            className="font-mono text-sm font-medium underline-offset-4 hover:underline"
            onClick={() => setDetailId(s.id)}
          >
            #{s.invoice_number}
          </button>
          <p className="text-xs text-muted-foreground">{s.items?.length ?? 0} item{(s.items?.length ?? 0) !== 1 ? 's' : ''}</p>
        </div>
      ),
      sortValue: (s) => s.invoice_number,
    },
    {
      key:    'customer',
      header: 'Customer',
      cell:   (s) => <span className="text-sm">{s.customer_name}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (s) => s.customer_name,
    },
    {
      key:    'total',
      header: 'Amount',
      cell:   (s) => (
        <div className="text-sm">
          <span className="font-semibold">{formatCurrency(s.total_amount)}</span>
          {s.balance > 0 && (
            <span className="ml-1.5 text-xs text-amber-600">bal: {formatCurrency(s.balance)}</span>
          )}
        </div>
      ),
      sortValue: (s) => s.total_amount,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (s) => (
        <Badge variant={STATUS_VARIANT[s.status]} className="text-xs">
          {SALE_STATUS_LABELS[s.status]}
        </Badge>
      ),
      sortValue: (s) => s.status,
    },
    {
      key:    'date',
      header: 'Date',
      cell:   (s) => <span className="text-sm text-muted-foreground">{formatDate(s.sold_at)}</span>,
      className: 'hidden md:table-cell',
      sortValue: (s) => s.sold_at,
    },
    {
      key:    'actions',
      header: '',
      cell:   (s) => (
        <Button
          variant="ghost" size="sm" className="h-7 px-2 text-xs"
          onClick={() => setDetailId(s.id)}
        >
          View
        </Button>
      ),
      className: 'w-16',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sales"
        description="All completed and cancelled sale records."
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={isExporting}>
                  <Download className="h-4 w-4" />
                  {isExporting ? 'Exporting…' : 'Export'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isAdmin && (
              <Button onClick={() => setFormOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> New Sale
              </Button>
            )}
          </div>
        }
      />

      {/* Revenue callout */}
      {!isLoading && pageRevenue > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 text-sm shadow-card">
          <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-muted-foreground">Revenue on this page:</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(pageRevenue)}</span>
          {data?.meta && (
            <span className="ml-auto text-xs text-muted-foreground">
              {data.meta.total} total record{data.meta.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoice, customer…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        {/* QR lookup — scans invoice QR and opens the linked sale */}
        <BillQrLookupDialog
          mode="sale"
          onFound={(saleId) => setDetailId(saleId)}
        />

        <Select value={customerId} onValueChange={(v) => { setCustomer(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatus((v === 'all' ? '' : v) as SaleStatus | ''); setPage(1) }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date" value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="w-[150px]" title="From date"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date" value={toDate}
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
        data={data?.data ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No sales found. Adjust filters or record a new sale."
      />

      <SaleFormModal   open={formOpen}       onClose={() => setFormOpen(false)} />
      <SaleDetailModal open={!!detailId}     onClose={() => setDetailId(null)} saleId={detailId} />
    </div>
  )
}
