import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createPlanetSurface } from '../scene/lunarSurface'
import {
  createShellMaterial,
  getShellMaterialUniforms,
} from '../scene/shellMaterial'
import {
  HERO_CAMERA,
  SHELL_MOTIONS,
  resolveShellPose,
  resolveShellRadius,
  type ShellMotion,
  type ShellSample,
} from '../scene/shellKeyframes'
import { detectQuality, dprFor } from '../lib/quality'

/** Matches the colour screen, so unlit faces disappear into it. */
const SCREEN = '#050506'

/**
 * Same look as the cover shells in Shells.tsx. Kept here so this display does
 * not share the cover's probes, lightning, or page fade.
 */
const INTENSITY_SCALE = 2
const TOON_STEPS = 4
const ALBEDO_AMOUNT = 0.75
const NORMAL_SCALE = 0.75
const DETAIL_SCALE = 0.1

function DisplayShell({
  motion,
  spin,
}: {
  motion: ShellMotion
  spin: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const surface = useMemo(
    () => createPlanetSurface(motion.surfaceKind),
    [motion.surfaceKind],
  )
  const spinAxis = useMemo(
    () => new THREE.Vector3(...motion.spinAxis).normalize(),
    [motion],
  )
  const sample = useMemo<ShellSample>(
    () => ({
      position: new THREE.Vector3(),
      lightDir: new THREE.Vector3(),
      intensity: 0,
    }),
    [],
  )
  const material = useMemo(() => {
    const { light, intensity } = motion.pose
    return createShellMaterial({
      tint: motion.tint,
      surface,
      normalScale: motion.normalScale * NORMAL_SCALE,
      detailScale: motion.detailScale * DETAIL_SCALE,
      albedoAmount: ALBEDO_AMOUNT,
      toonSteps: TOON_STEPS,
      lightColor: motion.lightColor,
      terminator: motion.terminator,
      lightDir: new THREE.Vector3(...light),
      intensity: intensity * INTENSITY_SCALE,
      opacity: 1,
      ambient: 0,
      voidColor: SCREEN,
      lightning: false,
    })
  }, [motion, surface])

  useEffect(() => () => material.dispose(), [material])

  const uniforms = useMemo(() => getShellMaterialUniforms(material), [material])

  useFrame((state, delta) => {
    const group = groupRef.current
    const mesh = meshRef.current
    if (!group || !mesh) return

    const aspect = Math.max(0.2, state.size.width / Math.max(1, state.size.height))
    mesh.visible = true
    mesh.scale.setScalar(resolveShellRadius(motion, aspect))
    resolveShellPose(motion, aspect, sample)
    group.position.copy(sample.position)
    uniforms.uLightDir.value.copy(sample.lightDir).normalize()
    uniforms.uIntensity.value = sample.intensity * INTENSITY_SCALE
    uniforms.uOpacity.value = 1

    const spinGroup = spinRef.current
    if (spin && spinGroup && motion.spinRate !== 0) {
      spinGroup.rotateOnAxis(spinAxis, motion.spinRate * delta)
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={spinRef}>
        <mesh ref={meshRef} material={material} frustumCulled visible={false}>
          <sphereGeometry args={[1, motion.segments, motion.segments]} />
        </mesh>
      </group>
    </group>
  )
}

function HoldCamera() {
  const look = useMemo(() => new THREE.Vector3(...HERO_CAMERA.target), [])

  useFrame(({ camera }) => {
    const [x, y, z] = HERO_CAMERA.position
    camera.position.set(x, y, z)
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== HERO_CAMERA.fov) {
      camera.fov = HERO_CAMERA.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(look)
  })

  return null
}

/** The cover's crescents, lit inside the colour screen rather than printed. */
export function PlanetScreen({ spin }: { spin: boolean }) {
  const dpr = useMemo(() => {
    const tier = detectQuality()
    return tier === 'static' ? ([1, 1.5] as [number, number]) : dprFor(tier)
  }, [])

  return (
    <div className="color-screen__shot color-screen__planets" aria-hidden>
      <Canvas
        dpr={dpr}
        frameloop={spin ? 'always' : 'demand'}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{
          position: [...HERO_CAMERA.position],
          fov: HERO_CAMERA.fov,
          near: 0.1,
          far: 200,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={[SCREEN]} />
        <HoldCamera />
        {SHELL_MOTIONS.map((motion) => (
          <DisplayShell key={motion.id} motion={motion} spin={spin} />
        ))}
      </Canvas>
    </div>
  )
}
