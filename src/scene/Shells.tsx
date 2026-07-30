import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState, getIntroArrive, hasEntered } from '../lib/scroll'
import { createPlanetSurface } from './lunarSurface'
import {
  createShellMaterial,
  getShellMaterialUniforms,
} from './shellMaterial'
import {
  SHELL_MOTIONS,
  resolveShellRadius,
  sampleCameraKeyframe,
  sampleShellKeyframe,
  type CameraPose,
  type ShellMotion,
  type ShellSample,
} from './shellKeyframes'

/**
 * Scales keyframe intensities (~0.7–0.9) for opaque directional shells.
 * Slightly above 1.0 — NormalBlending no longer stacks energy on overlaps.
 */
const INTENSITY_SCALE = 2.0

const POSITION_DAMP = 12
const LIGHT_DAMP = 7.5
const OPACITY_DAMP = 12

const CAMERA_DAMP_XY = 2.4
const CAMERA_DAMP_Z = 2.8
const CAMERA_DAMP_FOV = 2.2
const CAMERA_DAMP_TARGET = 2.1

const INTRO_FAR_Z = 48
const INTRO_FAR_FOV = 52
const INTRO_FAR_TARGET = new THREE.Vector3(0, 0, -2)

function Shell({ motion }: { motion: ShellMotion }) {
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const hasInitialised = useRef(false)
  const surface = useMemo(
    () => createPlanetSurface(motion.surfaceKind),
    [motion.surfaceKind],
  )

  const spinAxis = useMemo(
    () => new THREE.Vector3(...motion.spinAxis).normalize(),
    [motion],
  )

  const sampleOut = useMemo<ShellSample>(
    () => ({
      position: new THREE.Vector3(),
      lightDir: new THREE.Vector3(),
      intensity: 0,
    }),
    [],
  )

  const material = useMemo(() => {
    const first = motion.keyframes[0]
    return createShellMaterial({
      tint: motion.tint,
      surface,
      normalScale: motion.normalScale,
      detailScale: motion.detailScale,
      lightColor: motion.lightColor,
      terminator: motion.terminator,
      lightDir: new THREE.Vector3(...first.light),
      intensity: first.intensity * INTENSITY_SCALE,
      opacity: 0,
      // Zero ambient + void-matched unlit faces = logo crescents only.
      ambient: 0,
      voidColor: '#121214',
    })
  }, [motion, surface])

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
    const mesh = meshRef.current
    if (!group || !mesh) return

    const aspect = Math.max(0.2, state.size.width / state.size.height)
    // Recomputed every frame rather than on a resize event so the geometry stays
    // a unit sphere and reframing costs nothing but a multiply.
    const radius = resolveShellRadius(motion, aspect)
    mesh.scale.setScalar(radius)

    sampleShellKeyframe(motion.keyframes, scrollState.beat, aspect, sampleOut)

    const intensityTarget = sampleOut.intensity * INTENSITY_SCALE
    const distanceToSurface =
      state.camera.position.distanceTo(sampleOut.position) - radius
    // Opaque outside the sphere; fades only once the camera crosses the surface.
    let opacityTarget = THREE.MathUtils.smoothstep(distanceToSurface, -2, 0)
    // Clears out at peak warp so the jump is streaks rather than clutter.
    opacityTarget *= 1 - THREE.MathUtils.smoothstep(scrollState.warp, 0.55, 1)

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
    if (spinGroup && motion.spinRate !== 0) {
      spinGroup.rotateOnAxis(spinAxis, motion.spinRate * delta)
    }

    // These spheres cover the whole viewport up close. Left visible at zero
    // opacity they would still shade every pixel, so cull them outright.
    mesh.visible = uniforms.uOpacity.value > 0.004
  })

  return (
    <group ref={groupRef}>
      <group ref={spinRef}>
        <mesh ref={meshRef} material={material} visible={false} frustumCulled>
          <sphereGeometry args={[1, motion.segments, motion.segments]} />
        </mesh>
      </group>
    </group>
  )
}

/** Beat-driven dolly plus a damped look target, so the move reads as a turn. */
function CameraRig() {
  const fovRef = useRef(42)
  const hasInitialised = useRef(false)

  const pose = useMemo<CameraPose>(
    () => ({
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
      fov: 42,
    }),
    [],
  )
  const heroPose = useMemo<CameraPose>(
    () => ({
      position: new THREE.Vector3(),
      target: new THREE.Vector3(),
      fov: 42,
    }),
    [],
  )
  const lookTarget = useMemo(() => new THREE.Vector3(0, 0, -2), [])

  useFrame((state, delta) => {
    const camera = state.camera
    sampleCameraKeyframe(scrollState.beat, pose)
    sampleCameraKeyframe(0, heroPose)

    const arrive = getIntroArrive()
    const introSettling = hasEntered() && arrive < 1
    const useIntroPose = !hasEntered() || introSettling

    let destX: number
    let destY: number
    let destZ: number
    let destFov: number
    let targetX: number
    let targetY: number
    let targetZ: number

    if (useIntroPose) {
      const u = hasEntered() ? arrive : 0
      destX = THREE.MathUtils.lerp(0, heroPose.position.x, u)
      destY = THREE.MathUtils.lerp(0, heroPose.position.y, u)
      destZ = THREE.MathUtils.lerp(INTRO_FAR_Z, heroPose.position.z, u)
      destFov = THREE.MathUtils.lerp(INTRO_FAR_FOV, heroPose.fov, u)
      targetX = THREE.MathUtils.lerp(INTRO_FAR_TARGET.x, heroPose.target.x, u)
      targetY = THREE.MathUtils.lerp(INTRO_FAR_TARGET.y, heroPose.target.y, u)
      targetZ = THREE.MathUtils.lerp(INTRO_FAR_TARGET.z, heroPose.target.z, u)
    } else {
      destX = pose.position.x + state.pointer.x * 0.2
      destY = pose.position.y + state.pointer.y * 0.25
      destZ = pose.position.z
      destFov = pose.fov
      targetX = pose.target.x
      targetY = pose.target.y
      targetZ = pose.target.z
    }

    if (!hasInitialised.current) {
      camera.position.set(destX, destY, destZ)
      lookTarget.set(targetX, targetY, targetZ)
      fovRef.current = destFov
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = destFov
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

      lookTarget.x = THREE.MathUtils.damp(
        lookTarget.x,
        targetX,
        CAMERA_DAMP_TARGET,
        delta,
      )
      lookTarget.y = THREE.MathUtils.damp(
        lookTarget.y,
        targetY,
        CAMERA_DAMP_TARGET,
        delta,
      )
      lookTarget.z = THREE.MathUtils.damp(
        lookTarget.z,
        targetZ,
        CAMERA_DAMP_TARGET,
        delta,
      )

      fovRef.current = THREE.MathUtils.damp(
        fovRef.current,
        destFov,
        CAMERA_DAMP_FOV,
        delta,
      )
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = fovRef.current
        camera.updateProjectionMatrix()
      }
    }

    camera.lookAt(lookTarget)
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
