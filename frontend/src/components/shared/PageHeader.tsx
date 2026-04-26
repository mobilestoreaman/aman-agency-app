import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export default function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {action && (
        <div className="mt-3 shrink-0 sm:mt-0">{action}</div>
      )}
    </div>
  )
}
