import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { showsScenePlanets } from '../content/projects'
import { pageState, subscribePage } from '../lib/pages'
import { publishCamera } from '../lib/cameraBridge'
import { isGameActive } from '../lib/gameMode'
import { pointerState } from '../lib/pointer'
import { createPlanetSurface } from './lunarSurface'
import {
  createShellMaterial,
  getShellMaterialUniforms,
} from './shellMaterial'
import {
  SHELL_MOTIONS,
  HERO_CAMERA,
  panelFit,
  resolveShellPose,
  resolveShellRadius,
  type ShellMotion,
  type ShellSample,
} from './shellKeyframes'

/**
 * Scales pose intensities (~0.7–0.9) for opaque directional shells.
 * Slightly above 1.0 — NormalBlending no longer stacks energy on overlaps.
 */
const INTENSITY_SCALE = 2.0

const POSITION_DAMP = 12
const LIGHT_DAMP = 7.5
const OPACITY_DAMP = 12

const CAMERA_DAMP = 2.4
/** Pointer parallax, in world units at full deflection. */
const PARALLAX_X = 0.2
const PARALLAX_Y = 0.25

/**
 * Cel-shaded on the panel: a few hard light bands, with the dark maria
 * kept strong so they print as ink patches inside the bands. Relief still
 * bends the band edges, which is where the craters show.
 */
const TOON_STEPS = 4
const ALBEDO_AMOUNT = 0.75
/**
 * Fine relief breaks every band edge into sand, so the large crater forms
 * bend the bands and the micro-tile is all but dropped.
 */
const NORMAL_SCALE = 0.75
const DETAIL_SCALE = 0.1

/** Each click on a planet stacks charge: a longer, branchier, brighter strike. */
const LIGHTNING_CHARGE_PER_CLICK = 0.12
/** Seconds for full charge to bleed away once the clicking stops. */
const LIGHTNING_DISCHARGE_SECONDS = 7

/** Scratch vectors — one set for the whole module, reused every frame. */
const rayOrigin = new THREE.Vector3()
const rayDirection = new THREE.Vector3()
const toCentre = new THREE.Vector3()
const ndc = new THREE.Vector3()

type ShellProbe = {
  id: string
  centre: THREE.Vector3
  radius: number
  opacity: number
}

const shellProbes = new Map<string, ShellProbe>()

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

/** Casts the pointer ray; returns the distance along it to the sphere, or -1. */
function pointerRayHit(
  camera: THREE.Camera,
  centre: THREE.Vector3,
  radius: number,
): number {
  ndc.set(pointerState.x, pointerState.y, 0.5).unproject(camera)
  rayOrigin.copy(camera.position)
  rayDirection.copy(ndc).sub(rayOrigin).normalize()
  toCentre.copy(centre).sub(rayOrigin)
  const along = toCentre.dot(rayDirection)
  if (along <= 0) return -1
  const perpendicularSq = toCentre.lengthSq() - along * along
  if (perpendicularSq >= radius * radius) return -1
  return along - Math.sqrt(radius * radius - perpendicularSq)
}

/** Frontmost visible shell under the pointer, so the nearer planet takes the click. */
function resolveFrontShell(camera: THREE.Camera): string | null {
  if (!pointerState.enabled || pointerState.presence < 0.01) return null
  let bestId: string | null = null
  let bestHit = Infinity
  for (const probe of shellProbes.values()) {
    if (probe.opacity < 0.05) continue
    const hit = pointerRayHit(camera, probe.centre, probe.radius)
    if (hit >= 0 && hit < bestHit) {
      bestHit = hit
      bestId = probe.id
    }
  }
  return bestId
}

function unregisterShellProbe(id: string) {
  shellProbes.delete(id)
}

/** Live planet centres/radii for minigame collision (read-only each frame). */
export function forEachShellProbe(
  callback: (probe: {
    id: string
    centre: THREE.Vector3
    radius: number
    opacity: number
  }) => void,
) {
  for (const probe of shellProbes.values()) {
    callback(probe)
  }
}

function Shell({ motion }: { motion: ShellMotion }) {
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const hasInitialised = useRef(false)
  /** Damped camera-crossing fade, kept separate from the instant page switch. */
  const surfaceOpacity = useRef(0)
  /** Snaps the shell when the page changes where it lives, during the blank refresh. */
  const placement = useRef<'hero' | 'panel' | 'hidden'>('hidden')
  const lightningCharge = useRef(0)
  /** Seconds since the current strike began (draw → hold → fade), or -1. */
  const lightningAge = useRef(-1)
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
      opacity: 0,
      // Zero ambient + void-matched unlit faces = logo crescents only.
      ambient: 0,
      voidColor: '#0e1016',
      lightning: true,
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
    // The real shells, in the right-hand panel. Narrow pages have no panel.
    const inPanel =
      state.size.width >= 1024 &&
      !isGameActive() &&
      showsScenePlanets(pageState.index)
    const fit = inPanel ? panelFit(aspect) : 1
    // Recomputed every frame rather than on a resize event so the geometry stays
    // a unit sphere and reframing costs nothing but a multiply.
    const radius = resolveShellRadius(motion, aspect) * fit
    mesh.scale.setScalar(radius)

    resolveShellPose(motion, aspect, sampleOut, inPanel ? 'panel' : 'hero')
    if (fit !== 1) sampleOut.position.y *= fit
    const where = inPanel ? 'panel' : pageState.index === 0 || isGameActive() ? 'hero' : 'hidden'

    const intensityTarget = sampleOut.intensity * INTENSITY_SCALE
    const distanceToSurface =
      state.camera.position.distanceTo(sampleOut.position) - radius
    // Opaque outside the sphere; fades only once the camera crosses the surface.
    const surfaceTarget = THREE.MathUtils.smoothstep(distanceToSurface, -2, 0)

    const jumped = placement.current !== where
    if (!hasInitialised.current || jumped) {
      group.position.copy(sampleOut.position)
      uniforms.uLightDir.value.copy(sampleOut.lightDir).normalize()
      uniforms.uIntensity.value = intensityTarget
      surfaceOpacity.current = surfaceTarget
      hasInitialised.current = true
      placement.current = where
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

    // Cover, and the Center Infinity page where they sit in the right-hand panel.
    // Switched undamped: page turns swap content while the panel is blank, and
    // an unlit shell still writes depth, so a lingering fade would punch a
    // moon-shaped hole in the stars.
    const shown = pageState.index === 0 || isGameActive() || inPanel ? 1 : 0
    uniforms.uOpacity.value = surfaceOpacity.current * shown

    registerShellProbe(
      motion.id,
      group.position,
      radius,
      uniforms.uOpacity.value,
    )

    const frontShellId = resolveFrontShell(state.camera)
    pointerState.overShell = frontShellId !== null
    uniforms.uPlanetCenter.value.copy(group.position)
    uniforms.uTime.value = state.clock.elapsedTime

    if (pointerState.spaceClick && frontShellId === motion.id) {
      pointerState.spaceClick = false
      const hit = pointerRayHit(state.camera, group.position, radius)
      if (hit >= 0) {
        uniforms.uBoltOrigin.value
          .copy(rayDirection)
          .multiplyScalar(hit)
          .add(rayOrigin)
        lightningCharge.current = Math.min(
          1,
          lightningCharge.current + LIGHTNING_CHARGE_PER_CLICK,
        )
        uniforms.uLightningSeed.value = Math.random() * 1000
        lightningAge.current = 0
      }
    }
    updateLightning(lightningAge, lightningCharge, delta, uniforms)

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

/** Advances the strike: the tip races out, holds with flicker, then fades. */
function updateLightning(
  age: { current: number },
  charge: { current: number },
  delta: number,
  uniforms: ReturnType<typeof getShellMaterialUniforms>,
) {
  let draw = 0
  let opacity = 0
  if (age.current >= 0) {
    age.current += delta
    const c = charge.current
    const drawSec = 0.08 + c * 0.05
    const holdSec = 0.05 + c * 0.85
    const fadeSec = 0.1 + c * 0.35
    const t = age.current
    if (t < drawSec) {
      draw = t / drawSec
      opacity = 1
    } else if (t < drawSec + holdSec) {
      draw = 1
      opacity = 1
    } else if (t < drawSec + holdSec + fadeSec) {
      draw = 1
      opacity = 1 - (t - drawSec - holdSec) / fadeSec
    } else {
      age.current = -1
    }
  } else {
    charge.current = Math.max(
      0,
      charge.current - delta / LIGHTNING_DISCHARGE_SECONDS,
    )
  }
  uniforms.uLightningDraw.value = draw
  uniforms.uLightning.value = opacity
  uniforms.uLightningPower.value = charge.current
}

/**
 * Where the lens starts each time the cover is shown, relative to its rest
 * pose: forward and a little off-axis, about where the flyer hands it back.
 * It then eases home, and the planets seem to settle into place around it.
 */
const ARRIVAL_OFFSET = new THREE.Vector3(1.6, 0.9, -9)

/** Holds the hero framing, with a little pointer parallax. */
function CameraRig() {
  const hasInitialised = useRef(false)
  const arriving = useRef(false)
  const destination = useMemo(() => new THREE.Vector3(), [])
  const lookTarget = useMemo(
    () => new THREE.Vector3(...HERO_CAMERA.target),
    [],
  )

  // Page turns swap content while the panel is blank, so the jump is never seen.
  useEffect(
    () =>
      subscribePage((index) => {
        if (index === 0) arriving.current = true
      }),
    [],
  )

  useFrame((state, delta) => {
    // Flyer owns the lens while it runs; it starts from this pose so the cut is seamless.
    if (isGameActive()) return

    const camera = state.camera
    const [x, y, z] = HERO_CAMERA.position
    destination.set(
      x + state.pointer.x * PARALLAX_X,
      y + state.pointer.y * PARALLAX_Y,
      z,
    )

    if (arriving.current) {
      camera.position.copy(destination).add(ARRIVAL_OFFSET)
      arriving.current = false
      hasInitialised.current = true
    } else if (!hasInitialised.current) {
      camera.position.copy(destination)
      hasInitialised.current = true
    } else {
      // Also eases the lens home after the flyer hands it back.
      camera.position.x = THREE.MathUtils.damp(camera.position.x, destination.x, CAMERA_DAMP, delta)
      camera.position.y = THREE.MathUtils.damp(camera.position.y, destination.y, CAMERA_DAMP, delta)
      camera.position.z = THREE.MathUtils.damp(camera.position.z, destination.z, CAMERA_DAMP, delta)
    }

    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== HERO_CAMERA.fov) {
      camera.fov = HERO_CAMERA.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(lookTarget)
    publishCamera(camera.position, lookTarget, HERO_CAMERA.fov)
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
