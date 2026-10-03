import { useEffect, useRef } from 'react'

/**
 * The emitters' actual light. Everything in the DOM sits under the panel's
 * multiply layers, which is right for pigment and wrong for light: a glow drawn
 * there gets textured and shaded like ink. So the light is drawn here, above
 * the panel and bezel, and *added* to whatever is beneath it.
 *
 * Each `.emitter` element is a housing; this paints into it, per frame:
 * - a core that overexposes toward white, as a real LED does on camera,
 * - a tight coloured bloom (scatter in the lens and the panel's top film),
 * - a wide, faint spill with inverse-square falloff — the light landing on the
 *   panel around it, which is most of what makes it read as a source.
 */

/** All radii in CSS pixels. */
const CORE_RADIUS = 2.2
const BLOOM_RADIUS = 9
const SPILL_RADIUS = 70
/** Distance at which inverse-square spill has dropped to half. */
const SPILL_KNEE = 12
const SPILL_STRENGTH = 0.11
const BLOOM_STRENGTH = 0.3
/** Share of white in the core — saturated light clips toward white. */
const CORE_WHITE = 0.62
const BREATHE_SECONDS = 3.6
const BREATHE_DEPTH = 0.35

type Rgb = readonly [number, number, number]

const colourCache = new WeakMap<Element, Rgb>()

function parseColour(value: string): Rgb | null {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = value.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

function colourOf(el: Element): Rgb | null {
  const cached = colourCache.get(el)
  if (cached) return cached
  const parsed = parseColour(getComputedStyle(el).getPropertyValue('--emit'))
  if (parsed) colourCache.set(el, parsed)
  return parsed
}

function rgba([r, g, b]: Rgb, alpha: number) {
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha.toFixed(4)})`
}

function mixWhite([r, g, b]: Rgb, amount: number): Rgb {
  return [
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  ]
}

function drawEmitter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colour: Rgb,
  power: number,
  scale: number,
) {
  // Spill: 1 / (1 + (d/k)²), sampled into stops and eased to zero at the edge
  // so the gradient never ends on a visible ring.
  const spillR = SPILL_RADIUS * scale
  const spill = ctx.createRadialGradient(x, y, 0, x, y, spillR)
  const stops = 10
  for (let i = 0; i <= stops; i++) {
    const t = i / stops
    const d = (t * SPILL_RADIUS) / SPILL_KNEE
    const tail = 1 - t * t
    spill.addColorStop(t, rgba(colour, (SPILL_STRENGTH * power * tail) / (1 + d * d)))
  }
  ctx.fillStyle = spill
  ctx.fillRect(x - spillR, y - spillR, spillR * 2, spillR * 2)

  const bloomR = BLOOM_RADIUS * scale
  const bloom = ctx.createRadialGradient(x, y, 0, x, y, bloomR)
  bloom.addColorStop(0, rgba(colour, BLOOM_STRENGTH * power))
  bloom.addColorStop(0.25, rgba(colour, BLOOM_STRENGTH * 0.45 * power))
  bloom.addColorStop(0.6, rgba(colour, BLOOM_STRENGTH * 0.1 * power))
  bloom.addColorStop(1, rgba(colour, 0))
  ctx.fillStyle = bloom
  ctx.fillRect(x - bloomR, y - bloomR, bloomR * 2, bloomR * 2)

  // The core barely breathes: it is clipped, so only its halo shows the change.
  const coreR = CORE_RADIUS * scale
  const hot = mixWhite(colour, CORE_WHITE)
  const core = ctx.createRadialGradient(x, y, 0, x, y, coreR)
  core.addColorStop(0, rgba(hot, 1))
  core.addColorStop(0.55, rgba(mixWhite(colour, CORE_WHITE * 0.4), 0.9))
  core.addColorStop(1, rgba(colour, 0))
  ctx.fillStyle = core
  ctx.fillRect(x - coreR, y - coreR, coreR * 2, coreR * 2)
}

export function EmitterLight() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let dpr = 1
    let frame = 0

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
    }

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // The chrome fades out for the minigame; its lights go with it.
      const veil = Number(
        document.documentElement.style.getPropertyValue('--game-veil') || 0,
      )
      const presence = 1 - veil
      if (presence <= 0.001) return

      ctx.globalCompositeOperation = 'lighter'

      const phase = (time / 1000 / BREATHE_SECONDS) * Math.PI * 2
      const breath = reducedMotion.matches
        ? 1
        : 1 - BREATHE_DEPTH * (0.5 - 0.5 * Math.cos(phase))

      for (const el of document.querySelectorAll<HTMLElement>('.emitter')) {
        if (el.classList.contains('emitter--off')) continue
        const rect = el.getBoundingClientRect()
        // Elements on hidden pages have no box.
        if (rect.width === 0) continue
        const colour = colourOf(el)
        if (!colour) continue
        const power =
          presence * (el.classList.contains('emitter--breathe') ? breath : 1)
        drawEmitter(
          ctx,
          (rect.left + rect.width / 2) * dpr,
          (rect.top + rect.height / 2) * dpr,
          colour,
          power,
          dpr,
        )
      }
    }

    resize()
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="emitter-light" aria-hidden />
}
