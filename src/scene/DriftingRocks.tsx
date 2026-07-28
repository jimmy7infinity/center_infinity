import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createLunarTexture } from './lunarTexture'

const POOL_SIZE = 2
const CAMERA_Z = 17
const FOV_HALF_RAD = (42 * Math.PI) / 180 / 2

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

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function createRockGeometry(seed: number): THREE.BufferGeometry {
  const rng = seededRandom(seed)
  const useDodeca = rng() > 0.5
  const geo = useDodeca
    ? new THREE.DodecahedronGeometry(1, 0)
    : new THREE.IcosahedronGeometry(1, 0)
  const pos = geo.attributes.position

  for (let i = 0; i < pos.count; i++) {
    const jitter = 0.68 + rng() * 0.58
    pos.setXYZ(
      i,
      pos.getX(i) * jitter,
      pos.getY(i) * jitter,
      pos.getZ(i) * jitter,
    )
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
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

function viewSizeAtDepth(z: number): { width: number; height: number } {
  const d = CAMERA_Z - z
  const height = 2 * d * Math.tan(FOV_HALF_RAD)
  return { width: height, height }
}

function viewportToWorld(
  fx: number,
  fy: number,
  z: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const { width, height } = viewSizeAtDepth(z)
  return out.set((fx - 0.5) * width, (0.5 - fy) * height, z)
}

/** Bias spawn toward upper band and side edges of the viewport at mid depth. */
function pickSkySpawnPoint(out: THREE.Vector3): THREE.Vector3 {
  const edgeRoll = Math.random()
  let fx: number
  let fy: number

  if (edgeRoll < 0.35) {
    fx = 0.12 + Math.random() * 0.76
    fy = 0.04 + Math.random() * 0.22
  } else if (edgeRoll < 0.7) {
    fx = Math.random() < 0.5 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2
    fy = 0.08 + Math.random() * 0.5
  } else {
    fx = Math.random() < 0.5 ? Math.random() * 0.24 : 0.76 + Math.random() * 0.24
    fy = 0.04 + Math.random() * 0.18
  }

  const distFromCamera = 11 + Math.random() * 13
  const z = CAMERA_Z - distFromCamera
  return viewportToWorld(fx, fy, z, out)
}

function activateRock(rock: Rock) {
  const anchor = pickSkySpawnPoint(new THREE.Vector3())

  const travelRoll = Math.random()
  const travelDir = new THREE.Vector3()
  if (travelRoll < 0.5) {
    travelDir.set(
      Math.random() < 0.5 ? 1 : -1,
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.2,
    )
  } else {
    travelDir.set(
      (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.3,
    )
  }
  travelDir.normalize()

  const travelDistance = 10 + Math.random() * 14
  rock.duration = 12 + Math.random() * 10
  rock.start.copy(anchor).addScaledVector(travelDir, -travelDistance * 0.5)
  rock.end.copy(anchor).addScaledVector(travelDir, travelDistance * 0.5)
  rock.progress = 0
  rock.active = true

  const cameraPos = new THREE.Vector3(0, 0, CAMERA_Z)
  const midDist = rock.start.clone().lerp(rock.end, 0.5).distanceTo(cameraPos)
  const distT = THREE.MathUtils.clamp((midDist - 10) / 16, 0, 1)
  rock.scale = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(0.55, 1.8, distT) * (0.9 + Math.random() * 0.2),
    0.4,
    1.8,
  )

  rock.tumbleSpeed.set(
    (Math.random() - 0.5) * 0.22,
    (Math.random() - 0.5) * 0.22,
    (Math.random() - 0.5) * 0.22,
  )
  rock.baseRotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  )
}

/** Occasional slow tumbling debris drifting through the upper sky. */
export function DriftingRocks() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: POOL_SIZE }, () => null),
  )
  const rocksRef = useRef<Rock[]>(
    Array.from({ length: POOL_SIZE }, () => createRock()),
  )
  const spawnTimerRef = useRef(3 + Math.random() * 2)
  const scratchPosition = useMemo(() => new THREE.Vector3(), [])
  const scratchRotation = useMemo(() => new THREE.Euler(), [])

  const { geometries, material } = useMemo(() => {
    const geos = Array.from({ length: POOL_SIZE }, (_, index) =>
      createRockGeometry(0x9e37 + index * 7919),
    )
    const normalMap = createLunarTexture()
    const mat = new THREE.MeshStandardMaterial({
      color: '#9aa3b0',
      metalness: 0,
      roughness: 0.85,
      normalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
    })
    return { geometries: geos, material: mat }
  }, [])

  const scheduleNextSpawn = () => {
    spawnTimerRef.current = 8 + Math.random() * 8
  }

  const trySpawn = () => {
    const inactive = rocksRef.current.find((rock) => !rock.active)
    if (!inactive) {
      return
    }
    activateRock(inactive)
    scheduleNextSpawn()
  }

  useFrame((_, delta) => {
    spawnTimerRef.current -= delta
    if (spawnTimerRef.current <= 0) {
      trySpawn()
    }

    const rocks = rocksRef.current
    for (let i = 0; i < POOL_SIZE; i++) {
      const rock = rocks[i]
      const mesh = meshRefs.current[i]
      if (!mesh) {
        continue
      }

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
      scratchRotation.set(
        rock.baseRotation.x + rock.tumbleSpeed.x * elapsed,
        rock.baseRotation.y + rock.tumbleSpeed.y * elapsed,
        rock.baseRotation.z + rock.tumbleSpeed.z * elapsed,
      )

      mesh.visible = true
      mesh.position.copy(scratchPosition)
      mesh.rotation.copy(scratchRotation)
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
          frustumCulled={false}
        />
      ))}
    </group>
  )
}
