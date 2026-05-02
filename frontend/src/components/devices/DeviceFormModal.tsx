import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Camera } from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { BarcodeScanner } from '@/components/shared/BarcodeScanner'
import { useProducts } from '@/hooks/useProducts'
import { useCreateDevice, useUpdateDevice, DEVICE_STATUSES, STORAGE_OPTIONS } from '@/hooks/useDevices'
import type { Device, DeviceCondition, DeviceStatus } from '@/types'

const CONDITION_OPTIONS: { value: DeviceCondition; label: string }[] = [
  { value: 'new',         label: 'New' },
  { value: 'used',        label: 'Used' },
  { value: 'refurbished', label: 'Refurbished' },
]

const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Available',
  sold:      'Sold',
  repair:    'In Repair',
  defective: 'Defective',
  returned:  'Returned',
}

const schema = z.object({
  product_id:     z.string().min(1, 'Product is required'),
  imei1:          z.string().length(15, 'IMEI must be exactly 15 digits').regex(/^\d+$/, 'IMEI must contain only digits'),
  imei2:          z.string().length(15, 'IMEI must be exactly 15 digits').regex(/^\d+$/, 'IMEI must contain only digits').optional().or(z.literal('')),
  condition:      z.enum(['new', 'used', 'refurbished']),
  color:          z.string().max(40).optional().or(z.literal('')),
  storage:        z.string().optional().or(z.literal('')),
  purchase_price: z.coerce.number().min(0.01, 'Purchase price must be greater than 0').max(10_000_000, 'Price seems unrealistically large'),
  selling_price:  z.coerce.number().min(0.01, 'Selling price must be greater than 0').max(10_000_000, 'Price seems unrealistically large'),
  status:         z.enum(['available', 'sold', 'repair', 'returned', 'defective']),
  notes:          z.string().max(500).optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open:    boolean
  onClose: () => void
  device?: Device | null
}

export default function DeviceFormModal({ open, onClose, device }: Props) {
  const isEdit    = !!device
  const create    = useCreateDevice()
  const update    = useUpdateDevice()
  const isPending = create.isPending || update.isPending

  // Barcode scanner — track which field is being scanned ('imei1' | 'imei2' | null)
  const [scanField, setScanField] = useState<'imei1' | 'imei2' | null>(null)

  const { data: productsData } = useProducts({ limit: 200 })
  const products = productsData?.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      product_id: '', imei1: '', imei2: '', condition: 'new',
      color: '', storage: '', purchase_price: 0, selling_price: 0,
      status: 'available', notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      if (device) {
        form.reset({
          product_id:     device.product_id,
          imei1:          device.imei1,
          imei2:          device.imei2 ?? '',
          condition:      device.condition,
          color:          device.color ?? '',
          storage:        device.storage ?? '',
          purchase_price: device.purchase_price,
          selling_price:  device.selling_price,
          status:         device.status,
          notes:          device.notes ?? '',
        })
      } else {
        form.reset({
          product_id: '', imei1: '', imei2: '', condition: 'new',
          color: '', storage: '', purchase_price: 0, selling_price: 0,
          status: 'available', notes: '',
        })
      }
    }
  }, [open, device, form])

  const onSubmit = (values: FormValues) => {
    const payload = {
      product_id:     values.product_id,
      imei1:          values.imei1,
      imei2:          values.imei2          || undefined,
      condition:      values.condition,
      color:          values.color          || undefined,
      storage:        values.storage        || undefined,
      purchase_price: values.purchase_price,
      selling_price:  values.selling_price,
      notes:          values.notes          || undefined,
      ...(isEdit && { status: values.status }),
    }

    const mutation = isEdit
      ? update.mutateAsync({ id: device!.id, ...payload })
      : create.mutateAsync(payload)

    mutation.then(() => { form.reset(); onClose() })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? 'Edit Device' : 'Add Device'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
          <Form {...form}>
            <form id="device-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

              {/* Product */}
              <FormField
                control={form.control}
                name="product_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isEdit}>
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

              {/* IMEI1 + IMEI2 */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="imei1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IMEI <span className="text-destructive">*</span></FormLabel>
                      <div className="flex gap-1.5">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="15-digit IMEI"
                            maxLength={16}
                            className="font-mono"
                            disabled={isPending}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title="Scan IMEI barcode"
                          disabled={isPending}
                          onClick={() => setScanField('imei1')}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="imei2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        IMEI 2 <span className="text-muted-foreground text-xs">(dual-SIM, optional)</span>
                      </FormLabel>
                      <div className="flex gap-1.5">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Second IMEI"
                            maxLength={16}
                            className="font-mono"
                            disabled={isPending}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title="Scan IMEI 2 barcode"
                          disabled={isPending}
                          onClick={() => setScanField('imei2')}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Condition + Storage */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CONDITION_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                        value={field.value ? field.value : '__none__'}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select storage" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">— None —</SelectItem>
                          {STORAGE_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Color */}
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Midnight Black" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="purchase_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase / cost price (₹) <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0.01} step="0.01" disabled={isPending} />
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
                      <FormLabel>Selling price (₹) <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0.01} step="0.01" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Status — edit mode only */}
              {isEdit && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEVICE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
          <Button type="submit" form="device-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add device'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Barcode scanner dialog — opens over the form when camera button is clicked */}
      <BarcodeScanner
        open={!!scanField}
        onClose={() => setScanField(null)}
        hint={scanField === 'imei1' ? 'Scan IMEI 1 barcode' : 'Scan IMEI 2 barcode'}
        onDetect={(code) => {
          if (scanField) {
            // Strip non-digit chars and trim to 16 chars max
            const imei = code.replace(/\D/g, '').slice(0, 16)
            form.setValue(scanField, imei, { shouldValidate: true })
          }
          setScanField(null)
        }}
      />
    </Dialog>
  )
}
