import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { flyerControls } from './controls'

type BoosterJetProps = {
  /** Local +Z of the hull aft, in unscaled model units. */
  aftZ: number
}

/**
 * Additive blue plume on the spine — idle glow, hard kick while thrusting.
 */
export function BoosterJet({ aftZ }: BoosterJetProps) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  const mid = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const phase = useRef(0)

  useFrame((_, delta) => {
    const on = flyerControls.thrust
    const coreMesh = core.current
    const midMesh = mid.current
    const glowMesh = glow.current
    const lamp = light.current
    if (!coreMesh || !midMesh || !glowMesh || !lamp) return

    phase.current += delta * (on ? 28 : 8)
    const flicker = 0.85 + Math.sin(phase.current) * 0.15
    const kick = on ? 1 : 0.18

    const coreMat = coreMesh.material as THREE.MeshBasicMaterial
    const midMat = midMesh.material as THREE.MeshBasicMaterial
    const glowMat = glowMesh.material as THREE.MeshBasicMaterial

    coreMesh.scale.set(kick * flicker, kick * flicker, on ? 1.15 * flicker : 0.35)
    midMesh.scale.set(kick * 0.95, kick * 0.95, on ? 1.05 * flicker : 0.3)
    glowMesh.scale.set(on ? 1.1 * flicker : 0.45, on ? 1.1 * flicker : 0.45, on ? flicker : 0.35)

    coreMat.opacity = on ? 0.95 : 0.2
    midMat.opacity = on ? 0.65 : 0.1
    glowMat.opacity = on ? 0.4 : 0.06
    lamp.intensity = on ? 2.8 * flicker : 0.15
  })

  // Cones tip +Y by default; rotate so tip trails aft (+Z).
  const coreLen = 1.8
  const midLen = 2.4
  const glowLen = 3.2

  return (
    <group ref={group}>
      <mesh
        ref={core}
        position={[0, 0, aftZ + coreLen * 0.42]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[0.22, coreLen, 12, 1, true]} />
        <meshBasicMaterial
          color="#f2f8ff"
          transparent
          opacity={0.2}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        ref={mid}
        position={[0, 0, aftZ + midLen * 0.4]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[0.42, midLen, 12, 1, true]} />
        <meshBasicMaterial
          color="#7ec8ff"
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        ref={glow}
        position={[0, 0, aftZ + glowLen * 0.38]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[0.75, glowLen, 14, 1, true]} />
        <meshBasicMaterial
          color="#2f7fff"
          transparent
          opacity={0.06}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 0, aftZ + 0.4]}
        color="#5eb0ff"
        intensity={0.15}
        distance={6}
        decay={2}
      />
    </group>
  )
}
