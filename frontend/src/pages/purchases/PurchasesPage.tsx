import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, TrendingDown, PackageCheck, Download, ClipboardList } from 'lucide-react'
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
import PurchaseFormModal     from '@/components/purchases/PurchaseFormModal'
import InvoiceScanWizard    from '@/components/purchases/InvoiceScanWizard'
import PurchaseDetailSheet  from '@/components/purchases/PurchaseDetailSheet'
import { usePurchases, useDeletePurchase, useReceivePurchase } from '@/hooks/usePurchases'
import { useVendors } from '@/hooks/useVendors'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate, toApiDate } from '@/utils/date'
import { downloadExport, type ExportFormat } from '@/utils/export'
import { purchasesApi } from '@/api/purchases'
import { toast } from 'sonner'
import type { Purchase } from '@/types'

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'received':
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50">Received</Badge>
    case 'pending':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/50">Pending</Badge>
    case 'cancelled':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900/50">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function PurchasesPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]                 = useState(1)
  const [search, setSearch]             = useState('')
  const [vendorId, setVendorId]         = useState('')
  const [fromDate, setFromDate]         = useState('')
  const [toDate, setToDate]             = useState('')
  const [formOpen, setFormOpen]         = useState(false)
  const [scanOpen, setScanOpen]         = useState(false)
  const [editing, setEditing]           = useState<Purchase | null>(null)
  const [deleting, setDeleting]         = useState<Purchase | null>(null)
  const [receiving, setReceiving]       = useState<Purchase | null>(null)
  const [viewing, setViewing]           = useState<Purchase | null>(null)
  const [isExporting, setExporting]     = useState(false)

  const q = useDebounce(search)

  const { data, isLoading } = usePurchases({
    page,
    limit:  15,
    search:      q          || undefined,
    vendor_id:  vendorId   || undefined,
    from_date:  toApiDate(fromDate),
    to_date:    toApiDate(toDate),
  })

  const { data: vendorsData } = useVendors({ limit: 200 })
  const vendors = vendorsData?.data ?? []

  const deletePurchase  = useDeletePurchase()
  const receivePurchase = useReceivePurchase()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (p: Purchase) => { setEditing(p); setFormOpen(true) }

  const clearFilters = () => { setSearch(''); setVendorId(''); setFromDate(''); setToDate(''); setPage(1) }
  const hasFilters   = !!search || !!vendorId || !!fromDate || !!toDate

  const handleExport = async (format: ExportFormat) => {
    setExporting(true)
    try {
      const res = await purchasesApi.list({
        page: 1, limit: 10000,
        search:    q             || undefined,
        vendor_id: vendorId      || undefined,
        from_date: toApiDate(fromDate),
        to_date:   toApiDate(toDate),
      })
      const purchases = res.data.data ?? []

      const headers = [
        'Vendor', 'Status',
        'Product', 'Brand', 'IMEI 1', 'IMEI 2', 'Condition', 'Color', 'Storage',
        'Purchase Price', 'Selling Price',
        'Total Cost', 'Purchase Date', 'Received Date', 'Notes',
      ]

      // One row per purchase item
      const rows = purchases.flatMap((p) =>
        p.items.map((item) => ({
          'Vendor':         p.vendor_name,
          'Status':         p.status.charAt(0).toUpperCase() + p.status.slice(1),
          'Product':        item.product_name,
          'Brand':          item.brand_name ?? '',
          'IMEI 1':         item.imei1,
          'IMEI 2':         item.imei2 ?? '',
          'Condition':      item.condition,
          'Color':          item.color ?? '',
          'Storage':        item.storage ?? '',
          'Purchase Price': item.purchase_price,
          'Selling Price':  item.selling_price ?? '',
          'Total Cost':     p.total_cost,
          'Purchase Date':  formatDate(p.purchased_at),
          'Received Date':  p.received_at ? formatDate(p.received_at) : '',
          'Notes':          p.notes ?? '',
        }))
      )

      if (!downloadExport(format, 'Purchases', headers, rows)) {
        toast.info('No purchases match the current filters — nothing to export.')
      }
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = () => {
    if (!deleting) return
    deletePurchase.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const handleReceive = () => {
    if (!receiving) return
    receivePurchase.mutate({ id: receiving.id }, { onSuccess: () => setReceiving(null) })
  }

  // Summary totals from current page
  const pageTotal = (data?.data ?? []).reduce((s, p) => s + p.total_cost, 0)

  const columns: Column<Purchase>[] = [
    {
      key:    'items',
      header: 'Items',
      cell:   (p) => {
        const first = p.items[0]
        return (
          <div className="cursor-pointer group">
            <p className="font-medium group-hover:text-primary transition-colors">
              {first ? `${first.brand_name} ${first.product_name}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground group-hover:text-primary/70 transition-colors">
              {p.items.length === 1
                ? `IMEI: ${first?.imei1}`
                : `${p.items.length} devices — click to view all`}
            </p>
          </div>
        )
      },
    },
    {
      key:    'vendor',
      header: 'Vendor',
      cell:   (p) => <span className="text-sm">{p.vendor_name}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (p) => p.vendor_name,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (p) => <StatusBadge status={p.status} />,
      sortValue: (p) => p.status,
      shrink: true,
    },
    {
      key:    'total',
      header: 'Total cost',
      cell:   (p) => (
        <span className="font-semibold whitespace-nowrap">{formatCurrency(p.total_cost)}</span>
      ),
      sortValue: (p) => p.total_cost,
    },
    {
      key:    'date',
      header: 'Date',
      cell:   (p) => <span className="text-sm text-muted-foreground">{formatDate(p.purchased_at)}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (p) => p.purchased_at,
    },
    {
      key:    'actions',
      header: '',
      cell:   (p) =>
        isAdmin ? (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* "Receive Stock" is only shown for pending purchases */}
            {p.status === 'pending' && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/20"
                onClick={() => setReceiving(p)}
                title="Mark as received and add devices to inventory"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Receive</span>
              </Button>
            )}
            {/* Edit — only pending purchases can be edited */}
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => openEdit(p)}
              aria-label="Edit purchase"
              disabled={p.status !== 'pending'}
              title={p.status !== 'pending' ? 'Only pending purchases can be edited' : 'Edit purchase'}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleting(p)}
              aria-label="Delete purchase"
              disabled={p.status === 'received'}
              title={p.status === 'received' ? 'Received purchases cannot be deleted' : 'Delete purchase'}
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
        title="Purchases"
        description="Track all procurement — devices and accessories bought from vendors."
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
              <>
                <Button variant="outline" onClick={() => setScanOpen(true)} className="gap-1.5">
                  <ClipboardList className="h-4 w-4" /> New Purchase
                </Button>
                <Button onClick={openCreate} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Record Purchase
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Page total callout */}
      {!isLoading && (data?.data?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-rose-50/50 dark:bg-rose-950/20 px-4 py-3 text-sm shadow-card">
          <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" />
          <span className="text-muted-foreground">Total on this page:</span>
          <span className="font-bold text-rose-600 dark:text-rose-400">{formatCurrency(pageTotal)}</span>
          {data?.meta && (
            <span className="ml-auto text-xs text-muted-foreground">
              Showing {data.data.length} of {data.meta.total} records
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search product, vendor…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={vendorId} onValueChange={(v) => { setVendorId(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none"
            title="From date"
          />
          <span className="shrink-0 text-muted-foreground">–</span>
          <Input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="flex-1 sm:w-[140px] sm:flex-none"
            title="To date"
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
        data={data?.data ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No purchases found. Adjust filters or record the first purchase."
        onRowClick={(p) => setViewing(p)}
        mobileCard={{
          top:     ['items', 'status'],
          middle:  ['total'],
          bottom:  ['vendor', 'date'],
          actions: 'actions',
        }}
      />

      <PurchaseFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        onClose={() => { setEditing(null); setFormOpen(false) }}
        purchase={editing}
      />

      {/* Receive confirmation */}
      <ConfirmDialog
        open={!!receiving}
        onClose={() => setReceiving(null)}
        onConfirm={handleReceive}
        isPending={receivePurchase.isPending}
        title="Receive this stock?"
        description={
          receiving
            ? `This will add ${receiving.items.length} device(s) from ${receiving.vendor_name} to your inventory as available stock. This cannot be undone.`
            : ''
        }
        confirmLabel="Receive stock"
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deletePurchase.isPending}
        title="Delete this purchase record?"
        description={
          deleting
            ? `${deleting.items.length} device(s) from ${deleting.vendor_name}. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete purchase"
      />

      {/* Invoice scan wizard — opens from "New Purchase" button */}
      <InvoiceScanWizard
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onPurchaseCreated={() => setScanOpen(false)}
      />

      {/* Purchase detail sheet — opens on row click */}
      <PurchaseDetailSheet
        purchase={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}
