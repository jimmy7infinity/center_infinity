import { useEffect } from 'react'
import Lenis from 'lenis'
import { BEAT_COUNT, LAST_BEAT } from './beats'

export const scrollState = {
  /** Signed scroll speed as reported by Lenis; 0 when smoothing is off. */
  velocity: 0,
  /**
   * Position on the beat timeline. An integer means that section is centred and
   * its tableau is exactly composed; fractions interpolate between neighbours.
   */
  beat: 0,
  /** Hyperjump amount, 0..1. */
  warp: 0,
}

/** Beats of runway over which the warp builds before the final anchor. */
const WARP_BEAT_LEAD = 0.9
/** Fast scrolling anywhere earns a hint of stretch, but never a full jump. */
const VELOCITY_WARP_SCALE = 0.0022
const VELOCITY_WARP_CEILING = 0.16
/** Seconds the warp is held after the loop, masking the jump back to the top. */
const LOOP_FLASH_SECONDS = 1.05
const LOOP_COOLDOWN_SECONDS = 1.5
const LOOP_TRIGGER_SLACK_PX = 4

let lenisInstance: Lenis | null = null
let anchors: number[] = []
let sectionWarp = 0
let flash = 0
let introWarp = 0
let introStarted = false
let introPhase: 'idle' | 'hold' | 'ease' | 'done' = 'idle'
let introElapsed = 0
let loopCooldown = 0
let veilEnabled = false

const INTRO_HOLD_MS = 3000
const INTRO_EASE_MS = 800

export function getLenis() {
  return lenisInstance
}

function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function scrollLimit() {
  return Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  )
}

/**
 * Scroll offset at which each beat section sits centred in the viewport.
 *
 * Forced monotonic: a section shorter than the viewport can otherwise measure
 * as starting behind its predecessor, which would make the timeline run
 * backwards for a stretch.
 */
function measureAnchors() {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-beat]'),
  )

  if (import.meta.env.DEV && nodes.length !== BEAT_COUNT) {
    console.warn(
      `[scroll] found ${nodes.length} [data-beat] sections but the timeline declares ${BEAT_COUNT}.`,
    )
  }

  const viewportCentre = window.innerHeight / 2
  let running = -Infinity
  anchors = nodes.map((node) => {
    const rect = node.getBoundingClientRect()
    const centred = rect.top + window.scrollY + rect.height / 2 - viewportCentre
    running = Math.max(running, centred)
    return running
  })
}

function beatFromScroll(y: number): number {
  if (anchors.length === 0) return 0
  const last = anchors.length - 1
  if (y <= anchors[0]) return 0
  if (y >= anchors[last]) return last

  let i = 0
  while (i < last && anchors[i + 1] < y) i += 1
  const span = anchors[i + 1] - anchors[i]
  return span > 0 ? i + (y - anchors[i]) / span : i
}

function refreshWarp() {
  const velocityWarp = Math.min(
    VELOCITY_WARP_CEILING,
    Math.abs(scrollState.velocity) * VELOCITY_WARP_SCALE,
  )
  scrollState.warp = Math.max(sectionWarp, velocityWarp, flash, introWarp)

  // Dissolves the DOM copy into the streaks near peak warp. Written as a CSS
  // variable rather than React state so it costs nothing per frame — and it is
  // what hides the cut back to the top, since the text is the only part of the
  // frame that would otherwise pop.
  if (veilEnabled) {
    document.documentElement.style.setProperty(
      '--warp-veil',
      smoothstep(0.45, 0.95, scrollState.warp).toFixed(3),
    )
  }
}

function applyScroll(y: number, velocity: number) {
  scrollState.velocity = velocity
  scrollState.beat = beatFromScroll(y)
  sectionWarp = smoothstep(LAST_BEAT - WARP_BEAT_LEAD, LAST_BEAT, scrollState.beat)
  refreshWarp()
}

/**
 * At the end of the runway the screen is almost entirely warp streaks, so
 * cutting back to the top is invisible; the held flash covers the remainder
 * while the hero recomposes out of the light.
 */
function tryLoop(lenis: Lenis) {
  if (loopCooldown > 0) return
  const limit = scrollLimit()
  if (limit <= 0) return
  if (window.scrollY < limit - LOOP_TRIGGER_SLACK_PX) return
  if (sectionWarp < 0.98) return

  flash = 1
  loopCooldown = LOOP_COOLDOWN_SECONDS
  lenis.scrollTo(0, { immediate: true, force: true })
}

function tickIntroWarp(deltaMs: number) {
  if (introPhase === 'idle' || introPhase === 'done') return

  introElapsed += deltaMs

  if (introPhase === 'hold') {
    introWarp = 1
    if (introElapsed >= INTRO_HOLD_MS) {
      introPhase = 'ease'
      introElapsed = 0
    }
    return
  }

  const u = introElapsed / INTRO_EASE_MS
  if (u >= 1) {
    introPhase = 'done'
    introWarp = 0
    return
  }
  introWarp = 1 - smoothstep(0, 1, u)
}

/** Full-screen warp streaks on first load; no-op after the first call. */
export function startIntroWarp() {
  if (introStarted) return
  introStarted = true
  introPhase = 'hold'
  introElapsed = 0
  introWarp = 1
}

export function isIntroWarpActive() {
  return introPhase === 'hold' || introPhase === 'ease'
}

function resetIntroWarp() {
  introWarp = 0
  introStarted = false
  introPhase = 'idle'
  introElapsed = 0
}

export function useSmoothScroll(smooth: boolean) {
  useEffect(() => {
    measureAnchors()

    // Fonts and lazily-sized content shift the anchors after first paint.
    const observer = new ResizeObserver(() => measureAnchors())
    observer.observe(document.body)
    window.addEventListener('resize', measureAnchors)

    // Reduced motion draws a static backdrop instead of the scene, so there are
    // no streaks to dissolve into and the copy must stay put.
    veilEnabled = smooth
    if (!smooth) {
      document.documentElement.style.setProperty('--warp-veil', '0')
      const onScroll = () => applyScroll(window.scrollY, 0)
      onScroll()
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', measureAnchors)
        window.removeEventListener('scroll', onScroll)
      }
    }

    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
    })
    lenisInstance = lenis

    lenis.on('scroll', (instance: Lenis) => {
      applyScroll(instance.scroll ?? window.scrollY, instance.velocity ?? 0)
    })
    applyScroll(window.scrollY, 0)

    let frame = 0
    let previousTime = performance.now()
    const loop = (time: number) => {
      const delta = Math.min(0.05, (time - previousTime) / 1000)
      previousTime = time

      lenis.raf(time)

      if (loopCooldown > 0) loopCooldown = Math.max(0, loopCooldown - delta)
      if (flash > 0) flash = Math.max(0, flash - delta / LOOP_FLASH_SECONDS)
      tickIntroWarp(delta * 1000)
      refreshWarp()
      tryLoop(lenis)

      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measureAnchors)
      lenis.destroy()
      lenisInstance = null
      flash = 0
      resetIntroWarp()
      loopCooldown = 0
      veilEnabled = false
      document.documentElement.style.setProperty('--warp-veil', '0')
    }
  }, [smooth])
}
