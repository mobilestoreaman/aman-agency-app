import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export default function AnimatedCard({ children, className, onClick }: Props) {
  return (
    <div
      className={cn(
        'transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5 active:scale-[0.99]',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
