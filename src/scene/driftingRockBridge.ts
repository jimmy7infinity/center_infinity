import type * as THREE from 'three'

/**
 * Foreground rocks + meteors live in sibling components. This tiny bridge lets
 * a streak ask “did I clip a rock?” without lifting both into one parent.
 */
type SegmentCollider = (a: THREE.Vector3, b: THREE.Vector3) => boolean
type RayPick = (
  origin: THREE.Vector3,
  dir: THREE.Vector3,
) => { distance: number } | null

let collider: SegmentCollider | null = null
let rayPick: RayPick | null = null

export function setDriftingRockCollider(next: SegmentCollider | null) {
  collider = next
}

export function setDriftingRockRayPick(next: RayPick | null) {
  rayPick = next
}

/** True when the segment destroyed a rock (caller may kill the meteor). */
export function hitDriftingRockWithSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
): boolean {
  return collider?.(a, b) ?? false
}

/**
 * Nearest active rock along a camera ray — used so click-meteors spawn at the
 * same depth as debris they might actually strike.
 */
export function pickDriftingRockAlongRay(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): { distance: number } | null {
  return rayPick?.(origin, dir) ?? null
}
