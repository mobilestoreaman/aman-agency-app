/**
 * InvoiceScanWizard — 5-step invoice-to-purchase flow
 *
 * Step 1 Upload    → scan invoice file
 * Step 2 Processing → poll until OCR done
 * Step 3 Vendor    → confirm / create vendor
 * Step 4 Items     → match products, enter IMEIs
 * Step 5 Confirm   → review totals and create purchase
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload, FileText, X, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, ChevronLeft, Building2, ShoppingCart, ScanText,
  Plus, Trash2, Search, UserPlus,
} from 'lucide-react'
import { Button }       from '@/components/ui/button'
import { Badge }        from '@/components/ui/badge'
import { Input }        from '@/components/ui/input'
import { Label }        from '@/components/ui/label'
import { Textarea }     from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useVendorInvoice, useUploadVendorInvoice, useCreatePurchaseFromInvoice } from '@/hooks/useVendorInvoices'
import { useVendors, useCreateVendor }   from '@/hooks/useVendors'
import { useProducts }                   from '@/hooks/useProducts'
import { useDebounce }                   from '@/hooks/useDebounce'
import type { VendorInvoice, WizardItem, Vendor, Product, InvoicePurchaseItemReq } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'processing' | 'vendor' | 'items' | 'confirm'

interface Props {
  open:    boolean
  onClose: () => void
  /** Called when purchase is successfully created */
  onPurchaseCreated?: (purchaseId: string) => void
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png'
const MAX_MB   = 20

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'upload',     label: 'Upload'   },
  { id: 'processing', label: 'Scanning' },
  { id: 'vendor',     label: 'Vendor'   },
  { id: 'items',      label: 'Items'    },
  { id: 'confirm',    label: 'Confirm'  },
]

function StepIndicator({ current }: { current: WizardStep }) {
  const idx = STEPS.findIndex((s) => s.id === current)
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <div className={[
            'flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors',
            i < idx  ? 'bg-primary text-primary-foreground' :
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

function UploadStep({ onUploaded }: { onUploaded: (inv: VendorInvoice) => void }) {
  const [file, setFile]         = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)
  const upload                  = useUploadVendorInvoice('auto')

  const handleFile = (f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) { alert(`File exceeds ${MAX_MB} MB`); return }
    setFile(f)
  }
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [])

  const handleSubmit = () => {
    if (!file) return
    upload.mutate(file, { onSuccess: onUploaded })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="font-semibold text-base">Upload Invoice</h3>
        <p className="text-sm text-muted-foreground">
          Upload a PDF, JPEG, or PNG of the vendor invoice. OCR will extract vendor details and line items.
        </p>
      </div>

      {!file ? (
        <div
          className={[
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed',
            'py-12 px-4 cursor-pointer transition-colors',
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
      ) : (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <FileText className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setFile(null)}>
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
        <Button onClick={handleSubmit} disabled={!file || upload.isPending}>
          {upload.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : <>Upload &amp; Scan <ChevronRight className="ml-1 h-4 w-4" /></>}
        </Button>
      </div>
    </div>
  )
}

// ─── Step 2: Processing ───────────────────────────────────────────────────────

function ProcessingStep({
  invoiceId,
  onDone,
  onFailed,
}: {
  invoiceId: string
  onDone:    (inv: VendorInvoice) => void
  onFailed:  (msg: string) => void
}) {
  const { data: invoice } = useVendorInvoice(invoiceId)

  useEffect(() => {
    if (!invoice) return
    if (invoice.status === 'done' || invoice.status === 'needs_review') {
      onDone(invoice)
    } else if (invoice.status === 'failed') {
      onFailed(invoice.processing_error ?? 'OCR extraction failed')
    }
  }, [invoice?.status])

  const statusMsg: Record<string, string> = {
    pending:      'Queued for processing…',
    processing:   'Extracting text from invoice…',
    done:         'Extraction complete!',
    needs_review: 'Extraction complete (some fields need review)',
    failed:       'Extraction failed',
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <div className="text-center">
        <p className="font-medium">{statusMsg[invoice?.status ?? 'pending']}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Tesseract OCR is running in-house. This usually takes 5–15 seconds.
        </p>
      </div>
    </div>
  )
}

// ─── Step 3: Vendor ───────────────────────────────────────────────────────────

interface VendorStepProps {
  invoice:          VendorInvoice
  selectedVendorId: string
  onSelect:         (id: string, name: string) => void
  onBack:           () => void
  onNext:           () => void
}

function VendorStep({ invoice, selectedVendorId, onSelect, onBack, onNext }: VendorStepProps) {
  const extracted     = invoice.extraction
  const extractedName = extracted?.vendor_name?.value ?? ''
  const extractedPhone= extracted?.vendor_phone?.value ?? ''
  const extractedAddr = extracted?.vendor_address?.value ?? ''

  const [search, setSearch]       = useState(extractedName)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]     = useState(extractedName)
  const [newPhone, setNewPhone]   = useState(extractedPhone)
  const [newAddress, setNewAddress] = useState(extractedAddr)

  const dSearch = useDebounce(search, 400)
  const { data: vendorsData } = useVendors({ search: dSearch, limit: 8 })
  const vendors = vendorsData?.data ?? []

  const createVendor = useCreateVendor()

  const handleCreate = () => {
    if (!newName.trim() || !newPhone.trim()) return
    createVendor.mutate(
      { name: newName.trim(), phone: newPhone.trim(), address: newAddress.trim() },
      {
        onSuccess: (res) => {
          const v: Vendor = (res as { data: { data: Vendor } }).data.data
          onSelect(v.id, v.name)
          setShowCreate(false)
        },
      },
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Confirm Vendor</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select the vendor for this purchase. OCR detected:
        </p>
      </div>

      {/* OCR extraction preview */}
      {extracted && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
          <p><span className="font-medium">Name:</span> {extracted.vendor_name?.value || '—'}</p>
          <p><span className="font-medium">GSTIN:</span> {extracted.vendor_gstin?.value || '—'}</p>
          <p><span className="font-medium">Phone:</span> {extracted.vendor_phone?.value || '—'}</p>
          <p><span className="font-medium">Address:</span> {extracted.vendor_address?.value || '—'}</p>
        </div>
      )}

      {/* Search */}
      {!showCreate && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {vendors.length > 0 ? (
            <ul className="space-y-1 max-h-52 overflow-y-auto">
              {vendors.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(v.id, v.name)}
                    className={[
                      'w-full text-left px-3 py-2 rounded-md border text-sm transition-colors',
                      selectedVendorId === v.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-transparent hover:border-border hover:bg-muted/50',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.phone}</p>
                      </div>
                      {selectedVendorId === v.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : dSearch ? (
            <p className="text-sm text-muted-foreground py-2 text-center">
              No vendors match "{dSearch}"
            </p>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowCreate(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Create new vendor
          </Button>
        </div>
      )}

      {/* Inline create form */}
      {showCreate && (
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
              <Label className="text-xs">Phone * (e.g. +919876543210)</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91..." />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Address" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || !newPhone.trim() || createVendor.isPending}
            >
              {createVendor.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
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

// ─── Step 4: Item row ─────────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  item:     WizardItem
  index:    number
  onChange: (idx: number, patch: Partial<WizardItem>) => void
  onRemove: (idx: number) => void
  canRemove:boolean
}) {
  const [productSearch, setProductSearch] = useState(item.description.slice(0, 40))
  const [showDropdown, setShowDropdown]   = useState(false)
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
    <div className="rounded-lg border p-3 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground font-mono leading-tight line-clamp-2 flex-1">
          {item.description || `Item ${index + 1}`}
        </p>
        {canRemove && (
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Product search */}
      <div className="relative">
        <Label className="text-xs">Product *</Label>
        <div className="relative mt-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 text-sm h-8"
            placeholder="Search products…"
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
            <CheckCircle2 className="h-3 w-3" />{item.product_label}
          </p>
        )}
        {showDropdown && products.length > 0 && !item.product_id && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
            {products.map((p) => (
              <button
                key={p.id} type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={() => selectProduct(p)}
              >
                <p className="font-medium">{p.brand_name} {p.display_name}</p>
                <p className="text-xs text-muted-foreground">{p.variant?.storage} · {p.color} · {p.barcode}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* IMEI + Condition row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">IMEI 1 * (15 digits)</Label>
          <Input
            className={['text-sm h-8 mt-1 font-mono', !imeiValid ? 'border-red-400' : ''].join(' ')}
            value={item.imei1}
            maxLength={15}
            placeholder="123456789012345"
            onChange={(e) => onChange(index, { imei1: e.target.value.replace(/\D/g, '') })}
          />
          {!imeiValid && <p className="text-xs text-red-500 mt-0.5">Must be exactly 15 digits</p>}
        </div>
        <div>
          <Label className="text-xs">Condition *</Label>
          <Select value={item.condition} onValueChange={(v) => onChange(index, { condition: v as WizardItem['condition'] })}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="refurbished">Refurbished</SelectItem>
            </SelectContent>
          </Select>
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

      {/* Prices */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Purchase Price ₹ *</Label>
          <Input
            type="number" min="0" className="text-sm h-8 mt-1"
            value={item.purchase_price || ''}
            onChange={(e) => onChange(index, { purchase_price: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Selling Price ₹</Label>
          <Input
            type="number" min="0" className="text-sm h-8 mt-1"
            value={item.selling_price ?? ''}
            placeholder="Optional"
            onChange={(e) => onChange(index, { selling_price: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Items ─────────────────────────────────────────────────────────────

interface ItemsStepProps {
  invoice: VendorInvoice
  items:   WizardItem[]
  onChangeItems: (items: WizardItem[]) => void
  onBack:  () => void
  onNext:  () => void
}

function ItemsStep({ invoice, items, onChangeItems, onBack, onNext }: ItemsStepProps) {
  const update = (idx: number, patch: Partial<WizardItem>) => {
    onChangeItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  const remove = (idx: number) => {
    onChangeItems(items.filter((_, i) => i !== idx))
  }
  const addRow = () => {
    onChangeItems([...items, {
      description:    '',
      product_id:     '',
      product_label:  '',
      imei1:          '',
      condition:      'new',
      purchase_price: 0,
    }])
  }

  const allValid = items.every(
    (it) => it.product_id && it.imei1.length === 15 && it.purchase_price > 0
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">Review Line Items</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {items.length} item{items.length !== 1 ? 's' : ''} extracted. Match each to a product and enter the IMEI.
        </p>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {items.map((it, i) => (
          <ItemRow
            key={i}
            item={it}
            index={i}
            onChange={update}
            onRemove={remove}
            canRemove={items.length > 1}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />Add item
      </Button>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>
        <Button onClick={onNext} disabled={!allValid || items.length === 0}>
          Review <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Step 5: Confirm ─────────────────────────────────────────────────────────

interface ConfirmStepProps {
  invoice:        VendorInvoice
  selectedVendorId: string
  vendorName:     string
  items:          WizardItem[]
  notes:          string
  purchasedAt:    string
  onChangeNotes:       (v: string) => void
  onChangePurchasedAt: (v: string) => void
  onBack:         () => void
  onSubmit:       () => void
  submitting:     boolean
}

function ConfirmStep({
  invoice, selectedVendorId, vendorName, items,
  notes, purchasedAt,
  onChangeNotes, onChangePurchasedAt,
  onBack, onSubmit, submitting,
}: ConfirmStepProps) {
  const total = items.reduce((s, it) => s + it.purchase_price, 0)
  const extracted = invoice.extraction

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-base">Create Purchase</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Review and confirm the purchase details.</p>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border divide-y text-sm">
        <div className="flex items-center gap-2 px-3 py-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{vendorName}</span>
        </div>
        {extracted?.invoice_number?.value && (
          <div className="px-3 py-2 text-muted-foreground">
            Invoice #{extracted.invoice_number.value}
            {extracted.invoice_date?.value ? ` · ${extracted.invoice_date.value}` : ''}
          </div>
        )}
        <div className="px-3 py-2 space-y-1 max-h-44 overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground truncate max-w-[60%]">
                {it.product_label || it.description || `Item ${i + 1}`}
                {it.imei1 ? <span className="ml-1 font-mono text-xs">({it.imei1})</span> : null}
              </span>
              <span className="font-medium shrink-0">₹{it.purchase_price.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between px-3 py-2 font-semibold">
          <span>Total</span>
          <span>₹{total.toLocaleString()}</span>
        </div>
      </div>

      {/* Purchase date */}
      <div className="space-y-1">
        <Label htmlFor="purchased-at" className="text-sm">Purchase Date</Label>
        <Input
          id="purchased-at"
          type="date"
          value={purchasedAt}
          onChange={(e) => onChangePurchasedAt(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave blank to use today's date.</p>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="notes" className="text-sm">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Optional notes…"
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={2}
        />
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
  const [notes,            setNotes]           = useState('')
  const [purchasedAt,      setPurchasedAt]     = useState('')

  const createPurchase = useCreatePurchaseFromInvoice()

  // Build WizardItems from OCR extraction
  const buildItemsFromInvoice = (inv: VendorInvoice): WizardItem[] => {
    const lineItems = inv.extraction?.line_items ?? []
    if (lineItems.length === 0) {
      return [{ description: '', product_id: '', product_label: '', imei1: '', condition: 'new', purchase_price: 0 }]
    }
    return lineItems.map((li) => ({
      description:   li.description?.value ?? '',
      product_id:    '',
      product_label: '',
      imei1:         '',
      condition:     'new' as const,
      purchase_price: parseFloat(li.unit_price?.value?.replace(/,/g, '') ?? '0') || 0,
    }))
  }

  const handleUploaded = (inv: VendorInvoice) => {
    setInvoiceId(inv.id)
    setStep('processing')
  }

  const handleOCRDone = (inv: VendorInvoice) => {
    setInvoice(inv)
    setItems(buildItemsFromInvoice(inv))
    // Pre-fill purchase date from invoice date if OCR extracted it
    const invDate = inv.extraction?.invoice_date?.value
    if (invDate) {
      // Try to parse common date formats (DD/MM/YYYY or YYYY-MM-DD)
      const parts = invDate.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (parts) setPurchasedAt(`${parts[3]}-${parts[2]}-${parts[1]}`)
    }
    setStep('vendor')
  }

  const handleOCRFailed = (msg: string) => {
    setOcrError(msg)
  }

  const handleSelectVendor = (id: string, name: string) => {
    setSelectedVendorId(id)
    setVendorName(name)
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
          purchased_at: purchasedAt
            ? new Date(purchasedAt).toISOString()
            : undefined,
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
    // Reset all state on close
    setStep('upload')
    setInvoiceId(null)
    setInvoice(null)
    setOcrError(null)
    setSelectedVendorId('')
    setVendorName('')
    setItems([])
    setNotes('')
    setPurchasedAt('')
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
            <UploadStep onUploaded={handleUploaded} />
          )}

          {step === 'processing' && invoiceId && !ocrError && (
            <ProcessingStep
              invoiceId={invoiceId}
              onDone={handleOCRDone}
              onFailed={handleOCRFailed}
            />
          )}

          {step === 'processing' && ocrError && (
            <div className="py-10 text-center space-y-4">
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
              <div>
                <p className="font-medium text-red-700">OCR Extraction Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{ocrError}</p>
              </div>
              <Button variant="outline" onClick={() => { setStep('upload'); setOcrError(null) }}>
                Try Again
              </Button>
            </div>
          )}

          {step === 'vendor' && invoice && (
            <VendorStep
              invoice={invoice}
              selectedVendorId={selectedVendorId}
              onSelect={handleSelectVendor}
              onBack={() => setStep('upload')}
              onNext={() => setStep('items')}
            />
          )}

          {step === 'items' && invoice && (
            <ItemsStep
              invoice={invoice}
              items={items}
              onChangeItems={setItems}
              onBack={() => setStep('vendor')}
              onNext={() => setStep('confirm')}
            />
          )}

          {step === 'confirm' && invoice && (
            <ConfirmStep
              invoice={invoice}
              selectedVendorId={selectedVendorId}
              vendorName={vendorName}
              items={items}
              notes={notes}
              purchasedAt={purchasedAt}
              onChangeNotes={setNotes}
              onChangePurchasedAt={setPurchasedAt}
              onBack={() => setStep('items')}
              onSubmit={handleSubmit}
              submitting={createPurchase.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
