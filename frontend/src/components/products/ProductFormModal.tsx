import { useEffect, useState, useId } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Camera, ImagePlus, X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
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
import { useBrands } from '@/hooks/useBrands'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { uploadApi } from '@/api/upload'
import { toast } from 'sonner'
import type { Product } from '@/types'

const BARCODE_TYPES   = ['AUTO', 'EAN-13', 'UPC-A', 'CODE-128', 'CODE-39', 'QR'] as const
const RAM_OPTIONS     = ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '24GB', '32GB', 'N/A'] as const
const STORAGE_OPTIONS = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB', 'N/A'] as const
const MAX_IMAGES = 3

const ACCESSORIES = [
  { name: 'has_charger'   as const, label: 'Charger'      },
  { name: 'has_earphones' as const, label: 'Earphones'    },
  { name: 'has_cable'     as const, label: 'USB Cable'    },
  { name: 'has_box'       as const, label: 'Original Box' },
]

const schema = z.object({
  brand_id:      z.string().min(1, 'Brand is required'),
  model_name:    z.string().min(1, 'Model name is required').max(200),
  ram:           z.string().min(1, 'RAM is required').max(20),
  storage:       z.string().min(1, 'Storage is required').max(20),
  color:         z.string().min(1, 'Color is required').max(50),
  screen_size:   z.string().max(20).optional().or(z.literal('')),
  barcode:       z.string().min(1, 'Barcode is required').max(100),
  barcode_type:  z.string().optional().or(z.literal('')),
  has_charger:   z.boolean(),
  has_earphones: z.boolean(),
  has_cable:     z.boolean(),
  has_box:       z.boolean(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  product?: Product | null
}

// ── Shared field label ───────────────────────────────────────────────────────
function FL({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <span className="text-sm font-medium leading-none">
      {children}
      {optional
        ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
        : <span className="ml-0.5 text-destructive text-xs">*</span>
      }
    </span>
  )
}

// ── Single image slot ────────────────────────────────────────────────────────
// Uses <label> wrapping so the user's click goes directly to the file input
// with no programmatic .click() — this is more reliable inside Radix portals
// and avoids issues with focus traps blocking synthetic events.
function ImageSlot({
  url,
  index,
  uploading,
  hasCamera,
  onFile,
  onRemove,
}: {
  url?: string
  index: number
  uploading: boolean
  hasCamera: boolean
  onFile: (file: File | null, source: 'camera' | 'gallery') => void
  onRemove: () => void
}) {
  const cameraId = useId()
  const galleryId = useId()

  if (url) {
    return (
      <div className="group relative aspect-square rounded-lg border overflow-hidden bg-muted/30">
        <img
          src={url}
          alt={`Product photo ${index + 1}`}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="Remove image"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="absolute bottom-1 left-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white">
          {index + 1}
        </div>
      </div>
    )
  }

  return (
    <div className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 flex flex-col items-center justify-center gap-2">
      {uploading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
            Photo {index + 1}
          </p>
          <div className="flex gap-1.5">
            {/* Camera — only shown when device has a camera */}
            {hasCamera && (
              <label
                htmlFor={cameraId}
                title="Take photo"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border bg-background hover:bg-muted transition-colors"
              >
                <Camera className="h-4 w-4 text-muted-foreground" />
                <input
                  id={cameraId}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    onFile(e.target.files?.[0] ?? null, 'camera')
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            {/* Gallery / file picker */}
            <label
              htmlFor={galleryId}
              title="Choose from gallery"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border bg-background hover:bg-muted transition-colors"
            >
              <ImagePlus className="h-4 w-4 text-muted-foreground" />
              <input
                id={galleryId}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  onFile(e.target.files?.[0] ?? null, 'gallery')
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ProductFormModal({ open, onClose, product }: Props) {
  const isEdit    = !!product
  const create    = useCreateProduct()
  const update    = useUpdateProduct()
  const isPending = create.isPending || update.isPending

  const [scanOpen, setScanOpen]     = useState(false)
  const [images, setImages]         = useState<(string | undefined)[]>([undefined, undefined, undefined])
  const [uploading, setUploading]   = useState<boolean[]>([false, false, false])
  const [hasCamera, setHasCamera]   = useState(false)

  // Detect camera availability once on mount
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((devices) => setHasCamera(devices.some((d) => d.kind === 'videoinput')))
      .catch(() => setHasCamera(false))
  }, [])

  const { data: brandsData } = useBrands({ limit: 100 })
  const brands = brandsData?.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      brand_id: '', model_name: '', ram: '', storage: '', color: '',
      screen_size: '', barcode: '', barcode_type: '',
      has_charger: false, has_earphones: false, has_cable: false, has_box: false,
    },
  })

  useEffect(() => {
    if (!open) return
    form.reset(product ? {
      brand_id:      product.brand_id,
      model_name:    product.model_name,
      ram:           product.variant?.ram      ?? '',
      storage:       product.variant?.storage  ?? '',
      color:         product.color,
      screen_size:   product.screen_size       ?? '',
      barcode:       product.barcode,
      barcode_type:  product.barcode_type      ?? '',
      has_charger:   product.accessories?.has_charger   ?? false,
      has_earphones: product.accessories?.has_earphones ?? false,
      has_cable:     product.accessories?.has_cable     ?? false,
      has_box:       product.accessories?.has_box       ?? false,
    } : {
      brand_id: '', model_name: '', ram: '', storage: '', color: '',
      screen_size: '', barcode: '', barcode_type: '',
      has_charger: false, has_earphones: false, has_cable: false, has_box: false,
    })

    // Populate existing images when editing
    const existing = product?.images ?? []
    setImages([existing[0], existing[1], existing[2]])
    setUploading([false, false, false])
  }, [product, open, form])

  // ── Image upload helpers ─────────────────────────────────────────────────
  const handleFileSelected = async (file: File | null, slotIndex: number) => {
    if (!file) return
    setUploading((prev) => { const next = [...prev]; next[slotIndex] = true; return next })
    try {
      const res = await uploadApi.productImage(file)
      const url = res.data.data.url
      setImages((prev) => { const next = [...prev]; next[slotIndex] = url; return next })
    } catch {
      toast.error('Failed to upload image — please try again')
    } finally {
      setUploading((prev) => { const next = [...prev]; next[slotIndex] = false; return next })
    }
  }

  const removeImage = (slotIndex: number) => {
    setImages((prev) => { const next = [...prev]; next[slotIndex] = undefined; return next })
  }

  // ── Form submit ──────────────────────────────────────────────────────────
  const onSubmit = (values: FormValues) => {
    const cleanImages = images.filter((u): u is string => !!u)
    const payload = {
      brand_id:     values.brand_id,
      model_name:   values.model_name,
      variant:      { ram: values.ram, storage: values.storage },
      color:        values.color,
      screen_size:  values.screen_size  || undefined,
      barcode:      values.barcode,
      barcode_type: values.barcode_type || undefined,
      accessories:  {
        has_charger:   values.has_charger,
        has_earphones: values.has_earphones,
        has_cable:     values.has_cable,
        has_box:       values.has_box,
      },
      images: cleanImages,
    }
    const mutation = isEdit
      ? update.mutateAsync({ id: product!.id, ...payload })
      : create.mutateAsync(payload as Parameters<typeof create.mutateAsync>[0])
    mutation.then(() => { form.reset(); onClose() })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 px-5 pt-5 pb-4">
          <DialogTitle className="text-base font-semibold">
            {isEdit ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <ScrollArea className="flex-1 overflow-auto">
          <Form {...form}>
            <form id="product-form" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="px-5 pb-5 space-y-4">

                {/* Row 1 — Brand + Model */}
                <div className="grid grid-cols-[180px_1fr] gap-3">
                  <FormField control={form.control} name="brand_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL>Brand</FL></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="model_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL>Model name</FL></FormLabel>
                      <FormControl>
                        <Input {...field} className="h-9" placeholder="e.g. Galaxy S24 Ultra" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Row 2 — RAM + Storage + Color + Screen */}
                <div className="grid grid-cols-4 gap-3">
                  <FormField control={form.control} name="ram" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL>RAM</FL></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RAM_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="storage" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL>Storage</FL></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isPending}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STORAGE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="color" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL>Color</FL></FormLabel>
                      <FormControl>
                        <Input {...field} className="h-9" placeholder="Black" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="screen_size" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL optional>Screen</FL></FormLabel>
                      <FormControl>
                        <Input {...field} className="h-9" placeholder='6.8"' disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Row 3 — Barcode */}
                <div className="grid grid-cols-[1fr_160px] gap-3">
                  <FormField control={form.control} name="barcode" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL>Barcode</FL></FormLabel>
                      <div className="flex gap-1.5">
                        <FormControl>
                          <Input
                            {...field}
                            className="h-9 font-mono"
                            placeholder="Scan or type…"
                            disabled={isPending}
                          />
                        </FormControl>
                        <Button
                          type="button" variant="outline" size="sm"
                          className="h-9 shrink-0 gap-1.5 px-3"
                          onClick={() => setScanOpen(true)}
                          disabled={isPending}
                        >
                          <Camera className="h-3.5 w-3.5" />
                          Scan
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="barcode_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel><FL optional>Type</FL></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={isPending}>
                        <FormControl>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Auto" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BARCODE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t === 'AUTO' ? 'Auto-detect' : t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Row 4 — Accessories */}
                <div>
                  <p className="mb-2 text-sm font-medium">
                    In the box
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ACCESSORIES.map(({ name, label }) => (
                      <Controller
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => field.onChange(!field.value)}
                            className={cn(
                              'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                              field.value
                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground',
                            )}
                          >
                            {label}
                          </button>
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Row 5 — Product Photos ──────────────────────────────── */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Product Photos
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        (optional — up to {MAX_IMAGES})
                      </span>
                    </p>
                    {images.some(Boolean) && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => setImages([undefined, undefined, undefined])}
                      >
                        <Trash2 className="h-3 w-3" /> Clear all
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: MAX_IMAGES }).map((_, i) => (
                      <ImageSlot
                        key={i}
                        index={i}
                        url={images[i]}
                        uploading={uploading[i]}
                        hasCamera={hasCamera}
                        onFile={(file) => handleFileSelected(file, i)}
                        onRemove={() => removeImage(i)}
                      />
                    ))}
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {hasCamera
                      ? '📷 Camera button opens your device camera · 🖼 Gallery button picks from files.'
                      : '🖼 Click the gallery icon to pick an image file (JPEG, PNG, or WebP, max 5 MB).'}
                  </p>
                </div>

              </div>
            </form>
          </Form>
        </ScrollArea>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <DialogFooter className="shrink-0 border-t px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="product-form"
            disabled={isPending || uploading.some(Boolean)}
            className="min-w-[120px]"
          >
            {isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : uploading.some(Boolean)
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Uploading…</>
                : (isEdit ? 'Save changes' : 'Create product')
            }
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Barcode scanner */}
      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        hint="Scan product barcode"
        onDetect={(code) => {
          form.setValue('barcode', code, { shouldValidate: true })
          setScanOpen(false)
        }}
      />
    </Dialog>
  )
}
