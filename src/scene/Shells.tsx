import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createLunarTexture } from './lunarTexture'
import { scrollState } from '../lib/scroll'

type ShellSpec = {
  radius: number
  position: [number, number, number]
  spin: number
  normalScale: number
  tint: string
  segments: number
}

/**
 * Radii and offsets are deliberately irregular so the lit crescents never line
 * up concentrically — that misalignment is what gives the nested-moon look.
 */
const SHELLS: ShellSpec[] = [
  {
    radius: 1.15,
    position: [0.05, -0.95, 1.2],
    spin: 0.05,
    normalScale: 0.42,
    tint: '#a8b2c4',
    segments: 96,
  },
  {
    radius: 2.25,
    position: [-0.2, 0.4, -0.4],
    spin: -0.036,
    normalScale: 0.45,
    tint: '#949aa6',
    segments: 112,
  },
  {
    radius: 3.95,
    position: [0.3, -0.2, -2.4],
    spin: 0.024,
    normalScale: 0.4,
    tint: '#848993',
    segments: 128,
  },
  {
    radius: 6.4,
    position: [-0.45, 0.55, -5.2],
    spin: -0.015,
    normalScale: 0.34,
    tint: '#737882',
    segments: 128,
  },
]

function Shell({ spec }: { spec: ShellSpec }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshLambertMaterial>(null)
  const normalMap = useMemo(() => createLunarTexture(), [])
  const normalScale = useMemo(
    () => new THREE.Vector2(spec.normalScale, spec.normalScale),
    [spec.normalScale],
  )

  useFrame((state, delta) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return

    mesh.rotation.y += spec.spin * delta

    // Fade a shell out just before the camera crosses its surface so the
    // front-face cull never pops.
    const distanceToSurface =
      state.camera.position.distanceTo(mesh.position) - spec.radius
    const fade = THREE.MathUtils.smoothstep(distanceToSurface, -0.4, 1.1)
    material.opacity = THREE.MathUtils.damp(
      material.opacity,
      fade,
      12,
      delta,
    )

    // These spheres cover the whole viewport up close. Left visible at zero
    // opacity they would still shade every pixel, so cull them outright.
    mesh.visible = material.opacity > 0.004
  })

  return (
    <mesh ref={meshRef} position={spec.position} visible={false}>
      <sphereGeometry args={[spec.radius, spec.segments, spec.segments]} />
      {/* Lambert rather than Standard: the surface is matte rock with no
          environment reflections, so a full PBR BRDF costs fill rate for no
          visible gain. */}
      <meshLambertMaterial
        ref={materialRef}
        color={spec.tint}
        normalMap={normalMap}
        normalScale={normalScale}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

/** Scroll pulls the camera inward through the nested shells. */
function CameraRig() {
  const target = useRef({ z: 17, x: 0, y: 0 })

  useFrame((state, delta) => {
    const progress = scrollState.progress
    const camera = state.camera

    target.current.z = THREE.MathUtils.lerp(17, -7.5, progress)
    // A slow lateral arc keeps the crescents shifting rather than just scaling.
    target.current.x = Math.sin(progress * Math.PI * 1.15) * 1.9
    target.current.y = Math.sin(progress * Math.PI * 0.7) * 0.85

    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      target.current.x + state.pointer.x * 0.35,
      3.5,
      delta,
    )
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      target.current.y + state.pointer.y * 0.25,
      3.5,
      delta,
    )
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      target.current.z,
      4.5,
      delta,
    )
    camera.lookAt(0, 0, -2)
  })

  return null
}

export function Shells() {
  return (
    <>
      <CameraRig />
      {/* Backlit key light sits nearly opposite the camera: that is what
          reduces each sphere to a thin lit arc. */}
      <directionalLight position={[-6, 7, -9]} intensity={8.5} color="#dfe6f5" />
      <directionalLight position={[5, -4, -6]} intensity={2.1} color="#7d879b" />
      <ambientLight intensity={0.015} />
      {SHELLS.map((spec) => (
        <Shell key={spec.radius} spec={spec} />
      ))}
    </>
  )
}
