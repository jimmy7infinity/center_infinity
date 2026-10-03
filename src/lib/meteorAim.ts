/**
 * How an empty-space click becomes a meteor.
 * Click fires immediately. Drag pulls back like a pool cue, then releases the shot.
 */
export type MeteorAimMode = 'click' | 'drag'

export type MeteorShot = {
  /** Press point, NDC. The meteor leaves from here. */
  x: number
  y: number
  /** Shot direction in NDC: press minus the drag point. */
  dx: number
  dy: number
  /** 0–1 from how far the cue was pulled. */
  power: number
}

const listeners = new Set<() => void>()
let version = 0

export const meteorAim = {
  mode: 'click' as MeteorAimMode,
  dragging: false,
  pressX: 0,
  pressY: 0,
  x: 0,
  y: 0,
  shot: null as MeteorShot | null,
  /** The click that ends a drag must not also fire the old click-shot. */
  suppressClick: false,
}

export function subscribeMeteorAim(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getMeteorAimVersion() {
  return version
}

function emit() {
  version += 1
  for (const listener of listeners) listener()
}

export function setMeteorAimMode(mode: MeteorAimMode) {
  if (meteorAim.mode === mode) return
  meteorAim.mode = mode
  meteorAim.dragging = false
  meteorAim.shot = null
  meteorAim.suppressClick = false
  emit()
}

export function noteMeteorAimDrag() {
  emit()
}
