import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { useCreateBrand, useUpdateBrand } from '@/hooks/useBrands'
import type { Brand } from '@/types'

const schema = z.object({
  name:     z.string().min(1, 'Brand name is required').max(80),
  logo_url: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  brand?: Brand | null   // present = edit mode
}

export default function BrandFormModal({ open, onClose, brand }: Props) {
  const isEdit = !!brand
  const create = useCreateBrand()
  const update = useUpdateBrand()
  const isPending = create.isPending || update.isPending

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', logo_url: '' },
  })

  // Populate on edit
  useEffect(() => {
    if (brand) {
      form.reset({ name: brand.name, logo_url: brand.logo_url ?? '' })
    } else {
      form.reset({ name: '', logo_url: '' })
    }
  }, [brand, form])

  const onSubmit = (values: FormValues) => {
    const payload = { name: values.name, logo_url: values.logo_url || undefined }
    const mutation = isEdit
      ? update.mutateAsync({ id: brand!.id, ...payload })
      : create.mutateAsync(payload)

    mutation.then(() => {
      form.reset()
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Brand' : 'New Brand'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand name <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Samsung" disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="logo_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://…" type="url" disabled={isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" />}
                {isEdit ? 'Save changes' : 'Create brand'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
