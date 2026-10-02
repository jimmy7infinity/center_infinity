import { useEffect } from 'react'
import { BEATS, LAST_BEAT } from './beats'
import { runRefresh } from './refresh'

/**
 * The display shows one page at a time. Turning a page is an e-ink refresh,
 * never a scroll — the scene reads `pageState.index` per frame.
 */
export const pageState = {
  index: 0,
}

/** After a turn, ignore trackpad coast so one flick is exactly one page. */
const GESTURE_COOLDOWN_MS = 520
const WHEEL_THRESHOLD = 8
const TOUCH_THRESHOLD_PX = 48
/** Wheel events closer than this belong to the same gesture. */
const GESTURE_GAP_MS = 180

let entered = false
let entering = false
let turning = false
let gestureLocked = false
let pagingPaused = false
let unlockTimer = 0
let touchOrigin: { y: number; scroller: HTMLElement | null } | null = null
let lastWheelAt = 0
/** The current wheel gesture already scrolled a page's own content. */
let wheelGestureScrolled = false

const listeners = new Set<(index: number) => void>()

function setIndex(next: number) {
  pageState.index = next
  for (const listener of listeners) listener(next)
}

export function getPageIndex() {
  return pageState.index
}

export function subscribePage(listener: (index: number) => void) {
  listeners.add(listener)
  listener(pageState.index)
  return () => {
    listeners.delete(listener)
  }
}

export function hasEntered() {
  return entered
}

/** First draw of the hero; `onShown` runs while the panel is blank. */
export function enterSite(onShown: () => void) {
  if (entered || entering) return
  entering = true
  void runRefresh(() => {
    entered = true
    setIndex(0)
    onShown()
  })
}

function lockGesture() {
  gestureLocked = true
  window.clearTimeout(unlockTimer)
  unlockTimer = window.setTimeout(() => {
    gestureLocked = false
  }, GESTURE_COOLDOWN_MS)
}

/** Past the last page loops home, like the end of a book back to its cover. */
export function goToPage(index: number) {
  if (!entered) return
  const next = index > LAST_BEAT ? 0 : Math.max(0, index)
  if (next === pageState.index) return

  turning = true
  void runRefresh(() => setIndex(next)).then(() => {
    turning = false
    lockGesture()
  })
}

function turnPage(delta: number) {
  if (turning || gestureLocked || pagingPaused || !entered) return
  if (delta < 0 && pageState.index === 0) return
  goToPage(pageState.index + (delta > 0 ? 1 : -1))
}

/** Minigame owns input while it runs. */
export function setPagingPaused(paused: boolean) {
  pagingPaused = paused
  touchOrigin = null
}

/** The page's own scroller, when its content is taller than the display. */
function scrollerFor(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-page-scroll]')
    : null
}

/** A modal owns its own input; nothing in it turns pages. */
function inDialog(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('dialog')
}

function canScroll(scroller: HTMLElement | null, delta: number) {
  if (!scroller) return false
  const max = scroller.scrollHeight - scroller.clientHeight
  if (max <= 1) return false
  return delta > 0 ? scroller.scrollTop < max - 1 : scroller.scrollTop > 1
}

function onWheel(event: WheelEvent) {
  if (inDialog(event.target)) return
  const now = performance.now()
  const newGesture = now - lastWheelAt > GESTURE_GAP_MS
  lastWheelAt = now
  if (newGesture) wheelGestureScrolled = false

  if (canScroll(scrollerFor(event.target), event.deltaY)) {
    wheelGestureScrolled = true
    return
  }
  event.preventDefault()
  // Coasting off the end of a long page must not also turn it.
  if (wheelGestureScrolled) return
  if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) return
  turnPage(event.deltaY)
}

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1 || inDialog(event.target)) return
  touchOrigin = {
    y: event.touches[0].clientY,
    scroller: scrollerFor(event.target),
  }
}

function onTouchEnd(event: TouchEvent) {
  const origin = touchOrigin
  touchOrigin = null
  const endY = event.changedTouches[0]?.clientY
  if (!origin || endY === undefined) return
  const dy = origin.y - endY
  if (Math.abs(dy) < TOUCH_THRESHOLD_PX) return
  // A swipe that scrolled the page's content is reading, not turning.
  if (canScroll(origin.scroller, dy)) return
  turnPage(dy)
}

function onKeyDown(event: KeyboardEvent) {
  const el = event.target
  if (inDialog(el)) return
  if (
    el instanceof HTMLElement &&
    (el.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName))
  ) {
    return
  }
  const key = event.key
  if (key === 'ArrowDown' || key === 'PageDown' || key === ' ' || key === 'ArrowRight') {
    event.preventDefault()
    turnPage(1)
  } else if (key === 'ArrowUp' || key === 'PageUp' || key === 'ArrowLeft') {
    event.preventDefault()
    turnPage(-1)
  }
}

function pageForHash(id: string) {
  if (id === 'top') return 0
  if (id === 'work') return BEATS.indexOf('work-1')
  return BEATS.findIndex((beat) => beat === id)
}

function onAnchorClick(event: MouseEvent) {
  const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]')
  const href = anchor?.getAttribute('href')
  if (!href || href === '#') return
  const index = pageForHash(href.slice(1))
  if (index < 0) return
  event.preventDefault()
  goToPage(index)
}

/** Wheel, touch, keys and in-page links all turn pages. */
export function usePageInput(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onAnchorClick)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onAnchorClick)
      window.clearTimeout(unlockTimer)
    }
  }, [enabled])
}
