import { useMemo } from 'react'
import { Package, ShoppingCart, Wrench, AlertTriangle, RotateCcw, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useStockSummary } from '@/hooks/useDevices'
import { cn } from '@/lib/utils'

const buckets = [
  { key: 'in_stock',  label: 'Available', icon: Package,       color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/40', ring: 'ring-emerald-200/60 dark:ring-emerald-800/40' },
  { key: 'sold',      label: 'Sold',      icon: ShoppingCart,  color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/40',       ring: 'ring-blue-200/60 dark:ring-blue-800/40' },
  { key: 'repair',    label: 'In Repair', icon: Wrench,        color: 'text-violet-600',  bg: 'bg-violet-50 dark:bg-violet-950/40',   ring: 'ring-violet-200/60 dark:ring-violet-800/40' },
  { key: 'returned',  label: 'Returned',  icon: RotateCcw,     color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/40',     ring: 'ring-amber-200/60 dark:ring-amber-800/40' },
  { key: 'defective', label: 'Defective', icon: AlertTriangle, color: 'text-rose-600',    bg: 'bg-rose-50 dark:bg-rose-950/40',       ring: 'ring-rose-200/60 dark:ring-rose-800/40' },
  { key: 'total',     label: 'Total',     icon: XCircle,       color: 'text-slate-600',   bg: 'bg-slate-100 dark:bg-slate-800/60',    ring: 'ring-slate-200/60 dark:ring-slate-700/40' },
] as const

type BucketKey = typeof buckets[number]['key']

export default function StockSummaryCard() {
  const { data, isLoading } = useStockSummary()

  // Aggregate counts across all product rows
  const totals = useMemo<Record<BucketKey, number>>(() => {
    const rows = data?.rows ?? []
    return {
      in_stock:  rows.reduce((s, r) => s + r.in_stock,  0),
      sold:      rows.reduce((s, r) => s + r.sold,      0),
      repair:    rows.reduce((s, r) => s + r.repair,    0),
      returned:  rows.reduce((s, r) => s + r.returned,  0),
      defective: rows.reduce((s, r) => s + r.defective, 0),
      total:     data?.total_units ?? 0,
    }
  }, [data])

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
      {buckets.map(({ key, label, icon: Icon, color, bg, ring }) => (
        <Card key={key} className="shadow-card border-border/70">
          <CardContent className="flex flex-col items-center gap-1.5 p-3 text-center">
            {isLoading ? (
              <>
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-14" />
              </>
            ) : (
              <>
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full ring-1',
                    bg, ring,
                  )}
                >
                  <Icon className={cn('h-4 w-4', color)} />
                </div>
                <span className="text-xl font-bold leading-none tracking-tight">
                  {totals[key]}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
