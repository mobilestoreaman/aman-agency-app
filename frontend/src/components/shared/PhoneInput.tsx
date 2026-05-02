/**
 * PhoneInput
 * ----------
 * A phone number input that shows a fixed "+91" country-code badge on the left.
 * The parent form stores the full E.164 value ("+91XXXXXXXXXX") but the user
 * only types/pastes the local 10-digit number — no country code needed.
 *
 * Paste normalisation (the tricky part):
 *  • Uses a dedicated onPaste handler with e.preventDefault() so the browser
 *    never inserts raw clipboard text into the DOM. This bypasses:
 *      - maxLength truncation (browser counts spaces/dashes as characters)
 *      - iOS Safari's tel-input auto-formatting on paste
 *      - Android clipboard quirks that skip the onChange synthetic event
 *  • Normalises any of these common formats correctly:
 *      "+91 98765 43210"  →  9876543210
 *      "+91-9876543210"   →  9876543210
 *      "91 9876543210"    →  9876543210
 *      "98765 43210"      →  9876543210
 *      "98765-43210"      →  9876543210
 *      "09876543210"      →  9876543210  (leading 0 stripped)
 *      "9876543210"       →  9876543210  (plain, no change)
 *
 * Typing normalisation:
 *  • Non-digit characters are filtered out in real time
 *  • Country-code prefix (91) is stripped before the 10-digit cap so
 *    typing "+91..." doesn't eat into the local digit budget
 *
 * type="text" + inputMode="numeric" instead of type="tel":
 *  • type="tel" causes browsers (especially iOS Safari) to apply phone-number
 *    auto-formatting to pasted values before the JS event fires, producing
 *    inconsistent results across devices.
 *  • type="text" + inputMode="numeric" opens the numeric keyboard on mobile
 *    with none of the tel-specific paste transformations.
 *
 * No maxLength attribute:
 *  • maxLength on the DOM element is enforced by the browser before onChange
 *    fires. A number like "98765 43210" (11 chars with space) gets clipped to
 *    "98765 4321" — losing the last digit after the space is removed.
 *  • The 10-digit cap is enforced purely in JS after stripping non-digits.
 */
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const COUNTRY_CODE = '+91'
const LOCAL_DIGITS  = 10

/**
 * normalise — converts any common phone string into a clean 10-digit local
 * number string (no country code, no spaces, no dashes).
 *
 * Steps:
 *  1. Strip every non-digit character  →  digits only
 *  2. Strip leading country code (91)  →  if result would be >10 digits
 *  3. Strip leading 0                  →  e.g. "09876543210"
 *  4. Cap at 10 digits
 */
function normalise(raw: string): string {
  // Step 1: keep digits only
  let digits = raw.replace(/\D/g, '')

  // Step 2: strip leading "91" country code when the string is clearly a full
  // number (>10 digits means it includes the country code)
  if (digits.length > LOCAL_DIGITS && digits.startsWith('91')) {
    digits = digits.slice(2)
  }

  // Step 3: strip leading 0 (STD-style dialling prefix, not part of mobile number)
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  // Step 4: cap at 10 local digits
  return digits.slice(0, LOCAL_DIGITS)
}

/** Strip the country code prefix so we display only the local digits. */
function toLocal(full: string): string {
  if (!full) return ''
  if (full.startsWith(COUNTRY_CODE)) return full.slice(COUNTRY_CODE.length)
  // Bare "91..." stored without the + sign
  if (full.startsWith('91') && full.length > LOCAL_DIGITS) return full.slice(2)
  return full
}

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value?: string
  onChange?: (value: string) => void
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, className, disabled, ...rest }, ref) => {
    const localValue = toLocal(value)

    /** Emit the full E.164 string (or empty) for a given local digit string. */
    const emit = (local: string) =>
      onChange?.(local ? `${COUNTRY_CODE}${local}` : '')

    /**
     * onPaste — primary handler for paste events.
     *
     * e.preventDefault() stops the browser from inserting raw clipboard text
     * into the DOM, so maxLength and tel-input formatting never get a chance
     * to corrupt the value. We normalise the raw clipboard string ourselves
     * and update the controlled value directly.
     */
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const raw = e.clipboardData.getData('text')
      emit(normalise(raw))
    }

    /**
     * onChange — handles manual typing character by character.
     *
     * Paste events are handled by handlePaste above (which calls
     * e.preventDefault()), so this handler only runs for typed input.
     * We still normalise here as a safety net for browsers that route
     * paste through onChange instead of the paste event.
     */
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      emit(normalise(e.target.value))
    }

    return (
      <div className={cn('flex rounded-md shadow-sm', className)}>
        {/* Country code badge — read-only visual, not part of the input value */}
        <span
          className={cn(
            'inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted',
            'px-3 text-sm font-medium text-muted-foreground select-none',
            disabled && 'opacity-50',
          )}
        >
          {COUNTRY_CODE}
        </span>

        {/*
          type="text" + inputMode="numeric":
            - Opens the numeric keyboard on iOS and Android
            - Does NOT apply tel-specific paste transformations (unlike type="tel")

          No maxLength attribute:
            - Capping is done in JS after non-digits are stripped, so spaces
              and dashes in pasted numbers never eat into the digit budget
        */}
        <input
          {...rest}
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={localValue}
          onChange={handleChange}
          onPaste={handlePaste}
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
