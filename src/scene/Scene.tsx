import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
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
import { dprFor, type QualityTier } from '../lib/quality'

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
      {/* The frost/glitch feel on the Igloo site comes from a very small
          radially-modulated aberration, not a large offset. */}
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

export function Scene({ tier }: { tier: QualityTier }) {
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
      <color attach="background" args={['#0e1016']} />
      {/* No scene lights: every surface carries its own light direction so the
          four shells can be lit independently, the way the logo is. */}
      <Shells />
      <Starfield count={tier === 'high' ? 1100 : 550} />
      <DriftingRocks />
      <ShootingStars />
      <Effects tier={tier} />
    </Canvas>
  )
}
