import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import AnimatedCard from '@/components/shared/AnimatedCard'
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
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-8 w-8 rounded-xl shrink-0" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <AnimatedCard onClick={onClick} className={cn(onClick && 'cursor-pointer')}>
      <Card className="shadow-card border-border/70 overflow-hidden">
        <CardContent className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">
              {label}
            </p>
            <p className="mt-1 text-lg sm:text-2xl font-bold tracking-tight text-foreground tabular-nums truncate">
              {value}
            </p>
            {trendLabel && (
              <div
                className={cn(
                  'mt-1 flex items-center gap-1 text-[10px] sm:text-xs font-medium',
                  trend === 'up'      && 'text-success',
                  trend === 'down'    && 'text-destructive',
                  trend === 'neutral' && 'text-muted-foreground',
                )}
              >
                <TrendIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                <span className="truncate">{trendLabel}</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              'flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl',
              iconBg,
            )}
          >
            <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', iconColor)} />
          </div>
        </div>
      </CardContent>
      </Card>
    </AnimatedCard>
  )
}
