import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader2, Plus, Trash2, Cpu, ChevronsUpDown, Check,
  X, Printer, PackageX, CalendarClock, UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { BarcodeScannerButton } from '@/components/shared/BarcodeScanner'
import { PhoneInput } from '@/components/shared/PhoneInput'
import { useCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { useDevices, useDeviceByIMEI } from '@/hooks/useDevices'
import { salesApi } from '@/api/sales'
import { billsApi } from '@/api/bills'
import { paymentPromisesApi } from '@/api/paymentPromises'
import { getApiError } from '@/utils/error'
import { formatCurrency } from '@/utils/currency'
import { PHONE_RE } from '@/utils/validation'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import type { Customer } from '@/types'

// ── Payment mode options ──────────────────────────────────────────────────────
const PAYMENT_MODES = [
  { value: 'cash',          label: 'Cash',          icon: '💵' },
  { value: 'upi',           label: 'UPI',           icon: '📱' },
  { value: 'card',          label: 'Card',          icon: '💳' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: '🏦' },
  { value: 'credit',        label: 'Credit',        icon: '📋' },
] as const

// ── Zod schema ───────────────────────────────────────────────────────────────
const itemSchema = z.object({
  device_id:    z.string().min(1, 'Device required'),
  imei:         z.string(),
  product_name: z.string(),
  sale_price:   z.coerce.number().min(0.01, 'Price must be > 0'),
})

const schema = z.object({
  customer_id:  z.string().min(1, 'Customer is required'),
  sale_date:    z.string().min(1, 'Sale date is required'),
  amount_paid:  z.coerce.number().min(0).default(0),
  payment_mode: z.string().optional(),
  notes:        z.string().max(500).optional().or(z.literal('')),
  items:        z.array(itemSchema).min(1, 'Add at least one device'),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open:    boolean
  onClose: () => void
}

function todayValue() {
  return format(new Date(), 'yyyy-MM-dd')
}
function toISODate(d: string) {
  if (!d) return new Date().toISOString()
  return new Date(d + 'T00:00:00').toISOString()
}

// ── Customer combobox — plain absolute dropdown, no Radix Popover ────────────
// Radix Popover (and its Portal) conflicts with Radix Dialog's pointer-event
// management, making the trigger appear disabled. Using a plain <div> + absolute
// dropdown avoids the issue entirely.
interface CustomerSearchBoxProps {
  onSelect: (id: string) => void
  disabled: boolean
}

// Returns true when a string looks like a phone number:
// mostly digits (≥70 % of chars), minimum 6 digits present.
function looksLikePhone(s: string) {
  const digits = s.replace(/\D/g, '')
  return digits.length >= 6 && digits.length / s.length >= 0.7
}

function CustomerSearchBox({ onSelect, disabled }: CustomerSearchBoxProps) {
  const [open,        setOpen]        = useState(false)
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState<Customer | null>(null)
  // quickCreate = true → show the inline new-customer form instead of results
  const [quickCreate,   setQuickCreate]   = useState(false)
  const [quickName,     setQuickName]     = useState('')
  const [quickPhone,    setQuickPhone]    = useState('')
  const [quickAddress,  setQuickAddress]  = useState('')
  const [quickNotes,    setQuickNotes]    = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const debouncedSearch = useDebounce(search, 300)

  const { data }  = useCustomers({ search: debouncedSearch || undefined, limit: 20 })
  const customers = data?.data ?? []
  const createCustomer = useCreateCustomer()

  // Close when clicking outside the component
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuickCreate(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = () => {
    if (disabled) return
    setOpen(true)
    setQuickCreate(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleSelect = (c: Customer) => {
    setSelected(c)
    onSelect(c.id)
    setOpen(false)
    setSearch('')
    setQuickCreate(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(null)
    onSelect('')
    setSearch('')
    setOpen(false)
    setQuickCreate(false)
  }

  // Open the quick-create form, pre-filling from the current search term.
  const handleShowQuickCreate = () => {
    const isPhone = looksLikePhone(debouncedSearch)
    // Pre-fill phone: strip non-digits, cap at 10, prepend +91
    const digits = debouncedSearch.replace(/\D/g, '').slice(0, 10)
    setQuickPhone(isPhone ? `+91${digits}` : '')
    setQuickName(isPhone  ? ''             : debouncedSearch)
    setQuickAddress('')
    setQuickNotes('')
    setQuickCreate(true)
    // Focus the name field (always the first required field)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const quickPhoneValid = PHONE_RE.test(quickPhone)

  const handleQuickSubmit = () => {
    if (!quickName.trim() || !quickPhoneValid) return
    createCustomer.mutate(
      {
        name:    quickName.trim(),
        phone:   quickPhone,
        address: quickAddress.trim() || undefined,
        notes:   quickNotes.trim()   || undefined,
      },
      {
        onSuccess: (res) => {
          // Auto-select the newly created customer and close the dropdown
          handleSelect(res.data.data)
          setQuickAddress('')
          setQuickNotes('')
        },
      },
    )
  }

  // Show the "create" prompt only when the user has typed something and there
  // are no matching results — regardless of whether it looks like a phone number.
  const showCreatePrompt = !!debouncedSearch && customers.length === 0 && !quickCreate

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm',
          'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-muted-foreground',
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate font-medium text-foreground">{selected.name}</span>
            <span className="font-mono text-xs text-muted-foreground shrink-0">{selected.phone}</span>
          </span>
        ) : (
          <span>Search customer…</span>
        )}
        <span className="flex items-center gap-1 shrink-0 ml-2">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => e.key === 'Enter' && handleClear(e as unknown as React.MouseEvent)}
              className="rounded p-0.5 hover:bg-muted"
              aria-label="Clear selection"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </span>
      </button>

      {/* Dropdown — plain div, no portal, always inside Dialog DOM */}
      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">

          {quickCreate ? (
            /* ── Quick-create form ─────────────────────────────────────── */
            <div className="p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <UserPlus className="h-3.5 w-3.5" />
                New Customer
              </div>

              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Full name <span className="text-destructive">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickSubmit() } }}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Phone <span className="text-destructive">*</span>
                </label>
                <PhoneInput
                  value={quickPhone}
                  onChange={setQuickPhone}
                  disabled={createCustomer.isPending}
                />
                {quickPhone && !quickPhoneValid && (
                  <p className="text-[11px] text-destructive">Enter a valid 10-digit Indian mobile number</p>
                )}
              </div>

              {/* Address (optional) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Address <span className="text-muted-foreground text-[10px]">(optional)</span>
                </label>
                <textarea
                  value={quickAddress}
                  onChange={(e) => setQuickAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, City, State…"
                  disabled={createCustomer.isPending}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-50"
                />
              </div>

              {/* Notes (optional) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Notes <span className="text-muted-foreground text-[10px]">(optional)</span>
                </label>
                <textarea
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  rows={2}
                  placeholder="Any additional notes…"
                  disabled={createCustomer.isPending}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground disabled:opacity-50"
                />
              </div>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setQuickCreate(false)
                    setQuickAddress('')
                    setQuickNotes('')
                    setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                  className="flex-1 rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuickSubmit}
                  disabled={!quickName.trim() || !quickPhoneValid || createCustomer.isPending}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {createCustomer.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <UserPlus className="h-3.5 w-3.5" />
                  }
                  Add &amp; select
                </button>
              </div>
            </div>
          ) : (
            /* ── Search results ────────────────────────────────────────── */
            <>
              <div className="border-b p-2">
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or phone…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="max-h-52 overflow-y-auto py-1">
                {customers.length > 0 ? (
                  customers.map((c) => (
                    <div
                      key={c.id}
                      // onMouseDown fires before onBlur so the selection registers
                      // before the dropdown would close
                      onMouseDown={(e) => { e.preventDefault(); handleSelect(c) }}
                      className={cn(
                        'flex cursor-pointer items-center justify-between px-3 py-2 text-sm',
                        'hover:bg-accent hover:text-accent-foreground',
                        selected?.id === c.id && 'bg-accent',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      {selected?.id === c.id && (
                        <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {debouncedSearch ? 'No customers found.' : 'Type to search…'}
                  </p>
                )}

                {/* Create prompt — shown whenever search has text but no results */}
                {showCreatePrompt && (
                  <div
                    onClick={handleShowQuickCreate}
                    className="flex cursor-pointer items-center gap-2 border-t px-3 py-2 text-sm text-primary hover:bg-accent"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" />
                    <span>
                      Create new customer
                      {debouncedSearch && (
                        <span className="ml-1 text-muted-foreground">
                          for &quot;<span className="font-medium text-foreground">{debouncedSearch}</span>&quot;
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── IMEI scan + lookup bar ────────────────────────────────────────────────────
interface DeviceItem {
  device_id:    string
  imei:         string
  product_name: string
  sale_price:   number
}

interface ImeiScanBarProps {
  onAdd:          (d: DeviceItem) => void
  addedDeviceIds: Set<string>
}

function ImeiScanBar({ onAdd, addedDeviceIds }: ImeiScanBarProps) {
  const [imei, setImei] = useState('')
  const debouncedImei   = useDebounce(imei, 400)

  const { data: device, isFetching, isError } = useDeviceByIMEI(debouncedImei)

  const ready        = !!device && device.status === 'available' && !addedDeviceIds.has(device.id)
  const alreadyAdded = !!device && addedDeviceIds.has(device.id)
  const notAvail     = !!device && device.status !== 'available'

  const handleAdd = () => {
    if (!device || !ready) return
    const imei = device.imei1
    onAdd({
      device_id:    device.id,
      imei,
      product_name: device.product_name,
      sale_price:   device.selling_price,
    })
    setImei('')
  }

  const handleScan = (code: string) => {
    // Strip non-digits, keep max 16 chars (IMEI length)
    const cleaned = code.replace(/\D/g, '').slice(0, 16)
    setImei(cleaned || code.trim().slice(0, 20))
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Add device by IMEI
      </p>
      <div className="flex gap-2">
        <BarcodeScannerButton
          hint="Scan device IMEI"
          onScan={handleScan}
          label="Scan"
          closeOnScan
          className="shrink-0"
        />
        <div className="relative flex-1">
          <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            placeholder="Or type IMEI manually…"
            className="pl-9 font-mono text-sm"
            maxLength={20}
            inputMode="numeric"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!ready || isFetching}
          onClick={handleAdd}
          className="shrink-0"
        >
          {isFetching
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Plus className="h-4 w-4" />
          }
          Add
        </Button>
      </div>
      {debouncedImei.length >= 10 && !isFetching && (
        <p className="text-xs">
          {ready && (
            <span className="text-emerald-600">
              ✓ {device.product_name}
              {device.color ? ` · ${device.color}` : ''}
              {' '}— {formatCurrency(device.selling_price)} (edit price below if needed)
            </span>
          )}
          {alreadyAdded && (
            <span className="text-amber-600">⚠ Already added to this sale</span>
          )}
          {notAvail && (
            <span className="text-destructive">
              ✗ Device status is <strong>{device?.status}</strong> — not available for sale
            </span>
          )}
          {isError && (
            <span className="text-destructive">✗ No device found for this IMEI</span>
          )}
        </p>
      )}
    </div>
  )
}

// ── Product-picker row (secondary: pick by product → choose IMEI) ─────────────
// Loads all available devices upfront so:
//  • Only products with stock appear in the list
//  • The product picker is searchable by brand, model, storage, colour
function ProductPickerRow({ onAdd }: { onAdd: (d: DeviceItem) => void }) {
  const [productSearch,   setProductSearch]   = useState('')
  const [pickerOpen,      setPickerOpen]      = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; label: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Fetch all available devices once — limit 500 covers typical inventory sizes
  const { data: availableData, isLoading: loadingDevices } = useDevices({
    status: 'available',
    limit:  500,
  })
  const allAvailable = availableData?.data ?? []

  // Derive unique products that actually have available stock
  const productMap = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>()
    for (const d of allAvailable) {
      if (!map.has(d.product_id)) {
        map.set(d.product_id, {
          id:    d.product_id,
          label: `${d.brand_name} — ${d.product_name}`,
          count: 0,
        })
      }
      map.get(d.product_id)!.count++
    }
    return map
  }, [allAvailable])

  // Filter products by the search query (brand, model, storage, colour all live in the label or device)
  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim()
    const all = Array.from(productMap.values())
    if (!q) return all
    // also match storage/colour that lives on the devices themselves
    const matchingProductIds = new Set(
      allAvailable
        .filter((d) => {
          const haystack = [
            d.brand_name, d.product_name,
            d.storage ?? '', d.color ?? '',
          ].join(' ').toLowerCase()
          return haystack.includes(q)
        })
        .map((d) => d.product_id),
    )
    return all.filter((p) => matchingProductIds.has(p.id))
  }, [productMap, productSearch, allAvailable])

  // Devices available for the currently selected product
  const devicesForProduct = useMemo(
    () => selectedProduct
      ? allAvailable.filter((d) => d.product_id === selectedProduct.id)
      : [],
    [allAvailable, selectedProduct],
  )

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const openPicker = () => {
    setPickerOpen(true)
    // focus the search input after the dropdown renders
    setTimeout(() => searchRef.current?.focus(), 30)
  }

  const selectProduct = (p: { id: string; label: string }) => {
    setSelectedProduct(p)
    setPickerOpen(false)
    setProductSearch('')
  }

  const handleSelectDevice = (deviceId: string) => {
    const d = devicesForProduct.find((x) => x.id === deviceId)
    if (!d) return
    onAdd({ device_id: d.id, imei: d.imei1, product_name: d.product_name, sale_price: d.selling_price })
    setSelectedProduct(null)
  }

  const clearProduct = () => { setSelectedProduct(null); setProductSearch('') }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ── Searchable product combobox ── */}
      <div ref={pickerRef} className="relative">
        <button
          type="button"
          onClick={pickerOpen ? () => setPickerOpen(false) : openPicker}
          className={cn(
            'flex h-9 w-[240px] items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm',
            'hover:bg-accent/50 focus:outline-none',
            selectedProduct ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {loadingDevices ? 'Loading stock…' : (selectedProduct?.label ?? 'Pick product…')}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {selectedProduct && (
              <span
                role="button"
                tabIndex={0}
                onMouseDown={(e) => { e.stopPropagation(); clearProduct() }}
                onKeyDown={(e) => e.key === 'Enter' && clearProduct()}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </div>
        </button>

        {pickerOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-md border bg-popover shadow-lg">
            {/* Search input */}
            <div className="border-b p-2">
              <input
                ref={searchRef}
                className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search brand, model, storage, colour…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            {/* Product list */}
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredProducts.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                  <PackageX className="h-4 w-4" />
                  {productSearch ? 'No matching products in stock' : 'No available stock'}
                </div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => selectProduct(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent"
                  >
                    <span className="text-left">{p.label}</span>
                    <span className="ml-3 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      {p.count} avail.
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── IMEI selector for the chosen product ── */}
      {selectedProduct && (
        <Select onValueChange={handleSelectDevice}>
          <SelectTrigger className="w-[270px] text-sm">
            <SelectValue
              placeholder={
                devicesForProduct.length === 0 ? 'No stock for this product' : 'Select IMEI…'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {devicesForProduct.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <PackageX className="h-4 w-4" /> No available devices
              </div>
            ) : (
              devicesForProduct.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  <span className="font-mono text-xs">{d.imei1}</span>
                  {d.color   ? <span className="ml-1 text-muted-foreground">· {d.color}</span>   : null}
                  {d.storage ? <span className="ml-1 text-muted-foreground">· {d.storage}</span> : null}
                  <span className="ml-2 font-medium">{formatCurrency(d.selling_price)}</span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function SaleFormModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Promise date — shown when the customer leaves a balance outstanding
  const [promiseDate, setPromiseDate] = useState('')
  // Track selected customer ID so we can link the promise
  const selectedCustomerIdRef = useRef('')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: '', sale_date: todayValue(),
      amount_paid: 0, payment_mode: '', notes: '', items: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const watchedItems      = useWatch({ control: form.control, name: 'items' })
  const watchedAmountPaid = useWatch({ control: form.control, name: 'amount_paid' })

  const total   = (watchedItems ?? []).reduce((s, i) => s + (Number(i.sale_price) || 0), 0)
  const balance = Math.max(0, total - (Number(watchedAmountPaid) || 0))

  // Auto-fill amount paid to match the running total whenever items change.
  // Staff can still override it manually after the fact.
  useEffect(() => {
    form.setValue('amount_paid', total, { shouldValidate: false })
  }, [total, form])

  const addedDeviceIds = new Set((watchedItems ?? []).map((i) => i.device_id))

  const handleAddDevice = (d: DeviceItem) => {
    if (addedDeviceIds.has(d.device_id)) return
    append(d)
  }

  useEffect(() => {
    if (open) {
      form.reset({
        customer_id: '', sale_date: todayValue(),
        amount_paid: 0, payment_mode: '', notes: '', items: [],
      })
      setPromiseDate('')
      selectedCustomerIdRef.current = ''
    }
  }, [open, form])

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    let billId: string | null = null

    try {
      // ── 1. Create the sale ──────────────────────────────────────────────────
      const saleRes = await salesApi.create({
        customer_id:  values.customer_id,
        sold_at:      toISODate(values.sale_date),
        amount_paid:  values.amount_paid,
        payment_mode: values.payment_mode || undefined,
        notes:        values.notes || undefined,
        items: values.items.map((i) => ({
          device_id:  i.device_id,
          sale_price: i.sale_price,
        })),
      })
      const sale = saleRes.data.data

      // Invalidate TanStack Query caches
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['credit-ledger'] })

      // ── 2. Create + issue the bill automatically ────────────────────────────
      try {
        const billRes = await billsApi.create({ sale_id: sale.id })
        const bill    = billRes.data.data
        await billsApi.issue(bill.id)
        qc.invalidateQueries({ queryKey: ['bills'] })
        billId = bill.id
      } catch (billErr) {
        // Bill creation failure should not block the sale success
        console.warn('Bill generation failed:', billErr)
        toast.warning('Sale recorded, but bill generation failed. You can print it from Sale Details.')
      }

      // ── 3. Record payment promise if balance outstanding ───────────────────
      const currentBalance = Math.max(0, total - (Number(values.amount_paid) || 0))
      if (currentBalance > 0 && promiseDate) {
        try {
          await paymentPromisesApi.create({
            customer_id:     values.customer_id,
            sale_id:         sale.id,
            amount_promised: currentBalance,
            promised_date:   promiseDate,
            notes:           `Outstanding balance from sale ${sale.invoice_number}`,
          })
          qc.invalidateQueries({ queryKey: ['payment-promises'] })
        } catch (e) {
          // Non-blocking — the sale is already recorded
          console.warn('Promise creation failed:', e)
        }
      }

      toast.success(
        billId
          ? 'Sale recorded! Opening invoice…'
          : 'Sale recorded successfully.',
      )

      form.reset()
      setPromiseDate('')
      selectedCustomerIdRef.current = ''
      onClose()

      // ── 3. Open invoice via authenticated fetch → blob URL ─────────────────
      // window.open(url) alone fails because the browser can't attach the
      // Authorization header when navigating a new tab directly to the API.
      if (billId) {
        const id = billId
        setTimeout(() => billsApi.openInvoice(id).catch(() => {
          toast.warning('Invoice could not be opened. You can print it from Sale Details.')
        }), 200)
      }
    } catch (err) {
      toast.error(getApiError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 px-5 pt-4 pb-3 border-b">
          <DialogTitle className="text-base font-semibold">New Sale</DialogTitle>
        </DialogHeader>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        {/* plain div — flex-1 + min-h-0 is essential: without min-h-0 a flex  */}
        {/* child never shrinks below its content, so overflow-y-auto never    */}
        {/* fires. Radix ScrollArea has the same problem inside flex-col.       */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <Form {...form}>
            <form id="sale-form" onSubmit={form.handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">

              {/* Row 1 — Customer + Date */}
              <div className="grid grid-cols-[1fr_160px] gap-3">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <div>
                          <input type="hidden" {...field} />
                          <CustomerSearchBox
                            onSelect={(id) => {
                              field.onChange(id)
                              selectedCustomerIdRef.current = id
                            }}
                            disabled={isSubmitting}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sale_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sale date <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="date" className="h-9" disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Devices — placed before payment so staff add items first, then pay */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm font-semibold">
                    Devices <span className="text-destructive">*</span>
                  </FormLabel>
                  {(form.formState.errors.items as { message?: string })?.message && (
                    <p className="text-xs text-destructive">
                      {(form.formState.errors.items as { message?: string }).message}
                    </p>
                  )}
                </div>

                {/* IMEI scan bar */}
                <ImeiScanBar onAdd={handleAddDevice} addedDeviceIds={addedDeviceIds} />

                {/* Product picker */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Or add by product:</span>
                  <ProductPickerRow onAdd={handleAddDevice} />
                </div>

                {/* Added items */}
                {fields.length > 0 && (
                  <div className="rounded-lg border divide-y overflow-hidden">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-tight">
                            {watchedItems?.[index]?.product_name}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {watchedItems?.[index]?.imei}
                          </p>
                        </div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.sale_price`}
                          render={({ field: f }) => (
                            <FormItem className="mb-0 w-28 shrink-0">
                              <FormControl>
                                <Input
                                  {...f}
                                  type="number"
                                  min={0.01}
                                  step="0.01"
                                  className="h-8 text-right font-mono text-sm"
                                  disabled={isSubmitting}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => remove(index)}
                          disabled={isSubmitting}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Payment + Notes + Summary — all below devices so total is visible */}
              <div className="grid grid-cols-[1fr_200px] gap-4 items-start">

                {/* Left: Amount paid → Payment mode → Notes */}
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="amount_paid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount paid (₹)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-9 font-mono"
                            placeholder="0.00"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="payment_mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Payment mode
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                        </FormLabel>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {PAYMENT_MODES.map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => field.onChange(field.value === m.value ? '' : m.value)}
                              className={cn(
                                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                                field.value === m.value
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                              )}
                            >
                              <span>{m.icon}</span>
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Notes
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={2}
                            placeholder="Any remarks…"
                            disabled={isSubmitting}
                            className="resize-none"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right: Summary box — promise date lives here when balance > 0 */}
                <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm space-y-1.5 mt-6">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{fields.length} item{fields.length !== 1 ? 's' : ''}</span>
                    <span className="font-mono">{formatCurrency(total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Paid</span>
                    <span className="font-mono">{formatCurrency(Number(watchedAmountPaid) || 0)}</span>
                  </div>
                  <Separator />
                  <div className={cn(
                    'flex justify-between font-semibold',
                    balance > 0 ? 'text-amber-600' : 'text-emerald-700',
                  )}>
                    <span>{balance > 0 ? 'Balance' : 'Paid ✓'}</span>
                    <span className="font-mono">{formatCurrency(balance)}</span>
                  </div>

                  {/* Promise date — inline below balance, only when outstanding */}
                  {balance > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          <span>Pay-by date</span>
                          <span className="text-muted-foreground font-normal">(optional)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={promiseDate}
                            onChange={(e) => setPromiseDate(e.target.value)}
                            className="h-7 text-xs flex-1 px-2"
                            min={todayValue()}
                            disabled={isSubmitting}
                          />
                          {promiseDate && (
                            <button
                              type="button"
                              onClick={() => setPromiseDate('')}
                              className="text-muted-foreground hover:text-foreground shrink-0"
                              aria-label="Clear promise date"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {promiseDate ? (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">
                            ✓ Reminder on {new Date(promiseDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Set a date to get a reminder to collect.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

            </form>
          </Form>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <DialogFooter className="shrink-0 border-t px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="sale-form"
            disabled={isSubmitting || fields.length === 0}
            className="gap-1.5"
          >
            {isSubmitting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Printer className="h-4 w-4" />
            }
            {isSubmitting ? 'Processing…' : `Record & Print Bill · ${formatCurrency(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
