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
  /**
   * How stretched the starfield is, 0..1. Fast scrolling anywhere contributes,
   * so this is a motion cue as much as a beat.
   */
  warp: 0,
  /**
   * The actual hyperjump, 0..1 — the runway, the loop flash, and the intro, but
   * *not* the velocity stretch. Solid bodies clear out on this rather than on
   * `warp`, so scrolling quickly through the work sections doesn't dissolve the
   * planets it is meant to be showing off.
   */
  jump: 0,
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
let entered = false

const INTRO_HOLD_MS = 1800
const INTRO_EASE_MS = 1400

/**
 * Continuous magnetism — midpoints between sections are unstable.
 * While the user is scrolling they can pass through; the moment input stops,
 * scroll is pulled toward the nearer anchor every frame (no settle pause,
 * no separate "snap animation" that starts after a dead stop).
 */
const MAGNET_STRENGTH = 16
/** After the last wheel/touch/key, wait this long before the magnet engages. */
const INPUT_GRACE_SECONDS = 0.06
/** Landed close enough to count as on-composition. */
const SNAP_MIN_PX = 1.5

let lastInputAt = 0

/**
 * Magnetism yields to intent. Any real input opens a grace window where the
 * user owns the scroll; the pull resumes as soon as that window ends.
 */
function noteInput() {
  lastInputAt = performance.now()
}

function nearestAnchorIndex(scrollY: number) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < anchors.length; i++) {
    const dist = Math.abs(anchors[i] - scrollY)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

function tickMagnetism(lenis: Lenis, delta: number) {
  if (!entered || anchors.length === 0) return
  if ((performance.now() - lastInputAt) / 1000 < INPUT_GRACE_SECONDS) return

  const y = lenis.scroll ?? window.scrollY
  const nearest = nearestAnchorIndex(y)

  // Warp runway stays free-scroll into the loop.
  if (nearest >= LAST_BEAT) return

  const target = anchors[nearest]
  const error = target - y
  if (Math.abs(error) < SNAP_MIN_PX) {
    if (Math.abs(error) > 0.05) {
      lenis.scrollTo(target, { immediate: true, force: true })
    }
    return
  }

  // Exponential approach every frame — continuous magnet, not a delayed snap.
  const pull = 1 - Math.exp(-MAGNET_STRENGTH * delta)
  lenis.scrollTo(y + error * pull, { immediate: true, force: true })
}

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
  scrollState.jump = Math.max(sectionWarp, flash, introWarp)
  scrollState.warp = Math.max(scrollState.jump, velocityWarp)

  // Dissolves the DOM copy into the streaks near peak warp. Written as a CSS
  // variable rather than React state so it costs nothing per frame — and it is
  // what hides the cut back to the top, since the text is the only part of the
  // frame that would otherwise pop.
  if (veilEnabled) {
    if (!entered) {
      document.documentElement.style.setProperty('--warp-veil', '1')
    } else {
      const scrollVeil = smoothstep(0.15, 0.85, scrollState.warp)
      document.documentElement.style.setProperty(
        '--warp-veil',
        Math.max(scrollVeil, introWarp).toFixed(3),
      )
    }
  }
}

function applyScroll(y: number, velocity: number) {
  scrollState.velocity = velocity
  scrollState.beat = beatFromScroll(y)
  sectionWarp = smoothstep(LAST_BEAT - WARP_BEAT_LEAD, LAST_BEAT, scrollState.beat)

  // The hero *is* the wordmark, so the nav only claims it once we leave.
  document.documentElement.style.setProperty(
    '--past-hero',
    smoothstep(0.25, 0.7, scrollState.beat).toFixed(3),
  )

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

/** Full-screen warp streaks after the user enters; no-op after the first call. */
export function startIntroWarp() {
  if (introStarted) return
  introStarted = true
  introPhase = 'hold'
  introElapsed = 0
  introWarp = 1
}

export function hasEntered() {
  return entered
}

export function enterSite() {
  if (entered) return
  entered = true
  getLenis()?.start()
  startIntroWarp()
  refreshWarp()
}

/** 0 while idle or hold; eases 0→1 during intro settle; 1 when complete. */
export function getIntroArrive() {
  if (introPhase === 'done') return 1
  if (introPhase === 'ease') {
    const u = introElapsed / INTRO_EASE_MS
    return smoothstep(0, 1, Math.min(1, u))
  }
  return 0
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

/**
 * @param smooth - Lenis + warp intro when the WebGL scene is active
 * @param ready - false while quality tier is still detecting; keeps the default
 *   CSS veil (copy hidden) so text does not flash before the intro warp
 */
export function useSmoothScroll(smooth: boolean, ready = true) {
  useEffect(() => {
    if (!ready) return

    measureAnchors()

    // Fonts and lazily-sized content shift the anchors after first paint.
    const observer = new ResizeObserver(() => measureAnchors())
    observer.observe(document.body)
    window.addEventListener('resize', measureAnchors)

    // Reduced motion draws a static backdrop instead of the scene, so there are
    // no streaks to dissolve into and the copy must stay put.
    veilEnabled = smooth
    if (!smooth) {
      entered = true
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

    refreshWarp()

    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
    })
    lenisInstance = lenis
    // enterSite may have already run in the same tick; honour that so the
    // intro warp isn't stuck behind a stopped scroller.
    if (entered) {
      lenis.start()
    } else {
      lenis.stop()
    }

    lenis.on('scroll', (instance: Lenis) => {
      applyScroll(instance.scroll ?? window.scrollY, instance.velocity ?? 0)
    })
    applyScroll(window.scrollY, 0)

    window.addEventListener('wheel', noteInput, { passive: true })
    window.addEventListener('touchstart', noteInput, { passive: true })
    window.addEventListener('touchmove', noteInput, { passive: true })
    window.addEventListener('keydown', noteInput)

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
      tickMagnetism(lenis, delta)
      tryLoop(lenis)

      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measureAnchors)
      window.removeEventListener('wheel', noteInput)
      window.removeEventListener('touchstart', noteInput)
      window.removeEventListener('touchmove', noteInput)
      window.removeEventListener('keydown', noteInput)
      lenis.destroy()
      lenisInstance = null
      flash = 0
      resetIntroWarp()
      loopCooldown = 0
      veilEnabled = false
      document.documentElement.style.setProperty('--warp-veil', '0')
    }
  }, [smooth, ready])
}
