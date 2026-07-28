import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL_SIZE = 6
const METEOR_RENDER_ORDER = 100

type StreakKind = 'fast' | 'slow'

type Streak = {
  active: boolean
  progress: number
  kind: StreakKind
  duration: number
  streakLength: number
  planeHeight: number
  start: THREE.Vector3
  end: THREE.Vector3
  travelDir: THREE.Vector3
}

function createStreak(): Streak {
  return {
    active: false,
    progress: 0,
    kind: 'fast',
    duration: 1,
    streakLength: 1,
    planeHeight: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    travelDir: new THREE.Vector3(),
  }
}

function createStreakTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 4
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('ShootingStars: 2d canvas context unavailable')
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
  gradient.addColorStop(0, 'rgba(210, 220, 240, 0)')
  gradient.addColorStop(0.45, 'rgba(230, 238, 255, 0.35)')
  gradient.addColorStop(0.75, 'rgba(245, 248, 255, 0.85)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 1)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function randomUnitVector(out: THREE.Vector3): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  return out.set(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  )
}

function buildTangentBasis(
  normal: THREE.Vector3,
  tangent: THREE.Vector3,
  bitangent: THREE.Vector3,
) {
  tangent.copy(normal).cross(new THREE.Vector3(0, 1, 0))
  if (tangent.lengthSq() < 1e-4) {
    tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0))
  }
  tangent.normalize()
  bitangent.crossVectors(normal, tangent).normalize()
}

function activateStreak(streak: Streak) {
  const anchor = randomUnitVector(new THREE.Vector3())
  const radius = 22 + Math.random() * 23
  anchor.multiplyScalar(radius)

  const normal = anchor.clone().normalize()
  const tangent = new THREE.Vector3()
  const bitangent = new THREE.Vector3()
  buildTangentBasis(normal, tangent, bitangent)

  const sweepAngle = Math.random() * Math.PI * 2
  streak.travelDir
    .copy(tangent)
    .multiplyScalar(Math.cos(sweepAngle))
    .addScaledVector(bitangent, Math.sin(sweepAngle))
    .normalize()

  const isSlowBolide = Math.random() < 0.25
  streak.kind = isSlowBolide ? 'slow' : 'fast'

  let travelDistance: number
  if (isSlowBolide) {
    streak.duration = 3.2 + Math.random() * 1.8
    streak.streakLength = 12 + Math.random() * 8
    streak.planeHeight = 0.1 + Math.random() * 0.06
    travelDistance = 22 + Math.random() * 14
  } else {
    streak.duration = 1.4 + Math.random() * 1
    streak.streakLength = 6 + Math.random() * 6
    streak.planeHeight = 0.08 + Math.random() * 0.04
    travelDistance = 14 + Math.random() * 14
  }

  streak.start.copy(anchor).addScaledVector(streak.travelDir, -travelDistance * 0.5)
  streak.end.copy(anchor).addScaledVector(streak.travelDir, travelDistance * 0.5)
  streak.progress = 0
  streak.active = true
}

/** Sparse meteors in the far shell — additive streaks beyond the moons. */
export function ShootingStars() {
  const groupRef = useRef<THREE.Group>(null)
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: POOL_SIZE }, () => null),
  )
  const streaksRef = useRef<Streak[]>(
    Array.from({ length: POOL_SIZE }, () => createStreak()),
  )
  const spawnTimerRef = useRef(0.85 + Math.random() * 0.3)
  const doubleSpawnTimerRef = useRef<number | null>(null)
  const scratchPosition = useMemo(() => new THREE.Vector3(), [])
  const scratchQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const axisX = useMemo(() => new THREE.Vector3(1, 0, 0), [])

  const { geometry, materials } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 0.1, 1, 1)
    const streakTexture = createStreakTexture()
    const mats = Array.from({ length: POOL_SIZE }, () =>
      new THREE.MeshBasicMaterial({
        map: streakTexture,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        color: '#f8faff',
        side: THREE.DoubleSide,
      }),
    )
    return { geometry: geo, materials: mats }
  }, [])

  const scheduleNextSpawn = () => {
    spawnTimerRef.current = 2 + Math.random() * 2

    if (Math.random() < 0.2) {
      doubleSpawnTimerRef.current = 0.12 + Math.random() * 0.28
    }
  }

  const trySpawn = () => {
    const streaks = streaksRef.current
    const inactive = streaks.find((streak) => !streak.active)
    if (!inactive) {
      return
    }
    activateStreak(inactive)
    scheduleNextSpawn()
  }

  useFrame((_, delta) => {
    spawnTimerRef.current -= delta
    if (spawnTimerRef.current <= 0) {
      trySpawn()
    }

    if (doubleSpawnTimerRef.current !== null) {
      doubleSpawnTimerRef.current -= delta
      if (doubleSpawnTimerRef.current <= 0) {
        doubleSpawnTimerRef.current = null
        const inactive = streaksRef.current.find((streak) => !streak.active)
        if (inactive) {
          activateStreak(inactive)
        }
      }
    }

    const streaks = streaksRef.current
    for (let i = 0; i < POOL_SIZE; i++) {
      const streak = streaks[i]
      const mesh = meshRefs.current[i]
      const material = materials[i]
      if (!mesh) {
        continue
      }

      if (!streak.active) {
        mesh.visible = false
        continue
      }

      streak.progress += delta / streak.duration
      if (streak.progress >= 1) {
        streak.active = false
        mesh.visible = false
        continue
      }

      scratchPosition.lerpVectors(streak.start, streak.end, streak.progress)
      scratchQuaternion.setFromUnitVectors(axisX, streak.travelDir)

      mesh.visible = true
      mesh.position.copy(scratchPosition)
      mesh.quaternion.copy(scratchQuaternion)
      mesh.scale.set(streak.streakLength, streak.planeHeight / 0.1, 1)

      const fadeIn = Math.min(streak.progress * 8, 1)
      const fadeOut = Math.min((1 - streak.progress) * 5, 1)
      const opacityBoost = streak.kind === 'slow' ? 1.25 : 1
      material.opacity = Math.min(fadeIn * fadeOut * opacityBoost, 1)
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: POOL_SIZE }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            meshRefs.current[index] = node
          }}
          geometry={geometry}
          material={materials[index]}
          visible={false}
          frustumCulled={false}
          renderOrder={METEOR_RENDER_ORDER}
        />
      ))}
    </group>
  )
}
