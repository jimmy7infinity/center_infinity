import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Shells } from './Shells'
import { DriftingRocks } from './DriftingRocks'
import { ShootingStars } from './ShootingStars'
import { Starfield } from './Starfield'
import { SpaceFlyer } from '../game/spaceFlyer'
import { dprFor, type QualityTier } from '../lib/quality'
import { cameraBridge } from '../lib/cameraBridge'
import { isGameActive, subscribeGameMode } from '../lib/gameMode'

const VOID = '#0e1016'

function Effects({ tier }: { tier: QualityTier }) {
  const aberrationOffset = useMemo(
    () => new THREE.Vector2(0.00025, 0.0004),
    [],
  )

  if (tier === 'medium') {
    return (
      <EffectComposer>
        <Bloom
          intensity={0.42}
          luminanceThreshold={0.28}
          luminanceSmoothing={0.18}
          mipmapBlur
          resolutionScale={0.55}
        />
        <Vignette offset={0.3} darkness={0.68} />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.48}
        luminanceThreshold={0.26}
        luminanceSmoothing={0.2}
        mipmapBlur
        resolutionScale={0.65}
      />
      <ChromaticAberration
        offset={aberrationOffset}
        radialModulation
        modulationOffset={0.42}
      />
      <Vignette offset={0.28} darkness={0.72} />
      <Noise opacity={0.02} blendFunction={BlendFunction.OVERLAY} />
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
      // A couple of frames so the first warp streak is already in the pipeline.
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
      camera={{ position: [0, 0, 27], fov: 42, near: 0.1, far: 200 }}
    >
      <color attach="background" args={[VOID]} />
      <ReadySignal onReady={onReady} />
      <Shells />
      {gameOn ? <SpaceFlyer /> : null}
      <Starfield count={tier === 'high' ? 1100 : 550} />
      <Effects tier={tier} />
    </Canvas>
  )
}

function ForegroundDebris({ tier }: { tier: QualityTier }) {
  const gameOn = useGameMounted()

  return (
    <Canvas
      className="pointer-events-none !fixed inset-0 z-40"
      dpr={dprFor(tier)}
      gl={{
        antialias: tier === 'high',
        alpha: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
      }}
      camera={{ position: [0, 0, 27], fov: 42, near: 0.1, far: 200 }}
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
