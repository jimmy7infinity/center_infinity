import { useEffect, useRef } from 'react'
import {
  MESH_CELL,
  MESH_LINE_ALPHA,
  MESH_WELL_RADIUS,
  meshField,
  subscribeMeshWells,
} from '../lib/meshField'

/**
 * A fine grid printed across the panel that bends toward the cursor, like a
 * field lensing around a mass. Fixed wells, when a page sets them, pinch the
 * same grid. It sits under the panel's texture and room light, so it reads
 * as ink, not as an overlay.
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
    let outX = 0
    let outY = 0
    // Fixed wells plus the cursor: a handful of spans, reused so drawing doesn't allocate.
    const SPAN_CAP = 8
    const spanLo = new Float64Array(SPAN_CAP)
    const spanHi = new Float64Array(SPAN_CAP)
    let spanCount = 0
    const cursorRadius2 = MESH_WELL_RADIUS * MESH_WELL_RADIUS

    const pushSpan = (lo: number, hi: number) => {
      if (spanCount >= SPAN_CAP) return
      let i = spanCount
      while (i > 0 && spanLo[i - 1] > lo) {
        spanLo[i] = spanLo[i - 1]
        spanHi[i] = spanHi[i - 1]
        i--
      }
      spanLo[i] = lo
      spanHi[i] = hi
      spanCount++
    }

    const mergeSpans = () => {
      if (spanCount <= 1) return
      let write = 0
      let lo = spanLo[0]
      let hi = spanHi[0]
      for (let i = 1; i < spanCount; i++) {
        if (spanLo[i] <= hi) hi = Math.max(hi, spanHi[i])
        else {
          spanLo[write] = lo
          spanHi[write] = hi
          write++
          lo = spanLo[i]
          hi = spanHi[i]
        }
      }
      spanLo[write] = lo
      spanHi[write] = hi
      spanCount = write + 1
    }

    /** Spans of the line that pass near a well and need samples. */
    const gatherSpans = (fixed: number, vertical: boolean) => {
      spanCount = 0
      const cursorReach = MESH_WELL_RADIUS * 3
      if (meshField.pull >= 0.002) {
        const axis = vertical ? meshField.x : meshField.y
        const along = vertical ? meshField.y : meshField.x
        if (Math.abs(fixed - axis) <= cursorReach) {
          pushSpan(along - cursorReach, along + cursorReach)
        }
      }
      const wells = meshField.wells
      for (let i = 0; i < wells.length; i++) {
        const well = wells[i]
        const reach = well.radius * 2.2
        const axis = vertical ? well.x : well.y
        const along = vertical ? well.y : well.x
        if (Math.abs(fixed - axis) <= reach) pushSpan(along - reach, along + reach)
      }
      mergeSpans()
    }

    const place = (x: number, y: number) => {
      let ox = 0
      let oy = 0
      const pull = meshField.pull
      if (pull >= 0.002) {
        const dx = meshField.x - x
        const dy = meshField.y - y
        const d2 = dx * dx + dy * dy
        if (d2 < cursorRadius2 * 9) {
          const f = pull * Math.exp(-d2 / cursorRadius2)
          ox += dx * f
          oy += dy * f
        }
      }
      const wells = meshField.wells
      for (let i = 0; i < wells.length; i++) {
        const well = wells[i]
        const dx = well.x - x
        const dy = well.y - y
        const r2 = well.radius * well.radius
        const d2 = dx * dx + dy * dy
        if (d2 >= r2 * 4.84) continue
        const f = well.pull * Math.exp(-d2 / r2)
        ox += dx * f
        oy += dy * f
      }
      outX = x + ox
      outY = y + oy
    }

    const trace = (fixed: number, limit: number, vertical: boolean) => {
      gatherSpans(fixed, vertical)
      if (vertical) ctx.moveTo(fixed, 0)
      else ctx.moveTo(0, fixed)
      if (spanCount === 0) {
        if (vertical) ctx.lineTo(fixed, limit)
        else ctx.lineTo(limit, fixed)
        return
      }
      let along = 0
      for (let i = 0; i < spanCount; i++) {
        const start = Math.max(0, spanLo[i])
        const end = Math.min(limit, spanHi[i])
        if (end - start < 1) continue
        if (start > along + 0.5) {
          if (vertical) ctx.lineTo(fixed, start)
          else ctx.lineTo(start, fixed)
        }
        for (let t = Math.max(along, start); t < end; t += STEP) {
          if (vertical) place(fixed, t)
          else place(t, fixed)
          ctx.lineTo(outX, outY)
        }
        if (vertical) place(fixed, end)
        else place(end, fixed)
        ctx.lineTo(outX, outY)
        along = end
      }
      if (along < limit - 0.5) {
        if (vertical) ctx.lineTo(fixed, limit)
        else ctx.lineTo(limit, fixed)
      }
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ctx.strokeStyle = LINE
      ctx.lineWidth = 1 / dpr
      const ox = ((width / 2) % MESH_CELL) - MESH_CELL
      const oy = ((height / 2) % MESH_CELL) - MESH_CELL

      ctx.beginPath()
      for (let x = ox; x <= width + MESH_CELL; x += MESH_CELL) trace(x, height, true)
      for (let y = oy; y <= height + MESH_CELL; y += MESH_CELL) trace(y, width, false)
      ctx.stroke()

      // A second, shorter pass so each fixed well reads as a knot, not a faint bend.
      const wells = meshField.wells
      if (wells.length === 0) return
      ctx.strokeStyle = 'rgba(226, 223, 216, 0.07)'
      ctx.beginPath()
      for (let i = 0; i < wells.length; i++) {
        const well = wells[i]
        const reach = well.radius * 1.05
        const x0 = well.x - reach
        const x1 = well.x + reach
        const y0 = well.y - reach
        const y1 = well.y + reach
        for (let x = ox; x <= width + MESH_CELL; x += MESH_CELL) {
          if (x < x0 || x > x1) continue
          const yStart = Math.max(0, y0)
          const yEnd = Math.min(height, y1)
          place(x, yStart)
          ctx.moveTo(outX, outY)
          for (let y = yStart + STEP; y <= yEnd; y += STEP) {
            place(x, y)
            ctx.lineTo(outX, outY)
          }
        }
        for (let y = oy; y <= height + MESH_CELL; y += MESH_CELL) {
          if (y < y0 || y > y1) continue
          const xStart = Math.max(0, x0)
          const xEnd = Math.min(width, x1)
          place(xStart, y)
          ctx.moveTo(outX, outY)
          for (let x = xStart + STEP; x <= xEnd; x += STEP) {
            place(x, y)
            ctx.lineTo(outX, outY)
          }
        }
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
    const unsubscribeWells = subscribeMeshWells(wake)
    window.addEventListener('resize', resize)
    if (live) {
      window.addEventListener('pointermove', onMove, { passive: true })
      document.documentElement.addEventListener('pointerleave', onLeave)
      window.addEventListener('blur', onLeave)
    }

    return () => {
      cancelAnimationFrame(frame)
      unsubscribeWells()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className="warp-mesh" aria-hidden />
}
