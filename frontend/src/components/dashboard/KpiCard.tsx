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
      <Card className="shadow-card border-border/70">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2.5 min-w-0">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
            <Skeleton className="h-10 w-10 rounded-2xl shrink-0" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <AnimatedCard onClick={onClick} className={cn(onClick && 'cursor-pointer')}>
      <Card className="shadow-card border-border/70">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest leading-none">
                {label}
              </p>
              <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none [word-break:break-word]">
                {value}
              </p>
              {trendLabel && (
                <div
                  className={cn(
                    'mt-2 flex items-center gap-1 text-xs font-medium',
                    trend === 'up'      && 'text-success',
                    trend === 'down'    && 'text-destructive',
                    trend === 'neutral' && 'text-muted-foreground',
                  )}
                >
                  <TrendIcon className="h-3 w-3 shrink-0" />
                  <span className="leading-none">{trendLabel}</span>
                </div>
              )}
            </div>
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                iconBg,
              )}
            >
              <Icon className={cn('h-5 w-5', iconColor)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </AnimatedCard>
  )
}
