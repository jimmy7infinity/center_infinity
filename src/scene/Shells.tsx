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
 * Scales keyframe intensities (~0.7–0.85) for opaque directional shells.
 * Slightly above 1.0 — NormalBlending no longer stacks energy on overlaps.
 */
const INTENSITY_SCALE = 2.0

const POSITION_DAMP = 12
const LIGHT_DAMP = 7.5
const OPACITY_DAMP = 12

const CAMERA_DAMP_XY = 2.4
const CAMERA_DAMP_Z = 2.8
const CAMERA_DAMP_FOV = 2.2

type CameraKeyframe = {
  at: number
  x: number
  y: number
  z: number
  fov: number
}

/** Beat-timed dolly aligned to shell tableaux at 0 / 0.25 / 0.5 / 0.75 / 1.0. */
const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { at: 0, x: 0, y: 0, z: 17, fov: 42 },
  { at: 0.25, x: 0.2, y: 0.1, z: 15, fov: 44 },
  { at: 0.5, x: 0.4, y: 0.2, z: 11, fov: 48 },
  { at: 0.75, x: 0.8, y: -0.2, z: 5, fov: 46 },
  { at: 1, x: 1.2, y: -0.4, z: -2, fov: 40 },
]

function sampleCameraKeyframe(progress: number): CameraKeyframe {
  const t = THREE.MathUtils.clamp(progress, 0, 1)
  let i = 0
  while (i < CAMERA_KEYFRAMES.length - 1 && CAMERA_KEYFRAMES[i + 1].at < t) {
    i += 1
  }
  const a = CAMERA_KEYFRAMES[i]
  const b = CAMERA_KEYFRAMES[Math.min(i + 1, CAMERA_KEYFRAMES.length - 1)]
  const span = b.at - a.at
  const u = span > 0 ? (t - a.at) / span : 0
  return {
    at: t,
    x: THREE.MathUtils.lerp(a.x, b.x, u),
    y: THREE.MathUtils.lerp(a.y, b.y, u),
    z: THREE.MathUtils.lerp(a.z, b.z, u),
    fov: THREE.MathUtils.lerp(a.fov, b.fov, u),
  }
}

function Shell({ motion }: { motion: ShellMotion }) {
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const hasInitialised = useRef(false)
  const spinAxisScratch = useRef(new THREE.Vector3())
  const normalMap = useMemo(() => createLunarTexture(), [])

  const sampleOut = useMemo<ShellSample>(
    () => ({
      position: new THREE.Vector3(),
      lightDir: new THREE.Vector3(),
      intensity: 0,
      spinAxis: new THREE.Vector3(0, 1, 0),
      spinRate: 0,
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
    const group = groupRef.current
    if (!group) return

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
      group.position.copy(sampleOut.position)
      uniforms.uLightDir.value.copy(sampleOut.lightDir).normalize()
      uniforms.uIntensity.value = intensityTarget
      uniforms.uOpacity.value = opacityTarget
      hasInitialised.current = true
    } else {
      group.position.x = THREE.MathUtils.damp(
        group.position.x,
        sampleOut.position.x,
        POSITION_DAMP,
        delta,
      )
      group.position.y = THREE.MathUtils.damp(
        group.position.y,
        sampleOut.position.y,
        POSITION_DAMP,
        delta,
      )
      group.position.z = THREE.MathUtils.damp(
        group.position.z,
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

    const spinGroup = spinRef.current
    if (spinGroup && sampleOut.spinRate !== 0) {
      spinAxisScratch.current.copy(sampleOut.spinAxis).normalize()
      spinGroup.rotateOnAxis(
        spinAxisScratch.current,
        sampleOut.spinRate * delta,
      )
    }

    const mesh = meshRef.current
    if (!mesh) return

    // These spheres cover the whole viewport up close. Left visible at zero
    // opacity they would still shade every pixel, so cull them outright.
    mesh.visible = uniforms.uOpacity.value > 0.004
  })

  return (
    <group ref={groupRef}>
      <group ref={spinRef}>
        <mesh ref={meshRef} material={material} visible={false} frustumCulled>
          <sphereGeometry
            args={[motion.radius, motion.segments, motion.segments]}
          />
        </mesh>
      </group>
    </group>
  )
}

/** Scroll pulls the camera inward through the nested shells. */
function CameraRig() {
  const fovRef = useRef(42)
  const hasInitialised = useRef(false)

  useFrame((state, delta) => {
    const progress = scrollState.progress
    const camera = state.camera
    const beat = sampleCameraKeyframe(progress)

    const destX = beat.x + state.pointer.x * 0.2
    const destY = beat.y + state.pointer.y * 0.25
    const destZ = beat.z

    if (!hasInitialised.current) {
      camera.position.set(destX, destY, destZ)
      fovRef.current = beat.fov
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = beat.fov
        camera.updateProjectionMatrix()
      }
      hasInitialised.current = true
    } else {
      camera.position.x = THREE.MathUtils.damp(
        camera.position.x,
        destX,
        CAMERA_DAMP_XY,
        delta,
      )
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        destY,
        CAMERA_DAMP_XY,
        delta,
      )
      camera.position.z = THREE.MathUtils.damp(
        camera.position.z,
        destZ,
        CAMERA_DAMP_Z,
        delta,
      )

      fovRef.current = THREE.MathUtils.damp(
        fovRef.current,
        beat.fov,
        CAMERA_DAMP_FOV,
        delta,
      )
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = fovRef.current
        camera.updateProjectionMatrix()
      }
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
