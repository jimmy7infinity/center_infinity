import { useEffect, useRef } from 'react'
import {
  MESH_CELL,
  MESH_LINE_ALPHA,
  MESH_WELL_RADIUS,
  meshField,
} from '../lib/meshField'

/**
 * A fine grid printed across the panel that bends toward the cursor, like a
 * field lensing around a mass. It sits under the panel's texture and room
 * light, so it reads as ink, not as an overlay.
 */

/** Points per line are spaced this far apart where the mesh bends. */
const STEP = 6
/** Share of the distance to the cursor a point is pulled, at rest and in motion. */
const PULL_IDLE = 0.16
const PULL_MOVING = 0.42
/** Seconds for the extra pull from movement to settle. */
const ENERGY_DECAY = 0.7
const CURSOR_DAMP = 9
const LINE = `rgba(226, 223, 216, ${MESH_LINE_ALPHA})`

export function WarpMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const live =
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let dpr = 1
    let width = 0
    let height = 0
    let frame = 0
    let last = 0
    // The pointer the well chases, and how strongly it pulls.
    let tx = -1e4
    let ty = -1e4
    let presence = 0
    let present = false
    let energy = 0

    const warp = (x: number, y: number, k: number): [number, number] => {
      const dx = meshField.x - x
      const dy = meshField.y - y
      const f = k * Math.exp(-(dx * dx + dy * dy) / (MESH_WELL_RADIUS * MESH_WELL_RADIUS))
      return [x + dx * f, y + dy * f]
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ctx.strokeStyle = LINE
      ctx.lineWidth = 1 / dpr
      const { x: cx, y: cy, pull: k } = meshField
      const reach = MESH_WELL_RADIUS * 3
      const ox = ((width / 2) % MESH_CELL) - MESH_CELL
      const oy = ((height / 2) % MESH_CELL) - MESH_CELL

      ctx.beginPath()
      for (let x = ox; x <= width + MESH_CELL; x += MESH_CELL) {
        ctx.moveTo(x, 0)
        if (k >= 0.002 && Math.abs(x - cx) <= reach) {
          for (let y = Math.max(0, cy - reach); y <= Math.min(height, cy + reach); y += STEP) {
            const [px, py] = warp(x, y, k)
            ctx.lineTo(px, py)
          }
        }
        ctx.lineTo(x, height)
      }
      for (let y = oy; y <= height + MESH_CELL; y += MESH_CELL) {
        ctx.moveTo(0, y)
        if (k >= 0.002 && Math.abs(y - cy) <= reach) {
          for (let x = Math.max(0, cx - reach); x <= Math.min(width, cx + reach); x += STEP) {
            const [px, py] = warp(x, y, k)
            ctx.lineTo(px, py)
          }
        }
        ctx.lineTo(width, y)
      }
      ctx.stroke()
    }

    const tick = (time: number) => {
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60
      last = time
      const a = 1 - Math.exp(-CURSOR_DAMP * dt)
      meshField.x += (tx - meshField.x) * a
      meshField.y += (ty - meshField.y) * a
      presence += ((present ? 1 : 0) - presence) * a
      energy = Math.max(0, energy - dt / ENERGY_DECAY)
      meshField.pull = presence * (PULL_IDLE + (PULL_MOVING - PULL_IDLE) * energy)
      draw()
      const settled =
        Math.abs(tx - meshField.x) < 0.3 &&
        Math.abs(ty - meshField.y) < 0.3 &&
        energy === 0 &&
        Math.abs((present ? 1 : 0) - presence) < 0.002
      frame = settled ? 0 : requestAnimationFrame(tick)
      if (settled) last = 0
    }

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      draw()
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      if (!present) {
        // Arrive at the pointer rather than sweeping in from the last exit.
        meshField.x = event.clientX
        meshField.y = event.clientY
      }
      const moved = Math.hypot(event.clientX - tx, event.clientY - ty)
      tx = event.clientX
      ty = event.clientY
      present = true
      energy = Math.min(1, energy + moved / 60)
      wake()
    }

    const onLeave = () => {
      present = false
      wake()
    }

    resize()
    window.addEventListener('resize', resize)
    if (live) {
      window.addEventListener('pointermove', onMove, { passive: true })
      document.documentElement.addEventListener('pointerleave', onLeave)
      window.addEventListener('blur', onLeave)
    }

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className="warp-mesh" aria-hidden />
}
