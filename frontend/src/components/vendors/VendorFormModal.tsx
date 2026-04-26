import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PhoneInput } from '@/components/shared/PhoneInput'
import { PHONE_RE } from '@/utils/validation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCreateVendor, useUpdateVendor } from '@/hooks/useVendors'
import type { Vendor } from '@/types'

const schema = z.object({
  name:    z.string().min(2, 'Vendor name must be at least 2 characters').max(100),
  phone:   z.string().regex(PHONE_RE, 'Enter a valid 10-digit Indian mobile number').optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  notes:   z.string().max(500).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open:    boolean
  onClose: () => void
  vendor?: Vendor | null
}

export default function VendorFormModal({ open, onClose, vendor }: Props) {
  const isEdit    = !!vendor
  const create    = useCreateVendor()
  const update    = useUpdateVendor()
  const isPending = create.isPending || update.isPending

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '+91', address: '', notes: '' },
  })

  useEffect(() => {
    if (vendor) {
      form.reset({
        name:    vendor.name,
        phone:   vendor.phone   ?? '',
        address: vendor.address ?? '',
        notes:   vendor.notes   ?? '',
      })
    } else {
      form.reset({ name: '', phone: '+91', address: '', notes: '' })
    }
  }, [vendor, form])

  const onSubmit = (values: FormValues) => {
    const payload = {
      name:    values.name,
      phone:   values.phone,
      address: values.address || undefined,
      notes:   values.notes   || undefined,
    }
    const mutation = isEdit
      ? update.mutateAsync({ id: vendor!.id, ...payload })
      : create.mutateAsync(payload)

    mutation.then(() => { form.reset(); onClose() })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1">
          <Form {...form}>
            <form id="vendor-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-1">

              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Galaxy Distributors" disabled={isPending} autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
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

              {/* Address */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} placeholder="Street, City, State…" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
          <Button type="submit" form="vendor-form" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add vendor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
