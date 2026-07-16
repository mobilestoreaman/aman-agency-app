/**
 * InvoiceScanWizard — 4-step invoice-to-purchase flow
 *
 * Step 1  Upload     → scan invoice file (photo or PDF)
 * Step 2  Scanning   → poll until OCR done
 * Step 3  Vendor     → admin selects vendor from dropdown (no OCR guessing)
 * Step 4  Devices    → review extracted devices, fill IMEI + match product
 * Step 5  Confirm    → review totals and create purchase
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, FileText, X, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, ChevronLeft, Building2, ShoppingCart, ScanText,
  Plus, Trash2, Search, UserPlus, Camera, RotateCcw, Package,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useVendorInvoice,
  useUploadVendorInvoice,
  useCreatePurchaseFromInvoice,
} from '@/hooks/useVendorInvoices'
import { useVendors, useCreateVendor } from '@/hooks/useVendors'
import { useProducts }                 from '@/hooks/useProducts'
import { useDebounce }                 from '@/hooks/useDebounce'
import type {
  VendorInvoice, WizardItem, Vendor, Product, InvoicePurchaseItemReq,
} from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'processing' | 'vendor' | 'devices' | 'confirm'

interface Props {
  open:    boolean
  onClose: () => void
  onPurchaseCreated?: (purchaseId: string) => void
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png'
const MAX_MB   = 20

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload',     label: 'Upload'  },
  { id: 'processing', label: 'Scanning'},
  { id: 'vendor',     label: 'Vendor'  },
  { id: 'devices',    label: 'Devices' },
  { id: 'confirm',    label: 'Confirm' },
]

function StepIndicator({ current }: { current: WizardStep }) {
  const idx = STEPS.findIndex((s) => s.id === current)
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div className={[
            'flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors',
            i < idx   ? 'bg-primary text-primary-foreground' :
            i === idx ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                        'bg-muted text-muted-foreground',
          ].join(' ')}>
            {i < idx ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={[
            'text-xs hidden sm:inline',
            i === idx ? 'font-medium text-foreground' : 'text-muted-foreground',
          ].join(' ')}>{s.label}</span>
          {i < STEPS.length - 1 && (
            <div className={['h-px w-4 sm:w-8', i < idx ? 'bg-primary' : 'bg-border'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

type InputMode = 'file' | 'camera'

function UploadStep({ onUploaded }: { onUploaded: (inv: VendorInvoice) => void }) {
  const [inputMode,    setInputMode]   = useState<InputMode>('file')
  const [file,         setFile]        = useState<File | null>(null)
  const [dragOver,     setDragOver]    = useState(false)
  const [cameraError,  setCameraError] = useState<string | null>(null)
  const [streaming,    setStreaming]   = useState(false)

  const inputRef  = useRef<HTMLInputElement>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const upload    = useUploadVendorInvoice('auto')

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setStreaming(true)
    } catch {
      setCameraError('Camera access denied or not available on this device.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStreaming(false)
  }, [])

  useEffect(() => {
    if (inputMode === 'camera') startCamera()
    else stopCamera()
    return () => stopCamera()
  }, [inputMode])

  useEffect(() => { if (file) stopCamera() }, [file])

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      setFile(new File([blob], `invoice-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      stopCamera()
    }, 'image/jpeg', 0.92)
  }

  const handleFile = (f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) { alert(`File exceeds ${MAX_MB} MB`); return }
    setFile(f)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [])

  const resetFile = () => {
    setFile(null); upload.reset()
    if (inputMode === 'camera') startCamera()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-base">Add Invoice</h3>
        <p className="text-sm text-muted-foreground">
          Take a photo or upload a PDF/image. The OCR will extract all devices automatically.
        </p>
      </div>

      {/* Mode tabs */}
      {!file && (
        <div className="flex rounded-lg border p-1 bg-muted/40 gap-1">
          {(['file', 'camera'] as InputMode[]).map((m) => (
            <button
              key={m} type="button"
              onClick={() => setInputMode(m)}
              className={[
                'flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors',
                inputMode === m
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {m === 'file' ? <Upload className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {m === 'file' ? 'Upload File' : 'Take Photo'}
            </button>
          ))}
        </div>
      )}

      {/* File upload panel */}
      {inputMode === 'file' && !file && (
        <div
          className={[
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 px-4 cursor-pointer transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
          ].join(' ')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <ScanText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Drop invoice here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, JPEG, PNG · max {MAX_MB} MB</p>
          <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      )}

      {/* Camera panel */}
      {inputMode === 'camera' && !file && (
        <div className="space-y-3">
          {cameraError ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 py-10 px-4 text-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-400">{cameraError}</p>
              <Button variant="outline" size="sm" onClick={startCamera}>
                <RotateCcw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-[12%] border-2 border-white/40 rounded-md" />
              </div>
            </div>
          )}
          {streaming && (
            <Button className="w-full gap-2" onClick={capturePhoto}>
              <Camera className="h-4 w-4" /> Capture Invoice
            </Button>
          )}
        </div>
      )}

      {/* Selected file preview */}
      {file && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <FileText className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
              {file.type === 'image/jpeg' && file.name.startsWith('invoice-') ? ' · captured' : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={resetFile}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {upload.isError && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {(upload.error as Error)?.message ?? 'Upload failed'}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => file && upload.mutate(file, { onSuccess: onUploaded })}
          disabled={!file || upload.isPending}>
          {upload.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
            : <>Scan Invoice <ChevronRight className="ml-1 h-4 w-4" /></>}
        </Button>
      </div>
    </div>
  )
}

// ─── Step 2: Processing ───────────────────────────────────────────────────────

function ProcessingStep({
  invoiceId, onDone, onFailed,
}: {
  invoiceId: string
  onDone:    (inv: VendorInvoice) => void
  onFailed:  (msg: string) => void
}) {
  const { data: invoice } = useVendorInvoice(invoiceId)

  useEffect(() => {
    if (!invoice) return
    if (invoice.status === 'done' || invoice.status === 'needs_review') onDone(invoice)
    else if (invoice.status === 'failed') onFailed(invoice.processing_error ?? 'OCR failed')
  }, [invoice?.status])

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-medium">Scanning invoice…</p>
        <p className="text-sm text-muted-foreground mt-1">
          Extracting devices and prices. Usually takes 5–20 seconds.
        </p>
      </div>
    </div>
  )
}

// ─── Step 3: Vendor dropdown ──────────────────────────────────────────────────

interface VendorStepProps {
  selectedVendorId: string
  onSelect: (id: string, name: string) => void
  onBack:   () => void
  onNext:   () => void
}

function VendorStep({ selectedVendorId, onSelect, onBack, onNext }: VendorStepProps) {
  const [showCreate,  setShowCreate]  = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newPhone,    setNewPhone]    = useState('')
  const [newAddress,  setNewAddress]  = useState('')
  const [searchText,  setSearchText]  = useState('')

  // Load all vendors (high limit so the dropdown has everything)
  const { data: vendorsData, isLoading } = useVendors({ limit: 200 })
  const vendors = vendorsData?.data ?? []

  const createVendor = useCreateVendor()

  const filtered = searchText.trim()
    ? vendors.filter((v) =>
        v.name.toLowerCase().includes(searchText.toLowerCase()) ||
        v.phone.includes(searchText)
      )
    : vendors

  const handleCreate = () => {
    if (!newName.trim() || !newPhone.trim()) return
    createVendor.mutate(
      { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() },
      {
        onSuccess: (res) => {
          const v: Vendor = (res as { data: { data: Vendor } }).data.data
          onSelect(v.id, v.name)
          setShowCreate(false)
          setNewName(''); setNewPhone(''); setNewAddress('')
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Select Vendor</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Choose which vendor this invoice is from.
        </p>
      </div>

      {!showCreate ? (
        <div className="space-y-3">
          {/* Search filter */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search vendors…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Vendor list */}
          <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {searchText ? `No vendors match "${searchText}"` : 'No vendors found'}
              </p>
            ) : (
              filtered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelect(v.id, v.name)}
                  className={[
                    'w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between',
                    selectedVendorId === v.id
                      ? 'bg-primary/8 text-primary font-medium'
                      : 'hover:bg-muted/60',
                  ].join(' ')}
                >
                  <div>
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.phone}</p>
                  </div>
                  {selectedVendorId === v.id && (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={() => setShowCreate(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Add new vendor
          </Button>
        </div>
      ) : (
        /* Inline create form */
        <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
          <p className="text-sm font-medium flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> New Vendor
          </p>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Vendor name" />
            </div>
            <div>
              <Label className="text-xs">Phone *</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91..." />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Address" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}
              disabled={!newName.trim() || !newPhone.trim() || createVendor.isPending}>
              {createVendor.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create &amp; Select
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
        <Button onClick={onNext} disabled={!selectedVendorId}>
          Continue <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 4: Device row ───────────────────────────────────────────────────────

function DeviceRow({
  item, index, onChange, onRemove, canRemove,
}: {
  item:     WizardItem
  index:    number
  onChange: (idx: number, patch: Partial<WizardItem>) => void
  onRemove: (idx: number) => void
  canRemove: boolean
}) {
  const [productSearch, setProductSearch] = useState(item.description.slice(0, 60))
  const [showDropdown,  setShowDropdown]  = useState(false)
  const dSearch = useDebounce(productSearch, 400)

  const { data: productsData } = useProducts({ search: dSearch, limit: 8 })
  const products = productsData?.data ?? []

  const selectProduct = (p: Product) => {
    onChange(index, {
      product_id:    p.id,
      product_label: `${p.brand_name} ${p.display_name}`,
      color:         item.color || p.color,
      storage:       item.storage || p.variant?.storage || '',
    })
    setProductSearch(`${p.brand_name} ${p.display_name}`)
    setShowDropdown(false)
  }

  const imeiValid = !item.imei1 || item.imei1.length === 15

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* ── OCR extracted header — read-only reference ── */}
      <div className="bg-muted/40 border-b px-3 py-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug truncate">
              {item.description || `Device ${index + 1}`}
            </p>
            <div className="flex flex-wrap gap-2 mt-0.5">
              {item.ocr_qty && (
                <span className="text-xs text-muted-foreground">Qty: {item.ocr_qty}</span>
              )}
              {item.purchase_price > 0 && (
                <span className="text-xs text-muted-foreground">
                  ₹{item.purchase_price.toLocaleString()}
                </span>
              )}
              {item.ocr_hsn && (
                <span className="text-xs text-muted-foreground">HSN: {item.ocr_hsn}</span>
              )}
            </div>
          </div>
        </div>
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"
            onClick={() => onRemove(index)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* ── Fields admin fills in ── */}
      <div className="p-3 space-y-3">
        {/* Product match */}
        <div className="relative">
          <Label className="text-xs">Match to Product *</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 text-sm h-8"
              placeholder="Search product in system…"
              value={productSearch}
              onChange={(e) => {
                setProductSearch(e.target.value)
                onChange(index, { product_id: '', product_label: '' })
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>
          {item.product_id && (
            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> {item.product_label}
            </p>
          )}
          {showDropdown && products.length > 0 && !item.product_id && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
              {products.map((p) => (
                <button key={p.id} type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                  onMouseDown={() => selectProduct(p)}>
                  <p className="font-medium">{p.brand_name} {p.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.variant?.storage} · {p.color} · {p.barcode}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* IMEI — most important field, given visual prominence */}
        <div>
          <Label className="text-xs font-semibold">
            IMEI * <span className="font-normal text-muted-foreground">(15 digits)</span>
          </Label>
          <Input
            className={[
              'text-sm h-9 mt-1 font-mono tracking-wider',
              item.imei1 && !imeiValid ? 'border-red-400 focus-visible:ring-red-400' : '',
              item.imei1 && imeiValid  ? 'border-green-400' : '',
            ].join(' ')}
            value={item.imei1}
            maxLength={15}
            placeholder="_ _ _ _ _ _ _ _ _ _ _ _ _ _ _"
            onChange={(e) => onChange(index, { imei1: e.target.value.replace(/\D/g, '') })}
          />
          {item.imei1 && !imeiValid && (
            <p className="text-xs text-red-500 mt-0.5">Must be exactly 15 digits</p>
          )}
          {item.imei1 && imeiValid && (
            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Valid IMEI
            </p>
          )}
        </div>

        {/* Condition + Purchase Price row */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Condition *</Label>
            <Select value={item.condition}
              onValueChange={(v) => onChange(index, { condition: v as WizardItem['condition'] })}>
              <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="refurbished">Refurbished</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Purchase Price ₹ *</Label>
            <Input
              type="number" min="0" className="text-sm h-8 mt-1"
              value={item.purchase_price || ''}
              onChange={(e) => onChange(index, { purchase_price: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* Color + Storage */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Color</Label>
            <Input className="text-sm h-8 mt-1" value={item.color ?? ''} placeholder="e.g. Black"
              onChange={(e) => onChange(index, { color: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Storage</Label>
            <Input className="text-sm h-8 mt-1" value={item.storage ?? ''} placeholder="e.g. 128GB"
              onChange={(e) => onChange(index, { storage: e.target.value })} />
          </div>
        </div>

        {/* Selling price (optional) */}
        <div>
          <Label className="text-xs">Selling Price ₹ <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            type="number" min="0" className="text-sm h-8 mt-1"
            value={item.selling_price ?? ''}
            placeholder="Leave blank to set later"
            onChange={(e) => onChange(index, { selling_price: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Devices ─────────────────────────────────────────────────────────

interface DevicesStepProps {
  invoice:       VendorInvoice
  items:         WizardItem[]
  ocrItemCount:  number
  onChangeItems: (items: WizardItem[]) => void
  onBack:        () => void
  onNext:        () => void
}

const EMPTY_ITEM: WizardItem = {
  description: '', product_id: '', product_label: '',
  imei1: '', condition: 'new', purchase_price: 0,
}

function DevicesStep({ invoice, items, ocrItemCount, onChangeItems, onBack, onNext }: DevicesStepProps) {
  const update = (idx: number, patch: Partial<WizardItem>) =>
    onChangeItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))

  const remove = (idx: number) =>
    onChangeItems(items.filter((_, i) => i !== idx))

  const addRow = () =>
    onChangeItems([...items, { ...EMPTY_ITEM }])

  const allValid = items.length > 0 && items.every(
    (it) => it.product_id && it.imei1.length === 15 && it.purchase_price > 0
  )

  const extracted      = invoice.extraction
  const nothingFromOCR = ocrItemCount === 0
  const manualCount    = items.length - ocrItemCount
  const hasItems       = items.length > 0

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">Devices</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {nothingFromOCR
            ? 'OCR could not extract devices from this invoice — add them manually below.'
            : <>
                <strong className="text-foreground">{ocrItemCount}</strong> device{ocrItemCount !== 1 ? 's' : ''} extracted from invoice.
                {manualCount > 0 && <> + <strong className="text-foreground">{manualCount}</strong> added manually.</>}
                {' '}Match each to a product and enter the IMEI.
              </>}
        </p>
      </div>

      {/* OCR summary banner — only show when OCR returned useful data */}
      {extracted && !nothingFromOCR && (
        <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {extracted.invoice_number?.value && (
            <span>Invoice <strong className="text-foreground">#{extracted.invoice_number.value}</strong></span>
          )}
          {extracted.invoice_date?.value && (
            <span>Date <strong className="text-foreground">{extracted.invoice_date.value}</strong></span>
          )}
          {extracted.total_amount?.value && (
            <span>Total <strong className="text-foreground">₹{extracted.total_amount.value}</strong></span>
          )}
          {extracted.vendor_gstin?.value && (
            <span>GSTIN <strong className="text-foreground">{extracted.vendor_gstin.value}</strong></span>
          )}
        </div>
      )}

      {/* Nothing extracted — friendly empty state */}
      {nothingFromOCR && !hasItems && (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-6 text-center space-y-3">
          <Package className="h-10 w-10 text-amber-400 mx-auto" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">No devices found in invoice</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
              The OCR couldn't read the device table (poor image quality, rotated scan, or unsupported layout).
              You can add all devices manually below.
            </p>
          </div>
          <Button onClick={addRow} className="gap-2">
            <Plus className="h-4 w-4" /> Add First Device
          </Button>
        </div>
      )}

      {/* Device cards */}
      {hasItems && (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-0.5">
          {items.map((it, i) => (
            <DeviceRow
              key={i} item={it} index={i}
              onChange={update} onRemove={remove}
              canRemove={items.length > 1}
            />
          ))}
        </div>
      )}

      {/* Add more — only show as secondary action when there are already items */}
      {hasItems && (
        <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" /> Add device manually
        </Button>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
        <Button onClick={onNext} disabled={!allValid}>
          Review <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 5: Confirm ─────────────────────────────────────────────────────────

interface ConfirmStepProps {
  invoice:           VendorInvoice
  vendorName:        string
  items:             WizardItem[]
  notes:             string
  purchasedAt:       string
  onChangeNotes:       (v: string) => void
  onChangePurchasedAt: (v: string) => void
  onBack:            () => void
  onSubmit:          () => void
  submitting:        boolean
}

function ConfirmStep({
  invoice, vendorName, items, notes, purchasedAt,
  onChangeNotes, onChangePurchasedAt, onBack, onSubmit, submitting,
}: ConfirmStepProps) {
  const total     = items.reduce((s, it) => s + it.purchase_price, 0)
  const extracted = invoice.extraction

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Create Purchase</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Review and confirm before saving.</p>
      </div>

      <div className="rounded-lg border divide-y text-sm">
        {/* Vendor */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{vendorName}</span>
        </div>

        {/* Invoice meta */}
        {(extracted?.invoice_number?.value || extracted?.invoice_date?.value) && (
          <div className="px-3 py-2 text-muted-foreground text-xs">
            {extracted?.invoice_number?.value && <>Invoice #{extracted.invoice_number.value}</>}
            {extracted?.invoice_date?.value && <> · {extracted.invoice_date.value}</>}
          </div>
        )}

        {/* Device list */}
        <div className="px-3 py-2 space-y-1.5 max-h-52 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground truncate">
                  {it.product_label || it.description || `Device ${i + 1}`}
                </p>
                {it.imei1 && (
                  <p className="text-xs font-mono text-muted-foreground/70">{it.imei1}</p>
                )}
              </div>
              <span className="font-medium shrink-0">₹{it.purchase_price.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex justify-between px-3 py-2.5 font-semibold">
          <span>{items.length} device{items.length !== 1 ? 's' : ''}</span>
          <span>₹{total.toLocaleString()}</span>
        </div>
      </div>

      {/* Purchase date */}
      <div className="space-y-1">
        <Label htmlFor="purchased-at" className="text-sm">Purchase Date</Label>
        <Input id="purchased-at" type="date" value={purchasedAt}
          onChange={(e) => onChangePurchasedAt(e.target.value)} />
        <p className="text-xs text-muted-foreground">Leave blank to use today's date.</p>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="notes" className="text-sm">Notes</Label>
        <Textarea id="notes" placeholder="Optional notes…" value={notes}
          onChange={(e) => onChangeNotes(e.target.value)} rows={2} />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="mr-1 h-4 w-4" />Back
        </Button>
        <Button onClick={onSubmit} disabled={submitting} className="min-w-[140px]">
          {submitting
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
            : <><ShoppingCart className="mr-2 h-4 w-4" />Create Purchase</>}
        </Button>
      </div>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function InvoiceScanWizard({ open, onClose, onPurchaseCreated }: Props) {
  const [step,             setStep]            = useState<WizardStep>('upload')
  const [invoiceId,        setInvoiceId]       = useState<string | null>(null)
  const [invoice,          setInvoice]         = useState<VendorInvoice | null>(null)
  const [ocrError,         setOcrError]        = useState<string | null>(null)
  const [selectedVendorId, setSelectedVendorId]= useState('')
  const [vendorName,       setVendorName]      = useState('')
  const [items,            setItems]           = useState<WizardItem[]>([])
  const [ocrItemCount,     setOcrItemCount]    = useState(0)   // how many came from OCR
  const [notes,            setNotes]           = useState('')
  const [purchasedAt,      setPurchasedAt]     = useState('')

  const createPurchase = useCreatePurchaseFromInvoice()

  const buildItems = (inv: VendorInvoice): WizardItem[] => {
    const lineItems = inv.extraction?.line_items ?? []
    // Return empty array when OCR found nothing — don't create fake placeholder items
    if (lineItems.length === 0) return []
    return lineItems.map((li) => ({
      description:    li.description?.value ?? '',
      product_id:     '',
      product_label:  '',
      // Pre-populate IMEI from OCR if extracted (Samsung batch numbers, etc.)
      imei1:          li.imei?.value?.replace(/\D/g, '') ?? '',
      condition:      'new' as const,
      purchase_price: parseFloat(li.unit_price?.value?.replace(/,/g, '') ?? '0') || 0,
      // Pre-populate color & storage from model-code parsing
      color:          li.color?.value   || undefined,
      storage:        li.storage?.value || undefined,
      ocr_qty:        li.quantity?.value || undefined,
      ocr_hsn:        li.hsn_code?.value || undefined,
    }))
  }

  const handleOCRDone = (inv: VendorInvoice) => {
    setInvoice(inv)
    const built = buildItems(inv)
    setItems(built)
    setOcrItemCount(built.length)
    // Pre-fill purchase date from invoice date if available
    const d = inv.extraction?.invoice_date?.value
    if (d) {
      const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (m) setPurchasedAt(`${m[3]}-${m[2]}-${m[1]}`)
    }
    setStep('vendor')
  }

  const handleSubmit = () => {
    if (!invoiceId || !selectedVendorId || items.length === 0) return

    const reqItems: InvoicePurchaseItemReq[] = items.map((it) => ({
      product_id:     it.product_id,
      imei1:          it.imei1,
      imei2:          it.imei2 || undefined,
      condition:      it.condition,
      color:          it.color || undefined,
      storage:        it.storage || undefined,
      purchase_price: it.purchase_price,
      selling_price:  it.selling_price || undefined,
    }))

    createPurchase.mutate(
      {
        invoiceId,
        req: {
          vendor_id:    selectedVendorId,
          items:        reqItems,
          notes:        notes || undefined,
          purchased_at: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
        },
      },
      {
        onSuccess: (purchase) => {
          onPurchaseCreated?.(purchase.id)
          handleClose()
        },
      },
    )
  }

  const handleClose = () => {
    setStep('upload'); setInvoiceId(null); setInvoice(null)
    setOcrError(null); setSelectedVendorId(''); setVendorName('')
    setItems([]); setOcrItemCount(0); setNotes(''); setPurchasedAt('')
    createPurchase.reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanText className="h-5 w-5 text-primary" />
            Scan Invoice → Purchase
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <StepIndicator current={step} />

          {step === 'upload' && (
            <UploadStep onUploaded={(inv) => { setInvoiceId(inv.id); setStep('processing') }} />
          )}

          {step === 'processing' && invoiceId && !ocrError && (
            <ProcessingStep invoiceId={invoiceId} onDone={handleOCRDone}
              onFailed={(msg) => setOcrError(msg)} />
          )}

          {step === 'processing' && ocrError && (
            <div className="py-10 text-center space-y-4">
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
              <div>
                <p className="font-medium text-red-700">Scan Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{ocrError}</p>
              </div>
              <Button variant="outline" onClick={() => { setStep('upload'); setOcrError(null) }}>
                Try Again
              </Button>
            </div>
          )}

          {step === 'vendor' && (
            <VendorStep
              selectedVendorId={selectedVendorId}
              onSelect={(id, name) => { setSelectedVendorId(id); setVendorName(name) }}
              onBack={() => setStep('upload')}
              onNext={() => setStep('devices')}
            />
          )}

          {step === 'devices' && invoice && (
            <DevicesStep
              invoice={invoice}
              items={items}
              ocrItemCount={ocrItemCount}
              onChangeItems={setItems}
              onBack={() => setStep('vendor')}
              onNext={() => setStep('confirm')}
            />
          )}

          {step === 'confirm' && invoice && (
            <ConfirmStep
              invoice={invoice}
              vendorName={vendorName}
              items={items}
              notes={notes}
              purchasedAt={purchasedAt}
              onChangeNotes={setNotes}
              onChangePurchasedAt={setPurchasedAt}
              onBack={() => setStep('devices')}
              onSubmit={handleSubmit}
              submitting={createPurchase.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
