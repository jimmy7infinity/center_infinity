import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { recordShootingStarTriggered } from '../lib/achievements'
import { meteorAim, type MeteorShot } from '../lib/meteorAim'
import { pointerState } from '../lib/pointer'
import { hasEntered } from '../lib/pages'
import {
  hitDriftingRockWithSegment,
  pickDriftingRockAlongRay,
} from './driftingRockBridge'

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

/** The only light source on the panel, so it carries no hue. */
const COMET_CORE = new THREE.Color('#ffffff')
const COMET_GLOW = new THREE.Color('#d8d8d8')
/** Player shots stay warm through the ink pass: red body, orange debris. */
const PLAYER_CORE = new THREE.Color('#ff2a18')
const PLAYER_GLOW = new THREE.Color('#ff7a28')

const SPARK_MAX = 80

/** Seconds after the cover page first shows before the opening comet. */
const INTRO_COMET_DELAY = 1.1

type CometUniforms = {
  uHead: THREE.IUniform<THREE.Vector3>
  uTail: THREE.IUniform<THREE.Vector3>
  uHeadWidth: THREE.IUniform<number>
  uTailWidth: THREE.IUniform<number>
  uCoreColor: THREE.IUniform<THREE.Color>
  uGlowColor: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
  uHeat: THREE.IUniform<number>
}

type Meteor = {
  active: boolean
  /** Click-spawned streaks can shatter drifting rocks they clip. */
  fromClick: boolean
  /** Aimed by the player. Red, longer, and it sheds sparks. */
  player: boolean
  progress: number
  duration: number
  start: THREE.Vector3
  end: THREE.Vector3
  headWidth: number
  /** Prior-frame head — segment vs rock uses this → current head. */
  prevHead: THREE.Vector3
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
uniform float uHeat;

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
  color += uCoreColor * headBoost * 0.55 * uHeat;
  float alpha = tipFade * mix(glow * (0.55 + max(uHeat - 1.0, 0.0) * 0.5), spine, 0.35) * uOpacity;
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
    uCoreColor: { value: COMET_CORE.clone() },
    uGlowColor: { value: COMET_GLOW.clone() },
    uOpacity: { value: 0 },
    uHeat: { value: 1 },
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
    fromClick: false,
    player: false,
    progress: 0,
    duration: 1,
    start: new THREE.Vector3(),
    end: new THREE.Vector3(),
    headWidth: 0.04,
    prevHead: new THREE.Vector3(),
    mesh,
    uniforms,
  }
}

const spawnAnchor = new THREE.Vector3()
const travelDirection = new THREE.Vector3()

const _aimUnproject = new THREE.Vector3()
const _aimDir = new THREE.Vector3()
const _pickedRock = new THREE.Vector3()

function activateMeteor(
  meteor: Meteor,
  camera: THREE.PerspectiveCamera,
  crossText: boolean,
  /** Optional NDC (-1..1) — comet path passes through this screen point. */
  aimNdc?: { x: number; y: number },
  fromClick = false,
) {
  let distance = crossText
    ? CROSS_DISTANCE + Math.random() * 2.4
    : SKY_DISTANCE + Math.random() * 18

  // Click streaks aimed at debris fly through that rock. Matching only the
  // camera depth leaves the segment beside a big, off-center body.
  let throughRock = false
  if (fromClick && aimNdc && crossText) {
    camera.updateMatrixWorld()
    _aimUnproject.set(aimNdc.x, aimNdc.y, 0.5).unproject(camera)
    _aimDir.copy(_aimUnproject).sub(camera.position).normalize()
    const pick = pickDriftingRockAlongRay(camera.position, _aimDir)
    if (pick) {
      _pickedRock.copy(pick.point)
      throughRock = true
      distance = THREE.MathUtils.clamp(pick.distance, 2.6, 7.2)
    }
  }

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

  const span = throughRock
    ? Math.max(frameWidth * 0.72, 1.2)
    : frameWidth * (0.26 + Math.random() * 0.18)
  if (throughRock) {
    meteor.start.copy(_pickedRock).addScaledVector(_aimDir, -span * 0.42)
    meteor.end.copy(_pickedRock).addScaledVector(_aimDir, span * 0.58)
  } else {
    meteor.start.copy(spawnAnchor).addScaledVector(travelDirection, -span * 0.3)
    meteor.end.copy(spawnAnchor).addScaledVector(travelDirection, span * 0.7)
  }
  meteor.progress = 0
  meteor.duration = 0.8 + Math.random() * 0.65
  meteor.headWidth = (crossText ? 0.016 : 0.034) * (0.85 + Math.random() * 0.3)
  meteor.fromClick = fromClick
  meteor.player = false
  meteor.active = true
  meteor.prevHead.copy(meteor.start)

  meteor.uniforms.uCoreColor.value.copy(COMET_CORE)
  meteor.uniforms.uGlowColor.value.copy(COMET_GLOW)
  meteor.uniforms.uHeat.value = 1
  meteor.uniforms.uHeadWidth.value = meteor.headWidth
  meteor.uniforms.uTailWidth.value = meteor.headWidth * 0.02
}

const _shotRight = new THREE.Vector3()
const _shotUp = new THREE.Vector3()
const _shotDir = new THREE.Vector3()
const _rockPoint = new THREE.Vector3()

/** A rock sitting on the aim line, if the shot is pointed at one. */
function rockAlongAim(
  camera: THREE.PerspectiveCamera,
  shot: MeteorShot,
): THREE.Vector3 | null {
  const len = Math.hypot(shot.dx, shot.dy)
  if (len < 1e-5) return null
  const ux = shot.dx / len
  const uy = shot.dy / len
  for (let i = 0; i <= 16; i++) {
    const along = (i / 16) * 1.8
    const x = THREE.MathUtils.clamp(shot.x + ux * along, -1, 1)
    const y = THREE.MathUtils.clamp(shot.y + uy * along, -1, 1)
    _aimUnproject.set(x, y, 0.5).unproject(camera)
    _aimDir.copy(_aimUnproject).sub(camera.position).normalize()
    const pick = pickDriftingRockAlongRay(camera.position, _aimDir)
    if (!pick) continue
    _rockPoint.copy(pick.point)
    return _rockPoint
  }
  return null
}

/** A dragged shot. It leaves the press point and crosses the whole frame. */
function activatePlayerMeteor(
  meteor: Meteor,
  camera: THREE.PerspectiveCamera,
  shot: MeteorShot,
) {
  camera.updateMatrixWorld()
  const distance = CROSS_DISTANCE + 0.6
  const frameHeight = 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
  const frameWidth = frameHeight * camera.aspect
  const fx = THREE.MathUtils.clamp((shot.x + 1) * 0.5, 0.02, 0.98)
  const fy = THREE.MathUtils.clamp((1 - shot.y) * 0.5, 0.02, 0.98)

  spawnAnchor.set((fx - 0.5) * frameWidth, (0.5 - fy) * frameHeight, -distance)
  camera.localToWorld(spawnAnchor)

  _shotRight.setFromMatrixColumn(camera.matrixWorld, 0)
  _shotUp.setFromMatrixColumn(camera.matrixWorld, 1)
  _shotDir.copy(_shotRight).multiplyScalar(shot.dx).addScaledVector(_shotUp, shot.dy)
  if (_shotDir.lengthSq() < 1e-8) _shotDir.copy(_shotRight)
  _shotDir.normalize()

  const span = Math.hypot(frameWidth, frameHeight) * 1.25
  const speed = Math.hypot(frameWidth, frameHeight) * (0.7 + shot.power * 0.65)
  const rock = rockAlongAim(camera, shot)
  if (rock) {
    _shotDir.copy(rock).sub(spawnAnchor)
    if (_shotDir.lengthSq() < 1e-6) _shotDir.copy(_shotRight)
    _shotDir.normalize()
    meteor.start.copy(rock).addScaledVector(_shotDir, -span * 0.28)
    meteor.end.copy(rock).addScaledVector(_shotDir, span * 0.72)
  } else {
    meteor.start.copy(spawnAnchor)
    meteor.end.copy(spawnAnchor).addScaledVector(_shotDir, span)
  }
  meteor.progress = 0
  meteor.duration = span / speed
  meteor.headWidth = 0.03 * (0.9 + shot.power * 0.35)
  meteor.fromClick = true
  meteor.player = true
  meteor.active = true
  meteor.prevHead.copy(meteor.start)

  meteor.uniforms.uCoreColor.value.copy(PLAYER_CORE)
  meteor.uniforms.uGlowColor.value.copy(PLAYER_GLOW)
  meteor.uniforms.uHeat.value = 1.75
  meteor.uniforms.uHeadWidth.value = meteor.headWidth
  meteor.uniforms.uTailWidth.value = meteor.headWidth * 0.08
}

const SPARK_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * 70.0 / max(0.25, -mv.z), 2.0, 14.0);
}
`

const SPARK_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float glow = pow(1.0 - smoothstep(0.0, 1.0, r), 1.5);
  gl_FragColor = vec4(vColor * glow, glow);
}
`

type Spark = {
  life: number
  max: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

function createSparks() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_MAX * 3), 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(SPARK_MAX * 3), 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(SPARK_MAX), 1))
  geometry.setDrawRange(0, 0)
  const material = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 7
  points.visible = false
  const lives: Spark[] = []
  for (let i = 0; i < SPARK_MAX; i++) {
    lives.push({ life: 0, max: 0.2, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })
  }
  return { geometry, points, lives, cursor: 0 }
}

/** Sparse comet streaks; `crossText` places them above DOM copy. */
export function ShootingStars({ crossText = false }: { crossText?: boolean }) {
  const meteorsRef = useRef<Meteor[]>([])
  // Cross-text waits for the intro comet; don't let a timer fire beforehand.
  const spawnTimerRef = useRef(crossText ? Number.POSITIVE_INFINITY : 14 + Math.random() * 10)
  const introSpawnedRef = useRef(false)
  const sinceEnteredRef = useRef(0)
  const head = useMemo(() => new THREE.Vector3(), [])
  const tail = useMemo(() => new THREE.Vector3(), [])
  const flight = useMemo(() => new THREE.Vector3(), [])
  const sparks = useMemo(() => createSparks(), [])

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
      sparks.geometry.dispose()
      ;(sparks.points.material as THREE.Material).dispose()
    }
  }, [meteors, sparks])

  useFrame((state, delta) => {
    const camera = state.camera
    if (!(camera instanceof THREE.PerspectiveCamera)) return

    const baseOpacity = crossText ? 1 : 0.9

    /** Spawn into a free slot; optional recycle so click-spam always fires. */
    const trySpawn = (
      aimNdc?: { x: number; y: number },
      recycleIfFull = false,
      fromClick = false,
    ) => {
      let slot = meteorsRef.current.find((meteor) => !meteor.active)
      if (!slot) {
        if (!recycleIfFull) return false
        // Steal the oldest in-flight streak so every click still feels answered.
        slot = meteorsRef.current.reduce((oldest, meteor) =>
          meteor.progress >= oldest.progress ? meteor : oldest,
        )
      }
      activateMeteor(slot, camera, crossText, aimNdc, fromClick)
      return true
    }

    const nextGap = () =>
      crossText
        ? CROSS_SPAWN_MIN + Math.random() * CROSS_SPAWN_SPAN
        : SKY_SPAWN_MIN + Math.random() * SKY_SPAWN_SPAN

    // Click empty space → comet. Aim through the click; a hit on debris
    // shatters the rock (handled while the streak advances below).
    if (crossText && pointerState.spaceClick && !pointerState.overShell) {
      pointerState.spaceClick = false
      if (trySpawn({ x: pointerState.x, y: pointerState.y }, true, true)) {
        spawnTimerRef.current = nextGap()
        recordShootingStarTriggered()
      }
    }

    if (crossText && meteorAim.shot) {
      const shot = meteorAim.shot
      meteorAim.shot = null
      let slot = meteorsRef.current.find((meteor) => !meteor.active)
      if (!slot) {
        slot = meteorsRef.current.reduce((oldest, meteor) =>
          meteor.progress >= oldest.progress ? meteor : oldest,
        )
      }
      activatePlayerMeteor(slot, camera, shot)
      recordShootingStarTriggered()
    }

    const emitSpark = (origin: THREE.Vector3, forward: THREE.Vector3) => {
      const spark = sparks.lives[sparks.cursor % SPARK_MAX]
      sparks.cursor += 1
      const life = 0.1 + Math.random() * 0.16
      spark.life = life
      spark.max = life
      spark.x = origin.x
      spark.y = origin.y
      spark.z = origin.z
      const spin = Math.random() * Math.PI * 2
      const spray = 0.35 + Math.random() * 0.7
      spark.vx = -forward.x * (0.8 + Math.random() * 1.4) + Math.cos(spin) * spray
      spark.vy = -forward.y * (0.8 + Math.random() * 1.4) + Math.sin(spin) * spray
      spark.vz = -forward.z * (0.8 + Math.random() * 1.4) + (Math.random() - 0.5) * spray
    }

    // Exactly one comet shortly after the cover page first shows. Periodic
    // spawns stay frozen until this fires so load never doubles up.
    if (hasEntered()) sinceEnteredRef.current += delta
    if (
      crossText &&
      !introSpawnedRef.current &&
      sinceEnteredRef.current > INTRO_COMET_DELAY
    ) {
      introSpawnedRef.current = true
      trySpawn()
      spawnTimerRef.current = nextGap()
    }

    if (Number.isFinite(spawnTimerRef.current)) {
      spawnTimerRef.current -= delta
      if (spawnTimerRef.current <= 0) {
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
      if (!meteor.active) {
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
      // Player shots stay bright until they have crossed the frame.
      const appear = THREE.MathUtils.smoothstep(t, 0, 0.08)
      const vanish = meteor.player
        ? 1 - THREE.MathUtils.smoothstep(t, 0.9, 1)
        : 1 - THREE.MathUtils.smoothstep(t, 0.72, 1)
      head.lerpVectors(meteor.start, meteor.end, t)
      const trailLen = meteor.player ? 0.18 : 0.24 + (1 - t) * 0.06
      tail.lerpVectors(meteor.start, meteor.end, Math.max(0, t - trailLen))
      if (meteor.player && crossText) {
        flight.copy(meteor.end).sub(meteor.start)
        if (flight.lengthSq() > 1e-8) flight.normalize()
        emitSpark(head, flight)
        if (Math.random() < 0.65) emitSpark(head, flight)
      }

      if (
        meteor.fromClick &&
        crossText &&
        hitDriftingRockWithSegment(meteor.prevHead, head)
      ) {
        // Impact — snuff the streak so the breakup owns the moment.
        meteor.active = false
        meteor.fromClick = false
        mesh.visible = false
        meteor.uniforms.uOpacity.value = 0
        continue
      }
      meteor.prevHead.copy(head)

      meteor.uniforms.uHead.value.copy(head)
      meteor.uniforms.uTail.value.copy(tail)
      meteor.uniforms.uOpacity.value = baseOpacity * appear * vanish
      mesh.visible = true
    }

    let sparkCount = 0
    const pos = sparks.geometry.getAttribute('position') as THREE.BufferAttribute
    const col = sparks.geometry.getAttribute('aColor') as THREE.BufferAttribute
    const size = sparks.geometry.getAttribute('aSize') as THREE.BufferAttribute
    const posArray = pos.array as Float32Array
    const colArray = col.array as Float32Array
    const sizeArray = size.array as Float32Array
    for (const spark of sparks.lives) {
      if (spark.life <= 0) continue
      spark.life -= delta
      if (spark.life <= 0) continue
      spark.x += spark.vx * delta
      spark.y += spark.vy * delta
      spark.z += spark.vz * delta
      const i3 = sparkCount * 3
      posArray[i3] = spark.x
      posArray[i3 + 1] = spark.y
      posArray[i3 + 2] = spark.z
      const fade = spark.life / spark.max
      colArray[i3] = fade * 1.15
      colArray[i3 + 1] = fade * (0.28 + 0.35 * fade)
      colArray[i3 + 2] = fade * 0.04
      sizeArray[sparkCount] = 4 + fade * 7
      sparkCount += 1
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    size.needsUpdate = true
    sparks.geometry.setDrawRange(0, sparkCount)
    sparks.points.visible = sparkCount > 0
  })

  return (
    <group>
      {meteors.map((meteor, index) => (
        <primitive key={index} object={meteor.mesh} />
      ))}
      <primitive object={sparks.points} />
    </group>
  )
}
