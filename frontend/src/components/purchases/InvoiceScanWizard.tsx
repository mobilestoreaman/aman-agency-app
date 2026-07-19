/**
 * InvoiceScanWizard — 4-step manual purchase entry flow
 *
 * Step 1  Photo    → optional invoice photo for reference (no OCR)
 * Step 2  Vendor   → select / create vendor
 * Step 3  Devices  → enter each device manually (IMEI, product match, price…)
 * Step 4  Confirm  → review summary and create purchase
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, FileText, X, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, ChevronLeft, Building2, ShoppingCart,
  Plus, Trash2, Search, UserPlus, Camera, RotateCcw, Package,
  ImagePlus,
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
import { useUploadVendorInvoice, useLinkInvoicePurchase } from '@/hooks/useVendorInvoices'
import { useVendors, useCreateVendor } from '@/hooks/useVendors'
import { useProducts }               from '@/hooks/useProducts'
import { useCreatePurchase }         from '@/hooks/usePurchases'
import { useDebounce }               from '@/hooks/useDebounce'
import type { WizardItem, Vendor, Product } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'photo' | 'vendor' | 'devices' | 'confirm'

interface Props {
  open:    boolean
  onClose: () => void
  onPurchaseCreated?: (purchaseId: string) => void
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png'
const MAX_MB   = 20

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'photo',   label: 'Photo'   },
  { id: 'vendor',  label: 'Vendor'  },
  { id: 'devices', label: 'Devices' },
  { id: 'confirm', label: 'Confirm' },
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

// ─── Step 1: Photo (optional) ─────────────────────────────────────────────────

type InputMode = 'file' | 'camera'

function PhotoStep({ onSkip, onUploaded }: {
  onSkip:     () => void
  onUploaded: (invoiceId: string) => void
}) {
  const [inputMode,   setInputMode]  = useState<InputMode>('file')
  const [file,        setFile]       = useState<File | null>(null)
  const [dragOver,    setDragOver]   = useState(false)
  const [cameraError, setCameraError]= useState<string | null>(null)
  const [streaming,   setStreaming]  = useState(false)

  const inputRef  = useRef<HTMLInputElement>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // 'auto' mode — upload for archival only, OCR runs in background (results ignored)
  const upload = useUploadVendorInvoice('auto')

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

  const handleUpload = () => {
    if (!file) return
    upload.mutate(file, {
      onSuccess: (inv) => onUploaded(inv.id),
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base">Invoice Photo</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Optional
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Attach a photo of the invoice for future reference. You can skip this and
          fill all details manually.
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
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 px-4 cursor-pointer transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40',
          ].join(' ')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <ImagePlus className="h-9 w-9 text-muted-foreground mb-3" />
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
              <Camera className="h-4 w-4" /> Capture Photo
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

      <div className="flex justify-between">
        <Button variant="outline" onClick={onSkip}>
          Skip <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        {file && (
          <Button onClick={handleUpload} disabled={upload.isPending}>
            {upload.isPending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
              : <>Attach &amp; Continue <ChevronRight className="ml-1 h-4 w-4" /></>}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Step 2: Vendor ───────────────────────────────────────────────────────────

interface VendorStepProps {
  selectedVendorId: string
  onSelect: (id: string, name: string) => void
  onBack:   () => void
  onNext:   () => void
}

function VendorStep({ selectedVendorId, onSelect, onBack, onNext }: VendorStepProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newPhone,   setNewPhone]   = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [searchText, setSearchText] = useState('')

  const { data: vendorsData, isLoading } = useVendors({ limit: 200 })
  const vendors    = vendorsData?.data ?? []
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
          Choose which vendor this purchase is from.
        </p>
      </div>

      {!showCreate ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search vendors…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8"
            />
          </div>

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
                  key={v.id} type="button"
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
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />Back
        </Button>
        <Button onClick={onNext} disabled={!selectedVendorId}>
          Continue <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 3: Device row ───────────────────────────────────────────────────────

function DeviceRow({
  item, index, onChange, onRemove, canRemove,
}: {
  item:     WizardItem
  index:    number
  onChange: (idx: number, patch: Partial<WizardItem>) => void
  onRemove: (idx: number) => void
  canRemove: boolean
}) {
  const [productSearch, setProductSearch] = useState(item.product_label || '')
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
      {/* ── Device header ── */}
      <div className="bg-muted/40 border-b px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Device {index + 1}</span>
        </div>
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-600"
            onClick={() => onRemove(index)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* ── Fields ── */}
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

        {/* IMEI */}
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

        {/* Condition + Purchase Price */}
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

        {/* Selling price */}
        <div>
          <Label className="text-xs">
            Selling Price ₹ <span className="text-muted-foreground">(optional)</span>
          </Label>
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

// ─── Step 3: Devices ─────────────────────────────────────────────────────────

interface DevicesStepProps {
  items:         WizardItem[]
  onChangeItems: (items: WizardItem[]) => void
  onBack:        () => void
  onNext:        () => void
}

const EMPTY_ITEM: WizardItem = {
  description: '', product_id: '', product_label: '',
  imei1: '', condition: 'new', purchase_price: 0,
}

function DevicesStep({ items, onChangeItems, onBack, onNext }: DevicesStepProps) {
  const update = (idx: number, patch: Partial<WizardItem>) =>
    onChangeItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))

  const remove = (idx: number) =>
    onChangeItems(items.filter((_, i) => i !== idx))

  const addRow = () =>
    onChangeItems([...items, { ...EMPTY_ITEM }])

  const allValid = items.length > 0 && items.every(
    (it) => it.product_id && it.imei1.length === 15 && it.purchase_price > 0
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">Add Devices</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enter each device purchased. Match to a product in the system and fill in the IMEI.
        </p>
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-0.5">
        {items.map((it, i) => (
          <DeviceRow
            key={i} item={it} index={i}
            onChange={update} onRemove={remove}
            canRemove={items.length > 1}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" /> Add another device
      </Button>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />Back
        </Button>
        <Button onClick={onNext} disabled={!allValid}>
          Review <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 4: Confirm ─────────────────────────────────────────────────────────

interface ConfirmStepProps {
  vendorName:          string
  items:               WizardItem[]
  notes:               string
  purchasedAt:         string
  onChangeNotes:       (v: string) => void
  onChangePurchasedAt: (v: string) => void
  onBack:              () => void
  onSubmit:            () => void
  submitting:          boolean
}

function ConfirmStep({
  vendorName, items, notes, purchasedAt,
  onChangeNotes, onChangePurchasedAt, onBack, onSubmit, submitting,
}: ConfirmStepProps) {
  const total = items.reduce((s, it) => s + it.purchase_price, 0)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Review Purchase</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Confirm details before saving.</p>
      </div>

      <div className="rounded-lg border divide-y text-sm">
        {/* Vendor */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{vendorName}</span>
        </div>

        {/* Device list */}
        <div className="px-3 py-2 space-y-1.5 max-h-52 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground truncate">
                  {it.product_label || `Device ${i + 1}`}
                </p>
                {it.imei1 && (
                  <p className="text-xs font-mono text-muted-foreground/70">{it.imei1}</p>
                )}
                {(it.color || it.storage) && (
                  <p className="text-xs text-muted-foreground/70">
                    {[it.color, it.storage].filter(Boolean).join(' · ')}
                  </p>
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
  const [step,             setStep]            = useState<WizardStep>('photo')
  const [invoiceId,        setInvoiceId]       = useState<string | null>(null)
  const [selectedVendorId, setSelectedVendorId]= useState('')
  const [vendorName,       setVendorName]      = useState('')
  const [items,            setItems]           = useState<WizardItem[]>([{ ...EMPTY_ITEM }])
  const [notes,            setNotes]           = useState('')
  const [purchasedAt,      setPurchasedAt]     = useState('')

  const createPurchase   = useCreatePurchase()
  const linkInvoice      = useLinkInvoicePurchase()

  const handleSubmit = () => {
    if (!selectedVendorId || items.length === 0) return

    createPurchase.mutate(
      {
        vendor_id:    selectedVendorId,
        items:        items.map((it) => ({
          product_id:     it.product_id,
          imei1:          it.imei1,
          imei2:          it.imei2 || undefined,
          condition:      it.condition,
          color:          it.color || undefined,
          storage:        it.storage || undefined,
          purchase_price: it.purchase_price,
          selling_price:  it.selling_price || undefined,
        })),
        notes:        notes || undefined,
        purchased_at: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
      },
      {
        onSuccess: (res) => {
          const purchase = (res as { data: { data: { id: string } } }).data.data
          // Link the reference photo to this purchase (fire-and-forget)
          if (invoiceId) {
            linkInvoice.mutate({ invoiceId, purchaseId: purchase.id })
          }
          onPurchaseCreated?.(purchase.id)
          handleClose()
        },
      },
    )
  }

  const handleClose = () => {
    setStep('photo')
    setInvoiceId(null)
    setSelectedVendorId(''); setVendorName('')
    setItems([{ ...EMPTY_ITEM }])
    setNotes(''); setPurchasedAt('')
    createPurchase.reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            New Purchase
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <StepIndicator current={step} />

          {step === 'photo' && (
            <PhotoStep
              onSkip={() => setStep('vendor')}
              onUploaded={(id) => { setInvoiceId(id); setStep('vendor') }}
            />
          )}

          {step === 'vendor' && (
            <VendorStep
              selectedVendorId={selectedVendorId}
              onSelect={(id, name) => { setSelectedVendorId(id); setVendorName(name) }}
              onBack={() => setStep('photo')}
              onNext={() => setStep('devices')}
            />
          )}

          {step === 'devices' && (
            <DevicesStep
              items={items}
              onChangeItems={setItems}
              onBack={() => setStep('vendor')}
              onNext={() => setStep('confirm')}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
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
