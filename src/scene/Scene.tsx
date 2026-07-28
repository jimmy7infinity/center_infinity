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
import { Starfield } from './Starfield'
import { dprFor, type QualityTier } from '../lib/quality'

function Effects({ tier }: { tier: QualityTier }) {
  const aberrationOffset = useMemo(
    () => new THREE.Vector2(0.0007, 0.0011),
    [],
  )

  if (tier === 'medium') {
    return (
      <EffectComposer>
        <Bloom
          intensity={0.68}
          luminanceThreshold={0.18}
          luminanceSmoothing={0.32}
          mipmapBlur
          resolutionScale={0.4}
        />
        <Vignette offset={0.3} darkness={0.72} />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.62}
        luminanceThreshold={0.14}
        luminanceSmoothing={0.35}
        mipmapBlur
        resolutionScale={0.4}
      />
      {/* The frost/glitch feel on the Igloo site comes from a very small
          radially-modulated aberration, not a large offset. */}
      <ChromaticAberration
        offset={aberrationOffset}
        radialModulation
        modulationOffset={0.42}
      />
      <Vignette offset={0.28} darkness={0.78} />
      <Noise opacity={0.035} blendFunction={BlendFunction.OVERLAY} />
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
      camera={{ position: [0, 0, 17], fov: 42, near: 0.1, far: 120 }}
    >
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 24, 78]} />
      <Shells />
      <Starfield count={tier === 'high' ? 900 : 400} />
      <Effects tier={tier} />
    </Canvas>
  )
}
