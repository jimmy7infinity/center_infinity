import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { recordMeteorStrike } from '../lib/achievements'
import { INK_SURFACE_DISPLAY } from './InkEffect'
import { createRockBurstSystem } from '../game/spaceFlyer/rockBurst'
import {
  setDriftingRockCollider,
  setDriftingRockRayPick,
} from './driftingRockBridge'
import { createShellMaterial } from './shellMaterial'

const DRIFT_COUNT = 5
const GIANT_COUNT = 1
const SHARD_COUNT = 11
const SHOWER_COUNT = 18
const POOL_SIZE = DRIFT_COUNT + GIANT_COUNT + SHARD_COUNT + SHOWER_COUNT
const GEO_COUNT = 6

/** One giant and one shower per five minutes, offset so they don't arrive together. */
const RARE_INTERVAL = 5 * 60

/**
 * Distance from the camera, in world units. A single near band keeps debris
 * between the lens and the shells (~20+ units out at hero).
 */
const DEPTH_BANDS: readonly { range: [number, number]; weight: number }[] = [
  { range: [2.8, 6.2], weight: 1 },
]

/**
 * Debris reads as one sun-lit field, so unlike the shells (which each carry
 * their own light to match the logo) every rock shares this direction. Tilted
 * back on −Z so the camera sees a rim crescent rather than a flat front face.
 */
const SUN_DIR = new THREE.Vector3(-0.55, 0.86, -0.5).normalize()

/**
 * The debris canvas skips the ink pass, so the rocks are inked here: neutral
 * light pigment, with the unlit side landing exactly on the bare panel. This
 * shader writes display values directly, so the tones are given as such — a
 * hex tint would be linearised and land darker than the panel itself.
 */
const ROCK_TINT = new THREE.Color().setRGB(
  0.8,
  0.79,
  0.76,
  THREE.LinearSRGBColorSpace,
)
const ROCK_LIGHT = new THREE.Color(1, 1, 1)
const ROCK_TOON_STEPS = 3

/** World hit radius pad — rocks are tiny on screen; streaks need forgiveness. */
const MIN_HIT_RADIUS = 0.22

const _ab = new THREE.Vector3()
const _ac = new THREE.Vector3()
const _closest = new THREE.Vector3()
const _burstOrigin = new THREE.Vector3()

type RockKind = 'drift' | 'giant' | 'shard' | 'shower'

type Rock = {
  kind: RockKind
  active: boolean
  progress: number
  duration: number
  scale: number
  start: THREE.Vector3
  end: THREE.Vector3
  position: THREE.Vector3
  tumbleSpeed: THREE.Vector3
  baseRotation: THREE.Euler
}

type Lobe = {
  axis: THREE.Vector3
  amp: number
  freq: number
  phase: number
}

const _oc = new THREE.Vector3()

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

/**
 * Area-weighted normals averaged across coincident vertices.
 *
 * Polyhedron geometry is non-indexed, so `computeVertexNormals` gives every
 * triangle a single flat normal — which is what made these read as folded paper
 * rather than rock. Averaging by position instead yields a smooth surface with
 * no shading break where the faces meet.
 */
function applySmoothNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position
  const sums = new Map<string, THREE.Vector3>()
  const keys: string[] = new Array(position.count)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const faceNormal = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    keys[i] = `${position.getX(i).toFixed(4)}|${position.getY(i).toFixed(4)}|${position.getZ(i).toFixed(4)}`
  }

  for (let f = 0; f + 2 < position.count; f += 3) {
    a.fromBufferAttribute(position, f)
    b.fromBufferAttribute(position, f + 1)
    c.fromBufferAttribute(position, f + 2)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    // Left unnormalised so larger triangles carry proportionally more weight.
    faceNormal.crossVectors(ab, ac)

    for (let k = 0; k < 3; k++) {
      const key = keys[f + k]
      const existing = sums.get(key)
      if (existing) {
        existing.add(faceNormal)
      } else {
        sums.set(key, faceNormal.clone())
      }
    }
  }

  const normals = new Float32Array(position.count * 3)
  const scratch = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    const sum = sums.get(keys[i])
    scratch.copy(sum ?? new THREE.Vector3(0, 1, 0)).normalize()
    normals[i * 3] = scratch.x
    normals[i * 3 + 1] = scratch.y
    normals[i * 3 + 2] = scratch.z
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
}

/** Radial displacement: overlapping smooth lobes carve an irregular boulder. */
function rockRadius(direction: THREE.Vector3, lobes: Lobe[]): number {
  let radius = 1
  for (const lobe of lobes) {
    radius +=
      lobe.amp * Math.cos(direction.dot(lobe.axis) * lobe.freq + lobe.phase)
  }
  return radius
}

/** Irregular boulder mesh — shared with the flyer minigame orbit rocks. */
export function createRockGeometry(seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed)
  // Subdivided enough to resolve the craggy lobes below. These now pass close
  // to camera, where a smooth boulder reads as a paper shard.
  const geometry = new THREE.IcosahedronGeometry(1, 5)

  const makeLobes = (count: number, ampBase: number, ampSpread: number, freqBase: number, freqSpread: number) =>
    Array.from({ length: count }, () => ({
      axis: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
      amp: ampBase + rng() * ampSpread,
      freq: freqBase + rng() * freqSpread,
      phase: rng() * Math.PI * 2,
    }))

  // Amplitudes total well under 1 so the radius can never invert. The low
  // frequencies give the boulder its overall shape; the high ones give it an
  // irregular terminator, which is most of what makes it read as rock.
  const lobes: Lobe[] = [
    ...makeLobes(4, 0.055, 0.09, 1.4, 2.6),
    ...makeLobes(7, 0.012, 0.028, 5.5, 8.5),
  ]

  const position = geometry.attributes.position
  const direction = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i).normalize()
    const radius = rockRadius(direction, lobes)
    position.setXYZ(
      i,
      direction.x * radius,
      direction.y * radius,
      direction.z * radius,
    )
  }
  position.needsUpdate = true

  // Asteroids are elongated. Baked into the geometry rather than applied as a
  // mesh scale so the normals below stay correct.
  geometry.scale(1, 0.72 + rng() * 0.2, 0.82 + rng() * 0.24)
  applySmoothNormals(geometry)
  geometry.computeBoundingSphere()

  return geometry
}

function kindForIndex(index: number): RockKind {
  if (index < DRIFT_COUNT) return 'drift'
  if (index < DRIFT_COUNT + GIANT_COUNT) return 'giant'
  if (index < DRIFT_COUNT + GIANT_COUNT + SHARD_COUNT) return 'shard'
  return 'shower'
}

function createRock(index: number): Rock {
  return {
    kind: kindForIndex(index),
    active: false,
    progress: 0,
    duration: 1,
    scale: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    position: new THREE.Vector3(),
    tumbleSpeed: new THREE.Vector3(),
    baseRotation: new THREE.Euler(),
  }
}

function pickDistance(): number {
  let roll = Math.random()
  for (const band of DEPTH_BANDS) {
    if (roll < band.weight) {
      return band.range[0] + (roll / band.weight) * (band.range[1] - band.range[0])
    }
    roll -= band.weight
  }
  const last = DEPTH_BANDS[DEPTH_BANDS.length - 1].range
  return last[0] + Math.random() * (last[1] - last[0])
}

const spawnAnchor = new THREE.Vector3()
const travelDirection = new THREE.Vector3()
const _memberAnchor = new THREE.Vector3()
const _camRight = new THREE.Vector3()
const _camUp = new THREE.Vector3()
const _travel = new THREE.Vector3()
const _perp = new THREE.Vector3()
const _bin = new THREE.Vector3()
const _shardDir = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_X = new THREE.Vector3(1, 0, 0)

/**
 * Points `travelDirection` across the view and parks `spawnAnchor` on screen.
 * Both are in world space. Callers then push the path off either edge.
 */
function aimTransit(
  camera: THREE.PerspectiveCamera,
  distance: number,
  fx: number,
  fy: number,
  pitch: number,
  zJitter: number,
) {
  const frameHeight = 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
  const frameWidth = frameHeight * camera.aspect
  travelDirection
    .set(
      Math.cos(pitch) * (Math.random() < 0.5 ? 1 : -1),
      Math.sin(pitch),
      (Math.random() - 0.5) * zJitter,
    )
    .transformDirection(camera.matrixWorld)
  // Resolved through the camera's own matrix rather than an assumed pose. The
  // rig translates and turns across the beats, and at these distances a fixed
  // reference puts near rocks outside the frame entirely.
  spawnAnchor.set((fx - 0.5) * frameWidth, (0.5 - fy) * frameHeight, -distance)
  camera.localToWorld(spawnAnchor)
  return { frameWidth, frameHeight }
}

function layPath(
  rock: Rock,
  anchor: THREE.Vector3,
  direction: THREE.Vector3,
  span: number,
  duration: number,
) {
  rock.start.copy(anchor).addScaledVector(direction, -span * 0.5)
  rock.end.copy(anchor).addScaledVector(direction, span * 0.5)
  rock.progress = 0
  rock.duration = duration
  rock.active = true
}

function setTumble(rock: Rock, rate: number) {
  rock.tumbleSpeed.set(
    (Math.random() - 0.5) * rate,
    (Math.random() - 0.5) * rate,
    (Math.random() - 0.5) * rate,
  )
  rock.baseRotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  )
}

function activateRock(rock: Rock, camera: THREE.PerspectiveCamera) {
  const distance = pickDistance()
  // Biased to the upper band. The copy sits below on every breakpoint, and on
  // portrait it takes the whole lower half.
  const fx = 0.06 + Math.random() * 0.88
  const fy =
    Math.random() < 0.82 ? 0.02 + Math.random() * 0.46 : 0.48 + Math.random() * 0.28
  const pitch = (Math.random() - 0.5) * 0.9
  const { frameWidth } = aimTransit(camera, distance, fx, fy, pitch, 0.16)
  // Wide enough that both ends sit off-frame, so rocks enter and leave rather
  // than appearing and vanishing mid-shot.
  const span = frameWidth * 2.4
  // Near rocks cross faster. That parallax is what sells the depth now that
  // they share space with the shells instead of sitting behind them.
  layPath(
    rock,
    spawnAnchor,
    travelDirection,
    span,
    (16 + Math.random() * 12) * (0.5 + distance / 26),
  )
  // Scaled with depth so a rock stays rock-sized on screen at any distance
  // instead of becoming a second moon up close.
  rock.scale = distance * (0.0045 + Math.random() * 0.010)
  setTumble(rock, 0.16)
}

/** A slow hulk. Same crossing, several times the size, a fraction of the speed. */
function activateGiant(rock: Rock, camera: THREE.PerspectiveCamera) {
  const distance = pickDistance()
  const fx = 0.12 + Math.random() * 0.76
  const fy =
    Math.random() < 0.75 ? 0.08 + Math.random() * 0.4 : 0.48 + Math.random() * 0.2
  const pitch = (Math.random() - 0.5) * 0.45
  const { frameWidth } = aimTransit(camera, distance, fx, fy, pitch, 0.08)
  layPath(
    rock,
    spawnAnchor,
    travelDirection,
    frameWidth * 2.6,
    (78 + Math.random() * 36) * (0.55 + distance / 30),
  )
  rock.scale = distance * (0.08 + Math.random() * 0.028)
  setTumble(rock, 0.05)
}

/**
 * A meteor shower: one direction, a loose cloud of rocks crossing together.
 * Returns false when too few slots are free to read as a cluster.
 */
function activateShower(slots: Rock[], camera: THREE.PerspectiveCamera) {
  const open = slots.filter((rock) => !rock.active)
  if (open.length < 12) return false
  const distance = pickDistance()
  const fx = 0.2 + Math.random() * 0.6
  const fy = 0.06 + Math.random() * 0.4
  const pitch = (Math.random() - 0.5) * 0.35
  const { frameWidth, frameHeight } = aimTransit(camera, distance, fx, fy, pitch, 0.05)
  _camRight.setFromMatrixColumn(camera.matrixWorld, 0)
  _camUp.setFromMatrixColumn(camera.matrixWorld, 1)
  const span = frameWidth * 2.4
  const baseDuration = (14 + Math.random() * 8) * (0.5 + distance / 26)
  const count = Math.min(open.length, 14 + Math.floor(Math.random() * 5))
  for (let i = 0; i < count; i++) {
    const rock = open[i]
    _memberAnchor
      .copy(spawnAnchor)
      .addScaledVector(_camRight, (Math.random() - 0.5) * frameWidth * 0.46)
      .addScaledVector(_camUp, (Math.random() - 0.5) * frameHeight * 0.32)
      .addScaledVector(travelDirection, (Math.random() - 0.5) * frameWidth * 0.18)
    layPath(rock, _memberAnchor, travelDirection, span, baseDuration * (0.9 + Math.random() * 0.2))
    rock.scale = distance * (0.0038 + Math.random() * 0.006)
    rock.progress = Math.random() * 0.05
    setTumble(rock, 0.16)
  }
  return true
}

/** The giant's pieces. They keep going, fanned out and quicker than the hulk. */
function spawnShards(parent: Rock, rocks: Rock[]) {
  _travel.subVectors(parent.end, parent.start)
  const parentSpeed = _travel.length() / Math.max(parent.duration, 0.001)
  if (_travel.lengthSq() < 1e-8) _travel.set(1, 0, 0)
  else _travel.normalize()
  _perp.crossVectors(_travel, WORLD_UP)
  if (_perp.lengthSq() < 1e-6) _perp.crossVectors(_travel, WORLD_X)
  _perp.normalize()
  _bin.crossVectors(_travel, _perp).normalize()

  const open = rocks.filter((rock) => rock.kind === 'shard' && !rock.active)
  const count = Math.min(open.length, 8 + Math.floor(Math.random() * 3))
  for (let i = 0; i < count; i++) {
    const rock = open[i]
    const yaw = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
    const spread = 0.32 + Math.random() * 0.38
    _shardDir
      .copy(_travel)
      .addScaledVector(_perp, Math.cos(yaw) * spread)
      .addScaledVector(_bin, Math.sin(yaw) * spread)
      .normalize()
    const flight = 8 + Math.random() * 5
    const span = parentSpeed * (4.5 + Math.random() * 3) * flight
    rock.start.copy(parent.position).addScaledVector(_shardDir, parent.scale * 1.6)
    rock.end.copy(rock.start).addScaledVector(_shardDir, Math.max(span, parent.scale * 18))
    rock.progress = 0
    rock.duration = flight
    rock.scale = parent.scale * (0.18 + Math.random() * 0.14)
    rock.active = true
    setTumble(rock, 0.85)
  }
}

/** Nearer positive ray–sphere hit, or -1. */
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
  if (t0 > 0.02) return t0
  if (t1 > 0.02) return t1
  return -1
}

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

function hitRadiusFor(rock: Rock, geoRadius: number) {
  // The giant is a large, slow target. The same pad as the pebbles leaves
  // most of its body as a miss.
  const reach = rock.kind === 'giant' ? 5 : 2.4
  return Math.max(rock.scale * geoRadius * reach, MIN_HIT_RADIUS)
}

/** Sparse tumbling debris, lit by the same terminator model as the shells. */
export function DriftingRocks() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: POOL_SIZE }, () => null),
  )
  const rocksRef = useRef<Rock[]>(
    Array.from({ length: POOL_SIZE }, (_, index) => createRock(index)),
  )
  const spawnTimerRef = useRef(2)
  const giantTimerRef = useRef(RARE_INTERVAL)
  const showerTimerRef = useRef(RARE_INTERVAL * 0.5)
  const geoRadii = useRef<number[]>(Array.from({ length: POOL_SIZE }, () => 1))

  const geometries = useMemo(
    () =>
      Array.from({ length: GEO_COUNT }, (_, index) =>
        createRockGeometry(0x9e37 + index * 7919),
      ),
    [],
  )

  const material = useMemo(
    () =>
      createShellMaterial({
        tint: ROCK_TINT,
        lightDir: SUN_DIR,
        lightColor: ROCK_LIGHT,
        // Dimmer than the shells so rocks read as silhouettes in front, not
        // pasted-on shards that outshine the moons behind them.
        intensity: 1.05,
        // Wider than the shells': on something this small a hard terminator
        // collapses to a single bright pixel edge.
        terminator: 0.3,
        ambient: 0.05,
        voidColor: INK_SURFACE_DISPLAY,
        toonSteps: ROCK_TOON_STEPS,
        opacity: 1,
      }),
    [],
  )

  const bursts = useMemo(
    () =>
      createRockBurstSystem({
        disintegrate: true,
        fire: true,
        maxBursts: 6,
      }),
    [],
  )

  useEffect(() => {
    for (let i = 0; i < POOL_SIZE; i++) {
      const geometry = geometries[i % geometries.length]
      geoRadii.current[i] = geometry.boundingSphere?.radius ?? 1
    }

    const destroyRock = (index: number) => {
      const rock = rocksRef.current[index]
      if (!rock?.active) return false
      const mesh = meshRefs.current[index]
      _burstOrigin.copy(rock.position)
      // Match the visible boulder — a slight overshoot, not a screen-filling blast.
      const fxSize = Math.max(rock.scale * geoRadii.current[index] * 1.2, 0.028)
      if (rock.kind === 'giant') {
        bursts.spawn(_burstOrigin, fxSize, 'giant')
        bursts.spawn(_burstOrigin, fxSize, 'giant')
      } else {
        bursts.spawn(_burstOrigin, fxSize)
      }
      switch (rock.kind) {
        case 'giant':
          spawnShards(rock, rocksRef.current)
          break
        case 'drift':
        case 'shard':
        case 'shower':
          break
        default: {
          const exhaustive: never = rock.kind
          return exhaustive
        }
      }
      rock.active = false
      if (mesh) mesh.visible = false
      recordMeteorStrike()
      return true
    }

    setDriftingRockCollider((a, b) => {
      const rocks = rocksRef.current
      let best = -1
      let bestDist = Infinity
      for (let i = 0; i < POOL_SIZE; i++) {
        const rock = rocks[i]
        if (!rock.active) continue
        const radius = hitRadiusFor(rock, geoRadii.current[i])
        if (!segmentHitsSphere(a, b, rock.position, radius)) continue
        const dist = a.distanceToSquared(rock.position)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
      if (best < 0) return false
      return destroyRock(best)
    })

    setDriftingRockRayPick((origin, dir) => {
      const rocks = rocksRef.current
      let bestT = Infinity
      let best = -1
      for (let i = 0; i < POOL_SIZE; i++) {
        const rock = rocks[i]
        if (!rock.active) continue
        const body = hitRadiusFor(rock, geoRadii.current[i])
        // Small rocks need a wide grab. The giant's own radius is already
        // the generous one, so it isn't clamped back down to pebble size.
        const radius =
          rock.kind === 'giant' ? body : Math.min(body * 2.4, body + 0.45)
        const t = raySphere(origin, dir, rock.position, radius)
        if (t > 0 && t < bestT) {
          bestT = t
          best = i
        }
      }
      if (best < 0) return null
      return { distance: bestT, point: rocks[best].position }
    })

    return () => {
      setDriftingRockCollider(null)
      setDriftingRockRayPick(null)
      material.dispose()
      for (const geometry of geometries) {
        geometry.dispose()
      }
      bursts.dispose()
    }
  }, [material, geometries, bursts])

  useFrame((state, delta) => {
    const camera = state.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) return

    const rocks = rocksRef.current

    spawnTimerRef.current -= delta
    if (spawnTimerRef.current <= 0) {
      const inactive = rocks.find((rock) => rock.kind === 'drift' && !rock.active)
      if (inactive) activateRock(inactive, camera)
      spawnTimerRef.current = 4.5 + Math.random() * 5.5
    }

    giantTimerRef.current -= delta
    if (giantTimerRef.current <= 0) {
      const giant = rocks.find((rock) => rock.kind === 'giant' && !rock.active)
      if (giant) {
        activateGiant(giant, camera)
        giantTimerRef.current = RARE_INTERVAL
      } else {
        giantTimerRef.current = 20
      }
    }

    showerTimerRef.current -= delta
    if (showerTimerRef.current <= 0) {
      const shower = rocks.filter((rock) => rock.kind === 'shower')
      if (activateShower(shower, camera)) {
        showerTimerRef.current = RARE_INTERVAL
      } else {
        showerTimerRef.current = 20
      }
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const rock = rocks[i]
      const mesh = meshRefs.current[i]
      if (!mesh) continue

      if (!rock.active) {
        mesh.visible = false
        continue
      }

      rock.progress += delta / rock.duration
      if (rock.progress >= 1) {
        rock.active = false
        mesh.visible = false
        continue
      }

      rock.position.lerpVectors(rock.start, rock.end, rock.progress)
      const elapsed = rock.progress * rock.duration

      mesh.visible = true
      mesh.position.copy(rock.position)
      mesh.rotation.set(
        rock.baseRotation.x + rock.tumbleSpeed.x * elapsed,
        rock.baseRotation.y + rock.tumbleSpeed.y * elapsed,
        rock.baseRotation.z + rock.tumbleSpeed.z * elapsed,
      )
      mesh.scale.setScalar(rock.scale)
    }

    bursts.update(Math.min(0.05, delta))
  })

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            meshRefs.current[index] = node
          }}
          geometry={geometries[index % geometries.length]}
          material={material}
          visible={false}
          renderOrder={5}
        />
      ))}
      {bursts.pieceMeshes.map((mesh, index) => (
        <primitive key={`shard-${index}`} object={mesh} />
      ))}
      <primitive object={bursts.sparkMesh} />
      {bursts.dustMesh ? <primitive object={bursts.dustMesh} /> : null}
    </group>
  )
}
