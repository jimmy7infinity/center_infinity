import * as THREE from 'three'
import { rockHitRadius, type Rock } from './combat'

/**
 * Shared reticle aim — updated each frame, used for ship turn + shot direction.
 * Shots follow this (not the lagging nose) so the bolt tracks the hex.
 */
export const flyerAim = {
  /** World point under / through the reticle. */
  point: new THREE.Vector3(),
  /** Fire direction from the ship toward `point`. */
  direction: new THREE.Vector3(0, 0, -1),
  /** Muzzle world position. */
  muzzle: new THREE.Vector3(),
}

const _oc = new THREE.Vector3()
const _hit = new THREE.Vector3()

/**
 * Ray vs sphere. Returns distance along ray to the nearer hit, or -1.
 */
function raySphere(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  centre: THREE.Vector3,
  radius: number,
) {
  _oc.subVectors(origin, centre)
  const b = _oc.dot(dir)
  const c = _oc.lengthSq() - radius * radius
  const disc = b * b - c
  if (disc < 0) return -1
  const s = Math.sqrt(disc)
  const t0 = -b - s
  const t1 = -b + s
  if (t0 > 0.05) return t0
  if (t1 > 0.05) return t1
  return -1
}

/**
 * Closest rock under the camera reticle ray, if any.
 */
export function pickReticleRock(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  rocks: Rock[],
) {
  let bestT = Infinity
  let best: Rock | null = null
  for (const rock of rocks) {
    if (!rock.alive) continue
    const t = raySphere(origin, dir, rock.position, rockHitRadius(rock) * 1.05)
    if (t > 0 && t < bestT) {
      bestT = t
      best = rock
    }
  }
  if (!best) return null
  _hit.copy(origin).addScaledVector(dir, bestT)
  return { rock: best, point: _hit, distance: bestT }
}

/**
 * Depth along the view ray that sits ~`lead` units ahead of the ship —
 * keeps empty-space aim on the reticle plane instead of a fixed world range.
 */
export function reticleDepthAheadOfShip(
  cameraPos: THREE.Vector3,
  camFwd: THREE.Vector3,
  shipPos: THREE.Vector3,
  lead: number,
) {
  _oc.subVectors(shipPos, cameraPos)
  const along = _oc.dot(camFwd)
  return Math.max(along + lead, along + 2)
}
