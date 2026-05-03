import { useState, useCallback } from 'react'

/**
 * useConfirm — thin state wrapper for the ConfirmDialog component.
 *
 * Encapsulates the open/close boolean so callers don't repeat the same three
 * useState lines in every component.  Components still own their own state —
 * there is no global provider — which keeps each confirmation self-contained,
 * explicitly traceable, and independently testable.
 *
 * Usage:
 *   const confirm = useConfirm()
 *   ...
 *   <Button onClick={confirm.open}>Delete</Button>
 *   <ConfirmDialog
 *     open={confirm.isOpen}
 *     onClose={confirm.close}
 *     onConfirm={() => { doThing(); confirm.close() }}
 *     ...
 *   />
 */
export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false)

  const open  = useCallback(() => setIsOpen(true),  [])
  const close = useCallback(() => setIsOpen(false), [])

  return { isOpen, open, close } as const
}
