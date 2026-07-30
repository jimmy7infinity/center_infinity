import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../lib/scroll'

const POOL_SIZE = 2

/** Sky band outside the shell cluster — meteors stay in the backdrop. */
const SKY_DISTANCE = 38

type Meteor = {
  active: boolean
  progress: number
  duration: number
  start: THREE.Vector3
  end: THREE.Vector3
  line: THREE.Line
}

function createMeteor(material: THREE.LineBasicMaterial): Meteor {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(6), 3),
  )
  return {
    active: false,
    progress: 0,
    duration: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    line: new THREE.Line(geometry, material),
  }
}

const spawnAnchor = new THREE.Vector3()
const travelDirection = new THREE.Vector3()

function activateMeteor(
  meteor: Meteor,
  camera: THREE.PerspectiveCamera,
  /** 0 at hero — keep streaks out of the wordmark band. */
  beat: number,
) {
  const distance = SKY_DISTANCE + Math.random() * 18
  const frameHeight = 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
  const frameWidth = frameHeight * camera.aspect

  // On the hero, bias to the upper corners so streaks don't cross the mark.
  const heroGuard = 1 - THREE.MathUtils.smoothstep(0.15, 0.85, beat)
  const fx =
    Math.random() < 0.5
      ? 0.04 + Math.random() * (0.22 + (1 - heroGuard) * 0.2)
      : 0.74 - (1 - heroGuard) * 0.2 + Math.random() * (0.22 + (1 - heroGuard) * 0.2)
  const fy =
    heroGuard > 0.4
      ? 0.04 + Math.random() * 0.28
      : 0.06 + Math.random() * 0.72

  const pitch = (Math.random() - 0.5) * 0.55 - 0.15
  travelDirection
    .set(
      Math.cos(pitch) * (fx < 0.5 ? 1 : -1),
      Math.sin(pitch),
      (Math.random() - 0.5) * 0.25,
    )
    .transformDirection(camera.matrixWorld)

  spawnAnchor.set((fx - 0.5) * frameWidth, (0.5 - fy) * frameHeight, -distance)
  camera.localToWorld(spawnAnchor)

  const span = frameWidth * (0.28 + Math.random() * 0.22)
  meteor.start.copy(spawnAnchor).addScaledVector(travelDirection, -span * 0.35)
  meteor.end.copy(spawnAnchor).addScaledVector(travelDirection, span * 0.65)
  meteor.progress = 0
  meteor.duration = 0.7 + Math.random() * 0.7
  meteor.active = true
}

/** Sparse bright streaks across the sky; muted during warp. */
export function ShootingStars() {
  const meteorsRef = useRef<Meteor[]>([])
  const spawnTimerRef = useRef(4 + Math.random() * 3)
  const head = useMemo(() => new THREE.Vector3(), [])
  const tail = useMemo(() => new THREE.Vector3(), [])

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#eef2ff',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  const meteors = useMemo(
    () =>
      Array.from({ length: POOL_SIZE }, () => {
        const meteor = createMeteor(material)
        meteor.line.visible = false
        return meteor
      }),
    [material],
  )
  meteorsRef.current = meteors

  useEffect(() => {
    return () => {
      material.dispose()
      for (const meteor of meteors) {
        meteor.line.geometry.dispose()
      }
    }
  }, [material, meteors])

  useFrame((state, delta) => {
    const camera = state.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) return

    // A meteor crawling across a field of hyperjump streaks is the thing that
    // gives the jump away, so it clears well before the streaks take hold.
    const warpFade = 1 - THREE.MathUtils.smoothstep(scrollState.jump, 0.04, 0.3)
    // Dim on the hero so streaks can't overpower the wordmark even if one clips near.
    const heroFade = THREE.MathUtils.smoothstep(0.05, 0.55, scrollState.beat)
    material.opacity = 0.85 * warpFade * (0.35 + 0.65 * heroFade)

    spawnTimerRef.current -= delta
    if (spawnTimerRef.current <= 0 && warpFade > 0.05) {
      const inactive = meteorsRef.current.find((meteor) => !meteor.active)
      if (inactive) {
        activateMeteor(inactive, camera, scrollState.beat)
      }
      spawnTimerRef.current = 10 + Math.random() * 10
    }

    for (const meteor of meteorsRef.current) {
      const line = meteor.line
      if (!meteor.active || warpFade <= 0.01) {
        line.visible = false
        continue
      }

      meteor.progress += delta / meteor.duration
      if (meteor.progress >= 1) {
        meteor.active = false
        line.visible = false
        continue
      }

      const t = meteor.progress
      head.lerpVectors(meteor.start, meteor.end, t)
      tail.lerpVectors(meteor.start, meteor.end, Math.max(0, t - 0.18))

      const positions = line.geometry.attributes.position as THREE.BufferAttribute
      positions.setXYZ(0, tail.x, tail.y, tail.z)
      positions.setXYZ(1, head.x, head.y, head.z)
      positions.needsUpdate = true

      line.visible = true
    }
  })

  return (
    <group>
      {meteors.map((meteor, index) => (
        <primitive key={index} object={meteor.line} />
      ))}
    </group>
  )
}
