import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL_SIZE = 4

type Streak = {
  active: boolean
  progress: number
  duration: number
  streakLength: number
  start: THREE.Vector3
  end: THREE.Vector3
  travelDir: THREE.Vector3
}

function createStreak(): Streak {
  return {
    active: false,
    progress: 0,
    duration: 1,
    streakLength: 1,
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
  gradient.addColorStop(0, 'rgba(180, 195, 220, 0)')
  gradient.addColorStop(0.55, 'rgba(200, 215, 235, 0.25)')
  gradient.addColorStop(0.85, 'rgba(230, 238, 255, 0.75)')
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
  const radius = 30 + Math.random() * 30
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

  const travelDistance = 14 + Math.random() * 16
  streak.streakLength = 3.5 + Math.random() * 4.5
  streak.duration = 0.32 + Math.random() * 0.48
  streak.start.copy(anchor).addScaledVector(streak.travelDir, -travelDistance * 0.5)
  streak.end.copy(anchor).addScaledVector(streak.travelDir, travelDistance * 0.5)
  streak.progress = 0
  streak.active = true
}

/** Sparse, fast meteors in the far shell — additive streaks beyond the moons. */
export function ShootingStars() {
  const groupRef = useRef<THREE.Group>(null)
  const meshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: POOL_SIZE }, () => null),
  )
  const streaksRef = useRef<Streak[]>(
    Array.from({ length: POOL_SIZE }, () => createStreak()),
  )
  const spawnTimerRef = useRef(2 + Math.random() * 4)
  const doubleSpawnTimerRef = useRef<number | null>(null)
  const scratchPosition = useMemo(() => new THREE.Vector3(), [])
  const scratchQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const axisX = useMemo(() => new THREE.Vector3(1, 0, 0), [])

  const { geometry, materials } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 0.035, 1, 1)
    const streakTexture = createStreakTexture()
    const mats = Array.from({ length: POOL_SIZE }, () =>
      new THREE.MeshBasicMaterial({
        map: streakTexture,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: '#d8e4f4',
        side: THREE.DoubleSide,
      }),
    )
    return { geometry: geo, materials: mats }
  }, [])

  const scheduleNextSpawn = () => {
    let delay = 4 + Math.random() * 6

    // Occasional longer quiet stretch.
    if (Math.random() < 0.18) {
      delay += 5 + Math.random() * 8
    }

    spawnTimerRef.current = delay

    // Rare double: back-to-back streak with a short offset.
    if (Math.random() < 0.07) {
      doubleSpawnTimerRef.current = 0.18 + Math.random() * 0.32
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
      mesh.scale.set(streak.streakLength, 1, 1)

      const fadeIn = Math.min(streak.progress * 10, 1)
      const fadeOut = Math.min((1 - streak.progress) * 6, 1)
      material.opacity = 0.82 * fadeIn * fadeOut
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
        />
      ))}
    </group>
  )
}
