import { prefersTouchControls } from '../../lib/touch'

/**
 * Mutable input for the space flyer. Attached while the game is mounted;
 * read every frame from the R3F loop — no React re-renders on key repeat.
 */
export const flyerControls = {
  /** Aim in NDC, -1..1, y up. */
  aimX: 0,
  aimY: 0,
  /** CSS pixels — hex aim reticle. */
  clientX: 0,
  clientY: 0,
  thrust: false,
  fire: false,
  /** A / ← — bank & turn left (plane-style). */
  bankLeft: false,
  /** D / → — bank & turn right (plane-style). */
  bankRight: false,
  /**
   * Latched by a double-tap W / mobile burst pad. SpaceFlyer consumes it once.
   */
  burstQueued: false,
  /** True while virtual pads own input (auto-fire, no mouse aim). */
  touchMode: false,
}

/** Ignore aim until the pointer leaves the logo-click nest. */
const AIM_UNLOCK_PX = 28
const DOUBLE_TAP_W_MS = 300

const pressed = new Set<string>()
let aimGated = false
let gateOriginArmed = false
let gateOriginX = 0
let gateOriginY = 0
let pointerFire = false
let touchThrust = false
let lastWDownMs = 0
let touchMode = false

function syncThrust() {
  if (touchMode) {
    flyerControls.thrust = touchThrust
    return
  }
  flyerControls.thrust = pressed.has('KeyW') || pressed.has('ArrowUp')
}

function syncFire() {
  // Touch flights always shoot — one less thumb, and the pad is already busy.
  if (touchMode) {
    flyerControls.fire = true
    return
  }
  flyerControls.fire = pointerFire || pressed.has('Space')
}

function syncBank() {
  if (touchMode) {
    flyerControls.bankLeft = false
    flyerControls.bankRight = false
    return
  }
  flyerControls.bankLeft = pressed.has('KeyA') || pressed.has('ArrowLeft')
  flyerControls.bankRight = pressed.has('KeyD') || pressed.has('ArrowRight')
}

function setAimCentered() {
  const cx = window.innerWidth * 0.5
  const cy = window.innerHeight * 0.5
  flyerControls.clientX = cx
  flyerControls.clientY = cy
  flyerControls.aimX = 0
  flyerControls.aimY = 0
}

function setAimFromClient(clientX: number, clientY: number) {
  flyerControls.clientX = clientX
  flyerControls.clientY = clientY
  flyerControls.aimX = (clientX / window.innerWidth) * 2 - 1
  flyerControls.aimY = -((clientY / window.innerHeight) * 2 - 1)
}

/**
 * Keep the nose centred while the cursor is still on the logo that launched
 * the game. First real pointer travel unlocks free aim.
 */
function applyPointerAim(clientX: number, clientY: number) {
  if (!aimGated) {
    setAimFromClient(clientX, clientY)
    return
  }

  if (!gateOriginArmed) {
    gateOriginX = clientX
    gateOriginY = clientY
    gateOriginArmed = true
    setAimCentered()
    return
  }

  const dx = clientX - gateOriginX
  const dy = clientY - gateOriginY
  if (dx * dx + dy * dy < AIM_UNLOCK_PX * AIM_UNLOCK_PX) {
    setAimCentered()
    return
  }

  aimGated = false
  setAimFromClient(clientX, clientY)
}

function onKeyDown(event: KeyboardEvent) {
  if (
    event.code === 'KeyW' ||
    event.code === 'KeyA' ||
    event.code === 'KeyD' ||
    event.code === 'ArrowUp' ||
    event.code === 'ArrowLeft' ||
    event.code === 'ArrowRight' ||
    event.code === 'Space'
  ) {
    event.preventDefault()
  }

  // Double-tap W (ignore key-repeat) → burst.
  if (
    (event.code === 'KeyW' || event.code === 'ArrowUp') &&
    !event.repeat
  ) {
    const now = performance.now()
    if (now - lastWDownMs <= DOUBLE_TAP_W_MS) {
      flyerControls.burstQueued = true
      lastWDownMs = 0
    } else {
      lastWDownMs = now
    }
  }

  pressed.add(event.code)
  syncThrust()
  syncFire()
  syncBank()
}

function onKeyUp(event: KeyboardEvent) {
  pressed.delete(event.code)
  syncThrust()
  syncFire()
  syncBank()
}

function onPointerMove(event: PointerEvent) {
  if (touchMode) return
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
  applyPointerAim(event.clientX, event.clientY)
}

function onPointerDown(event: PointerEvent) {
  if (touchMode) return
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
  if (event.button !== 0) return
  pointerFire = true
  applyPointerAim(event.clientX, event.clientY)
  syncFire()
}

function onPointerUp(event: PointerEvent) {
  if (touchMode) return
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
  if (event.button !== 0) return
  pointerFire = false
  syncFire()
}

function onBlur() {
  pressed.clear()
  pointerFire = false
  touchThrust = false
  lastWDownMs = 0
  flyerControls.burstQueued = false
  syncThrust()
  syncFire()
  syncBank()
}

/** Stick NDC from the virtual pad (−1..1). Reticle follows for feedback. */
export function setTouchAim(nx: number, ny: number) {
  if (!touchMode) return
  const aimX = Math.max(-1, Math.min(1, nx))
  const aimY = Math.max(-1, Math.min(1, ny))
  flyerControls.aimX = aimX
  flyerControls.aimY = aimY
  flyerControls.clientX = (aimX * 0.5 + 0.5) * window.innerWidth
  flyerControls.clientY = (-aimY * 0.5 + 0.5) * window.innerHeight
}

export function setTouchThrust(on: boolean) {
  if (!touchMode) return
  touchThrust = on
  syncThrust()
}

export function queueTouchBurst() {
  if (!touchMode) return
  flyerControls.burstQueued = true
}

export function isTouchFlight() {
  return touchMode
}

/** Start listening; returns teardown. */
export function attachFlyerControls() {
  touchMode = prefersTouchControls()
  flyerControls.touchMode = touchMode
  aimGated = !touchMode
  gateOriginArmed = false
  pointerFire = false
  touchThrust = false
  lastWDownMs = 0
  setAimCentered()
  flyerControls.thrust = false
  flyerControls.fire = false
  flyerControls.bankLeft = false
  flyerControls.bankRight = false
  flyerControls.burstQueued = false
  pressed.clear()
  syncFire()
  syncThrust()
  syncBank()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('blur', onBlur)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('blur', onBlur)
    pressed.clear()
    aimGated = false
    gateOriginArmed = false
    pointerFire = false
    touchThrust = false
    lastWDownMs = 0
    touchMode = false
    flyerControls.touchMode = false
    flyerControls.thrust = false
    flyerControls.fire = false
    flyerControls.bankLeft = false
    flyerControls.bankRight = false
    flyerControls.burstQueued = false
  }
}
