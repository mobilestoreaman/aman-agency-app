/**
 * CustomerSearchBox — searchable customer picker with inline quick-create.
 *
 * Uses a plain <div> + absolute dropdown instead of Radix Popover to avoid
 * the Radix Dialog pointer-event conflict.
 *
 * Props:
 *   onSelect(id)             — called with the customer ID ('' = cleared)
 *   onCustomerChange(c|null) — called with the full Customer object (optional)
 *   disabled                 — locks the picker
 *   initialCustomer          — pre-populate when the caller already knows the customer
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, ChevronsUpDown, Check, X, UserPlus } from 'lucide-react'
import { PhoneInput } from '@/components/shared/PhoneInput'
import { useCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { useDebounce } from '@/hooks/useDebounce'
import { PHONE_RE } from '@/utils/validation'
import { cn } from '@/lib/utils'
import type { Customer } from '@/types'

export interface CustomerSearchBoxProps {
  /** Called with selected customer ID; '' means cleared. */
  onSelect: (id: string) => void
  /** Optionally receive the full Customer object too. */
  onCustomerChange?: (customer: Customer | null) => void
  disabled?: boolean
  /** Pre-populate the picker (e.g. when opened from a customer detail page). */
  initialCustomer?: Customer | null
}

// Returns true when a string looks like a phone number:
// mostly digits (≥70 % of chars), minimum 6 digits present.
function looksLikePhone(s: string) {
  const digits = s.replace(/\D/g, '')
  return digits.length >= 6 && digits.length / s.length >= 0.7
}

export function CustomerSearchBox({
  onSelect,
  onCustomerChange,
  disabled = false,
  initialCustomer = null,
}: CustomerSearchBoxProps) {
  const [open,         setOpen]         = useState(false)
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Customer | null>(initialCustomer)
  const [quickCreate,  setQuickCreate]  = useState(false)
  const [quickName,    setQuickName]    = useState('')
  const [quickPhone,   setQuickPhone]   = useState('')
  const [quickAddress, setQuickAddress] = useState('')
  const [quickNotes,   setQuickNotes]   = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const debouncedSearch = useDebounce(search, 300)

  const { data }   = useCustomers({ search: debouncedSearch || undefined, limit: 20 })
  const customers  = data?.data ?? []
  const createCustomer = useCreateCustomer()

  // Sync when the caller changes the initialCustomer after mount
  // (e.g. CreditEntryModal fetches the customer async on open)
  useEffect(() => {
    setSelected(initialCustomer ?? null)
  }, [initialCustomer])

  // Close when clicking outside
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
    onCustomerChange?.(c)
    setOpen(false)
    setSearch('')
    setQuickCreate(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(null)
    onSelect('')
    onCustomerChange?.(null)
    setSearch('')
    setOpen(false)
    setQuickCreate(false)
  }

  const handleShowQuickCreate = () => {
    const isPhone = looksLikePhone(debouncedSearch)
    const digits  = debouncedSearch.replace(/\D/g, '').slice(0, 10)
    setQuickPhone(isPhone ? `+91${digits}` : '')
    setQuickName(isPhone  ? ''             : debouncedSearch)
    setQuickAddress('')
    setQuickNotes('')
    setQuickCreate(true)
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
          handleSelect(res.data.data)
          setQuickAddress('')
          setQuickNotes('')
        },
      },
    )
  }

  const showCreatePrompt = !!debouncedSearch && customers.length === 0 && !quickCreate

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
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
          {selected && !disabled && (
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

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">

          {quickCreate ? (
            /* ── Quick-create form ────────────────────────────────────────── */
            <div className="p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <UserPlus className="h-3.5 w-3.5" />
                New Customer
              </div>

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
            /* ── Search results ───────────────────────────────────────────── */
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
