import * as THREE from 'three'
import { recordRockDestroyed } from '../../lib/achievements'
import { addGameScore, POINTS_PER_ROCK } from '../../lib/gameMode'

export const MAX_SHOTS = 48
/** Fixed field — seeded once, never respawns mid-run. */
export const MAX_ROCKS = 18
export const SHOT_SPEED = 42
export const SHOT_LIFE = 1.35
export const FIRE_COOLDOWN = 0.16
/** Visual mesh scale multiplier (geometry radius ≈ 1). */
export const ROCK_MESH_SCALE = 1
/** Clear air between rock surface and any planet surface. */
export const PLANET_CLEARANCE = 0.55

export type Shot = {
  alive: boolean
  life: number
  position: THREE.Vector3
  prevPosition: THREE.Vector3
  velocity: THREE.Vector3
}

export type Rock = {
  alive: boolean
  hostId: string
  orbitRadius: number
  angle: number
  spin: number
  tilt: number
  /** World-space visual radius (mesh.scale). */
  size: number
  position: THREE.Vector3
}

export type PlanetBody = {
  centre: THREE.Vector3
  radius: number
}

export function createShotPool(): Shot[] {
  return Array.from({ length: MAX_SHOTS }, () => ({
    alive: false,
    life: 0,
    position: new THREE.Vector3(),
    prevPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  }))
}

export function createRockPool(): Rock[] {
  return Array.from({ length: MAX_ROCKS }, () => ({
    alive: false,
    hostId: '',
    orbitRadius: 4,
    angle: 0,
    spin: 0.08,
    tilt: 0,
    size: 0.35,
    position: new THREE.Vector3(),
  }))
}

export function fireShot(
  shots: Shot[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
) {
  for (const shot of shots) {
    if (shot.alive) continue
    shot.alive = true
    shot.life = SHOT_LIFE
    shot.position.copy(origin)
    shot.prevPosition.copy(origin)
    shot.velocity.copy(direction).normalize().multiplyScalar(SHOT_SPEED)
    return true
  }
  return false
}

export function stepShots(shots: Shot[], dt: number) {
  for (const shot of shots) {
    if (!shot.alive) continue
    shot.prevPosition.copy(shot.position)
    shot.life -= dt
    if (shot.life <= 0) {
      shot.alive = false
      continue
    }
    shot.position.addScaledVector(shot.velocity, dt)
  }
}

const _orbit = new THREE.Vector3()
const _tiltAxis = new THREE.Vector3()
const _ab = new THREE.Vector3()
const _ac = new THREE.Vector3()
const _closest = new THREE.Vector3()
const _push = new THREE.Vector3()
const _fallbackAxis = new THREE.Vector3(1, 0, 0)

function segmentHitsSphere(
  a: THREE.Vector3,
  b: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
) {
  _ab.subVectors(b, a)
  const abLenSq = _ab.lengthSq()
  if (abLenSq < 1e-10) {
    return a.distanceToSquared(center) <= radius * radius
  }
  _ac.subVectors(center, a)
  const t = THREE.MathUtils.clamp(_ac.dot(_ab) / abLenSq, 0, 1)
  _closest.copy(a).addScaledVector(_ab, t)
  return _closest.distanceToSquared(center) <= radius * radius
}

export function rockHitRadius(rock: Rock) {
  return rock.size * ROCK_MESH_SCALE * 0.92
}

/** Keep a rock outside every planet shell (+ clearance). */
export function separateRockFromPlanets(
  rock: Rock,
  planets: PlanetBody[],
) {
  for (const planet of planets) {
    _push.copy(rock.position).sub(planet.centre)
    const dist = _push.length()
    const minDist = planet.radius + rock.size * ROCK_MESH_SCALE + PLANET_CLEARANCE
    if (dist < 1e-5) {
      rock.position.copy(planet.centre).addScaledVector(_fallbackAxis, minDist)
      continue
    }
    if (dist < minDist) {
      _push.multiplyScalar(1 / dist)
      rock.position.copy(planet.centre).addScaledVector(_push, minDist)
    }
  }
}

export function stepRocks(
  rocks: Rock[],
  centres: Map<string, THREE.Vector3>,
  hostRadii: Map<string, number>,
  planets: PlanetBody[],
  dt: number,
) {
  for (const rock of rocks) {
    if (!rock.alive) continue

    const centre = centres.get(rock.hostId)
    if (!centre) continue

    const hostRadius = hostRadii.get(rock.hostId) ?? 0
    const minOrbit =
      hostRadius + rock.size * ROCK_MESH_SCALE + PLANET_CLEARANCE + 0.35
    if (rock.orbitRadius < minOrbit) rock.orbitRadius = minOrbit

    rock.angle += rock.spin * dt
    // Keep the path nearly circular so tilt can’t pull the rock into the host.
    _orbit.set(
      Math.cos(rock.angle) * rock.orbitRadius,
      Math.sin(rock.angle) * rock.orbitRadius * Math.sin(rock.tilt * 0.35),
      Math.sin(rock.angle) * rock.orbitRadius * Math.cos(rock.tilt * 0.35),
    )
    _tiltAxis.set(0.15, 1, 0.1).normalize()
    _orbit.applyAxisAngle(_tiltAxis, rock.tilt * 0.25)
    // Renormalize to the clearance orbit so inclination doesn’t shrink radius.
    if (_orbit.lengthSq() > 1e-8) {
      _orbit.setLength(rock.orbitRadius)
    }
    rock.position.copy(centre).add(_orbit)
    separateRockFromPlanets(rock, planets)
  }
}

export function resolveShotHits(
  shots: Shot[],
  rocks: Rock[],
  onHit?: (position: THREE.Vector3, size: number) => void,
) {
  let hits = 0
  for (const shot of shots) {
    if (!shot.alive) continue
    for (const rock of rocks) {
      if (!rock.alive) continue
      const radius = rockHitRadius(rock)
      if (
        !segmentHitsSphere(
          shot.prevPosition,
          shot.position,
          rock.position,
          radius,
        )
      ) {
        continue
      }
      shot.alive = false
      rock.alive = false
      onHit?.(rock.position, rock.size)
      hits += 1
      addGameScore(POINTS_PER_ROCK)
      recordRockDestroyed()
      break
    }
  }
  return hits
}
