/**
 * PhoneInput
 * ----------
 * A phone number input that shows a fixed "+91" country-code badge on the left.
 * The parent form stores the full E.164 value ("+91XXXXXXXXXX") but the user
 * only types the 10-digit local number — no country code needed.
 *
 * Behaviour:
 *  • Strips "+91" (or "91") prefix from an incoming value before display
 *  • Accepts only numeric characters (non-digits are filtered on input)
 *  • Emits the full "+91XXXXXXXXXX" string (or "+91" when empty) via onChange
 *  • Forwards all standard InputHTMLAttributes (disabled, autoFocus, etc.)
 *
 * Usage (react-hook-form):
 *   <PhoneInput
 *     value={field.value}
 *     onChange={field.onChange}
 *     onBlur={field.onBlur}
 *     disabled={isPending}
 *   />
 */
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const COUNTRY_CODE = '+91'

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value?: string
  onChange?: (value: string) => void
}

/** Strip the country code prefix so we display only the local digits. */
function toLocal(full: string): string {
  if (!full) return ''
  // Handle "+91...", "91...", or bare digits
  if (full.startsWith(COUNTRY_CODE)) return full.slice(COUNTRY_CODE.length)
  if (full.startsWith('91') && full.length > 10) return full.slice(2)
  return full
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, className, disabled, ...rest }, ref) => {
    const localValue = toLocal(value)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Strip all non-digit characters from what the user types
      const digits = e.target.value.replace(/\D/g, '')
      // Cap at 10 digits (standard Indian mobile number length)
      const capped = digits.slice(0, 10)
      onChange?.(capped ? `${COUNTRY_CODE}${capped}` : '')
    }

    return (
      <div className={cn('flex rounded-md shadow-sm', className)}>
        {/* Country code badge */}
        <span
          className={cn(
            'inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted',
            'px-3 text-sm font-medium text-muted-foreground select-none',
            disabled && 'opacity-50',
          )}
        >
          {COUNTRY_CODE}
        </span>

        {/* Number input */}
        <input
          {...rest}
          ref={ref}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          value={localValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder="98765 43210"
          className={cn(
            'flex h-10 w-full min-w-0 flex-1 rounded-r-md border border-input bg-background',
            'px-3 py-2 text-sm ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>
    )
  },
)

PhoneInput.displayName = 'PhoneInput'
