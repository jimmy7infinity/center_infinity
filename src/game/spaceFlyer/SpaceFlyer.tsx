import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { publishCamera } from '../../lib/cameraBridge'
import { unlockAchievement } from '../../lib/achievements'
import {
  exitGame,
  getGameTimeLeft,
  isGameActive,
  isGameOver,
  triggerGameOver,
} from '../../lib/gameMode'
import { forEachShellProbe } from '../../scene/Shells'
import { attachFlyerControls, flyerControls } from './controls'
import { CombatField } from './OrbitRocks'
import { createRockBurstSystem } from './rockBurst'
import { ShipFallback, ShipModel } from './ShipModel'
import {
  createSonicBoomState,
  playSonicBoomSound,
  SonicBoom,
} from './SonicBoom'

const THRUST = 7.5
const BURST_THRUST = 22
const BURST_KICK = 14
const BURST_DURATION = 0.95
const BURST_MAX_SPEED = 16
const DRAG = 1.35
const MAX_SPEED = 9
const WORLD_BOUND = 40
const SHIP_RADIUS = 0.22
const CHASE_DISTANCE = 3.4
const CHASE_DISTANCE_BURST = 6.2
const CHASE_HEIGHT = 0.55
const LOOK_AHEAD = 6
const CAM_POS_DAMP = 2.4
const CAM_POS_DAMP_BURST = 4.5
const CAM_LOOK_DAMP = 3.2
const MAX_TURN_RATE = 2.1
const AIM_RANGE = 28
const MAX_PITCH = 1.05
const GAME_FOV = 42
const BURST_FOV = 50
const SPAWN_LOOK_DISTANCE = 10
const BANK_AIM_NUDGE = 0.26
const MAX_BANK_ROLL = 0.7
const AUTO_BANK_FROM_AIM = 0.22
const BANK_ROLL_DAMP = 7

const _shipForward = new THREE.Vector3()
const _aimPoint = new THREE.Vector3()
const _aimDir = new THREE.Vector3()
const _lookDir = new THREE.Vector3()
const _ndc = new THREE.Vector3()
const _desiredQuat = new THREE.Quaternion()
const _rollQuat = new THREE.Quaternion()
const _basis = new THREE.Matrix4()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _tmpRight = new THREE.Vector3()
const _tmpUp = new THREE.Vector3()
const _back = new THREE.Vector3()
const _localFwd = new THREE.Vector3(0, 0, -1)
const _crashPos = new THREE.Vector3()

/**
 * Boot from the current hero view, then chase-cam flight.
 * Cursor aims; A/D bank; double-W bursts. Planet contact = GAME OVER.
 */
export function SpaceFlyer() {
  const shipRef = useRef<THREE.Group>(null)
  const velocity = useMemo(() => new THREE.Vector3(), [])
  const camPos = useMemo(() => new THREE.Vector3(), [])
  const camLook = useMemo(() => new THREE.Vector3(), [])
  const desiredCam = useMemo(() => new THREE.Vector3(), [])
  const desiredLook = useMemo(() => new THREE.Vector3(), [])
  const hitNormal = useMemo(() => new THREE.Vector3(), [])
  const accel = useMemo(() => new THREE.Vector3(), [])
  const wreck = useMemo(() => createRockBurstSystem(), [])
  const roll = useRef(0)
  const burstLeft = useRef(0)
  const boom = useRef(createSonicBoomState())
  const exiting = useRef(false)
  const crashed = useRef(false)
  const booted = useRef(false)

  const getNose = useCallback((out: THREE.Vector3) => {
    const ship = shipRef.current
    if (!ship) {
      out.set(0, 0, -1)
      return
    }
    out.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize()
  }, [])

  useEffect(() => {
    const detach = attachFlyerControls()
    exiting.current = false
    crashed.current = false
    booted.current = false
    roll.current = 0
    burstLeft.current = 0
    boom.current.alive = false
    velocity.set(0, 0, 0)
    return () => {
      detach()
      wreck.dispose()
    }
  }, [velocity, wreck])

  useFrame((state, delta) => {
    if (!isGameActive() || exiting.current) return

    const ship = shipRef.current
    if (!ship) return

    const dt = Math.min(0.05, delta)
    const camera = state.camera

    // Crash hold — HUD owns exit after GAME OVER; keep wreck FX + camera alive.
    if (crashed.current || isGameOver()) {
      wreck.update(dt)
      camera.position.copy(camPos)
      camera.lookAt(camLook)
      publishCamera(
        camera.position,
        camLook,
        camera instanceof THREE.PerspectiveCamera ? camera.fov : GAME_FOV,
      )
      return
    }

    if (getGameTimeLeft() <= 0) {
      exiting.current = true
      exitGame()
      return
    }

    if (!booted.current) {
      camPos.copy(camera.position)
      camera.getWorldDirection(_lookDir)
      camLook.copy(camera.position).addScaledVector(_lookDir, 16)

      ship.position
        .copy(camera.position)
        .addScaledVector(_lookDir, SPAWN_LOOK_DISTANCE)

      _tmpRight.crossVectors(_lookDir, _worldUp)
      if (_tmpRight.lengthSq() < 1e-6) _tmpRight.set(1, 0, 0)
      else _tmpRight.normalize()
      _tmpUp.crossVectors(_tmpRight, _lookDir).normalize()
      _back.copy(_lookDir).negate()
      _basis.makeBasis(_tmpRight, _tmpUp, _back)
      ship.quaternion.setFromRotationMatrix(_basis)
      velocity.copy(_lookDir).multiplyScalar(1.1)
      ship.visible = true
      booted.current = true
    }

    let bank = 0
    if (flyerControls.bankLeft) bank -= 1
    if (flyerControls.bankRight) bank += 1

    const aimX = THREE.MathUtils.clamp(
      flyerControls.aimX + bank * BANK_AIM_NUDGE,
      -1.35,
      1.35,
    )
    const aimY = flyerControls.aimY

    camera.updateMatrixWorld()
    _ndc.set(aimX, aimY, 0.5).unproject(camera)
    _aimDir.copy(_ndc).sub(camera.position).normalize()
    _aimPoint.copy(camera.position).addScaledVector(_aimDir, AIM_RANGE)

    _aimDir.copy(_aimPoint).sub(ship.position)
    if (_aimDir.lengthSq() < 1e-6) {
      _aimDir.set(0, 0, -1).applyQuaternion(ship.quaternion)
    } else {
      _aimDir.normalize()
    }

    const pitch = Math.asin(
      THREE.MathUtils.clamp(_aimDir.y, -Math.sin(MAX_PITCH), Math.sin(MAX_PITCH)),
    )
    const flatLen = Math.hypot(_aimDir.x, _aimDir.z)
    const yawDirX = flatLen > 1e-5 ? _aimDir.x / flatLen : 0
    const yawDirZ = flatLen > 1e-5 ? _aimDir.z / flatLen : -1
    _aimDir
      .set(
        yawDirX * Math.cos(pitch),
        Math.sin(pitch),
        yawDirZ * Math.cos(pitch),
      )
      .normalize()

    _tmpRight.crossVectors(_aimDir, _worldUp)
    if (_tmpRight.lengthSq() < 1e-6) {
      _tmpRight.set(1, 0, 0).applyQuaternion(ship.quaternion).normalize()
    } else {
      _tmpRight.normalize()
    }
    _tmpUp.crossVectors(_tmpRight, _aimDir).normalize()
    _back.copy(_aimDir).negate()
    _basis.makeBasis(_tmpRight, _tmpUp, _back)
    _desiredQuat.setFromRotationMatrix(_basis)

    const targetRoll =
      bank * MAX_BANK_ROLL +
      THREE.MathUtils.clamp(flyerControls.aimX, -1, 1) * AUTO_BANK_FROM_AIM
    roll.current = THREE.MathUtils.damp(
      roll.current,
      targetRoll,
      BANK_ROLL_DAMP,
      dt,
    )
    _rollQuat.setFromAxisAngle(_localFwd, roll.current)
    _desiredQuat.multiply(_rollQuat)

    ship.quaternion.rotateTowards(_desiredQuat, MAX_TURN_RATE * dt)

    _shipForward.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize()

    if (flyerControls.burstQueued) {
      flyerControls.burstQueued = false
      burstLeft.current = BURST_DURATION
      velocity.addScaledVector(_shipForward, BURST_KICK)
      boom.current.alive = true
      boom.current.age = 0
      boom.current.position.copy(ship.position).addScaledVector(_shipForward, 0.2)
      boom.current.forward.copy(_shipForward)
      playSonicBoomSound()
      unlockAchievement('go_faster')
    }

    if (burstLeft.current > 0) {
      burstLeft.current = Math.max(0, burstLeft.current - dt)
    }
    const bursting = burstLeft.current > 0
    const burstFade = bursting
      ? THREE.MathUtils.smoothstep(burstLeft.current / BURST_DURATION, 0, 1)
      : 0

    accel.set(0, 0, 0)
    if (flyerControls.thrust) {
      accel.addScaledVector(
        _shipForward,
        THREE.MathUtils.lerp(THRUST, BURST_THRUST, burstFade),
      )
    } else if (bursting) {
      accel.addScaledVector(_shipForward, BURST_THRUST * 0.55 * burstFade)
    }

    velocity.addScaledVector(accel, dt)
    velocity.multiplyScalar(Math.exp(-DRAG * dt))
    const speedCap = THREE.MathUtils.lerp(MAX_SPEED, BURST_MAX_SPEED, burstFade)
    if (velocity.length() > speedCap) velocity.setLength(speedCap)

    ship.position.addScaledVector(velocity, dt)

    // Planet contact destroys the craft — no soft bounce.
    let hitPlanet = false
    forEachShellProbe((probe) => {
      if (hitPlanet || probe.opacity < 0.05) return
      hitNormal.copy(ship.position).sub(probe.centre)
      const dist = hitNormal.length()
      const minDist = probe.radius + SHIP_RADIUS
      if (dist < 1e-5 || dist >= minDist) return
      hitPlanet = true
      _crashPos.copy(ship.position)
    })

    if (hitPlanet) {
      crashed.current = true
      ship.visible = false
      velocity.set(0, 0, 0)
      flyerControls.burstQueued = false
      wreck.spawn(_crashPos, 0.55)
      triggerGameOver()
      wreck.update(dt)
      return
    }

    const radial = ship.position.length()
    if (radial > WORLD_BOUND) {
      hitNormal.copy(ship.position).multiplyScalar(1 / radial)
      ship.position.addScaledVector(hitNormal, WORLD_BOUND - radial)
      const into = velocity.dot(hitNormal)
      if (into > 0) velocity.addScaledVector(hitNormal, -into * 1.05)
    }

    _shipForward.set(0, 0, -1).applyQuaternion(ship.quaternion).normalize()
    const chaseDist = THREE.MathUtils.lerp(
      CHASE_DISTANCE,
      CHASE_DISTANCE_BURST,
      burstFade,
    )
    const camDamp = THREE.MathUtils.lerp(
      CAM_POS_DAMP,
      CAM_POS_DAMP_BURST,
      burstFade,
    )
    desiredCam
      .copy(ship.position)
      .addScaledVector(_shipForward, -chaseDist)
      .addScaledVector(_worldUp, CHASE_HEIGHT)
    desiredLook.copy(ship.position).addScaledVector(_shipForward, LOOK_AHEAD)

    camPos.x = THREE.MathUtils.damp(camPos.x, desiredCam.x, camDamp, dt)
    camPos.y = THREE.MathUtils.damp(camPos.y, desiredCam.y, camDamp, dt)
    camPos.z = THREE.MathUtils.damp(camPos.z, desiredCam.z, camDamp, dt)
    camLook.x = THREE.MathUtils.damp(camLook.x, desiredLook.x, CAM_LOOK_DAMP, dt)
    camLook.y = THREE.MathUtils.damp(camLook.y, desiredLook.y, CAM_LOOK_DAMP, dt)
    camLook.z = THREE.MathUtils.damp(camLook.z, desiredLook.z, CAM_LOOK_DAMP, dt)

    camera.position.copy(camPos)
    camera.lookAt(camLook)
    const targetFov = THREE.MathUtils.lerp(GAME_FOV, BURST_FOV, burstFade)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt)
      camera.updateProjectionMatrix()
    }
    publishCamera(
      camera.position,
      camLook,
      camera instanceof THREE.PerspectiveCamera ? camera.fov : GAME_FOV,
    )
  })

  return (
    <>
      <group ref={shipRef}>
        <Suspense fallback={<ShipFallback />}>
          <ShipModel />
        </Suspense>
      </group>
      <SonicBoom boomRef={boom} />
      {wreck.pieceMeshes.map((mesh, index) => (
        <primitive key={`wreck-${index}`} object={mesh} />
      ))}
      <primitive object={wreck.sparkMesh} />
      <CombatField shipRef={shipRef} getNose={getNose} />
    </>
  )
}
