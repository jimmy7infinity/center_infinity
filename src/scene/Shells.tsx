import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState, getIntroArrive, hasEntered } from '../lib/scroll'
import { pointerState } from '../lib/pointer'
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

/**
 * How far off the surface the cursor light floats, as a share of the radius.
 * Close to 1 on purpose: the nearer it sits, the more tangential it strikes the
 * surrounding surface, and grazing light is the only kind that casts the long
 * rim shadows that make the relief read.
 */
const CURSOR_LIFT = 1.02
/**
 * Storm patch radius as a share of the shell radius.
 * √0.20 ≈ 0.447 → ~20% of the visible disk area (πr² / πR²).
 */
const CURSOR_RANGE = Math.sqrt(0.2)
const CURSOR_DAMP = 10
const CURSOR_GAIN = 0.4
/** How long the storm takes to go from first streaks to full body. */
const PRESENCE_SECONDS = 1.75
/** Storm angular rate (rad/s) — full speed as soon as the cell exists. */
const STORM_SPIN_RATE = 0.85
const STORM_DAMP = 6

/** Harmonious cool→warm→cool cycle — never loud, never rainbow. */
const CURSOR_HUES = [
  new THREE.Color('#8fd8ff'),
  new THREE.Color('#b5a6e0'),
  new THREE.Color('#e8c49a'),
  new THREE.Color('#9ec9e8'),
]

/** Soft stone warmth revealed under the lit patch. */
const WARM_REVEAL = new THREE.Color('#c4a882')

/** Scratch vectors — one set for the whole module, reused every frame. */
const rayOrigin = new THREE.Vector3()
const rayDirection = new THREE.Vector3()
const toCentre = new THREE.Vector3()
const cursorNormal = new THREE.Vector3()
const cursorTarget = new THREE.Vector3()
const ndc = new THREE.Vector3()
const hueA = new THREE.Color()
const hueB = new THREE.Color()
const cursorColorScratch = new THREE.Color()

type ShellProbe = {
  id: string
  centre: THREE.Vector3
  radius: number
  opacity: number
}

const shellProbes = new Map<string, ShellProbe>()

/** Frontmost opaque shell under the pointer this frame, or null. */
let frontShellId: string | null = null

function registerShellProbe(
  id: string,
  centre: THREE.Vector3,
  radius: number,
  opacity: number,
) {
  let probe = shellProbes.get(id)
  if (!probe) {
    probe = { id, centre: new THREE.Vector3(), radius: 0, opacity: 0 }
    shellProbes.set(id, probe)
  }
  probe.centre.copy(centre)
  probe.radius = radius
  probe.opacity = opacity
}

function unregisterShellProbe(id: string) {
  shellProbes.delete(id)
}

/**
 * Opaque bodies should occlude the cursor effect. Only a real ray hit counts —
 * no limb soft-falloff from off-planet.
 */
function resolveFrontShell(camera: THREE.Camera): string | null {
  if (!pointerState.enabled || pointerState.presence < 0.01) return null

  ndc.set(pointerState.x, pointerState.y, 0.5).unproject(camera)
  rayOrigin.copy(camera.position)
  rayDirection.copy(ndc).sub(rayOrigin).normalize()

  let bestId: string | null = null
  let bestAlong = Infinity

  for (const probe of shellProbes.values()) {
    if (probe.opacity < 0.05) continue

    toCentre.copy(probe.centre).sub(rayOrigin)
    const along = toCentre.dot(rayDirection)
    if (along < 0) continue

    const perpendicular = Math.sqrt(
      Math.max(0, toCentre.lengthSq() - along * along),
    )
    if (perpendicular >= probe.radius) continue

    const half = Math.sqrt(
      probe.radius * probe.radius - perpendicular * perpendicular,
    )
    const hitAlong = along - half
    if (hitAlong < bestAlong) {
      bestAlong = hitAlong
      bestId = probe.id
    }
  }

  return bestId
}

/**
 * Places the cursor effect on the surface under the pointer. Returns 1 only when
 * the ray actually intersects the sphere; otherwise 0.
 */
function placeCursorLight(
  camera: THREE.Camera,
  centre: THREE.Vector3,
  radius: number,
  out: THREE.Vector3,
): number {
  ndc.set(pointerState.x, pointerState.y, 0.5).unproject(camera)
  rayOrigin.copy(camera.position)
  rayDirection.copy(ndc).sub(rayOrigin).normalize()

  toCentre.copy(centre).sub(rayOrigin)
  const along = toCentre.dot(rayDirection)
  const perpendicular = Math.sqrt(
    Math.max(0, toCentre.lengthSq() - along * along),
  )

  if (perpendicular >= radius || along <= 0) return 0

  const half = Math.sqrt(radius * radius - perpendicular * perpendicular)
  cursorTarget
    .copy(rayDirection)
    .multiplyScalar(along - half)
    .add(rayOrigin)

  cursorNormal.copy(cursorTarget).sub(centre)
  if (cursorNormal.lengthSq() < 1e-6) cursorNormal.copy(camera.position).sub(centre)
  cursorNormal.normalize()

  // Effect sits on the surface; lift is only for the soft fill term.
  out.copy(centre).addScaledVector(cursorNormal, radius * CURSOR_LIFT)
  return 1
}

function sampleCursorHue(beat: number, shellIndex: number, elapsed: number) {
  // Slow cycle, phase-offset per shell, gently biased by the current beat so
  // sections feel related without painting the planets themselves.
  const phase =
    elapsed * 0.11 + shellIndex * 0.85 + beat * 0.17
  const wrapped = ((phase % CURSOR_HUES.length) + CURSOR_HUES.length) % CURSOR_HUES.length
  const i0 = Math.floor(wrapped)
  const i1 = (i0 + 1) % CURSOR_HUES.length
  const t = wrapped - i0
  hueA.copy(CURSOR_HUES[i0])
  hueB.copy(CURSOR_HUES[i1])
  return cursorColorScratch.copy(hueA).lerp(hueB, t)
}

function Shell({
  motion,
  shellIndex,
}: {
  motion: ShellMotion
  shellIndex: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const hasInitialised = useRef(false)
  /** Damped camera-crossing fade, kept separate from the instant warp fade. */
  const surfaceOpacity = useRef(0)
  const cursorTargetPos = useRef(new THREE.Vector3())
  const surfaceHitPos = useRef(new THREE.Vector3())
  const presence = useRef(0)
  /** Integrated storm angle — avoids the fast phase jump of time×rate(dwell). */
  const stormAngle = useRef(0)
  const stormAlive = useRef(false)
  const stormSpinSign = useRef(1)
  const stormSizeMul = useRef(1)
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
      voidColor: '#0e1016',
      cursorLight: true,
      cursorGain: CURSOR_GAIN,
    })
  }, [motion, surface])

  useEffect(() => {
    return () => {
      material.dispose()
      unregisterShellProbe(motion.id)
    }
  }, [material, motion.id])

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
    const surfaceTarget = THREE.MathUtils.smoothstep(distanceToSurface, -2, 0)

    if (!hasInitialised.current) {
      group.position.copy(sampleOut.position)
      uniforms.uLightDir.value.copy(sampleOut.lightDir).normalize()
      uniforms.uIntensity.value = intensityTarget
      surfaceOpacity.current = surfaceTarget
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
      surfaceOpacity.current = THREE.MathUtils.damp(
        surfaceOpacity.current,
        surfaceTarget,
        OPACITY_DAMP,
        delta,
      )
    }

    // Applied undamped, and on `jump` rather than `warp`. An unlit shell is
    // void-coloured but still writes depth, so for as long as a damped fade runs
    // it punches a moon-shaped hole in the starfield behind it — which is
    // exactly the silhouette that used to appear over the intro warp.
    const jumpFade = 1 - THREE.MathUtils.smoothstep(scrollState.jump, 0.1, 0.45)
    uniforms.uOpacity.value = surfaceOpacity.current * jumpFade

    registerShellProbe(
      motion.id,
      group.position,
      radius,
      uniforms.uOpacity.value,
    )

    // Occlusion uses last-frame probes for siblings; this shell's probe is fresh.
    // Resolve once here — cheap, and keeps Shell self-contained.
    frontShellId = resolveFrontShell(state.camera)

    // Only while the ray actually intersects this shell.
    const wantsCursor =
      pointerState.enabled &&
      jumpFade > 0.01 &&
      frontShellId === motion.id
    const rawStrength = wantsCursor
      ? placeCursorLight(
          state.camera,
          group.position,
          radius,
          cursorTargetPos.current,
        ) * pointerState.presence
      : 0

    uniforms.uPlanetCenter.value.copy(group.position)

    if (rawStrength > 0) {
      surfaceHitPos.current
        .copy(cursorTargetPos.current)
        .sub(group.position)
        .normalize()
        .multiplyScalar(radius)
        .add(group.position)

      // New contact → roll a fresh storm (seed, spin direction, size, phase).
      if (!stormAlive.current) {
        stormAlive.current = true
        uniforms.uStormSeed.value = Math.random() * 1000
        stormSpinSign.current = Math.random() < 0.5 ? -1 : 1
        stormSizeMul.current = 0.82 + Math.random() * 0.36
        stormAngle.current = Math.random() * Math.PI * 2
        uniforms.uStormCenter.value.copy(surfaceHitPos.current)
      }

      // Lock the eye harder once present so the swirl doesn't wobble.
      const follow = presence.current > 0.5 ? 4 : CURSOR_DAMP
      uniforms.uStormCenter.value.lerp(
        surfaceHitPos.current,
        1 - Math.exp(-follow * delta),
      )
      uniforms.uCursorPos.value.lerp(
        cursorTargetPos.current,
        1 - Math.exp(-CURSOR_DAMP * delta),
      )
      presence.current = Math.min(1, presence.current + delta / PRESENCE_SECONDS)
    } else {
      presence.current = Math.max(0, presence.current - delta / 0.55)
      if (presence.current <= 0.001) {
        stormAlive.current = false
        presence.current = 0
      }
    }

    // Linear grow clock — shader owns the streak→fill curve (smoothstep here
    // would front-load the fill and kill the tendril phase).
    uniforms.uCursorRange.value = radius * CURSOR_RANGE * stormSizeMul.current
    uniforms.uStormGrow.value = presence.current

    uniforms.uCursorStrength.value = THREE.MathUtils.damp(
      uniforms.uCursorStrength.value,
      rawStrength * Math.min(1, presence.current * 2),
      STORM_DAMP,
      delta,
    )

    const hue = sampleCursorHue(
      scrollState.beat,
      shellIndex,
      state.clock.elapsedTime,
    )
    uniforms.uCursorColor.value.copy(hue).multiplyScalar(CURSOR_GAIN)
    uniforms.uCursorWarmth.value = 0
    uniforms.uWarmReveal.value.copy(WARM_REVEAL)

    uniforms.uTime.value = state.clock.elapsedTime
    // Storm character is immediate — only the front spreads. Spin at full rate.
    const active = rawStrength > 0 && presence.current > 0.01 ? 1 : 0
    uniforms.uDwell.value = active
    if (active) {
      stormAngle.current += STORM_SPIN_RATE * stormSpinSign.current * delta
    }
    uniforms.uStormAngle.value = stormAngle.current
    uniforms.uStormStrength.value = THREE.MathUtils.damp(
      uniforms.uStormStrength.value,
      active,
      STORM_DAMP,
      delta,
    )

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
      {SHELL_MOTIONS.map((motion, shellIndex) => (
        <Shell key={motion.id} motion={motion} shellIndex={shellIndex} />
      ))}
    </>
  )
}
