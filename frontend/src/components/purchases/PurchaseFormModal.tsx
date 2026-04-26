import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BarcodeScannerButton } from '@/components/shared/BarcodeScanner'
import { useVendors } from '@/hooks/useVendors'
import { useProducts } from '@/hooks/useProducts'
import { useCreatePurchase, useUpdatePurchase } from '@/hooks/usePurchases'
import type { Purchase } from '@/types'

const CONDITIONS = [
  { value: 'new',         label: 'New' },
  { value: 'used',        label: 'Used' },
  { value: 'refurbished', label: 'Refurbished' },
] as const

const schema = z.object({
  vendor_id:      z.string().min(1, 'Vendor is required'),
  product_id:     z.string().min(1, 'Product is required'),
  imei1:          z.string()
    .min(14, 'IMEI must be 14–16 digits')
    .max(16, 'IMEI must be 14–16 digits')
    .regex(/^\d+$/, 'IMEI must contain only digits'),
  imei2:          z.string()
    .min(14).max(16)
    .regex(/^\d+$/, 'IMEI must contain only digits')
    .optional()
    .or(z.literal('')),
  condition:      z.enum(['new', 'used', 'refurbished'], {
    required_error: 'Condition is required',
  }),
  color:          z.string().max(50).optional().or(z.literal('')),
  storage:        z.string().max(20).optional().or(z.literal('')),
  purchase_price: z.coerce.number().min(0, 'Price must be ≥ 0').max(10_000_000, 'Price seems unrealistically large'),
  selling_price:  z.coerce.number().min(0.01, 'Selling price must be greater than 0').max(10_000_000, 'Price seems unrealistically large').optional(),
  purchased_at:   z.string().optional(),
  notes:          z.string().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open:      boolean
  onClose:   () => void
  purchase?: Purchase | null   // present → edit mode
}

function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Convert an ISO datetime string from the backend to YYYY-MM-DD for the date input. */
function isoToInputDate(iso: string): string {
  if (!iso) return todayInputValue()
  return iso.split('T')[0]
}

export default function PurchaseFormModal({ open, onClose, purchase }: Props) {
  const isEdit = !!purchase
  const create = useCreatePurchase()
  const update = useUpdatePurchase()
  const isPending = create.isPending || update.isPending

  const { data: vendorsData } = useVendors({ limit: 200 })
  const vendors = vendorsData?.data ?? []

  const { data: productsData } = useProducts({ limit: 200 })
  const products = productsData?.data ?? []

  // Derive defaults from the first item when editing
  const firstItem = purchase?.items?.[0]

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vendor_id: '', product_id: '', imei1: '', imei2: '',
      condition: 'new', color: '', storage: '', purchase_price: 0, selling_price: 0,
      purchased_at: todayInputValue(), notes: '',
    },
  })

  // Reset whenever the dialog opens or the purchase being edited changes
  useEffect(() => {
    if (open) {
      form.reset({
        vendor_id:      purchase?.vendor_id      ?? '',
        product_id:     firstItem?.product_id    ?? '',
        imei1:          firstItem?.imei1         ?? '',
        imei2:          firstItem?.imei2         ?? '',
        condition:      (firstItem?.condition as 'new' | 'used' | 'refurbished') ?? 'new',
        color:          firstItem?.color         ?? '',
        storage:        firstItem?.storage       ?? '',
        purchase_price: firstItem?.purchase_price ?? 0,
        selling_price:  firstItem?.selling_price  ?? 0,
        purchased_at:   purchase ? isoToInputDate(purchase.purchased_at) : todayInputValue(),
        notes:          purchase?.notes          ?? '',
      })
    }
  }, [open, purchase]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (values: FormValues) => {
    const purchased_at = values.purchased_at
      ? new Date(values.purchased_at + 'T00:00:00').toISOString()
      : undefined

    const item = {
      product_id:     values.product_id,
      imei1:          values.imei1,
      imei2:          values.imei2    || undefined,
      condition:      values.condition,
      color:          values.color    || undefined,
      storage:        values.storage  || undefined,
      purchase_price: values.purchase_price,
      selling_price:  values.selling_price || undefined,
    }

    if (isEdit && purchase) {
      update.mutate(
        {
          id:          purchase.id,
          vendor_id:   values.vendor_id,
          items:       [item],
          purchased_at,
          notes:       values.notes || undefined,
        },
        { onSuccess: () => { form.reset(); onClose() } },
      )
    } else {
      create.mutate(
        {
          vendor_id:   values.vendor_id,
          items:       [item],
          purchased_at,
          notes:       values.notes || undefined,
        },
        { onSuccess: () => { form.reset(); onClose() } },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? 'Edit Purchase' : 'Record Purchase'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
          <Form {...form}>
            <form id="purchase-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

              {/* Vendor */}
              <FormField
                control={form.control}
                name="vendor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Product */}
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.brand_name} — {p.display_name || p.model_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* IMEI 1 + IMEI 2 */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="imei1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IMEI 1 <span className="text-destructive">*</span></FormLabel>
                      <div className="flex gap-1.5">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="14–16 digit IMEI"
                            maxLength={16}
                            inputMode="numeric"
                            disabled={isPending}
                          />
                        </FormControl>
                        <BarcodeScannerButton
                          hint="Scan IMEI 1"
                          onScan={(code) => field.onChange(code.replace(/\D/g, '').slice(0, 16))}
                          label=""
                          className="shrink-0 px-2"
                        />
                      </div>
                      <FormDescription className="text-xs">Primary IMEI or serial number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="imei2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IMEI 2 <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <div className="flex gap-1.5">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Dual-SIM second IMEI"
                            maxLength={16}
                            inputMode="numeric"
                            disabled={isPending}
                          />
                        </FormControl>
                        <BarcodeScannerButton
                          hint="Scan IMEI 2"
                          onScan={(code) => field.onChange(code.replace(/\D/g, '').slice(0, 16))}
                          label=""
                          className="shrink-0 px-2"
                        />
                      </div>
                      <FormDescription className="text-xs">Only for dual-SIM devices</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Condition + Color + Storage */}
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONDITIONS.map(({ value, label }) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Phantom Black" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="storage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Storage <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. 128GB" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Purchase price + Selling price + Date */}
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="purchase_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost price (₹) <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} step="0.01" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="selling_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selling price (₹) <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0.01} step="0.01" disabled={isPending} placeholder="0.00" />
                      </FormControl>
                      <FormDescription className="text-xs">Pre-fills device listing</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purchased_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase date <span className="text-destructive">*</span></FormLabel>
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
          <Button type="submit" form="purchase-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Record purchase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
