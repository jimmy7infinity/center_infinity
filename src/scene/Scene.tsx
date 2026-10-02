import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Shells } from './Shells'
import { DriftingRocks } from './DriftingRocks'
import { ShootingStars } from './ShootingStars'
import { Starfield } from './Starfield'
import { SpaceFlyer } from '../game/spaceFlyer'
import { dprFor, type QualityTier } from '../lib/quality'
import { cameraBridge } from '../lib/cameraBridge'
import { isGameActive, subscribeGameMode } from '../lib/gameMode'
import { InkEffect } from './InkEffect'
import { HERO_CAMERA } from './shellKeyframes'

/**
 * Scene-space void, shared with the shells' unlit faces. The ink pass prints it
 * as bare panel; anything lighter would read as faint pigment.
 */
const VOID = '#0e1016'

/** No bloom, fringing, vignette or moving grain — those are camera and screen tells. */
function InkEffects() {
  const dpr = useThree((state) => state.viewport.dpr)
  const effect = useMemo(() => new InkEffect(), [])

  useEffect(() => {
    effect.setPixelRatio(dpr)
  }, [effect, dpr])

  useEffect(() => () => effect.dispose(), [effect])

  return (
    <EffectComposer multisampling={0}>
      <primitive object={effect} />
    </EffectComposer>
  )
}

/** Follows the background CameraRig so debris stays view-locked. */
function FollowCamera() {
  useFrame((state) => {
    if (!cameraBridge.ready) return
    const camera = state.camera
    camera.position.copy(cameraBridge.position)
    if (camera instanceof THREE.PerspectiveCamera) {
      if (Math.abs(camera.fov - cameraBridge.fov) > 0.01) {
        camera.fov = cameraBridge.fov
        camera.updateProjectionMatrix()
      }
    }
    camera.lookAt(cameraBridge.target)
  })
  return null
}

/** Fires once the first WebGL frame has drawn — ends the loading gate. */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    let frames = 0
    let raf = 0
    const tick = () => {
      frames += 1
      // A couple of frames so the first page draws without a shader-compile hitch.
      if (frames >= 2) {
        onReady?.()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onReady])
  return null
}

/** A sparse field: printed dots, not a sky full of lights. */
function starCount(tier: QualityTier) {
  return tier === 'high' ? 275 : 140
}

function useGameMounted() {
  const [active, setActive] = useState(false)
  useEffect(() => subscribeGameMode(() => setActive(isGameActive())), [])
  return active
}

function BackgroundScene({
  tier,
  onReady,
}: {
  tier: QualityTier
  onReady?: () => void
}) {
  const gameOn = useGameMounted()

  return (
    <Canvas
      className="!fixed inset-0 z-0"
      dpr={dprFor(tier)}
      gl={{
        antialias: tier === 'high',
        alpha: false,
        powerPreference: 'high-performance',
      }}
      camera={{ position: [...HERO_CAMERA.position], fov: HERO_CAMERA.fov, near: 0.1, far: 200 }}
    >
      <color attach="background" args={[VOID]} />
      <ReadySignal onReady={onReady} />
      <Shells />
      {gameOn ? <SpaceFlyer /> : null}
      <Starfield count={starCount(tier)} />
      <InkEffects />
    </Canvas>
  )
}

function ForegroundDebris({ tier }: { tier: QualityTier }) {
  const gameOn = useGameMounted()

  return (
    <Canvas
      className="pointer-events-none !fixed inset-0 z-[102]"
      dpr={dprFor(tier)}
      gl={{
        antialias: tier === 'high',
        alpha: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
      }}
      camera={{ position: [...HERO_CAMERA.position], fov: HERO_CAMERA.fov, near: 0.1, far: 200 }}
      // R3F sets pointer-events:auto on the root; className alone loses the fight.
      style={{ background: 'transparent', pointerEvents: 'none' }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
      }}
    >
      <FollowCamera />
      {/* Rocks/meteors sit above the bg canvas and would bury the ship. */}
      {gameOn ? null : (
        <>
          <DriftingRocks />
          <ShootingStars crossText />
        </>
      )}
    </Canvas>
  )
}

export function Scene({
  tier,
  onReady,
}: {
  tier: QualityTier
  onReady?: () => void
}) {
  return (
    <>
      <BackgroundScene tier={tier} onReady={onReady} />
      <ForegroundDebris tier={tier} />
    </>
  )
}
