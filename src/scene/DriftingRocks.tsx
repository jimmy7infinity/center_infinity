import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../lib/scroll'
import {
  createShellMaterial,
  getShellMaterialUniforms,
} from './shellMaterial'

const POOL_SIZE = 10

/**
 * Distance from the camera, in world units. The shells occupy roughly 8 to 37
 * units out, so the near band passes in front of all of them and the mid band
 * threads between them — debris confined behind the shells reads as a painted
 * backdrop rather than as objects sharing the space.
 */
const DEPTH_BANDS: readonly { range: [number, number]; weight: number }[] = [
  { range: [3.6, 8.5], weight: 0.42 },
  { range: [8.5, 17], weight: 0.38 },
  { range: [17, 34], weight: 0.2 },
]

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

function activateRock(rock: Rock, camera: THREE.PerspectiveCamera) {
  const distance = pickDistance()
  const frameHeight = 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
  const frameWidth = frameHeight * camera.aspect

  // Biased to the upper band. The copy sits below on every breakpoint, and on
  // portrait it takes the whole lower half.
  const fx = 0.06 + Math.random() * 0.88
  const fy =
    Math.random() < 0.82 ? 0.02 + Math.random() * 0.46 : 0.48 + Math.random() * 0.28

  // Mostly across the frame, with enough z to keep them off a shared plane.
  const pitch = (Math.random() - 0.5) * 0.9
  travelDirection
    .set(
      Math.cos(pitch) * (Math.random() < 0.5 ? 1 : -1),
      Math.sin(pitch),
      (Math.random() - 0.5) * 0.35,
    )
    .transformDirection(camera.matrixWorld)

  // Resolved through the camera's own matrix rather than an assumed pose. The
  // rig translates and turns across the beats, and at these distances a fixed
  // reference puts near rocks outside the frame entirely.
  spawnAnchor.set((fx - 0.5) * frameWidth, (0.5 - fy) * frameHeight, -distance)
  camera.localToWorld(spawnAnchor)

  // Wide enough that both ends sit off-frame, so rocks enter and leave rather
  // than appearing and vanishing mid-shot.
  const span = frameWidth * 2.4
  rock.start.copy(spawnAnchor).addScaledVector(travelDirection, -span * 0.5)
  rock.end.copy(spawnAnchor).addScaledVector(travelDirection, span * 0.5)
  rock.progress = 0
  rock.active = true
  // Near rocks cross faster. That parallax is what sells the depth now that
  // they share space with the shells instead of sitting behind them.
  rock.duration = (16 + Math.random() * 12) * (0.5 + distance / 26)
  // Scaled with depth so a rock stays rock-sized on screen at any distance
  // instead of becoming a second moon up close. The band works out to roughly
  // 2–8% of frame height whatever the depth.
  rock.scale = distance * (0.009 + Math.random() * 0.021)

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
        // Deliberately dimmer than the shells' effective 1.4–1.8. Rocks now
        // cross in front of lit crescents, and one that out-shines the moon
        // behind it reads as a pasted-on shard; darker, it reads as a
        // silhouette, which is what conveys "in front".
        intensity: 1.05,
        // Wider than the shells': on something this small a hard terminator
        // collapses to a single bright pixel edge.
        terminator: 0.3,
        ambient: 0.05,
        voidColor: '#121214',
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

    const camera = state.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) return

    spawnTimerRef.current -= delta
    if (spawnTimerRef.current <= 0) {
      const inactive = rocksRef.current.find((rock) => !rock.active)
      if (inactive) {
        activateRock(inactive, camera)
      }
      spawnTimerRef.current = 2.2 + Math.random() * 2.8
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
