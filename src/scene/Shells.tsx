import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../lib/scroll'
import { createLunarTexture } from './lunarTexture'
import {
  createShellMaterial,
  getShellMaterialUniforms,
} from './shellMaterial'
import {
  SHELL_MOTIONS,
  sampleShellKeyframe,
  type ShellMotion,
  type ShellSample,
} from './shellKeyframes'

/**
 * Scales keyframe intensities (~0.65–0.92) for additive shells. Kept low so
 * overlapping rim crescents sum without blowing out to white under bloom.
 */
const INTENSITY_SCALE = 1.32

const POSITION_DAMP = 12
const LIGHT_DAMP = 12
const OPACITY_DAMP = 12

function Shell({ motion }: { motion: ShellMotion }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const hasInitialised = useRef(false)
  const normalMap = useMemo(() => createLunarTexture(), [])

  const sampleOut = useMemo<ShellSample>(
    () => ({
      position: new THREE.Vector3(),
      lightDir: new THREE.Vector3(),
      intensity: 0,
    }),
    [],
  )

  const material = useMemo(() => {
    const k0 = motion.keyframes[0]
    return createShellMaterial({
      tint: motion.tint,
      normalMap,
      normalScale: motion.normalScale,
      lightColor: motion.lightColor,
      terminator: motion.terminator,
      lightDir: new THREE.Vector3(...k0.lightDir),
      intensity: k0.intensity * INTENSITY_SCALE,
      opacity: 0,
    })
  }, [motion, normalMap])

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  const uniforms = useMemo(
    () => getShellMaterialUniforms(material),
    [material],
  )

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    const progress = scrollState.progress
    sampleShellKeyframe(motion.keyframes, progress, sampleOut)

    const intensityTarget = sampleOut.intensity * INTENSITY_SCALE
    const distanceToSurface =
      state.camera.position.distanceTo(sampleOut.position) - motion.radius
    const opacityTarget = THREE.MathUtils.smoothstep(
      distanceToSurface,
      -0.4,
      1.1,
    )

    if (!hasInitialised.current) {
      mesh.position.copy(sampleOut.position)
      uniforms.uLightDir.value.copy(sampleOut.lightDir).normalize()
      uniforms.uIntensity.value = intensityTarget
      uniforms.uOpacity.value = opacityTarget
      hasInitialised.current = true
    } else {
      mesh.position.x = THREE.MathUtils.damp(
        mesh.position.x,
        sampleOut.position.x,
        POSITION_DAMP,
        delta,
      )
      mesh.position.y = THREE.MathUtils.damp(
        mesh.position.y,
        sampleOut.position.y,
        POSITION_DAMP,
        delta,
      )
      mesh.position.z = THREE.MathUtils.damp(
        mesh.position.z,
        sampleOut.position.z,
        POSITION_DAMP,
        delta,
      )

      const light = uniforms.uLightDir.value
      light.x = THREE.MathUtils.damp(
        light.x,
        sampleOut.lightDir.x,
        LIGHT_DAMP,
        delta,
      )
      light.y = THREE.MathUtils.damp(
        light.y,
        sampleOut.lightDir.y,
        LIGHT_DAMP,
        delta,
      )
      light.z = THREE.MathUtils.damp(
        light.z,
        sampleOut.lightDir.z,
        LIGHT_DAMP,
        delta,
      )
      light.normalize()

      uniforms.uIntensity.value = THREE.MathUtils.damp(
        uniforms.uIntensity.value,
        intensityTarget,
        LIGHT_DAMP,
        delta,
      )
      uniforms.uOpacity.value = THREE.MathUtils.damp(
        uniforms.uOpacity.value,
        opacityTarget,
        OPACITY_DAMP,
        delta,
      )
    }

    mesh.rotation.y += motion.spin * delta

    // These spheres cover the whole viewport up close. Left visible at zero
    // opacity they would still shade every pixel, so cull them outright.
    mesh.visible = uniforms.uOpacity.value > 0.004
  })

  return (
    <mesh ref={meshRef} visible={false} material={material}>
      <sphereGeometry
        args={[motion.radius, motion.segments, motion.segments]}
      />
    </mesh>
  )
}

/** Scroll pulls the camera inward through the nested shells. */
function CameraRig() {
  const target = useRef({ z: 17, x: 0, y: 0 })
  const hasInitialised = useRef(false)

  useFrame((state, delta) => {
    const progress = scrollState.progress
    const camera = state.camera

    target.current.z = THREE.MathUtils.lerp(17, -7.5, progress)
    // A slow lateral arc keeps the crescents shifting rather than just scaling.
    target.current.x = Math.sin(progress * Math.PI * 1.15) * 1.9
    target.current.y = Math.sin(progress * Math.PI * 0.7) * 0.85

    const destX = target.current.x + state.pointer.x * 0.35
    const destY = target.current.y + state.pointer.y * 0.25
    const destZ = target.current.z

    if (!hasInitialised.current) {
      camera.position.set(destX, destY, destZ)
      hasInitialised.current = true
    } else {
      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        destX,
        3.5,
        delta,
      )
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        destY,
        3.5,
        delta,
      )
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        destZ,
        4.5,
        delta,
      )
    }

    camera.lookAt(0, 0, -2)
  })

  return null
}

export function Shells() {
  return (
    <>
      <CameraRig />
      {SHELL_MOTIONS.map((motion) => (
        <Shell key={motion.id} motion={motion} />
      ))}
    </>
  )
}
