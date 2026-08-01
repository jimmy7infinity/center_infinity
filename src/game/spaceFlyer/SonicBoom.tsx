import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const LIFE = 0.78
const STREAK_COUNT = 18

export type SonicBoomState = {
  alive: boolean
  age: number
  position: THREE.Vector3
  forward: THREE.Vector3
}

const _target = new THREE.Vector3()
const _matrix = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _outward = new THREE.Vector3()
const _streakUp = new THREE.Vector3(0, 1, 0)

const shockVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const shockFragment = /* glsl */ `
uniform float uOpacity;
uniform float uHot;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float rim = smoothstep(0.72, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
  float inner = smoothstep(0.15, 0.55, r) * (1.0 - smoothstep(0.55, 0.78, r));
  float core = (1.0 - smoothstep(0.0, 0.22, r)) * uHot;

  vec3 color = mix(vec3(0.45, 0.72, 1.0), vec3(0.95, 0.98, 1.0), rim);
  color = mix(color, vec3(1.0, 0.95, 0.85), core);
  float alpha = (rim * 1.15 + inner * 0.28 + core * 0.9) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

/**
 * Layered Mach cone + double shock + radial streaks on burst.
 */
export function SonicBoom({
  boomRef,
}: {
  boomRef: React.RefObject<SonicBoomState>
}) {
  const group = useRef<THREE.Group>(null)
  const shockA = useRef<THREE.Mesh>(null)
  const shockB = useRef<THREE.Mesh>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const cone = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.Mesh>(null)
  const streaks = useRef<THREE.InstancedMesh>(null)

  const shockMats = useMemo(() => {
    const make = () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0 },
          uHot: { value: 1 },
        },
        vertexShader: shockVertex,
        fragmentShader: shockFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    return [make(), make()] as const
  }, [])

  useFrame((_, delta) => {
    const boom = boomRef.current
    const root = group.current
    if (!boom || !root) return

    const meshes = [
      shockA.current,
      shockB.current,
      ringA.current,
      ringB.current,
      cone.current,
      flash.current,
    ]
    const streakMesh = streaks.current

    if (!boom.alive) {
      for (const mesh of meshes) if (mesh) mesh.visible = false
      if (streakMesh) streakMesh.visible = false
      return
    }

    boom.age += delta
    const t = boom.age / LIFE
    if (t >= 1) {
      boom.alive = false
      for (const mesh of meshes) if (mesh) mesh.visible = false
      if (streakMesh) streakMesh.visible = false
      return
    }

    _target.copy(boom.position).add(boom.forward)
    root.position.copy(boom.position)
    root.lookAt(_target)

    const ease = 1 - (1 - t) * (1 - t)
    const fade = (1 - t) * (1 - t)
    const hot = Math.max(0, 1 - t * 2.4)

    // Primary shock — fast expand.
    if (shockA.current) {
      const s = 0.25 + ease * 3.6
      shockA.current.visible = true
      shockA.current.scale.setScalar(s)
      shockMats[0].uniforms.uOpacity.value = fade * 0.95
      shockMats[0].uniforms.uHot.value = hot
    }

    // Secondary shock — delayed, thinner.
    if (shockB.current && ringB.current) {
      const t2 = THREE.MathUtils.clamp((t - 0.08) / 0.92, 0, 1)
      const ease2 = 1 - (1 - t2) * (1 - t2)
      const fade2 = (1 - t2) * (1 - t2)
      const s2 = 0.15 + ease2 * 4.4
      const on = t > 0.06
      shockB.current.visible = on
      ringB.current.visible = on
      shockB.current.scale.setScalar(s2)
      shockMats[1].uniforms.uOpacity.value = on ? fade2 * 0.55 : 0
      shockMats[1].uniforms.uHot.value = hot * 0.45
      ringB.current.scale.setScalar(s2 * 1.02)
      ;(ringB.current.material as THREE.MeshBasicMaterial).opacity = on
        ? fade2 * 0.75
        : 0
    }

    if (ringA.current) {
      const s = 0.25 + ease * 3.7
      ringA.current.visible = true
      ringA.current.scale.setScalar(s)
      ;(ringA.current.material as THREE.MeshBasicMaterial).opacity = fade * 0.85
    }

    // Mach cone trailing behind the shock.
    if (cone.current) {
      const coneLen = 0.4 + ease * 2.2
      const coneRad = 0.15 + ease * 1.35
      cone.current.visible = true
      cone.current.position.set(0, 0, -coneLen * 0.35)
      cone.current.scale.set(coneRad, coneLen, coneRad)
      ;(cone.current.material as THREE.MeshBasicMaterial).opacity =
        fade * 0.28 * (0.4 + hot)
    }

    if (flash.current) {
      flash.current.visible = hot > 0.02
      const fs = 0.2 + hot * 1.1
      flash.current.scale.setScalar(fs)
      ;(flash.current.material as THREE.MeshBasicMaterial).opacity = hot * 0.9
    }

    if (streakMesh) {
      streakMesh.visible = t < 0.65
      const streakFade = Math.max(0, 1 - t / 0.65)
      for (let i = 0; i < STREAK_COUNT; i++) {
        const angle = (i / STREAK_COUNT) * Math.PI * 2
        const reach = (0.4 + ease * 2.4) * (0.75 + (i % 3) * 0.12)
        _pos.set(
          Math.cos(angle) * reach * 0.55,
          Math.sin(angle) * reach * 0.55,
          -0.05 - ease * 0.2,
        )
        _outward.set(Math.cos(angle), Math.sin(angle), -0.2).normalize()
        _quat.setFromUnitVectors(_streakUp, _outward)
        const len = 0.15 + ease * 0.85 * streakFade
        _scale.set(0.012 * streakFade, len, 0.012 * streakFade)
        _matrix.compose(_pos, _quat, _scale)
        streakMesh.setMatrixAt(i, _matrix)
      }
      streakMesh.instanceMatrix.needsUpdate = true
      ;(streakMesh.material as THREE.MeshBasicMaterial).opacity =
        streakFade * 0.7
    }
  })

  return (
    <group ref={group}>
      <mesh ref={shockA} material={shockMats[0]} visible={false}>
        <circleGeometry args={[1, 64]} />
      </mesh>
      <mesh ref={shockB} material={shockMats[1]} visible={false}>
        <circleGeometry args={[1, 64]} />
      </mesh>
      <mesh ref={ringA} visible={false}>
        <torusGeometry args={[1, 0.028, 8, 64]} />
        <meshBasicMaterial
          color="#f2f7ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={ringB} visible={false}>
        <torusGeometry args={[1, 0.016, 8, 64]} />
        <meshBasicMaterial
          color="#9ec8ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={cone} visible={false} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1, 1, 28, 1, true]} />
        <meshBasicMaterial
          color="#b9d9ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <instancedMesh
        ref={streaks}
        args={[undefined, undefined, STREAK_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 4]} />
        <meshBasicMaterial
          color="#dceeff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </group>
  )
}

export function createSonicBoomState(): SonicBoomState {
  return {
    alive: false,
    age: 0,
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1),
  }
}

/** Procedural boom with a sharper crack + low thump. */
export function playSonicBoomSound() {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const now = ctx.currentTime

    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.4, now + 0.012)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
    master.connect(ctx.destination)

    const thump = ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(140, now)
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.28)
    const thumpGain = ctx.createGain()
    thumpGain.gain.setValueAtTime(0.55, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
    thump.connect(thumpGain)
    thumpGain.connect(master)
    thump.start(now)
    thump.stop(now + 0.3)

    const crack = ctx.createOscillator()
    crack.type = 'triangle'
    crack.frequency.setValueAtTime(920, now)
    crack.frequency.exponentialRampToValueAtTime(180, now + 0.09)
    const crackGain = ctx.createGain()
    crackGain.gain.setValueAtTime(0.3, now)
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
    crack.connect(crackGain)
    crackGain.connect(master)
    crack.start(now)
    crack.stop(now + 0.12)

    const noiseLen = 0.32
    const noiseBuf = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * noiseLen),
      ctx.sampleRate,
    )
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.4)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1200
    band.Q.value = 0.55
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.55, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen)
    noise.connect(band)
    band.connect(noiseGain)
    noiseGain.connect(master)
    noise.start(now)
    noise.stop(now + noiseLen)

    window.setTimeout(() => {
      void ctx.close()
    }, 700)
  } catch {
    // Autoplay restrictions — visual still plays.
  }
}
