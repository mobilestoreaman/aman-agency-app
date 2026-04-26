import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/shared/PhoneInput'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDevices } from '@/hooks/useDevices'
import { useCustomers } from '@/hooks/useCustomers'
import { useCreateBorrowLend, useUpdateBorrowLend } from '@/hooks/useBorrowLends'
import { toApiDate } from '@/utils/date'
import { PHONE_RE } from '@/utils/validation'
import type { BorrowLend, BorrowLendType } from '@/types'

const schema = z.object({
  type:                  z.enum(['borrow', 'lend']),
  device_id:             z.string().min(1, 'Device is required'),
  customer_id:           z.string().optional().or(z.literal('')),
  party_name:            z.string().min(1, 'Party name is required').max(100),
  party_phone:           z.string().regex(PHONE_RE).optional().or(z.literal('')),
  borrow_date:           z.string().min(1, 'Date is required'),
  expected_return_date:  z.string().optional().or(z.literal('')),
  notes:                 z.string().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

function todayValue() { return format(new Date(), 'yyyy-MM-dd') }
// Backend stores dates as IST calendar day midnight (UTC). DD-MM-YYYY is sent
// back. Parse it and convert to YYYY-MM-DD for the HTML date input.
function fromApiDate(d?: string) {
  if (!d) return ''
  // Handle both "DD-MM-YYYY" (backend response) and ISO 8601 formats
  if (d.includes('T') || d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // ISO 8601 → shift to IST and extract date
    const utcMs = new Date(d).getTime()
    if (isNaN(utcMs)) return ''
    const istDate = new Date(utcMs + 330 * 60 * 1000)
    return istDate.toISOString().split('T')[0]
  }
  // DD-MM-YYYY → YYYY-MM-DD
  const [day, m, y] = d.split('-')
  return `${y}-${m}-${day}`
}

interface Props {
  open:       boolean
  onClose:    () => void
  entry?:     BorrowLend | null
  /** Pre-select type when opening from a filtered context */
  defaultType?: BorrowLendType
}

export default function BorrowLendFormModal({ open, onClose, entry, defaultType = 'lend' }: Props) {
  const isEdit    = !!entry
  const create    = useCreateBorrowLend()
  const update    = useUpdateBorrowLend()
  const isPending = create.isPending || update.isPending

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  // Devices: for lend show only available; for borrow allow any
  const [typePreview, setTypePreview] = useState<BorrowLendType>(defaultType)

  const { data: devicesData } = useDevices({
    limit: 200,
    status: typePreview === 'lend' ? 'available' : undefined,
  })
  const devices = devicesData?.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultType, device_id: '', customer_id: '',
      party_name: '', party_phone: '',
      borrow_date: todayValue(), expected_return_date: '', notes: '',
    },
  })

  // Keep typePreview in sync with form value for the device filter
  const currentType = form.watch('type')
  useEffect(() => { setTypePreview(currentType) }, [currentType])

  useEffect(() => {
    if (entry) {
      form.reset({
        type:                 entry.type,
        device_id:            entry.device_id,
        customer_id:          entry.customer_id   ?? '',
        party_name:           entry.party_name,
        party_phone:          entry.party_phone   ?? '',
        borrow_date:          fromApiDate(entry.borrow_date),
        expected_return_date: fromApiDate(entry.expected_return_date),
        notes:                entry.notes         ?? '',
      })
    } else {
      form.reset({
        type: defaultType, device_id: '', customer_id: '',
        party_name: '', party_phone: '',
        borrow_date: todayValue(), expected_return_date: '', notes: '',
      })
    }
  }, [entry, open, defaultType, form])

  const onSubmit = (values: FormValues) => {
    if (isEdit) {
      update.mutate(
        {
          id:                    entry!.id,
          party_name:            values.party_name,
          party_phone:           values.party_phone  || undefined,
          expected_return_date:  toApiDate(values.expected_return_date ?? ''),
          notes:                 values.notes        || undefined,
        },
        { onSuccess: () => { form.reset(); onClose() } },
      )
    } else {
      create.mutate(
        {
          type:                  values.type,
          device_id:             values.device_id,
          customer_id:           values.customer_id  || undefined,
          party_name:            values.party_name,
          party_phone:           values.party_phone  || undefined,
          borrow_date:           toApiDate(values.borrow_date)!,
          expected_return_date:  toApiDate(values.expected_return_date ?? ''),
          notes:                 values.notes        || undefined,
        },
        { onSuccess: () => { form.reset(); onClose() } },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? 'Edit Entry' : 'Add Borrow / Lend'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
          <Form {...form}>
            <form id="bl-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

              {/* Type toggle — only on create */}
              {!isEdit && (
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type <span className="text-destructive">*</span></FormLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {(['lend', 'borrow'] as BorrowLendType[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => field.onChange(t)}
                            className={`flex items-center justify-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${
                              field.value === t
                                ? t === 'lend'
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-amber-600 bg-amber-600 text-white'
                                : 'border-input bg-background hover:bg-accent'
                            }`}
                          >
                            {t === 'lend'
                              ? <><ArrowUpRight className="h-4 w-4" /> Lent out</>
                              : <><ArrowDownLeft className="h-4 w-4" /> Borrowed</>
                            }
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Device */}
              {!isEdit && (
                <FormField
                  control={form.control}
                  name="device_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Device <span className="text-destructive">*</span>
                        {typePreview === 'lend' && (
                          <span className="ml-1 text-xs text-muted-foreground">(available only)</span>
                        )}
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select device by IMEI" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {devices.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              <span className="font-mono text-xs">{d.imei1}</span>
                              <span className="ml-2 text-muted-foreground">— {d.product_name}{d.color ? ` · ${d.color}` : ''}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {isEdit && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Device: </span>
                  <span className="font-medium">{entry?.device_desc ?? '—'}</span>
                </div>
              )}

              {/* Optional customer link */}
              {!isEdit && (
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer link <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="None — or link to customer" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Party name + phone */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="party_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Party name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Who to/from?" disabled={isPending} autoFocus={isEdit} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="party_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="borrow_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{currentType === 'lend' ? 'Lent on' : 'Borrowed on'} <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="date" disabled={isPending || isEdit} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expected_return_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected return <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="date" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} placeholder="Any additional notes…" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="bl-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
