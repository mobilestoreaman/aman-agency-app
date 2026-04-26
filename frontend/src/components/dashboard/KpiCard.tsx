import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  iconBg?: string
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  isLoading?: boolean
  onClick?: () => void
}

export default function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor = 'text-primary',
  iconBg   = 'bg-primary/10',
  trend,
  trendLabel,
  isLoading,
  onClick,
}: KpiCardProps) {
  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <Card
      className={cn(
        'shadow-card border-border/70 transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-elevated hover:-translate-y-0.5',
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {value}
            </p>
            {trendLabel && (
              <div
                className={cn(
                  'mt-1.5 flex items-center gap-1 text-xs font-medium',
                  trend === 'up'      && 'text-emerald-600 dark:text-emerald-400',
                  trend === 'down'    && 'text-destructive',
                  trend === 'neutral' && 'text-muted-foreground',
                )}
              >
                <TrendIcon className="h-3 w-3 shrink-0" />
                <span>{trendLabel}</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              iconBg,
            )}
          >
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
