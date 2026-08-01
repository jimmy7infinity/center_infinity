import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const LIFE = 0.85
const STREAK_COUNT = 24
const EMBER_COUNT = 28

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
const _emberColor = new THREE.Color()
const RED = new THREE.Color('#ff1a00')
const ORANGE = new THREE.Color('#ff6a00')
const AMBER = new THREE.Color('#ff8c1a')

type Ember = {
  dir: THREE.Vector3
  speed: number
  size: number
  spin: number
}

const shockVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** Heat shock disc — deep red ↔ hot orange bands, almost no white. */
const shockFragment = /* glsl */ `
uniform float uOpacity;
uniform float uHot;
uniform float uPhase;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float angle = atan(p.y, p.x);
  // Alternating red / orange petals around the ring.
  float petal = 0.5 + 0.5 * sin(angle * 8.0 + uPhase * 11.0);
  float ripple = 0.5 + 0.5 * sin(angle * 5.0 - uPhase * 7.0);
  float rimBand = 0.76 + ripple * 0.05;

  float rim = smoothstep(rimBand - 0.14, rimBand, r) * (1.0 - smoothstep(rimBand, 1.0, r));
  float mid = smoothstep(0.12, 0.5, r) * (1.0 - smoothstep(0.5, 0.8, r));
  float core = (1.0 - smoothstep(0.0, 0.32, r)) * uHot;

  vec3 blood = vec3(0.75, 0.02, 0.0);
  vec3 crimson = vec3(1.0, 0.08, 0.02);
  vec3 orange = vec3(1.0, 0.38, 0.02);
  vec3 flame = vec3(1.0, 0.55, 0.08);

  vec3 color = mix(blood, crimson, mid);
  color = mix(color, orange, rim * (0.55 + petal * 0.45));
  color = mix(color, flame, rim * petal * 0.65 + core * 0.5);
  // Hot core stays orange-red, not white.
  color = mix(color, vec3(1.0, 0.45, 0.05), core * 0.85);

  float alpha = (rim * 1.5 + mid * 0.55 + core * 0.75) * uOpacity;
  alpha *= 0.8 + petal * 0.35;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

const coneVertex = /* glsl */ `
varying float vAlong;
varying float vRadial;
void main() {
  vAlong = uv.y;
  vRadial = length(position.xz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const coneFragment = /* glsl */ `
uniform float uOpacity;
uniform float uHot;
varying float vAlong;
varying float vRadial;

void main() {
  float edge = smoothstep(0.45, 1.0, vRadial);
  float tip = smoothstep(0.0, 0.35, vAlong) * (1.0 - smoothstep(0.55, 1.0, vAlong));
  // Spine orange, outer lip deep red.
  vec3 color = mix(vec3(1.0, 0.48, 0.06), vec3(0.85, 0.04, 0.0), edge);
  color = mix(color, vec3(1.0, 0.32, 0.02), tip * uHot);
  float alpha = (0.22 + edge * 0.65 + tip * 0.4) * uOpacity * (1.0 - vAlong * 0.45);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

/**
 * Afterburner Mach break — orange/red heat shock, cone, streaks, embers.
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
  const haze = useRef<THREE.Mesh>(null)
  const cone = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.Mesh>(null)
  const lamp = useRef<THREE.PointLight>(null)
  const streaks = useRef<THREE.InstancedMesh>(null)
  const embers = useRef<THREE.InstancedMesh>(null)

  const emberPool = useMemo<Ember[]>(
    () =>
      Array.from({ length: EMBER_COUNT }, () => ({
        dir: new THREE.Vector3(),
        speed: 1,
        size: 0.04,
        spin: 0,
      })),
    [],
  )

  const shockMats = useMemo(() => {
    const make = () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0 },
          uHot: { value: 1 },
          uPhase: { value: 0 },
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

  const coneMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0 },
          uHot: { value: 1 },
        },
        vertexShader: coneVertex,
        fragmentShader: coneFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useFrame((_, delta) => {
    const boom = boomRef.current
    const root = group.current
    if (!boom || !root) return

    const meshes = [
      shockA.current,
      shockB.current,
      ringA.current,
      ringB.current,
      haze.current,
      cone.current,
      flash.current,
    ]
    const streakMesh = streaks.current
    const emberMesh = embers.current
    const light = lamp.current

    if (!boom.alive) {
      for (const mesh of meshes) if (mesh) mesh.visible = false
      if (streakMesh) streakMesh.visible = false
      if (emberMesh) emberMesh.visible = false
      if (light) light.intensity = 0
      return
    }

    // Seed ember directions once at birth.
    if (boom.age === 0) {
      for (const ember of emberPool) {
        ember.dir
          .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.35)
          .normalize()
        ember.speed = 2.2 + Math.random() * 4.5
        ember.size = 0.03 + Math.random() * 0.07
        ember.spin = Math.random() * Math.PI * 2
      }
    }

    boom.age += delta
    const t = boom.age / LIFE
    if (t >= 1) {
      boom.alive = false
      for (const mesh of meshes) if (mesh) mesh.visible = false
      if (streakMesh) streakMesh.visible = false
      if (emberMesh) emberMesh.visible = false
      if (light) light.intensity = 0
      return
    }

    _target.copy(boom.position).add(boom.forward)
    root.position.copy(boom.position)
    root.lookAt(_target)

    const ease = 1 - (1 - t) * (1 - t)
    const fade = (1 - t) * (1 - t)
    const hot = Math.max(0, 1 - t * 2.2)
    const phase = boom.age

    if (shockA.current) {
      const s = 0.3 + ease * 4.0
      shockA.current.visible = true
      shockA.current.scale.setScalar(s)
      shockMats[0].uniforms.uOpacity.value = fade * 1.05
      shockMats[0].uniforms.uHot.value = hot
      shockMats[0].uniforms.uPhase.value = phase
    }

    if (shockB.current && ringB.current) {
      const t2 = THREE.MathUtils.clamp((t - 0.07) / 0.93, 0, 1)
      const ease2 = 1 - (1 - t2) * (1 - t2)
      const fade2 = (1 - t2) * (1 - t2)
      const s2 = 0.2 + ease2 * 5.0
      const on = t > 0.05
      shockB.current.visible = on
      ringB.current.visible = on
      shockB.current.scale.setScalar(s2)
      shockMats[1].uniforms.uOpacity.value = on ? fade2 * 0.5 : 0
      shockMats[1].uniforms.uHot.value = hot * 0.35
      shockMats[1].uniforms.uPhase.value = phase * 1.3 + 1.2
      ringB.current.scale.setScalar(s2 * 1.02)
      ;(ringB.current.material as THREE.MeshBasicMaterial).opacity = on
        ? fade2 * 0.7
        : 0
    }

    if (ringA.current) {
      ringA.current.visible = true
      ringA.current.scale.setScalar(0.3 + ease * 4.1)
      ;(ringA.current.material as THREE.MeshBasicMaterial).opacity = fade * 0.9
    }

    if (haze.current) {
      haze.current.visible = true
      haze.current.scale.setScalar(0.5 + ease * 5.2)
      ;(haze.current.material as THREE.MeshBasicMaterial).opacity =
        fade * 0.32 * (0.55 + hot)
    }

    if (cone.current) {
      const coneLen = 0.5 + ease * 2.8
      const coneRad = 0.2 + ease * 1.55
      cone.current.visible = true
      cone.current.position.set(0, 0, -coneLen * 0.4)
      cone.current.scale.set(coneRad, coneLen, coneRad)
      coneMat.uniforms.uOpacity.value = fade * 0.55
      coneMat.uniforms.uHot.value = hot
    }

    if (flash.current) {
      flash.current.visible = hot > 0.02
      flash.current.scale.setScalar(0.25 + hot * 1.35)
      ;(flash.current.material as THREE.MeshBasicMaterial).opacity = hot * 0.85
    }

    if (light) {
      light.intensity = hot * 8 + fade * 1.5
      light.distance = 6 + ease * 4
    }

    if (streakMesh) {
      streakMesh.visible = t < 0.7
      const streakFade = Math.max(0, 1 - t / 0.7)
      for (let i = 0; i < STREAK_COUNT; i++) {
        const angle = (i / STREAK_COUNT) * Math.PI * 2 + phase * 0.4
        const reach = (0.5 + ease * 2.8) * (0.7 + (i % 4) * 0.1)
        _pos.set(
          Math.cos(angle) * reach * 0.6,
          Math.sin(angle) * reach * 0.6,
          -0.08 - ease * 0.35,
        )
        _outward.set(Math.cos(angle), Math.sin(angle), -0.35).normalize()
        _quat.setFromUnitVectors(_streakUp, _outward)
        const len = 0.2 + ease * 1.15 * streakFade
        const thick = (0.01 + (i % 3) * 0.004) * streakFade
        _scale.set(thick, len, thick)
        _matrix.compose(_pos, _quat, _scale)
        streakMesh.setMatrixAt(i, _matrix)
        // Alternate deep red / hot orange bolts.
        _emberColor.copy(i % 2 === 0 ? RED : ORANGE)
        streakMesh.setColorAt(i, _emberColor)
      }
      streakMesh.instanceMatrix.needsUpdate = true
      if (streakMesh.instanceColor) streakMesh.instanceColor.needsUpdate = true
      ;(streakMesh.material as THREE.MeshBasicMaterial).opacity =
        streakFade * 0.95
    }

    if (emberMesh) {
      emberMesh.visible = t < 0.85
      const emberFade = Math.max(0, 1 - t / 0.85)
      for (let i = 0; i < EMBER_COUNT; i++) {
        const ember = emberPool[i]
        // Local space: group already faces the burst forward.
        _pos
          .copy(ember.dir)
          .multiplyScalar(ember.speed * ease * 0.4)
        _pos.z -= 0.35 + ease * 1.4 * (0.35 + (i % 5) * 0.12)
        _quat.setFromAxisAngle(_streakUp, ember.spin + phase * 4)
        const s = ember.size * emberFade * (0.6 + hot * 0.8)
        _scale.setScalar(s)
        _matrix.compose(_pos, _quat, _scale)
        emberMesh.setMatrixAt(i, _matrix)
        _emberColor.copy(i % 3 === 0 ? RED : i % 3 === 1 ? ORANGE : AMBER)
        emberMesh.setColorAt(i, _emberColor)
      }
      emberMesh.instanceMatrix.needsUpdate = true
      if (emberMesh.instanceColor) emberMesh.instanceColor.needsUpdate = true
      ;(emberMesh.material as THREE.MeshBasicMaterial).opacity =
        emberFade * 0.95
    }
  })

  return (
    <group ref={group}>
      <mesh ref={shockA} material={shockMats[0]} visible={false}>
        <circleGeometry args={[1, 72]} />
      </mesh>
      <mesh ref={shockB} material={shockMats[1]} visible={false}>
        <circleGeometry args={[1, 72]} />
      </mesh>
      <mesh ref={ringA} visible={false}>
        <torusGeometry args={[1, 0.036, 8, 72]} />
        <meshBasicMaterial
          color="#ff5500"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={ringB} visible={false}>
        <torusGeometry args={[1, 0.02, 8, 72]} />
        <meshBasicMaterial
          color="#ff0a00"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={haze} visible={false}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial
          color="#ff2200"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={cone} material={coneMat} visible={false} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1, 1, 32, 1, true]} />
      </mesh>
      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color="#ff4a10"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight
        ref={lamp}
        color="#ff3a08"
        intensity={0}
        distance={8}
        decay={2}
      />
      <instancedMesh
        ref={streaks}
        args={[undefined, undefined, STREAK_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 0.35, 1, 5]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
      <instancedMesh
        ref={embers}
        args={[undefined, undefined, EMBER_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial
          color="#ffffff"
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
