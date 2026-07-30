import { useEffect } from 'react'

/**
 * Mutable pointer singleton, read per-frame by the scene. Same shape and same
 * reason as `scrollState`: routing this through React would re-render the tree
 * on every mouse move.
 */
export const pointerState = {
  /** Normalised device coordinates, -1..1, y up. */
  x: 0,
  y: 0,
  /** Frame-to-frame NDC delta — drives storm splat force. */
  vx: 0,
  vy: 0,
  /** 1 while a fine pointer is over the document, 0 once it leaves. */
  presence: 0,
  /**
   * False on touch-only devices. There is no hover state to respond to there,
   * and a light that parks wherever the last tap landed reads as a bug.
   */
  enabled: false,
}

export function usePointerTracking(active: boolean) {
  useEffect(() => {
    if (!active) return

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!fine.matches) {
      pointerState.enabled = false
      return
    }
    pointerState.enabled = true

    let prevX = pointerState.x
    let prevY = pointerState.y
    let hasPrev = false

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = -((event.clientY / window.innerHeight) * 2 - 1)
      if (hasPrev) {
        pointerState.vx = x - prevX
        pointerState.vy = y - prevY
      }
      prevX = x
      prevY = y
      hasPrev = true
      pointerState.x = x
      pointerState.y = y
      pointerState.presence = 1
    }

    const onLeave = () => {
      pointerState.presence = 0
      pointerState.vx = 0
      pointerState.vy = 0
      hasPrev = false
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)

    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      pointerState.presence = 0
      pointerState.vx = 0
      pointerState.vy = 0
      pointerState.enabled = false
    }
  }, [active])
}
