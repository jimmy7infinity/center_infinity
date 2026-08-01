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

let lenisInstance: Lenis | null = null
let anchors: number[] = []
let sectionWarp = 0
let flash = 0
let introWarp = 0
let introStarted = false
let introPhase: 'idle' | 'hold' | 'ease' | 'done' = 'idle'
let introElapsed = 0
/** 0..1 — hero brand copy fades in after planets finish arriving. */
let heroCopy = 0
let heroCopyElapsed = 0
let loopCooldown = 0
let veilEnabled = false
let entered = false

const INTRO_HOLD_MS = 1800
const INTRO_EASE_MS = 1400
/** Pause after planets settle, then ease the hero mark/type in. */
const HERO_COPY_DELAY_MS = 550
const HERO_COPY_FADE_MS = 1100

/**
 * Hard section pager — one intentional gesture = exactly one beat.
 * Mid-glide input is ignored (not queued), so a trackpad flick cannot chain
 * past the next composition. The right-rail nav may jump any beat.
 */
const SECTION_DURATION = 0.8
const WHEEL_THRESHOLD = 8
/**
 * After landing, ignore leftover trackpad inertia. Must outlast typical
 * Mac trackpad coast or one flick lands two sections.
 */
const GESTURE_COOLDOWN_MS = 520
const TOUCH_THRESHOLD_PX = 48

let sectionIndex = 0
let paging = false
let gestureLocked = false
let pageToken = 0
let unlockTimer = 0
let touchOriginY: number | null = null
/** When true, wheel/touch/keys never advance sections (minigame owns input). */
let pagingPaused = false
const sectionListeners = new Set<(index: number) => void>()

function easeAssist(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

function notifySection() {
  for (const listener of sectionListeners) listener(sectionIndex)
}

export function getSectionIndex() {
  return sectionIndex
}

export function subscribeSection(listener: (index: number) => void) {
  sectionListeners.add(listener)
  listener(sectionIndex)
  return () => {
    sectionListeners.delete(listener)
  }
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

function syncSectionFromScroll() {
  if (anchors.length === 0) return
  const next = nearestAnchorIndex(lenisInstance?.scroll ?? window.scrollY)
  if (next !== sectionIndex) {
    sectionIndex = next
    notifySection()
  }
}

function unlockGesture() {
  window.clearTimeout(unlockTimer)
  unlockTimer = window.setTimeout(() => {
    gestureLocked = false
  }, GESTURE_COOLDOWN_MS)
}

function triggerLoop(lenis: Lenis) {
  if (loopCooldown > 0) return
  flash = 1
  loopCooldown = LOOP_COOLDOWN_SECONDS
  const token = ++pageToken
  paging = true
  gestureLocked = true
  sectionIndex = 0
  notifySection()
  lenis.scrollTo(0, { immediate: true, force: true })
  if (token === pageToken) {
    paging = false
    unlockGesture()
  }
}

/** Pause guided section paging while a minigame owns the viewport. */
export function setSectionPagingPaused(paused: boolean) {
  pagingPaused = paused
  if (paused) {
    pageToken += 1
    paging = false
    gestureLocked = false
    window.clearTimeout(unlockTimer)
    touchOriginY = null
  }
}

/** Public loop/warp flash back to the hero (same path as the runway end). */
export function triggerSiteLoop() {
  const lenis = lenisInstance
  if (!lenis) return
  triggerLoop(lenis)
}

function finishPage(token: number) {
  if (token !== pageToken) return
  paging = false
  unlockGesture()
}

type GoOptions = {
  /** Nav / anchor jumps interrupt the current glide. */
  force?: boolean
}

function goToSection(index: number, options: GoOptions = {}) {
  const lenis = lenisInstance
  if (!entered || !lenis || anchors.length === 0) return

  // Wheel/keys never stack — only an explicit nav jump may interrupt.
  if (!options.force && (paging || gestureLocked)) return

  // Past the last beat → warp loop back to the hero.
  if (index > LAST_BEAT) {
    if (sectionIndex >= LAST_BEAT) triggerLoop(lenis)
    return
  }

  const next = Math.max(0, Math.min(LAST_BEAT, index))
  if (next === sectionIndex && !options.force) return

  const target = anchors[next]
  if (target === undefined) return

  if (options.force) {
    pageToken += 1
    window.clearTimeout(unlockTimer)
  }

  const span = Math.abs(next - sectionIndex)
  const token = ++pageToken
  paging = true
  gestureLocked = true
  sectionIndex = next
  notifySection()
  lenis.scrollTo(target, {
    duration: options.force && span > 1 ? 0.95 : SECTION_DURATION,
    easing: easeAssist,
    force: true,
    lock: true,
    onComplete: () => finishPage(token),
  })
}

/** Public API for the right-rail nav — may skip intermediate beats. */
export function goToSectionIndex(index: number) {
  goToSection(index, { force: true })
}

function pageBy(delta: number) {
  if (delta === 0) return
  goToSection(sectionIndex + (delta > 0 ? 1 : -1))
}

function onWheel(event: WheelEvent) {
  // Always kill native / Lenis free-scroll so the page never drifts off-beat.
  event.preventDefault()
  event.stopImmediatePropagation()
  if (!entered || pagingPaused || paging || gestureLocked) return
  if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) return
  pageBy(event.deltaY)
}

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) return
  touchOriginY = event.touches[0].clientY
}

function onTouchMove(event: TouchEvent) {
  if (entered) event.preventDefault()
}

function onTouchEnd(event: TouchEvent) {
  if (touchOriginY === null || !entered) {
    touchOriginY = null
    return
  }
  const endY = event.changedTouches[0]?.clientY
  const startY = touchOriginY
  touchOriginY = null
  if (endY === undefined || pagingPaused || paging || gestureLocked) return
  const dy = startY - endY
  if (Math.abs(dy) < TOUCH_THRESHOLD_PX) return
  pageBy(dy)
}

function onKeyDown(event: KeyboardEvent) {
  if (!entered || pagingPaused || paging || gestureLocked) return
  const el = event.target
  if (el instanceof HTMLElement) {
    const tag = el.tagName
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'BUTTON' ||
      el.isContentEditable
    ) {
      return
    }
  }
  const key = event.key
  if (
    key === 'ArrowDown' ||
    key === 'PageDown' ||
    key === ' ' ||
    key === 'Spacebar'
  ) {
    event.preventDefault()
    pageBy(1)
    return
  }
  if (key === 'ArrowUp' || key === 'PageUp') {
    event.preventDefault()
    pageBy(-1)
  }
}

function onAnchorClick(event: MouseEvent) {
  const target = (event.target as Element | null)?.closest?.('a[href^="#"]')
  if (!target) return
  const href = target.getAttribute('href')
  if (!href || href === '#') return

  const id = href.slice(1)
  const beatNodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-beat]'),
  )
  let index = -1
  if (id === 'top') index = 0
  else if (id === 'work') {
    index = beatNodes.findIndex((node) => node.dataset.beat?.startsWith('work'))
  } else {
    index = beatNodes.findIndex(
      (node) => node.id === id || node.dataset.beat === id,
    )
    if (index < 0) {
      const section = document.getElementById(id)
      if (section) {
        const beat = section.querySelector<HTMLElement>('[data-beat]')
        if (beat) index = beatNodes.indexOf(beat)
        else index = beatNodes.findIndex((node) => section.contains(node))
      }
    }
  }
  if (index < 0) return
  event.preventDefault()
  goToSection(index, { force: true })
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

/** Hero brand/type — held until the intro lands, then delayed fade-in. */
function tickHeroCopy(deltaMs: number) {
  if (!entered || introPhase !== 'done') {
    heroCopy = 0
    heroCopyElapsed = 0
    document.documentElement.style.setProperty('--hero-copy', '0')
    return
  }

  heroCopyElapsed += deltaMs
  if (heroCopyElapsed < HERO_COPY_DELAY_MS) {
    heroCopy = 0
  } else {
    const u = (heroCopyElapsed - HERO_COPY_DELAY_MS) / HERO_COPY_FADE_MS
    heroCopy = smoothstep(0, 1, Math.min(1, u))
  }
  document.documentElement.style.setProperty('--hero-copy', heroCopy.toFixed(3))
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
  // Land on the hero composition — never mid-scroll after the intro.
  sectionIndex = 0
  notifySection()
  const hero = anchors[0]
  if (hero !== undefined) {
    getLenis()?.scrollTo(hero, { immediate: true, force: true })
  }
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

/** 0..1 reveal of the hero logo / “we build” line after the scene settles. */
export function getHeroCopy() {
  return heroCopy
}

function resetIntroWarp() {
  introWarp = 0
  introStarted = false
  introPhase = 'idle'
  introElapsed = 0
  heroCopy = 0
  heroCopyElapsed = 0
  document.documentElement.style.setProperty('--hero-copy', '0')
}

/**
 * @param smooth - Lenis + warp intro when the WebGL scene is active
 * @param ready - false while quality tier is still detecting; keeps the default
 *   CSS veil (copy hidden) so text does not flash before the intro warp
 */
export function useSmoothScroll(smooth: boolean, ready = true) {
  useEffect(() => {
    if (!ready) return

    const remeasure = () => {
      measureAnchors()
      if (!paging) syncSectionFromScroll()
    }
    remeasure()

    // Fonts and lazily-sized content shift the anchors after first paint.
    const observer = new ResizeObserver(remeasure)
    observer.observe(document.body)
    window.addEventListener('resize', remeasure)

    // Reduced motion draws a static backdrop instead of the scene, so there are
    // no streaks to dissolve into and the copy must stay put.
    veilEnabled = smooth
    if (!smooth) {
      entered = true
      document.documentElement.style.setProperty('--warp-veil', '0')
      document.documentElement.style.setProperty('--hero-copy', '1')
      heroCopy = 1
      const onScroll = () => applyScroll(window.scrollY, 0)
      onScroll()
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', remeasure)
        window.removeEventListener('scroll', onScroll)
      }
    }

    refreshWarp()

    // Keep the document tall for programmatic glides, but kill native rubber-band
    // / free-scroll so the only motion is our guided travel.
    const root = document.documentElement
    const prevTouchAction = document.body.style.touchAction
    const prevOverscroll = root.style.overscrollBehaviorY
    document.body.style.touchAction = 'none'
    root.style.overscrollBehaviorY = 'none'

    // Lenis only runs our guided glides — wheel/touch never feed free scroll.
    const lenis = new Lenis({
      lerp: 1,
      smoothWheel: false,
      syncTouch: false,
      wheelMultiplier: 0,
      touchMultiplier: 0,
      // Returning false cancels Lenis consuming the gesture as free scroll.
      virtualScroll: () => false,
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
    syncSectionFromScroll()

    // Capture phase so we beat Lenis / the browser before any free-scroll starts.
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('touchstart', onTouchStart, {
      passive: true,
      capture: true,
    })
    window.addEventListener('touchmove', onTouchMove, {
      passive: false,
      capture: true,
    })
    window.addEventListener('touchend', onTouchEnd, {
      passive: true,
      capture: true,
    })
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onAnchorClick)

    let frame = 0
    let previousTime = performance.now()
    const loop = (time: number) => {
      const delta = Math.min(0.05, (time - previousTime) / 1000)
      previousTime = time

      lenis.raf(time)

      if (loopCooldown > 0) loopCooldown = Math.max(0, loopCooldown - delta)
      if (flash > 0) flash = Math.max(0, flash - delta / LOOP_FLASH_SECONDS)
      tickIntroWarp(delta * 1000)
      tickHeroCopy(delta * 1000)
      refreshWarp()

      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('touchstart', onTouchStart, true)
      window.removeEventListener('touchmove', onTouchMove, true)
      window.removeEventListener('touchend', onTouchEnd, true)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onAnchorClick)
      lenis.destroy()
      lenisInstance = null
      flash = 0
      resetIntroWarp()
      loopCooldown = 0
      paging = false
      gestureLocked = false
      pageToken += 1
      window.clearTimeout(unlockTimer)
      document.body.style.touchAction = prevTouchAction
      root.style.overscrollBehaviorY = prevOverscroll
      veilEnabled = false
      pagingPaused = false
      document.documentElement.style.setProperty('--warp-veil', '0')
      document.documentElement.style.setProperty('--game-veil', '0')
      document.documentElement.style.setProperty('--hero-copy', '0')
    }
  }, [smooth, ready])
}
