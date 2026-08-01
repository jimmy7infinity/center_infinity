import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isGameOver } from '../../lib/gameMode'
import { forEachShellProbe } from '../../scene/Shells'
import { createRockGeometry } from '../../scene/DriftingRocks'
import {
  createRockPool,
  createShotPool,
  fireShot,
  resolveShotHits,
  stepRocks,
  stepShots,
  type PlanetBody,
  type Rock,
  FIRE_COOLDOWN,
  PLANET_CLEARANCE,
  ROCK_MESH_SCALE,
} from './combat'
import { flyerControls } from './controls'
import { flyerAim, pickReticleRock } from './flyerAim'
import { createRockBurstSystem } from './rockBurst'
import { createRockCoatMaterial, getRockCoatUniforms } from './rockCoat'
import {
  createShotStreak,
  disposeShotStreak,
  updateShotStreak,
  type ShotStreak,
} from './shotStreak'

type CombatFieldProps = {
  shipRef: RefObject<THREE.Group | null>
}

const SUN_DIR = new THREE.Vector3(-0.55, 0.86, -0.5).normalize()
const GEO_VARIANTS = 5
const TRACER_LENGTH = 3.2
/** Fixed field size — no mid-run spawns. */
const ROCKS_IN_PLAY = 16

const _shotDir = new THREE.Vector3()
const _rayDir = new THREE.Vector3()
const _ndc = new THREE.Vector3()
const _centres = new Map<string, THREE.Vector3>()
const _hostRadii = new Map<string, number>()
const _planets: PlanetBody[] = []

function seedRocks(rocks: Rock[]) {
  const hosts: { id: string; radius: number }[] = []
  forEachShellProbe((probe) => {
    if (probe.opacity < 0.05) return
    hosts.push({ id: probe.id, radius: probe.radius })
  })
  if (hosts.length === 0) return false

  let i = 0
  while (i < ROCKS_IN_PLAY && i < rocks.length) {
    const host = hosts[i % hosts.length]
    const rock = rocks[i]
    rock.alive = true
    rock.hostId = host.id
    rock.size = 0.18 + Math.random() * 0.26
    const minOrbit =
      host.radius + rock.size * ROCK_MESH_SCALE + PLANET_CLEARANCE + 0.45
    rock.orbitRadius = minOrbit + Math.random() * host.radius * 0.55
    rock.angle = Math.random() * Math.PI * 2
    rock.spin = 0.04 + Math.random() * 0.06
    rock.tilt = 0.25 + Math.random() * 0.7
    i += 1
  }
  return i > 0
}

/**
 * Fixed set of orbiting debris + bolts + break FX. No respawn mid-run.
 */
export function CombatField({ shipRef }: CombatFieldProps) {
  const rocks = useMemo(() => createRockPool(), [])
  const shots = useMemo(() => createShotPool(), [])
  const bursts = useMemo(() => createRockBurstSystem(), [])
  const seeded = useRef(false)
  const cooldown = useRef(0)
  const rockMeshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: rocks.length }, () => null),
  )

  const geometries = useMemo(
    () =>
      Array.from({ length: GEO_VARIANTS }, (_, index) =>
        createRockGeometry(0x51f0 + index * 7919),
      ),
    [],
  )

  // Dark rock + cold shimmer coat (game-only — keeps landing debris unchanged).
  const material = useMemo(() => createRockCoatMaterial(), [])

  const streaks = useMemo(
    () => Array.from({ length: shots.length }, () => createShotStreak()),
    [shots.length],
  )

  useEffect(() => {
    return () => {
      material.dispose()
      for (const geometry of geometries) geometry.dispose()
      for (const streak of streaks) disposeShotStreak(streak)
      bursts.dispose()
    }
  }, [material, geometries, streaks, bursts])

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta)
    const ship = shipRef.current
    if (!ship) return

    if (!seeded.current) {
      seeded.current = seedRocks(rocks)
    }

    _planets.length = 0
    forEachShellProbe((probe) => {
      if (probe.opacity < 0.05) return
      let centre = _centres.get(probe.id)
      if (!centre) {
        centre = new THREE.Vector3()
        _centres.set(probe.id, centre)
      }
      centre.copy(probe.centre)
      _hostRadii.set(probe.id, probe.radius)
      _planets.push({ centre, radius: probe.radius })
    })

    stepRocks(rocks, _centres, _hostRadii, _planets, dt)

    // Refine aim onto whatever rock sits under the hex — shots track the
    // reticle at that depth instead of a fixed plane (no more under-passes).
    const camera = state.camera
    camera.updateMatrixWorld()
    _ndc.set(flyerControls.aimX, flyerControls.aimY, 0.5).unproject(camera)
    _rayDir.copy(_ndc).sub(camera.position).normalize()
    const pick = pickReticleRock(camera.position, _rayDir, rocks)
    if (pick) {
      flyerAim.point.copy(pick.point)
      flyerAim.direction.copy(pick.point).sub(ship.position)
      if (flyerAim.direction.lengthSq() > 1e-8) {
        flyerAim.direction.normalize()
      }
      flyerAim.muzzle.copy(ship.position).addScaledVector(flyerAim.direction, 0.42)
    }

    const over = isGameOver()
    cooldown.current = Math.max(0, cooldown.current - dt)
    if (!over && flyerControls.fire && cooldown.current <= 0) {
      // Fire along reticle aim, not the lagging nose.
      if (fireShot(shots, flyerAim.muzzle, flyerAim.direction)) {
        cooldown.current = FIRE_COOLDOWN
      }
    }

    if (!over) {
      stepShots(shots, dt)
      resolveShotHits(shots, rocks, (position, size) => {
        bursts.spawn(position, size)
      })
    }
    bursts.update(dt)

    const uniforms = getRockCoatUniforms(material)
    uniforms.uLightDir.value.copy(SUN_DIR)
    uniforms.uTime.value = state.clock.elapsedTime

    for (let i = 0; i < rocks.length; i++) {
      const rock = rocks[i]
      const mesh = rockMeshRefs.current[i]
      if (!mesh) continue
      if (!rock.alive) {
        mesh.visible = false
        continue
      }
      mesh.visible = true
      mesh.position.copy(rock.position)
      mesh.scale.setScalar(rock.size * ROCK_MESH_SCALE)
      mesh.rotation.set(rock.angle * 0.7, rock.angle, rock.tilt)
    }

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      const streak = streaks[i] as ShotStreak
      if (!shot.alive) {
        updateShotStreak(streak, shot.position, _shotDir, false)
        continue
      }
      _shotDir.copy(shot.velocity).normalize()
      updateShotStreak(streak, shot.position, _shotDir, true, TRACER_LENGTH)
    }
  })

  return (
    <>
      {rocks.map((_, index) => (
        <mesh
          key={`rock-${index}`}
          ref={(node) => {
            rockMeshRefs.current[index] = node
          }}
          geometry={geometries[index % GEO_VARIANTS]}
          material={material}
          visible={false}
          frustumCulled={false}
          renderOrder={5}
        />
      ))}
      {streaks.map((streak, index) => (
        <primitive key={`shot-${index}`} object={streak.mesh} />
      ))}
      {bursts.pieceMeshes.map((mesh, index) => (
        <primitive key={`shard-${index}`} object={mesh} />
      ))}
      <primitive object={bursts.sparkMesh} />
    </>
  )
}
