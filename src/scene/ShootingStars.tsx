import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { recordShootingStarTriggered } from '../lib/achievements'
import { pointerState } from '../lib/pointer'
import { getHeroCopy, scrollState } from '../lib/scroll'

/** Max concurrent streaks — enough to spam-click, capped for fill cost. */
const POOL_SIZE = 10
/** Segments along the trail — enough for a soft taper, cheap enough to pool. */
const TRAIL_SEGMENTS = 12

/** Backdrop meteors (legacy) — behind shells. */
const SKY_DISTANCE = 38
/** Foreground meteors — between camera and DOM / shells so they cross copy. */
const CROSS_DISTANCE = 4.2

/** Rare cadence after the intro comet (seconds). */
const CROSS_SPAWN_MIN = 22
const CROSS_SPAWN_SPAN = 16
const SKY_SPAWN_MIN = 28
const SKY_SPAWN_SPAN = 20

const ORANGE_CORE = new THREE.Color('#fff2d6')
const ORANGE_GLOW = new THREE.Color('#ff8a3a')
const GREEN_CORE = new THREE.Color('#e8fff4')
const GREEN_GLOW = new THREE.Color('#3fd98a')
const BLUE_CORE = new THREE.Color('#eef6ff')
const BLUE_GLOW = new THREE.Color('#4aa8ff')

const COMET_PALETTES = [
  { core: ORANGE_CORE, glow: ORANGE_GLOW },
  { core: GREEN_CORE, glow: GREEN_GLOW },
  { core: BLUE_CORE, glow: BLUE_GLOW },
] as const

type CometUniforms = {
  uHead: THREE.IUniform<THREE.Vector3>
  uTail: THREE.IUniform<THREE.Vector3>
  uHeadWidth: THREE.IUniform<number>
  uTailWidth: THREE.IUniform<number>
  uCoreColor: THREE.IUniform<THREE.Color>
  uGlowColor: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
}

type Meteor = {
  active: boolean
  progress: number
  duration: number
  start: THREE.Vector3
  end: THREE.Vector3
  headWidth: number
  mesh: THREE.Mesh
  uniforms: CometUniforms
}

const cometVertexShader = /* glsl */ `
attribute float aSide;
attribute float aAlong;

uniform vec3 uHead;
uniform vec3 uTail;
uniform float uHeadWidth;
uniform float uTailWidth;

varying float vAlong;
varying float vAcross;

void main() {
  vAlong = aAlong;
  vAcross = aSide;

  vec3 axis = uHead - uTail;
  float len = length(axis);
  vec3 forward = len > 1e-5 ? axis / len : vec3(0.0, 1.0, 0.0);
  vec3 mid = mix(uTail, uHead, 1.0 - aAlong);
  vec3 toCam = normalize(cameraPosition - mid);
  vec3 right = cross(forward, toCam);
  float rLen = length(right);
  right = rLen > 1e-5 ? right / rLen : normalize(cross(forward, vec3(0.0, 1.0, 0.0)));

  // Bright bulb at the head, hairline fade to the trail tip.
  float taper = pow(1.0 - aAlong, 1.65);
  float width = mix(uTailWidth, uHeadWidth, taper);
  vec3 pos = mix(uHead, uTail, aAlong) + right * aSide * width;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const cometFragmentShader = /* glsl */ `
uniform vec3 uCoreColor;
uniform vec3 uGlowColor;
uniform float uOpacity;

varying float vAlong;
varying float vAcross;

void main() {
  float across = 1.0 - abs(vAcross);
  // Soft lateral falloff — glow edge, hot core down the spine.
  float spine = pow(across, 1.8);
  float glow = pow(across, 0.55);
  float tipFade = 1.0 - smoothstep(0.2, 1.0, vAlong);
  float headBoost = 1.0 - smoothstep(0.0, 0.22, vAlong);

  vec3 color = mix(uGlowColor, uCoreColor, spine * (0.45 + headBoost * 0.55));
  color += uCoreColor * headBoost * 0.55;
  float alpha = tipFade * mix(glow * 0.55, spine, 0.35) * uOpacity;
  alpha *= mix(1.4, 0.25, vAlong);

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

function createTrailGeometry(): THREE.BufferGeometry {
  const seg = TRAIL_SEGMENTS
  const verts = (seg + 1) * 2
  const positions = new Float32Array(verts * 3)
  const sides = new Float32Array(verts)
  const alongs = new Float32Array(verts)
  const indices: number[] = []

  for (let i = 0; i <= seg; i++) {
    const along = i / seg
    const a = i * 2
    const b = a + 1
    sides[a] = -1
    sides[b] = 1
    alongs[a] = along
    alongs[b] = along
    if (i < seg) {
      const c = (i + 1) * 2
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  geometry.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1))
  geometry.setIndex(indices)
  return geometry
}

function createMeteor(): Meteor {
  const uniforms: CometUniforms = {
    uHead: { value: new THREE.Vector3() },
    uTail: { value: new THREE.Vector3() },
    uHeadWidth: { value: 0.04 },
    uTailWidth: { value: 0.001 },
    uCoreColor: { value: ORANGE_CORE.clone() },
    uGlowColor: { value: ORANGE_GLOW.clone() },
    uOpacity: { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader: cometVertexShader,
    fragmentShader: cometFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(createTrailGeometry(), material)
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.renderOrder = 6

  return {
    active: false,
    progress: 0,
    duration: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    headWidth: 0.04,
    mesh,
    uniforms,
  }
}

const spawnAnchor = new THREE.Vector3()
const travelDirection = new THREE.Vector3()

function activateMeteor(
  meteor: Meteor,
  camera: THREE.PerspectiveCamera,
  crossText: boolean,
  /** Optional NDC (-1..1) — comet path passes through this screen point. */
  aimNdc?: { x: number; y: number },
) {
  const distance = crossText
    ? CROSS_DISTANCE + Math.random() * 2.4
    : SKY_DISTANCE + Math.random() * 18
  const frameHeight = 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
  const frameWidth = frameHeight * camera.aspect

  const fx = aimNdc
    ? THREE.MathUtils.clamp((aimNdc.x + 1) * 0.5, 0.04, 0.96)
    : crossText
      ? 0.08 + Math.random() * 0.84
      : Math.random() < 0.5
        ? 0.04 + Math.random() * 0.22
        : 0.74 + Math.random() * 0.22
  const fy = aimNdc
    ? THREE.MathUtils.clamp((1 - aimNdc.y) * 0.5, 0.04, 0.96)
    : crossText
      ? 0.12 + Math.random() * 0.76
      : 0.04 + Math.random() * 0.28

  const pitch = (Math.random() - 0.5) * 0.55 - 0.15
  travelDirection
    .set(
      Math.cos(pitch) * (fx < 0.5 ? 1 : -1),
      Math.sin(pitch),
      (Math.random() - 0.5) * 0.25,
    )
    .transformDirection(camera.matrixWorld)

  spawnAnchor.set((fx - 0.5) * frameWidth, (0.5 - fy) * frameHeight, -distance)
  camera.localToWorld(spawnAnchor)

  const span = frameWidth * (0.26 + Math.random() * 0.18)
  meteor.start.copy(spawnAnchor).addScaledVector(travelDirection, -span * 0.3)
  meteor.end.copy(spawnAnchor).addScaledVector(travelDirection, span * 0.7)
  meteor.progress = 0
  meteor.duration = 0.8 + Math.random() * 0.65
  meteor.headWidth = (crossText ? 0.016 : 0.034) * (0.85 + Math.random() * 0.3)
  meteor.active = true

  const palette =
    COMET_PALETTES[Math.floor(Math.random() * COMET_PALETTES.length)]!
  meteor.uniforms.uCoreColor.value.copy(palette.core)
  meteor.uniforms.uGlowColor.value.copy(palette.glow)
  meteor.uniforms.uHeadWidth.value = meteor.headWidth
  meteor.uniforms.uTailWidth.value = meteor.headWidth * 0.02
}

/** Sparse comet streaks; `crossText` places them above DOM copy. */
export function ShootingStars({ crossText = false }: { crossText?: boolean }) {
  const meteorsRef = useRef<Meteor[]>([])
  // Cross-text waits for the intro comet; don't let a timer fire beforehand.
  const spawnTimerRef = useRef(crossText ? Number.POSITIVE_INFINITY : 14 + Math.random() * 10)
  const introSpawnedRef = useRef(false)
  const head = useMemo(() => new THREE.Vector3(), [])
  const tail = useMemo(() => new THREE.Vector3(), [])

  const meteors = useMemo(
    () => Array.from({ length: POOL_SIZE }, () => createMeteor()),
    [],
  )
  meteorsRef.current = meteors

  useEffect(() => {
    return () => {
      for (const meteor of meteors) {
        meteor.mesh.geometry.dispose()
        ;(meteor.mesh.material as THREE.ShaderMaterial).dispose()
      }
    }
  }, [meteors])

  useFrame((state, delta) => {
    const camera = state.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) return

    const warpFade = 1 - THREE.MathUtils.smoothstep(scrollState.jump, 0.04, 0.3)
    const baseOpacity = (crossText ? 1 : 0.9) * warpFade

    /** Spawn into a free slot; optional recycle so click-spam always fires. */
    const trySpawn = (
      aimNdc?: { x: number; y: number },
      recycleIfFull = false,
    ) => {
      let slot = meteorsRef.current.find((meteor) => !meteor.active)
      if (!slot) {
        if (!recycleIfFull) return false
        // Steal the oldest in-flight streak so every click still feels answered.
        slot = meteorsRef.current.reduce((oldest, meteor) =>
          meteor.progress >= oldest.progress ? meteor : oldest,
        )
      }
      activateMeteor(slot, camera, crossText, aimNdc)
      return true
    }

    const nextGap = () =>
      crossText
        ? CROSS_SPAWN_MIN + Math.random() * CROSS_SPAWN_SPAN
        : SKY_SPAWN_MIN + Math.random() * SKY_SPAWN_SPAN

    // Click empty space → comet. Clicks on a planet are left for storm lightning
    // (Shells consumes spaceClick when the pointer is over a shell).
    if (
      crossText &&
      pointerState.spaceClick &&
      !pointerState.overShell &&
      warpFade > 0.05
    ) {
      pointerState.spaceClick = false
      if (trySpawn({ x: pointerState.x, y: pointerState.y }, true)) {
        spawnTimerRef.current = nextGap()
        recordShootingStarTriggered()
      }
    }

    // Exactly one comet when the hero mark / “we build” line has mostly arrived.
    // Periodic spawns stay frozen until this fires so load never doubles up.
    if (
      crossText &&
      !introSpawnedRef.current &&
      getHeroCopy() > 0.88 &&
      warpFade > 0.05
    ) {
      introSpawnedRef.current = true
      trySpawn()
      spawnTimerRef.current = nextGap()
    }

    if (Number.isFinite(spawnTimerRef.current)) {
      spawnTimerRef.current -= delta
      if (spawnTimerRef.current <= 0 && warpFade > 0.05) {
        // Ambient cadence skips when the pool is saturated (don't steal click slots).
        if (!trySpawn()) {
          spawnTimerRef.current = 2 + Math.random() * 2
        } else {
          spawnTimerRef.current = nextGap()
        }
      }
    }

    for (const meteor of meteorsRef.current) {
      const mesh = meteor.mesh
      if (!meteor.active || warpFade <= 0.01) {
        mesh.visible = false
        meteor.uniforms.uOpacity.value = 0
        continue
      }

      meteor.progress += delta / meteor.duration
      if (meteor.progress >= 1) {
        meteor.active = false
        mesh.visible = false
        meteor.uniforms.uOpacity.value = 0
        continue
      }

      const t = meteor.progress
      // Ease in/out so the streak breathes rather than hard-cutting.
      const appear = THREE.MathUtils.smoothstep(t, 0, 0.12)
      const vanish = 1 - THREE.MathUtils.smoothstep(t, 0.72, 1)
      head.lerpVectors(meteor.start, meteor.end, t)
      const trailLen = 0.24 + (1 - t) * 0.06
      tail.lerpVectors(meteor.start, meteor.end, Math.max(0, t - trailLen))

      meteor.uniforms.uHead.value.copy(head)
      meteor.uniforms.uTail.value.copy(tail)
      meteor.uniforms.uOpacity.value = baseOpacity * appear * vanish
      mesh.visible = true
    }
  })

  return (
    <group>
      {meteors.map((meteor, index) => (
        <primitive key={index} object={meteor.mesh} />
      ))}
    </group>
  )
}
