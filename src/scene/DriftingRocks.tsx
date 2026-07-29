import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../lib/scroll'
import {
  createShellMaterial,
  getShellMaterialUniforms,
} from './shellMaterial'

const POOL_SIZE = 7
const CAMERA_Z = 17
const FOV_HALF_RAD = (42 * Math.PI) / 180 / 2

/**
 * Debris reads as one sun-lit field, so unlike the shells (which each carry
 * their own light to match the logo) every rock shares this direction. Tilted
 * back on −Z so the camera sees a rim crescent rather than a flat front face.
 */
const SUN_DIR = new THREE.Vector3(-0.55, 0.86, -0.5).normalize()

type Rock = {
  active: boolean
  progress: number
  duration: number
  scale: number
  start: THREE.Vector3
  end: THREE.Vector3
  tumbleSpeed: THREE.Vector3
  baseRotation: THREE.Euler
}

type Lobe = {
  axis: THREE.Vector3
  amp: number
  freq: number
  phase: number
}

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

function createRockGeometry(seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed)
  const geometry = new THREE.IcosahedronGeometry(1, 3)

  const lobes: Lobe[] = Array.from({ length: 4 }, () => ({
    axis: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      .normalize(),
    // Amplitudes total well under 1 so the radius can never invert.
    amp: 0.05 + rng() * 0.09,
    freq: 1.4 + rng() * 2.8,
    phase: rng() * Math.PI * 2,
  }))

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

function createRock(): Rock {
  return {
    active: false,
    progress: 0,
    duration: 1,
    scale: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    tumbleSpeed: new THREE.Vector3(),
    baseRotation: new THREE.Euler(),
  }
}

function viewportToWorld(
  fx: number,
  fy: number,
  z: number,
  aspect: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const distance = CAMERA_Z - z
  const viewHeight = 2 * distance * Math.tan(FOV_HALF_RAD)
  const viewWidth = viewHeight * aspect
  return out.set((fx - 0.5) * viewWidth, (0.5 - fy) * viewHeight, z)
}

/** Biased to the upper band and the side margins, away from the copy. */
function pickSpawnAnchor(aspect: number, out: THREE.Vector3): THREE.Vector3 {
  const fromSide = Math.random() < 0.55
  const fx = fromSide
    ? Math.random() < 0.5
      ? -0.12 + Math.random() * 0.28
      : 0.84 + Math.random() * 0.28
    : 0.1 + Math.random() * 0.8
  const fy = fromSide ? 0.05 + Math.random() * 0.6 : -0.08 + Math.random() * 0.35

  const distanceFromCamera = 22 + Math.random() * 26
  return viewportToWorld(fx, fy, CAMERA_Z - distanceFromCamera, aspect, out)
}

const spawnAnchor = new THREE.Vector3()
const travelDirection = new THREE.Vector3()

function activateRock(rock: Rock, aspect: number) {
  pickSpawnAnchor(aspect, spawnAnchor)

  travelDirection
    .set(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.5,
    )
    .normalize()

  const travelDistance = 8 + Math.random() * 12
  rock.duration = 26 + Math.random() * 22
  rock.start.copy(spawnAnchor).addScaledVector(travelDirection, -travelDistance * 0.5)
  rock.end.copy(spawnAnchor).addScaledVector(travelDirection, travelDistance * 0.5)
  rock.progress = 0
  rock.active = true
  rock.scale = 0.14 + Math.random() * 0.36

  rock.tumbleSpeed.set(
    (Math.random() - 0.5) * 0.16,
    (Math.random() - 0.5) * 0.16,
    (Math.random() - 0.5) * 0.16,
  )
  rock.baseRotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  )
}

/** Sparse tumbling debris, lit by the same terminator model as the shells. */
export function DriftingRocks() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: POOL_SIZE }, () => null),
  )
  const rocksRef = useRef<Rock[]>(
    Array.from({ length: POOL_SIZE }, () => createRock()),
  )
  const spawnTimerRef = useRef(2)
  const scratchPosition = useMemo(() => new THREE.Vector3(), [])

  const geometries = useMemo(
    () =>
      Array.from({ length: POOL_SIZE }, (_, index) =>
        createRockGeometry(0x9e37 + index * 7919),
      ),
    [],
  )

  const material = useMemo(
    () =>
      createShellMaterial({
        tint: '#8d94a2',
        lightDir: SUN_DIR,
        lightColor: '#e8edf8',
        intensity: 1.9,
        // Wider than the shells': on something this small a hard terminator
        // collapses to a single bright pixel edge.
        terminator: 0.3,
        ambient: 0.05,
        opacity: 1,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      material.dispose()
      for (const geometry of geometries) {
        geometry.dispose()
      }
    }
  }, [material, geometries])

  const uniforms = useMemo(
    () => getShellMaterialUniforms(material),
    [material],
  )

  useFrame((state, delta) => {
    // Static debris would look wrong against streaking stars, so it clears out
    // for the duration of the warp.
    uniforms.uOpacity.value = 1 - scrollState.warp

    const aspect = Math.max(0.2, state.size.width / state.size.height)

    spawnTimerRef.current -= delta
    if (spawnTimerRef.current <= 0) {
      const inactive = rocksRef.current.find((rock) => !rock.active)
      if (inactive) {
        activateRock(inactive, aspect)
      }
      spawnTimerRef.current = 2.5 + Math.random() * 4
    }

    const rocks = rocksRef.current
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

      scratchPosition.lerpVectors(rock.start, rock.end, rock.progress)
      const elapsed = rock.progress * rock.duration

      mesh.visible = true
      mesh.position.copy(scratchPosition)
      mesh.rotation.set(
        rock.baseRotation.x + rock.tumbleSpeed.x * elapsed,
        rock.baseRotation.y + rock.tumbleSpeed.y * elapsed,
        rock.baseRotation.z + rock.tumbleSpeed.z * elapsed,
      )
      mesh.scale.setScalar(rock.scale)
    }
  })

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            meshRefs.current[index] = node
          }}
          geometry={geometries[index]}
          material={material}
          visible={false}
        />
      ))}
    </group>
  )
}
