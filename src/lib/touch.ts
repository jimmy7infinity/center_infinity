/**
 * True when the primary input is touch-shaped: coarse pointer, or a touch
 * device without a fine hover mouse. Used to swap keyboard/mouse flight for
 * virtual pads — not merely "is a phone".
 */
export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia('(pointer: coarse)').matches
  if (coarse) return true
  const fineHover = window.matchMedia(
    '(hover: hover) and (pointer: fine)',
  ).matches
  return !fineHover && navigator.maxTouchPoints > 0
}
