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
  resolveShellPose,
  resolveShellRadius,
  type ShellMotion,
  type ShellSample,
} from './shellKeyframes'
import { StormLines, createStorm } from './strikeShow'
import { pickDriftingRockAlongRay } from './driftingRockBridge'

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

/**
 * Charge only builds when clicks land before the last ones have bled off.
 * That charge is the storm: more bolts, longer ones, and a longer cool-down.
 */
const HEAT_PER_CLICK = 0.11
/** How fast unused heat falls off, so a pause clears the buildup. */
const HEAT_DECAY_PER_SECOND = 0.22

/** Scratch vectors — one set for the whole module, reused every frame. */
const rayOrigin = new THREE.Vector3()
const rayDirection = new THREE.Vector3()
const toCentre = new THREE.Vector3()
const ndc = new THREE.Vector3()
const fitNdc = new THREE.Vector3()
const fitWorld = new THREE.Vector3()
const fitRight = new THREE.Vector3()
const fitUp = new THREE.Vector3()
const fitSample: ShellSample = {
  position: new THREE.Vector3(),
  lightDir: new THREE.Vector3(),
  intensity: 0,
}

/**
 * The Center Infinity page is the hero picture at three-quarter size.
 * The mark stays centred on the page, so the smaller crescents land at the
 * left of the right-hand scene instead of being enlarged to fill that panel.
 */
const CLUSTER_PAGE_SCALE = 0.75

const clusterFit = {
  on: false,
  scale: 1,
  ox: 0,
  oy: 0,
}

/**
 * Projects the hero arrangement and shrinks it in place. Scaling in NDC, then
 * unprojecting each shell at its own depth, keeps the nested mark concentric.
 */
function updateClusterFit(camera: THREE.Camera, width: number, height: number) {
  camera.updateMatrixWorld()
  const aspect = Math.max(0.2, width / Math.max(height, 1))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  fitRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
  fitUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
  for (const motion of SHELL_MOTIONS) {
    resolveShellPose(motion, aspect, fitSample)
    const radius = resolveShellRadius(motion, aspect)
    fitWorld.copy(fitSample.position)
    fitNdc.copy(fitWorld).project(camera)
    const cx = fitNdc.x
    const cy = fitNdc.y
    fitNdc.copy(fitWorld).addScaledVector(fitRight, radius).project(camera)
    const rx = Math.abs(fitNdc.x - cx)
    fitNdc.copy(fitWorld).addScaledVector(fitUp, radius).project(camera)
    const ry = Math.abs(fitNdc.y - cy)
    minX = Math.min(minX, cx - rx)
    maxX = Math.max(maxX, cx + rx)
    minY = Math.min(minY, cy - ry)
    maxY = Math.max(maxY, cy + ry)
  }
  const cx = (minX + maxX) * 0.5
  const cy = (minY + maxY) * 0.5
  const scale = CLUSTER_PAGE_SCALE
  clusterFit.on = true
  clusterFit.scale = scale
  clusterFit.ox = cx * (1 - scale)
  clusterFit.oy = cy * (1 - scale)
}

function placeInPanel(camera: THREE.Camera, position: THREE.Vector3) {
  fitNdc.copy(position).project(camera)
  const clipZ = fitNdc.z
  fitNdc.x = fitNdc.x * clusterFit.scale + clusterFit.ox
  fitNdc.y = fitNdc.y * clusterFit.scale + clusterFit.oy
  fitNdc.z = clipZ
  position.copy(fitNdc).unproject(camera)
}

/**
 * The filament's end is the cursor, at the strike's depth so the streamer
 * stays a line across the view instead of diving at the lens. `outAim` is in
 * the shell group's local space.
 */
function cursorAim(
  camera: THREE.Camera,
  originLocal: THREE.Vector3,
  center: THREE.Vector3,
  outAim: THREE.Vector3,
) {
  fitWorld.copy(originLocal).add(center)
  fitNdc.copy(fitWorld).project(camera)
  const clipZ = fitNdc.z
  fitNdc.set(pointerState.x, pointerState.y, clipZ)
  outAim.copy(fitNdc).unproject(camera).sub(center)
}

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
function resolveFrontShell(camera: THREE.Camera): { id: string; hit: number } | null {
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
  if (!bestId) return null
  return { id: bestId, hit: bestHit }
}

/** A drifting rock in front of the shell — the click belongs to the meteor. */
function rockCoversShell(camera: THREE.Camera, shellHit: number) {
  ndc.set(pointerState.x, pointerState.y, 0.5).unproject(camera)
  rayOrigin.copy(camera.position)
  rayDirection.copy(ndc).sub(rayOrigin).normalize()
  const rock = pickDriftingRockAlongRay(rayOrigin, rayDirection)
  return rock !== null && rock.distance < shellHit
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
  /** Clicks inside a short window. Bleeds off once they stop. */
  const heat = useRef(0)
  /** Charge snapped when the current storm started. Drives length and duration. */
  const strikePower = useRef(0)
  /** Seconds since the current storm began (draw → hold → cool), or -1. */
  const lightningAge = useRef(-1)
  const strikeSeed = useRef(0)
  /** Keeps running through the cool-down so the reshape cycle does not freeze. */
  const wave = useRef(0)
  /** Irregular flash clock. Slows while the bolt cools, then stops. */
  const flashTime = useRef(0)
  /** Sharp burst on each click. Falls off within a fraction of a second. */
  const strikeFlash = useRef(0)
  const scorch = useRef(0)
  const scorchPeak = useRef(0)
  /** Seconds of burn left after the white light is gone. */
  const scorchLeft = useRef(0)
  /** Dark line left in the bolt's path. Fades on its own after the flash. */
  const charMark = useRef(0)
  const charPeak = useRef(0)
  const charLeft = useRef(0)
  const scorchWave = useRef(0)
  const scorchShake = useRef(1)
  /** Click point in the shell group's local space, before it is lifted to the radius. */
  const boltLocal = useRef(new THREE.Vector3())
  const storm = useMemo(() => createStorm(), [])
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
    // CameraRig shrinks the hero cluster in place before this runs.
    const inPanel = clusterFit.on
    // Recomputed every frame rather than on a resize event so the geometry stays
    // a unit sphere and reframing costs nothing but a multiply.
    const radius =
      resolveShellRadius(motion, aspect) * (inPanel ? clusterFit.scale : 1)
    mesh.scale.setScalar(radius)

    resolveShellPose(motion, aspect, sampleOut)
    if (inPanel) placeInPanel(state.camera, sampleOut.position)
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

    // Cover, and the Center Infinity page where the same scene sits at three-quarter size.
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

    const front = resolveFrontShell(state.camera)
    const frontShellId =
      front && !rockCoversShell(state.camera, front.hit) ? front.id : null
    pointerState.overShell = frontShellId !== null

    if (pointerState.spaceClick && frontShellId === motion.id) {
      pointerState.spaceClick = false
      const hit = pointerRayHit(state.camera, group.position, radius)
      if (hit >= 0) {
        boltLocal.current
          .copy(rayDirection)
          .multiplyScalar(hit)
          .add(rayOrigin)
          .sub(group.position)
        heat.current = Math.min(1, heat.current + HEAT_PER_CLICK)
        strikePower.current = heat.current
        strikeFlash.current = 1
        if (lightningAge.current < 0) {
          strikeSeed.current = Math.random() * 1000
          lightningAge.current = 0
          wave.current = 0
          flashTime.current = 0
          scorch.current = 0
          scorchPeak.current = 0
          scorchLeft.current = 0
          charMark.current = 0
          charPeak.current = 0
          charLeft.current = 0
        } else {
          // Keep the arcs that are already out. A new click lengthens them
          // and refreshes the bright phase instead of blinking the crescent.
          const drawSec = 0.2 + strikePower.current * 0.35
          lightningAge.current = drawSec
        }
      }
    }

    const flashed = updateLightning(lightningAge, delta, strikePower.current)
    const scorchLinger = 1.5 + strikePower.current * 1.8
    const charLinger = 8 + strikePower.current * 6
    if (lightningAge.current >= 0) {
      const pace = flashed.cooling ? 0.4 + 0.6 * flashed.shake : 1
      wave.current += delta * pace
      const flashPace = flashed.cooling ? 0.35 + 0.65 * flashed.shake : 1
      flashTime.current += delta * flashPace
      scorchWave.current = wave.current
      scorchShake.current = flashed.shake
      if (flashed.cooling) {
        scorch.current = flashed.settle * 0.92
        scorchPeak.current = scorch.current
        scorchLeft.current = scorchLinger
        charMark.current = flashed.settle
        charPeak.current = charMark.current
        charLeft.current = charLinger
      } else {
        scorch.current = Math.max(0, scorch.current - delta * 6)
        scorchPeak.current = scorch.current
        charMark.current = Math.max(0, charMark.current - delta * 4)
        charPeak.current = charMark.current
      }
    } else {
      if (scorchLeft.current > 0 && scorchPeak.current > 0.02) {
        scorchLeft.current = Math.max(0, scorchLeft.current - delta)
        const u = 1 - scorchLeft.current / scorchLinger
        const fade = 1 - u * u * (3 - 2 * u)
        scorch.current = scorchPeak.current * fade
        if (scorchLeft.current <= 0) {
          scorch.current = 0
          scorchPeak.current = 0
        }
      }
      if (charLeft.current > 0 && charPeak.current > 0.02) {
        charLeft.current = Math.max(0, charLeft.current - delta)
        const u = 1 - charLeft.current / charLinger
        const fade = 1 - u * u * (3 - 2 * u)
        charMark.current = charPeak.current * fade
        if (charLeft.current <= 0) {
          charMark.current = 0
          charPeak.current = 0
        }
      }
    }
    strikeFlash.current = Math.max(0, strikeFlash.current - delta * 7)
    heat.current = Math.max(0, heat.current - delta * HEAT_DECAY_PER_SECOND)

    if (boltLocal.current.lengthSq() > 1e-8) {
      storm.origin.copy(boltLocal.current).normalize().multiplyScalar(radius * 1.012)
    }
    storm.opacity = flashed.opacity
    storm.draw = flashed.draw
    storm.power = strikePower.current
    storm.seed = strikeSeed.current
    storm.crackle = flashed.crackle
    storm.wave = wave.current
    storm.shake = flashed.shake
    storm.cooling = flashed.cooling
    storm.flashTime = flashTime.current
    storm.strikeFlash = strikeFlash.current
    storm.scorch = scorch.current
    storm.scorchWave = scorchWave.current
    storm.scorchShake = scorchShake.current
    storm.char = charMark.current
    storm.radius = radius
    const hovering = frontShellId === motion.id
    if (flashed.opacity > 0.03 && !hovering && pointerState.presence > 0) {
      cursorAim(state.camera, storm.origin, group.position, storm.aim)
      storm.arc = 1
    } else {
      storm.arc = 0
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
      <StormLines storm={storm} />
    </group>
  )
}

/**
 * The bolts crawl out, hold a shape, retarget, and cool. The reshape keeps
 * going through the fade and only gets smaller, so it does not freeze and die.
 * `settle` rises through that fade and is what leaves the burn behind.
 */
function updateLightning(
  age: { current: number },
  delta: number,
  power: number,
): {
  draw: number
  opacity: number
  crackle: number
  shake: number
  cooling: boolean
  settle: number
} {
  let draw = 0
  let opacity = 0
  let crackle = 0
  let shake = 1
  let cooling = false
  let settle = 0
  if (age.current >= 0) {
    age.current += delta
    const t = age.current
    const drawSec = 0.2 + power * 0.35
    const holdSec = 0.4 + power * 0.65
    const fadeSec = 2.6 + power * 3.2
    const brightUntil = drawSec + holdSec
    const rate = 9 + power * 4
    if (t < drawSec) {
      draw = t / drawSec
      opacity = 1
      crackle = Math.floor(t * rate)
    } else if (t < brightUntil) {
      draw = 1
      opacity = 1
      crackle = Math.floor(t * rate)
    } else if (t < brightUntil + fadeSec) {
      draw = 1
      const u = (t - brightUntil) / fadeSec
      const eased = u * u * (3 - 2 * u)
      opacity = 1 - eased
      crackle = Math.floor(t * rate * (1 - eased * 0.65))
      shake = 1 - eased * 0.8
      cooling = true
      settle = eased
    } else {
      age.current = -1
      shake = 0
      settle = 1
    }
  }
  return { draw, opacity, crackle, shake, cooling, settle }
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
    if (isGameActive()) {
      clusterFit.on = false
      return
    }

    const camera = state.camera
    const [x, y, z] = HERO_CAMERA.position
    // Planted on the project page so the fit isn't chasing pointer parallax.
    const planted = state.size.width >= 1024 && showsScenePlanets(pageState.index)
    destination.set(
      x + (planted ? 0 : state.pointer.x * PARALLAX_X),
      y + (planted ? 0 : state.pointer.y * PARALLAX_Y),
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
    camera.updateMatrixWorld()
    publishCamera(camera.position, lookTarget, HERO_CAMERA.fov)
    if (planted && camera instanceof THREE.PerspectiveCamera) {
      updateClusterFit(camera, state.size.width, state.size.height)
    } else {
      clusterFit.on = false
    }
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
