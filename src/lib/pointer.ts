import { useEffect } from 'react'
import { isGameActive } from './gameMode'
import { meteorAim, noteMeteorAimDrag } from './meteorAim'

/**
 * Mutable pointer singleton, read per-frame by the scene. Same shape and same
 * reason as `scrollState`: routing this through React would re-render the tree
 * on every mouse move.
 */
export const pointerState = {
  /** Normalised device coordinates, -1..1, y up. */
  x: 0,
  y: 0,
  /** Frame-to-frame NDC delta. */
  vx: 0,
  vy: 0,
  /** 1 while a fine pointer is over the document, 0 once it leaves. */
  presence: 0,
  /**
   * False on touch-only devices. There is no hover state to respond to there,
   * and a light that parks wherever the last tap landed reads as a bug.
   */
  enabled: false,
  /**
   * Latched by a click on non-interactive empty space; the scene consumes and
   * clears it. Strikes lightning on a planet, otherwise fires a comet.
   */
  spaceClick: false,
  /** Written by shells each frame — pointer ray currently hits a planet. */
  overShell: false,
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
      if (meteorAim.dragging) {
        meteorAim.x = x
        meteorAim.y = y
        noteMeteorAimDrag()
      }
    }

    const onLeave = () => {
      pointerState.presence = 0
      pointerState.vx = 0
      pointerState.vy = 0
      hasPrev = false
      if (meteorAim.dragging) {
        meteorAim.dragging = false
        noteMeteorAimDrag()
      }
    }

    const isChromeTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        'a, button, input, textarea, select, label, dialog, [role="button"]',
      )

    // Comet clicks often land on DOM copy under the canvas. preventDefault on
    // mousedown stops the browser from painting a text selection ("Scroll", etc).
    const onMouseDown = (event: MouseEvent) => {
      if (isGameActive() || isChromeTarget(event.target)) return
      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      if (meteorAim.mode !== 'drag' || pointerState.overShell) return
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = -((event.clientY / window.innerHeight) * 2 - 1)
      pointerState.x = x
      pointerState.y = y
      pointerState.presence = 1
      meteorAim.dragging = true
      meteorAim.pressX = x
      meteorAim.pressY = y
      meteorAim.x = x
      meteorAim.y = y
      meteorAim.suppressClick = true
      noteMeteorAimDrag()
    }

    const onMouseUp = (event: MouseEvent) => {
      if (!meteorAim.dragging) return
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = -((event.clientY / window.innerHeight) * 2 - 1)
      const dx = meteorAim.pressX - x
      const dy = meteorAim.pressY - y
      meteorAim.dragging = false
      meteorAim.x = x
      meteorAim.y = y
      if (Math.hypot(dx, dy) > 0.035) {
        meteorAim.shot = {
          x: meteorAim.pressX,
          y: meteorAim.pressY,
          dx,
          dy,
          power: Math.min(1, Math.hypot(dx, dy) / 0.55),
        }
      }
      noteMeteorAimDrag()
    }

    const onClick = (event: MouseEvent) => {
      if (isGameActive()) return
      if (isChromeTarget(event.target)) return
      // Keep NDC in sync even if the last move was skipped.
      pointerState.x = (event.clientX / window.innerWidth) * 2 - 1
      pointerState.y = -((event.clientY / window.innerHeight) * 2 - 1)
      pointerState.presence = 1
      if (meteorAim.suppressClick) {
        meteorAim.suppressClick = false
        return
      }
      pointerState.spaceClick = true
      window.getSelection()?.removeAllRanges()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('click', onClick)

    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('click', onClick)
      pointerState.presence = 0
      pointerState.vx = 0
      pointerState.vy = 0
      pointerState.spaceClick = false
      pointerState.overShell = false
      pointerState.enabled = false
    }
  }, [active])
}
