import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useChangeDeviceStatus, DEVICE_STATUSES } from '@/hooks/useDevices'
import type { Device, DeviceStatus } from '@/types'

const schema = z.object({
  status: z.enum(['available', 'sold', 'repair', 'returned', 'defective']),
  notes:  z.string().max(300).optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open:    boolean
  onClose: () => void
  device:  Device | null
}

const STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Available',
  sold:      'Sold',
  repair:    'In Repair',
  defective: 'Defective',
  returned:  'Returned',
}

export default function StatusChangeModal({ open, onClose, device }: Props) {
  const changeStatus = useChangeDeviceStatus()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'available', notes: '' },
  })

  useEffect(() => {
    if (device) {
      form.reset({ status: device.status, notes: '' })
    }
  }, [device, form])

  const onSubmit = (values: FormValues) => {
    if (!device) return
    changeStatus.mutate(
      { id: device.id, status: values.status, notes: values.notes || undefined },
      { onSuccess: () => { form.reset(); onClose() } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Device Status</DialogTitle>
        </DialogHeader>

        {device && (
          <p className="text-sm text-muted-foreground">
            IMEI: <span className="font-mono font-medium text-foreground">{device.imei1}</span>
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New status <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
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

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="Reason for status change…"
                      disabled={changeStatus.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={changeStatus.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={changeStatus.isPending}>
                {changeStatus.isPending && <Loader2 className="animate-spin" />}
                Update status
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
