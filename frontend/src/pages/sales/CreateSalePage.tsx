import { useState } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Loader2, Cpu, PackageX,
  Search, ShoppingCart, ScanLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import PageHeader from '@/components/shared/PageHeader'
import BarcodeScanner from '@/components/shared/BarcodeScanner'
import { useCustomers } from '@/hooks/useCustomers'
import { useDeviceByIMEI, useDevices } from '@/hooks/useDevices'
import { useCreateSale } from '@/hooks/useSales'
import { formatCurrency } from '@/utils/currency'
import { useDebounce } from '@/hooks/useDebounce'

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayValue() { return format(new Date(), 'yyyy-MM-dd') }
function toISODate(d: string) {
  if (!d) return new Date().toISOString()
  return new Date(d + 'T00:00:00').toISOString()
}

// ── Schema ────────────────────────────────────────────────────────────────────
const itemSchema = z.object({
  device_id:    z.string().min(1),
  imei:         z.string(),
  product_name: z.string(),
  sale_price:   z.coerce.number().min(0),
})

const schema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  sale_date:   z.string().min(1, 'Date is required'),
  amount_paid: z.coerce.number().min(0).default(0),
  notes:       z.string().max(500).optional().or(z.literal('')),
  items:       z.array(itemSchema).min(1, 'Add at least one device'),
})
type FormValues = z.infer<typeof schema>

// ── IMEI quick-add bar ────────────────────────────────────────────────────────
function ImeiAddBar({ onAdd }: {
  onAdd: (d: { device_id: string; imei: string; product_name: string; sale_price: number }) => void
}) {
  const [imei, setImei]         = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const debouncedImei           = useDebounce(imei, 400)
  const { data: device, isFetching, isError } = useDeviceByIMEI(debouncedImei)

  const handleAdd = () => {
    if (!device) return
    onAdd({
      device_id:    device.id,
      imei:         device.imei1,
      product_name: device.product_name,
      sale_price:   device.selling_price,
    })
    setImei('')
  }

  const handleScan = (code: string) => {
    setImei(code)
    setScanOpen(false)
  }

  const ready    = !!device && device.status === 'available'
  const notAvail = !!device && device.status !== 'available'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Scan or type IMEI / serial…"
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ready && handleAdd()}
            className="pl-9 font-mono"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {/* Camera scanner toggle */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Scan with camera"
          onClick={() => setScanOpen((v) => !v)}
        >
          <ScanLine className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          disabled={!ready}
          className="shrink-0 gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Camera scanner panel */}
      {scanOpen && (
        <BarcodeScanner
          open={scanOpen}
          onDetect={handleScan}
          onClose={() => setScanOpen(false)}
        />
      )}

      {device && (
        <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm">
          {ready ? (
            <>
              <span className="truncate font-medium">{device.product_name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{device.imei1}</span>
              <Badge variant="success" className="shrink-0 text-xs">Available</Badge>
            </>
          ) : (
            <>
              <PackageX className="h-4 w-4 shrink-0 text-destructive" />
              <span className="text-destructive">Not available ({device.status})</span>
            </>
          )}
        </div>
      )}
      {isError && imei.length >= 10 && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <PackageX className="h-3.5 w-3.5" /> Not found
        </p>
      )}
    </div>
  )
}

// ── Dropdown device picker ────────────────────────────────────────────────────
function DevicePickerBar({ onAdd }: {
  onAdd: (d: { device_id: string; imei: string; product_name: string; sale_price: number }) => void
}) {
  const [search, setSearch] = useState('')
  const q = useDebounce(search, 300)
  const { data } = useDevices({ limit: 40, status: 'available', search: q || undefined })
  const devices = data?.data ?? []

  return (
    <div className="relative flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search available devices by name or IMEI…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      {devices.length > 0 && search.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {devices.map((d) => (
            <button
              key={d.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent"
              onClick={() => {
                onAdd({ device_id: d.id, imei: d.imei1, product_name: d.product_name, sale_price: d.selling_price })
                setSearch('')
              }}
            >
              <span className="truncate font-medium">{d.product_name}</span>
              <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">{d.imei1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CreateSalePage() {
  const navigate = useNavigate()
  const createSale = useCreateSale()

  const { data: customersData } = useCustomers({ limit: 200 })
  const customers = customersData?.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: '',
      sale_date:   todayValue(),
      amount_paid: 0,
      notes:       '',
      items:       [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })
  const watchedItems      = useWatch({ control: form.control, name: 'items' }) ?? []
  const watchedAmountPaid = useWatch({ control: form.control, name: 'amount_paid' }) ?? 0

  const total   = Math.round(watchedItems.reduce((s, i) => s + (Number(i.sale_price) || 0), 0) * 100) / 100
  const balance = Math.round(Math.max(0, total - Number(watchedAmountPaid)) * 100) / 100

  const addDevice = (d: { device_id: string; imei: string; product_name: string; sale_price: number }) => {
    if (fields.some((f) => f.device_id === d.device_id)) return
    append({ ...d })
  }

  const onSubmit = (values: FormValues) => {
    createSale.mutate(
      {
        customer_id: values.customer_id,
        sold_at:     toISODate(values.sale_date),
        amount_paid: values.amount_paid,
        notes:       values.notes || undefined,
        items:       values.items.map((i) => ({
          device_id:  i.device_id,
          sale_price: i.sale_price,
        })),
      },
      { onSuccess: () => navigate('/sales') },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => navigate('/sales')}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title="New Sale"
          description="Add devices to the sale, select a customer, and record payment."
        />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left: devices */}
            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Devices
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* IMEI scanner */}
                  <ImeiAddBar onAdd={addDevice} />

                  {/* Device search */}
                  <DevicePickerBar onAdd={addDevice} />

                  {/* Items list */}
                  {fields.length > 0 ? (
                    <div className="divide-y rounded-md border">
                      {fields.map((field, idx) => (
                        <div key={field.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{field.product_name}</p>
                            {field.imei && (
                              <p className="font-mono text-xs text-muted-foreground">{field.imei}</p>
                            )}
                          </div>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.sale_price`}
                            render={({ field: f }) => (
                              <FormItem className="w-28">
                                <FormControl>
                                  <Input
                                    type="number" min={0} step="0.01"
                                    className="h-8 text-right font-mono"
                                    {...f}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <Button
                            type="button"
                            variant="ghost" size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => remove(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      No devices added yet. Scan an IMEI or search above.
                    </p>
                  )}

                  {form.formState.errors.items?.root && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.items.root.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: sale details */}
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Sale Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="customer_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                              {c.credit_balance > 0 && (
                                <span className="ml-2 text-xs text-amber-600">
                                  ({formatCurrency(c.credit_balance)} due)
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sale_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sale Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="amount_paid" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount Paid (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes <span className="text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Any remarks…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              {/* Totals summary */}
              <Card>
                <CardContent className="pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total ({fields.length} item{fields.length !== 1 ? 's' : ''})</span>
                    <span className="font-mono">{formatCurrency(total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Amount paid</span>
                    <span className="font-mono">{formatCurrency(Number(watchedAmountPaid) || 0)}</span>
                  </div>
                  <Separator />
                  <div className={`flex justify-between font-bold text-base ${balance > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    <span>{balance > 0 ? 'Balance due' : 'Fully paid'}</span>
                    <span className="font-mono">{formatCurrency(balance)}</span>
                  </div>

                  <Button
                    type="submit"
                    className="mt-3 w-full gap-2"
                    disabled={createSale.isPending || fields.length === 0}
                  >
                    {createSale.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                      : <><ShoppingCart className="h-4 w-4" /> Record Sale</>
                    }
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}
