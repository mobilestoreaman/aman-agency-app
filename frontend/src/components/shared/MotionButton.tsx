import { forwardRef } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MotionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, size, ...props }, ref) => {
    const isSmallSize = size === 'sm' || size === 'icon'

    return (
      <div
        className={cn(
          !isSmallSize && 'active:scale-[0.97] transition-transform',
        )}
      >
        <Button
          ref={ref}
          {...props}
          size={size}
          className={className}
        >
          {children}
        </Button>
      </div>
    )
  },
)

MotionButton.displayName = 'MotionButton'

export default MotionButton
