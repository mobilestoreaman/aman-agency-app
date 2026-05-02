import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, Search, RefreshCw, Cpu,
  Camera, X, LayoutGrid, List,
} from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StockSummaryCard from '@/components/devices/StockSummaryCard'
import DeviceFormModal from '@/components/devices/DeviceFormModal'
import StatusChangeModal from '@/components/devices/StatusChangeModal'
import {
  useDevices, useDeviceByIMEI, useDeleteDevice, DEVICE_STATUSES,
} from '@/hooks/useDevices'
import { useProducts } from '@/hooks/useProducts'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import type { Device, DeviceStatus } from '@/types'

// ── Status maps ───────────────────────────────────────────────────────────────
const STATUS_VARIANT: Record<DeviceStatus, 'success' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
  available: 'success',
  sold:      'secondary',
  repair:    'warning',
  defective: 'destructive',
  returned:  'outline',
}

const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Available',
  sold:      'Sold',
  repair:    'In Repair',
  defective: 'Defective',
  returned:  'Returned',
}

const STATUS_STRIPE: Record<DeviceStatus, string> = {
  available: 'bg-green-500',
  sold:      'bg-gray-400',
  repair:    'bg-yellow-500',
  defective: 'bg-red-500',
  returned:  'bg-blue-400',
}

// ── IMEI Camera Scanner ───────────────────────────────────────────────────────
function IMEIScanner({
  onDetected,
  onClose,
}: {
  onDetected: (imei: string) => void
  onClose: () => void
}) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef   = useRef<number>(0)
  const [error, setError]     = useState<string | null>(null)
  const [ready, setReady]     = useState(false)

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let active = true

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setReady(true)

        // BarcodeDetector is experimental/not in TS lib yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!('BarcodeDetector' in (window as any))) {
          setError('Barcode scanning is not supported on this browser. Please enter the IMEI manually.')
          return
        }

        // @ts-expect-error
        const detector = new BarcodeDetector({
          formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar'],
        })

        const scan = async () => {
          if (!videoRef.current || !active) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            for (const b of barcodes) {
              // Strip non-digits and check IMEI length (14–16 digits)
              const digits = (b.rawValue as string).replace(/\D/g, '')
              if (digits.length >= 14 && digits.length <= 16) {
                stopCamera()
                onDetected(digits)
                return
              }
            }
          } catch {
            // ignore frame-level errors
          }
          animRef.current = requestAnimationFrame(scan)
        }
        animRef.current = requestAnimationFrame(scan)
      } catch {
        setError('Camera access denied. Please allow camera permission and try again, or enter the IMEI manually.')
        setReady(true)
      }
    }

    start()
    return () => {
      active = false
      stopCamera()
    }
  }, [onDetected, stopCamera])

  return (
    <div className="relative rounded-xl border bg-black overflow-hidden">
      <video ref={videoRef} className="w-full h-52 object-cover" playsInline muted />

      {/* Scan-guide overlay */}
      {ready && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
          {/* Viewfinder box */}
          <div className="relative w-64 h-20">
            <div className="absolute inset-0 border border-white/30 rounded" />
            <div className="absolute top-0 left-0   h-4 w-4 border-t-2 border-l-2 border-primary rounded-tl" />
            <div className="absolute top-0 right-0  h-4 w-4 border-t-2 border-r-2 border-primary rounded-tr" />
            <div className="absolute bottom-0 left-0  h-4 w-4 border-b-2 border-l-2 border-primary rounded-bl" />
            <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-primary rounded-br" />
            {/* Animated scan line */}
            <div className="absolute inset-x-0 h-0.5 bg-primary/70 animate-scan-line" />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
          <p className="text-center text-sm text-white leading-snug">{error}</p>
        </div>
      )}

      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-9 w-9 bg-background/80 backdrop-blur-sm"
        onClick={() => { stopCamera(); onClose() }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      {/* Hint */}
      {ready && !error && (
        <div className="absolute bottom-2 inset-x-0 flex justify-center">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
            Point camera at the IMEI barcode
          </span>
        </div>
      )}

    </div>
  )
}

// ── Device card ───────────────────────────────────────────────────────────────
function DeviceCard({
  device,
  isAdmin,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  device: Device
  isAdmin: boolean
  onEdit: (d: Device) => void
  onDelete: (d: Device) => void
  onStatusChange: (d: Device) => void
}) {
  return (
    <div className="group flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md overflow-hidden">
      {/* Coloured status stripe at top */}
      <div className={`h-1.5 w-full ${STATUS_STRIPE[device.status]}`} />

      <div className="flex flex-col gap-2.5 p-3">
        {/* Status + Condition */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant={STATUS_VARIANT[device.status]} className="text-[10px] px-1.5 py-0">
            {STATUS_LABELS[device.status]}
          </Badge>
          {device.condition && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
              {device.condition}
            </Badge>
          )}
        </div>

        {/* Brand + Product */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground truncate">{device.brand_name}</p>
          <p className="text-sm font-medium leading-snug line-clamp-2">{device.product_name}</p>
        </div>

        {/* IMEI block */}
        <div className="rounded-md bg-muted/60 px-2 py-1.5 space-y-1">
          <div>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">IMEI 1</p>
            <p className="font-mono text-xs font-semibold tracking-wide">{device.imei1}</p>
          </div>
          {device.imei2 && (
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">IMEI 2</p>
              <p className="font-mono text-xs font-semibold tracking-wide">{device.imei2}</p>
            </div>
          )}
        </div>

        {/* Color / Storage */}
        {(device.color || device.storage) && (
          <div className="flex flex-wrap gap-1">
            {device.color && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{device.color}</Badge>
            )}
            {device.storage && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{device.storage}</Badge>
            )}
          </div>
        )}

        {/* Pricing */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Buy: {formatCurrency(device.purchase_price)}</span>
          <span className="font-semibold">{formatCurrency(device.selling_price)}</span>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-1 pt-1 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-[11px] px-1"
            onClick={() => onStatusChange(device)}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Status
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => onEdit(device)}
                aria-label="Edit device"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive hover:text-destructive"
                onClick={() => onDelete(device)}
                aria-label="Delete device"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DevicesPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState<DeviceStatus | ''>('available')
  const [productId, setProductId] = useState('')
  const [view, setView]           = useState<'grid' | 'table'>('grid')

  // IMEI quick-lookup
  const [imeiQuery, setImeiQuery]     = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const debouncedImei = useDebounce(imeiQuery, 500)

  // Modals
  const [formOpen, setFormOpen]         = useState(false)
  const [editing, setEditing]           = useState<Device | null>(null)
  const [statusDevice, setStatusDevice] = useState<Device | null>(null)
  const [deleting, setDeleting]         = useState<Device | null>(null)

  const q = useDebounce(search)

  const gridLimit  = 24
  const tableLimit = 15

  const { data, isLoading } = useDevices({
    page,
    limit:                view === 'grid' ? gridLimit : tableLimit,
    search:               q          || undefined,
    status:               statusFilter || undefined,
    product_id:           productId   || undefined,
    // when no status filter is active show available devices first
    sort_available_first: !statusFilter || undefined,
  })

  const { data: imeiDevice, isFetching: imeiLoading } = useDeviceByIMEI(debouncedImei)

  const { data: productsData } = useProducts({ limit: 200 })
  const products = productsData?.data ?? []

  const deleteDevice = useDeleteDevice()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (d: Device) => { setEditing(d); setFormOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteDevice.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  // "Clear" resets all overrides and returns to the default available-only view
  const clearFilters = () => { setSearch(''); setStatus('available'); setProductId(''); setPage(1) }
  // hasFilters is true when the user has deviated from the default (available only, no search/product)
  const hasFilters   = !!search || statusFilter !== 'available' || !!productId

  const devices = data?.data ?? []

  const handleIMEIDetected = useCallback((imei: string) => {
    setImeiQuery(imei)
    setShowScanner(false)
  }, [])

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns: Column<Device>[] = [
    {
      key:    'imei',
      header: 'IMEI / Device',
      cell:   (d) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium truncate max-w-[160px] sm:max-w-none">{d.imei1}</p>
          <p className="truncate text-xs text-muted-foreground">
            {d.product_name}
            {d.color   ? ` · ${d.color}`   : ''}
            {d.storage ? ` · ${d.storage}` : ''}
          </p>
        </div>
      ),
      sortValue: (d) => d.imei1,
    },
    {
      key:    'brand',
      header: 'Brand',
      cell:   (d) => <span className="text-sm">{d.brand_name}</span>,
      className: 'hidden sm:table-cell',
      sortValue: (d) => d.brand_name,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (d) => (
        <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABELS[d.status]}</Badge>
      ),
      sortValue: (d) => d.status,
    },
    {
      key:    'pricing',
      header: 'Purchase / Selling',
      cell:   (d) => (
        <div className="text-sm">
          <span className="text-muted-foreground">{formatCurrency(d.purchase_price)}</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="font-medium">{formatCurrency(d.selling_price)}</span>
        </div>
      ),
      className: 'hidden lg:table-cell',
      sortValue: (d) => d.selling_price,
    },
    {
      key:    'actions',
      header: '',
      cell:   (d) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost" size="sm" className="h-8 px-2 text-xs"
            onClick={() => setStatusDevice(d)}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Status
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => openEdit(d)} aria-label="Edit device"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(d)} aria-label="Delete device"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
      className: 'w-36 whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Devices"
        description="Inventory of all individual devices by IMEI."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Device
            </Button>
          )
        }
      />

      {/* Stock summary */}
      <StockSummaryCard />

      {/* ── IMEI Quick Lookup ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          IMEI Quick Lookup
        </p>

        <div className="flex flex-col gap-3">
          {/* Input row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Enter or scan IMEI (min 10 digits)…"
                value={imeiQuery}
                onChange={(e) => { setImeiQuery(e.target.value); setShowScanner(false) }}
                className="pl-9 font-mono text-sm"
                maxLength={20}
                inputMode="numeric"
              />
              {imeiQuery && (
                <button
                  onClick={() => setImeiQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear IMEI"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              variant={showScanner ? 'default' : 'outline'}
              size="icon"
              onClick={() => setShowScanner((v) => !v)}
              title="Scan IMEI barcode with camera"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </div>

          {/* Camera scanner */}
          {showScanner && (
            <IMEIScanner
              onDetected={handleIMEIDetected}
              onClose={() => setShowScanner(false)}
            />
          )}

          {/* Lookup result */}
          {!showScanner && imeiLoading && (
            <span className="text-sm text-muted-foreground animate-pulse">Searching…</span>
          )}
          {!showScanner && !imeiLoading && debouncedImei.length >= 10 && imeiDevice && (
            <div className="flex items-center flex-wrap gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{imeiDevice.product_name}</span>
              {imeiDevice.color   && <span className="text-muted-foreground">· {imeiDevice.color}</span>}
              {imeiDevice.storage && <span className="text-muted-foreground">· {imeiDevice.storage}</span>}
              <Badge variant={STATUS_VARIANT[imeiDevice.status]} className="ml-1 text-xs">
                {STATUS_LABELS[imeiDevice.status]}
              </Badge>
            </div>
          )}
          {!showScanner && !imeiLoading && debouncedImei.length >= 10 && !imeiDevice && (
            <span className="text-sm text-muted-foreground">No device found for this IMEI.</span>
          )}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Text search */}
        <div className="relative min-w-0 flex-1 basis-40">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search IMEI, product, brand…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => { setStatus(v === 'all' ? '' : v as DeviceStatus); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {DEVICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Product filter */}
        <Select value={productId} onValueChange={(v) => { setProductId(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.display_name || p.model_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            {!search && !productId && statusFilter !== 'available' ? 'Reset to available' : 'Clear filters'}
          </Button>
        )}

        {/* View toggle — always right-aligned */}
        <div className="flex items-center rounded-md border bg-muted/40 p-0.5 gap-0.5 ml-auto">
          <Button
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { setView('grid'); setPage(1) }}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { setView('table'); setPage(1) }}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {!isLoading && data?.meta && (
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {data.meta.total} device{data.meta.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ── Grid view ────────────────────────────────────────────────────── */}
      {view === 'grid' && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex flex-col rounded-xl border bg-card overflow-hidden animate-pulse">
                  <div className="h-1.5 w-full bg-muted" />
                  <div className="p-3 space-y-2.5">
                    <div className="flex gap-1.5">
                      <div className="h-4 w-16 rounded-full bg-muted" />
                      <div className="h-4 w-12 rounded-full bg-muted" />
                    </div>
                    <div className="h-3 w-14 rounded bg-muted" />
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="h-10 w-full rounded-md bg-muted" />
                    <div className="flex gap-1">
                      <div className="h-4 w-10 rounded-full bg-muted" />
                      <div className="h-4 w-10 rounded-full bg-muted" />
                    </div>
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-7 w-full rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : devices.length === 0 ? (
            <EmptyState
              icon={Cpu}
              title={
                statusFilter === 'available'
                  ? 'No available devices'
                  : hasFilters
                    ? 'No devices match your filters'
                    : 'No devices yet'
              }
              description={
                statusFilter === 'available'
                  ? 'All devices are currently sold or in another status.'
                  : hasFilters
                    ? 'Try adjusting or clearing your filters.'
                    : 'Add your first device to get started.'
              }
              action={
                statusFilter === 'available'
                  ? { label: 'Show all devices', onClick: () => { setStatus(''); setPage(1) } }
                  : !hasFilters && !statusFilter && isAdmin
                    ? { label: 'Add Device', onClick: openCreate }
                    : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={setDeleting}
                    onStatusChange={setStatusDevice}
                  />
                ))}
              </div>

              {/* Grid pagination */}
              {data?.meta && data.meta.total_pages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {data.meta.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.meta.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Table view ───────────────────────────────────────────────────── */}
      {view === 'table' && (
        <ResponsiveTable
          columns={columns}
          data={devices}
          isLoading={isLoading}
          meta={data?.meta}
          onPageChange={setPage}
          emptyMessage="No devices found. Adjust filters or add the first device."
          mobileCard={{
            top:     ['imei', 'status'],
            middle:  ['pricing'],
            bottom:  ['brand'],
            actions: 'actions',
          }}
        />
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <DeviceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        device={editing}
      />
      <StatusChangeModal
        open={!!statusDevice}
        onClose={() => setStatusDevice(null)}
        device={statusDevice}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteDevice.isPending}
        title={`Delete IMEI "${deleting?.imei1}"?`}
        description="This will permanently remove the device record. Sales history referencing this device will not be affected."
        confirmLabel="Delete device"
      />
    </div>
  )
}
