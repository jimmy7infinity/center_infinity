import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Two different bolts, on purpose.
 *
 * The storm is on the planet. Arcs leave the click and run around the surface.
 * Charge adds more of them and sends them farther. While a bolt is up it
 * flashes: a dim channel, then a short bright burst with a halo, then dim again.
 *
 * After the clicking stops the bolt settles and leaves a burn on that path:
 * a dark line in the same channel, as if the surface were scorched, fading
 * slowly. The bolt itself is ink — bright and dim stretches of the same grey.
 *
 * The plasma arc is the other case: the pointer has left this planet while the
 * storm is still up. One filament runs from that planet's strike to the cursor
 * and ends there. The path is a jagged polyline — sharp turns, short segments —
 * and it holds, then retargets, the way a plasma ball does. Hot stretches are
 * the filament itself, wider and brighter, the way a real channel lights up
 * unevenly instead of wearing beads.
 */

const LEVELS = 6
const PLASMA_LEVELS = 5
const MAX_POINTS = 65
const LEADER_MAX = 8
const SURFACE = LEADER_MAX * 2

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WORLD_X = new THREE.Vector3(1, 0, 0)

const span = new THREE.Vector3()
const side = new THREE.Vector3()
const viewDir = new THREE.Vector3()
const held = new THREE.Vector3()
const frameN = new THREE.Vector3()
const frameT = new THREE.Vector3()
const frameB = new THREE.Vector3()
const seg = new THREE.Vector3()
const mid = new THREE.Vector3()
const chord = new THREE.Vector3()
const perp = new THREE.Vector3()
const bin = new THREE.Vector3()
const nudge = new THREE.Vector3()
const left = new THREE.Vector3()
const right = new THREE.Vector3()

const TH_A = new Float32Array(MAX_POINTS)
const BR_A = new Float32Array(MAX_POINTS)
const TH_B = new Float32Array(MAX_POINTS)
const BR_B = new Float32Array(MAX_POINTS)

const bufA: THREE.Vector3[] = []
const bufB: THREE.Vector3[] = []
const scratchA: THREE.Vector3[] = []
const scratchB: THREE.Vector3[] = []
for (let i = 0; i < MAX_POINTS; i++) {
  bufA.push(new THREE.Vector3())
  bufB.push(new THREE.Vector3())
  scratchA.push(new THREE.Vector3())
  scratchB.push(new THREE.Vector3())
}

let radialScale = 1

export type Storm = {
  opacity: number
  draw: number
  power: number
  seed: number
  crackle: number
  /** Clock for the lock-then-reshape cycle. Keeps running while the bolt cools. */
  wave: number
  /** 1 while the storm is hot, eases down through the fade. */
  shake: number
  cooling: boolean
  /** Flash clock. Slows as the bolt settles so the bursts thin out. */
  flashTime: number
  /** 1 on a click, falls off within a fraction of a second. */
  strikeFlash: number
  /** 0–1 orange burn left on the planet after the white light settles. */
  scorch: number
  scorchWave: number
  scorchShake: number
  /** 0–1 char left after the glow. A thin dark line that fades slowly. */
  char: number
  /** 1 when the pointer has left this planet. */
  arc: number
  radius: number
  /** Strike point, in the shell group's local space. */
  origin: THREE.Vector3
  /** Cursor, in the same space. */
  aim: THREE.Vector3
}

export function createStorm(): Storm {
  return {
    opacity: 0,
    draw: 0,
    power: 0,
    seed: 0,
    crackle: 0,
    wave: 0,
    shake: 1,
    cooling: false,
    flashTime: 0,
    strikeFlash: 0,
    scorch: 0,
    scorchWave: 0,
    scorchShake: 1,
    char: 0,
    arc: 0,
    radius: 0,
    origin: new THREE.Vector3(),
    aim: new THREE.Vector3(),
  }
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Plasma-ball rhythm: the path holds, then moves to a new path, then holds.
 * Each beat is a different length. `blend` is 0 while it is locked and rises
 * through the reshape.
 */
function reshape(time: number, salt: number): { shapeA: number; shapeB: number; blend: number } {
  let t = 0
  let cycle = 0
  const clock = Math.max(0, time)
  while (cycle < 96) {
    const hold = 0.11 + hash(salt + cycle * 3.1) * 0.2
    const morph = 0.07 + hash(salt + cycle * 5.7) * 0.1
    if (t + hold + morph > clock) {
      const local = clock - t
      if (local <= hold) return { shapeA: cycle, shapeB: cycle, blend: 0 }
      const u = (local - hold) / morph
      const blend = u * u * (3 - 2 * u)
      return { shapeA: cycle, shapeB: cycle + 1, blend }
    }
    t += hold + morph
    cycle += 1
  }
  return { shapeA: cycle, shapeB: cycle, blend: 0 }
}

/** One sharp flash. Most of the cycle is the gap between bursts. */
function burst(time: number, salt: number): number {
  let t = 0
  let i = 0
  const clock = Math.max(0, time)
  while (i < 160) {
    const gap = 0.16 + hash(salt + i * 2.17) * 0.28
    const width = 0.07 + hash(salt + i * 6.3) * 0.05
    if (t + gap + width > clock) {
      const local = clock - t
      if (local < gap) return 0
      const u = (local - gap) / width
      if (u < 0.25) return u / 0.25
      return 1 - (u - 0.25) / 0.75
    }
    t += gap + width
    i += 1
  }
  return 0
}

function boltLook(base: number, salt: number, storm: Storm) {
  const peak = Math.max(
    storm.strikeFlash,
    burst(storm.flashTime, storm.seed + salt),
    burst(storm.flashTime, storm.seed + salt + 23.7),
  )
  return {
    peak,
    core: base * (0.5 + 0.5 * peak),
    // The soft edge stays on between bursts, then flares with them.
    body: base * (0.42 + 0.58 * peak),
  }
}

function makeArc(depthTest: boolean, order: number, vertexColors = false): THREE.Line {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3),
  )
  if (vertexColors) {
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3),
    )
  }
  geometry.setDrawRange(0, 0)
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    vertexColors,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  })
  const line = new THREE.Line(geometry, material)
  line.frustumCulled = false
  line.renderOrder = order
  line.visible = false
  return line
}

function screenPerp(dir: THREE.Vector3) {
  side.crossVectors(dir, viewDir)
  if (side.lengthSq() < 1e-8) side.crossVectors(dir, WORLD_UP)
  if (side.lengthSq() < 1e-8) side.crossVectors(dir, WORLD_X)
  side.normalize()
}

function segmentPerp(dir: THREE.Vector3) {
  perp.crossVectors(dir, viewDir)
  if (perp.lengthSq() < 1e-8) perp.crossVectors(dir, WORLD_UP)
  if (perp.lengthSq() < 1e-8) perp.crossVectors(dir, WORLD_X)
  perp.normalize()
  bin.crossVectors(dir, perp)
  if (bin.lengthSq() < 1e-8) bin.copy(WORLD_UP)
  else bin.normalize()
}

function shellFrame(origin: THREE.Vector3) {
  frameN.copy(origin)
  if (frameN.lengthSq() < 1e-8) frameN.set(0, 0, 1)
  else frameN.normalize()
  frameT.crossVectors(WORLD_UP, frameN)
  if (frameT.lengthSq() < 1e-8) frameT.crossVectors(WORLD_X, frameN)
  frameT.normalize()
  frameB.crossVectors(frameN, frameT)
}

/** A point on the shell, just proud of the surface. */
function onShell(bearing: number, theta: number, radius: number, out: THREE.Vector3) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  out
    .copy(frameN)
    .multiplyScalar(c)
    .addScaledVector(frameT, s * Math.cos(bearing))
    .addScaledVector(frameB, s * Math.sin(bearing))
    .multiplyScalar(radius * 1.012)
}

/**
 * Jag a surface path from `theta0` to `theta1` at a fixed bearing.
 * Theta only increases, so the bolt keeps traveling outward. The kick is
 * sideways arc, converted to bearing, and it halves every split.
 */
function displaceBearing(
  theta0: number,
  theta1: number,
  bearing: number,
  seed: number,
  swing: number,
  wave: number,
  shake: number,
): number {
  let th = TH_A
  let br = BR_A
  let thD = TH_B
  let brD = BR_B
  th[0] = theta0
  br[0] = bearing
  th[1] = theta1
  br[1] = bearing
  const spanTheta = Math.max(1e-4, theta1 - theta0)
  const pulse = reshape(wave, seed)
  let count = 2
  let kick = spanTheta * swing
  for (let g = 0; g < LEVELS; g++) {
    let w = 0
    for (let i = 0; i < count - 1; i++) {
      thD[w] = th[i]
      brD[w] = br[i]
      w += 1
      const midTheta = (th[i] + th[i + 1]) * 0.5
      const midBearing = (br[i] + br[i + 1]) * 0.5
      const stable = hash(seed + g * 41 + i * 3.7) - 0.5
      const fa = hash(seed + 90 + pulse.shapeA * 17 + g * 41 + i * 3.7) - 0.5
      const fb = hash(seed + 90 + pulse.shapeB * 17 + g * 41 + i * 3.7) - 0.5
      const lived = fa + (fb - fa) * pulse.blend
      const mix = g < 1 ? 0.15 : g < 3 ? 0.6 : 0.92
      const h = stable + (lived - stable) * mix * shake
      const rest = Math.sin(wave * 5.4 + i * 1.7 + g) * 0.03 * shake * (g === 0 ? 0.2 : 1)
      const envelope = Math.min(1, midTheta / (spanTheta * 0.14 + theta0))
      const sinT = Math.max(0.2, Math.sin(Math.max(midTheta, 0)))
      let bearingKick = ((h + rest) * 2 * kick * envelope) / sinT
      bearingKick = Math.max(-0.72, Math.min(0.72, bearingKick))
      thD[w] = midTheta
      brD[w] = midBearing + bearingKick
      w += 1
    }
    thD[w] = th[count - 1]
    brD[w] = br[count - 1]
    w += 1
    count = w
    const swapTh = th
    th = thD
    thD = swapTh
    const swapBr = br
    br = brD
    brD = swapBr
    kick *= 0.5
  }
  if (th !== TH_A) {
    TH_A.set(th.subarray(0, count))
    BR_A.set(br.subarray(0, count))
  }
  return count
}

function layOnShell(count: number, radius: number) {
  for (let i = 0; i < count; i++) onShell(BR_A[i], TH_A[i], radius, bufA[i])
}

function sampleTheta(count: number, theta: number, outPos: THREE.Vector3, outBearing: { v: number }) {
  if (theta <= TH_A[0]) {
    outPos.copy(bufA[0])
    outBearing.v = BR_A[0]
    return
  }
  for (let i = 0; i < count - 1; i++) {
    if (TH_A[i + 1] < theta) continue
    const d = TH_A[i + 1] - TH_A[i]
    const f = d < 1e-6 ? 0 : (theta - TH_A[i]) / d
    outPos.lerpVectors(bufA[i], bufA[i + 1], f)
    outBearing.v = BR_A[i] + (BR_A[i + 1] - BR_A[i]) * f
    return
  }
  outPos.copy(bufA[count - 1])
  outBearing.v = BR_A[count - 1]
}

/**
 * Jagged filament from `from` to `to`. Both ends stay put. Each split kicks
 * the midpoint off the segment in a random direction, so the turns are corners
 * rather than a smoothed bow.
 */
function fillJagged(
  from: THREE.Vector3,
  to: THREE.Vector3,
  seed: number,
  shape: number,
  swing: number,
  out: THREE.Vector3[],
): number {
  let src = scratchA
  let dst = scratchB
  src[0].copy(from)
  src[1].copy(to)
  let count = 2
  let rough = swing
  chord.copy(to).sub(from)
  const chordLen2 = Math.max(1e-8, chord.lengthSq())
  for (let g = 0; g < PLASMA_LEVELS; g++) {
    let w = 0
    for (let i = 0; i < count - 1; i++) {
      dst[w].copy(src[i])
      w += 1
      const a = src[i]
      const b = src[i + 1]
      seg.copy(b).sub(a)
      const segLen = Math.max(1e-6, seg.length())
      mid.copy(a).add(b).multiplyScalar(0.5)
      const along = Math.max(0, Math.min(1, held.copy(mid).sub(from).dot(chord) / chordLen2))
      const env = Math.sin(Math.PI * along)
      seg.multiplyScalar(1 / segLen)
      segmentPerp(seg)
      const spin = hash(seed + shape * 13.1 + g * 7.7 + i * 4.3) * Math.PI * 2
      const mag =
        g === 0
          ? 0.72 + hash(seed + 3 + shape * 5.2) * 0.28
          : hash(seed + shape * 19.7 + g * 41 + i * 3.7)
      const kick = mag * segLen * rough * env
      dst[w]
        .copy(mid)
        .addScaledVector(perp, Math.cos(spin) * kick)
        .addScaledVector(bin, Math.sin(spin) * kick * 0.38)
      w += 1
    }
    dst[w].copy(src[count - 1])
    w += 1
    count = w
    const swap = src
    src = dst
    dst = swap
    rough *= 0.74
  }
  for (let i = 0; i < count; i++) out[i].copy(src[i])
  out[0].copy(from)
  out[count - 1].copy(to)
  return count
}

function layArc(
  from: THREE.Vector3,
  to: THREE.Vector3,
  seed: number,
  swing: number,
  wave: number,
  shake: number,
): number {
  const pulse = reshape(wave + hash(seed) * 0.45, seed)
  const count = fillJagged(from, to, seed, pulse.shapeA, swing, bufA)
  if (pulse.blend > 0.001) {
    fillJagged(from, to, seed, pulse.shapeB, swing, bufB)
    for (let i = 0; i < count; i++) bufA[i].lerp(bufB[i], pulse.blend)
    bufA[0].copy(from)
    bufA[count - 1].copy(to)
  }
  chord.copy(to).sub(from)
  const len = chord.length()
  if (len > 1e-5) {
    chord.multiplyScalar(1 / len)
    screenPerp(chord)
    const breath = 0.01 * shake * len
    if (breath > 1e-6) {
      for (let i = 1; i < count - 1; i++) {
        const t = i / (count - 1)
        const env = Math.sin(Math.PI * t)
        bufA[i].addScaledVector(side, Math.sin(wave * 6.2 + i * 1.4 + seed) * breath * env)
      }
    }
  }
  return count
}

type Tone = 'bolt' | 'char'

const RIBBON_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSide;
varying vec3 vColor;
varying float vSide;

void main() {
  vColor = aColor;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const RIBBON_FRAG = /* glsl */ `
uniform float uGain;
uniform float uSoft;
uniform float uChar;
uniform float uCeiling;
varying vec3 vColor;
varying float vSide;

void main() {
  float d = abs(vSide);
  // Highlights sit so far above 1 that a soft darken never leaves the top ink
  // step. The burn is a hard ceiling: min(scene, ceiling) along the stroke.
  if (uChar > 0.5) {
    if (d > 0.9) discard;
    gl_FragColor = vec4(uCeiling, uCeiling, uCeiling, 1.0);
    return;
  }
  float body = pow(1.0 - smoothstep(0.0, 1.0, d), uSoft);
  float glow = body * uGain;
  gl_FragColor = vec4(vColor * glow, glow);
}
`

function noise01(salt: number, x: number): number {
  const i0 = Math.floor(x)
  const f = x - i0
  const s = f * f * (3 - 2 * f)
  return hash(salt + i0 * 1.7) * (1 - s) + hash(salt + (i0 + 1) * 1.7) * s
}

/** 0–1. Wide hot stretches, with a shorter streak and a little grit, crawling the path. */
function channelHeat(salt: number, t: number, time: number, pace: number): number {
  const scroll = time * pace
  const coarse = noise01(salt, t * 3.2 + scroll)
  const streak = noise01(salt + 13, t * 7.5 - scroll * 1.35)
  const grit = noise01(salt + 37, t * 16 + scroll * 2.1)
  return coarse * 0.62 + streak * 0.28 + grit * 0.1
}

/**
 * 0–1. A few short knots along the stroke. Most of the path is quiet;
 * these are the places it thickens and burns hotter.
 */
function channelSpot(salt: number, t: number, time: number, pace: number): number {
  const scroll = time * pace * 0.65
  const u = t * 5 + scroll
  const i0 = Math.floor(u)
  const f = u - i0
  const center = 0.18 + hash(salt + i0 * 6.1) * 0.64
  const width = 0.055 + hash(salt + 2.4 + i0) * 0.06
  const peak = Math.max(0, 1 - Math.abs(f - center) / width)
  const shaped = peak * peak
  const alive = hash(salt + 8 + i0 * 1.9) > 0.4 ? 1 : 0
  const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * (4.2 + hash(salt + i0) * 6) + i0 * 1.7))
  return shaped * alive * pulse
}

/** –1–1. Fine edge wander, the stand-in for a turbulence displacement. */
function channelFray(salt: number, t: number, time: number, pace: number): number {
  const scroll = time * pace * 1.4
  const a = noise01(salt + 80, t * 11 + scroll) * 2 - 1
  const b = noise01(salt + 120, t * 23 - scroll) * 2 - 1
  return a * 0.68 + b * 0.32
}

function writeTone(colors: Float32Array, offset: number, tone: Tone, body: number, spot: number) {
  if (tone === 'bolt') {
    const bright = 0.16 + 0.3 * body + 1.65 * spot
    colors[offset] = bright
    colors[offset + 1] = bright
    colors[offset + 2] = bright
    return
  }
  if (tone === 'char') {
    const mask = 0.55 + 0.45 * body
    colors[offset] = mask
    colors[offset + 1] = mask
    colors[offset + 2] = mask
    return
  }
  const exhaustive: never = tone
  return exhaustive
}

function strokePerp(
  index: number,
  src: THREE.Vector3,
  mode: 'ribbon' | 'flat',
  axis: THREE.Vector3,
  count: number,
  out: THREE.Vector3,
) {
  if (mode === 'flat') {
    out.copy(axis)
    if (out.lengthSq() < 1e-10) out.set(1, 0, 0)
    else out.normalize()
    return
  }
  if (mode === 'ribbon') {
    const prev = bufA[Math.max(0, index - 1)]
    const next = bufA[Math.min(count - 1, index + 1)]
    seg.copy(next).sub(prev)
    out.crossVectors(src, seg)
    if (out.lengthSq() < 1e-10) out.copy(frameT)
    else out.normalize()
    return
  }
  const exhaustive: never = mode
  out.set(1, 0, 0)
  return exhaustive
}

function makeRibbon(depthTest: boolean, order: number, char = false): THREE.Mesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2 * 3), 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 2 * 3), 3))
  const sides = new Float32Array(MAX_POINTS * 2)
  for (let i = 0; i < MAX_POINTS; i++) {
    sides[i * 2] = -1
    sides[i * 2 + 1] = 1
  }
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  const index = new Uint16Array((MAX_POINTS - 1) * 6)
  let k = 0
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    const a = i * 2
    const b = i * 2 + 1
    const c = (i + 1) * 2
    const d = (i + 1) * 2 + 1
    index[k++] = a
    index[k++] = b
    index[k++] = c
    index[k++] = b
    index[k++] = d
    index[k++] = c
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.setDrawRange(0, 0)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGain: { value: 0 },
      uSoft: { value: 1.6 },
      uChar: { value: char ? 1 : 0 },
      uCeiling: { value: 1 },
    },
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthTest,
    depthWrite: false,
    blending: char ? THREE.CustomBlending : THREE.AdditiveBlending,
    blendEquation: char ? THREE.MinEquation : THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = order
  mesh.visible = false
  return mesh
}

/**
 * One stroke. The sharp core sits on the path. The ribbon is the same path,
 * wider where the channel is hot and frayed along the edge, fading across its
 * own width so the glow belongs to the bolt.
 */
function paintChannel(
  core: THREE.Line | null,
  ribbon: THREE.Mesh,
  count: number,
  limit: number | undefined,
  tone: Tone,
  mode: 'ribbon' | 'flat',
  axis: THREE.Vector3,
  base: number,
  swell: number,
  frayAmp: number,
  salt: number,
  time: number,
  pace: number,
  gain: number,
  soft: number,
  coreOpacity: number,
  flash: number,
) {
  const material = ribbon.material as THREE.ShaderMaterial
  material.uniforms.uGain.value = gain
  material.uniforms.uSoft.value = soft
  if (count < 2 || gain < 0.03) {
    ribbon.visible = false
    if (core) core.visible = false
    return
  }
  const posAttr = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute
  const colAttr = ribbon.geometry.getAttribute('aColor') as THREE.BufferAttribute
  const positions = posAttr.array as Float32Array
  const colors = colAttr.array as Float32Array
  let corePos: Float32Array | null = null
  let coreCol: Float32Array | null = null
  let corePositionAttr: THREE.BufferAttribute | null = null
  let coreColorAttr: THREE.BufferAttribute | null = null
  if (core) {
    const coreMat = core.material as THREE.LineBasicMaterial
    coreMat.color.setHex(0xffffff)
    coreMat.opacity = coreOpacity
    corePositionAttr = core.geometry.getAttribute('position') as THREE.BufferAttribute
    coreColorAttr = core.geometry.getAttribute('color') as THREE.BufferAttribute
    corePos = corePositionAttr.array as Float32Array
    coreCol = coreColorAttr.array as Float32Array
  }
  const thetaSpan = TH_A[count - 1] - TH_A[0]
  const alongOf = (theta: number, index: number) => {
    if (mode === 'flat' || thetaSpan <= 1e-4) return count <= 1 ? 0 : index / (count - 1)
    return (theta - TH_A[0]) / thetaSpan
  }
  let written = 0
  const capped = limit !== undefined
  const emit = (index: number, theta: number, src: THREE.Vector3) => {
    const t = Math.max(0, Math.min(1, alongOf(theta, index)))
    const heat = channelHeat(salt, t, time, pace)
    const spot = channelSpot(salt, t, time, pace) * (0.55 + 0.75 * flash)
    const edge = channelFray(salt, t, time, pace)
    const bite = channelFray(salt + 200, t * 1.8, time, pace * 1.7)
    const pinch = Math.sin(Math.PI * t)
    const open = 0.42 + 0.58 * pinch
    const grit = noise01(salt + 50, t * 19 + time * pace * 2)
    const half = (base + swell * (0.22 + heat * 0.45 + grit * 0.1 + spot * 0.95)) * open
    const rough = frayAmp * (edge * 0.65 + bite * 0.55) * pinch
    strokePerp(index, src, mode, axis, count, perp)
    left.copy(src).addScaledVector(perp, -half - rough)
    right.copy(src).addScaledVector(perp, half + rough * 0.4)
    if (radialScale !== 1) {
      left.multiplyScalar(radialScale)
      right.multiplyScalar(radialScale)
      nudge.copy(src).multiplyScalar(radialScale)
    } else {
      nudge.copy(src)
    }
    const o = written * 6
    positions[o] = left.x
    positions[o + 1] = left.y
    positions[o + 2] = left.z
    positions[o + 3] = right.x
    positions[o + 4] = right.y
    positions[o + 5] = right.z
    writeTone(colors, o, tone, heat, spot)
    writeTone(colors, o + 3, tone, heat, spot)
    if (corePos && coreCol) {
      const c = written * 3
      corePos[c] = nudge.x
      corePos[c + 1] = nudge.y
      corePos[c + 2] = nudge.z
      writeTone(coreCol, c, tone, heat, spot)
    }
    written += 1
  }
  for (let i = 0; i < count; i++) {
    if (capped && TH_A[i] > limit) {
      if (written > 0 && i > 0) {
        const d = TH_A[i] - TH_A[i - 1]
        const f = d < 1e-6 ? 0 : (limit - TH_A[i - 1]) / d
        held.copy(bufA[i - 1]).lerp(bufA[i], f)
        emit(i - 1, limit, held)
      }
      break
    }
    emit(i, mode === 'flat' ? 0 : TH_A[i], bufA[i])
  }
  posAttr.needsUpdate = true
  colAttr.needsUpdate = true
  ribbon.geometry.setDrawRange(0, Math.max(0, (written - 1) * 6))
  ribbon.visible = written >= 2
  if (core && corePos && coreCol && corePositionAttr && coreColorAttr) {
    corePositionAttr.needsUpdate = true
    coreColorAttr.needsUpdate = true
    core.geometry.setDrawRange(0, written)
    core.visible = written >= 2 && coreOpacity >= 0.02
  }
}

function paintBolt(
  core: THREE.Line,
  ribbon: THREE.Mesh,
  count: number,
  look: { peak: number; core: number; body: number },
  limit: number | undefined,
  mode: 'ribbon' | 'flat',
  axis: THREE.Vector3,
  spread: number,
  salt: number,
  time: number,
) {
  radialScale = 1
  paintChannel(
    core,
    ribbon,
    count,
    limit,
    'bolt',
    mode,
    axis,
    spread * 0.34,
    spread,
    spread * 0.3,
    salt,
    time,
    0.5,
    look.body * (0.82 + 0.45 * look.peak),
    2.05,
    look.core,
    look.peak,
  )
}

function paintChar(
  ribbon: THREE.Mesh,
  count: number,
  amount: number,
  radius: number,
  salt: number,
  time: number,
  limit?: number,
) {
  if (amount < 0.02) {
    ribbon.visible = false
    return
  }
  const material = ribbon.material as THREE.ShaderMaterial
  // 1 is a full scorch (barely above black). As it fades the ceiling rises
  // through the ink steps until the line disappears into the lit surface.
  material.uniforms.uCeiling.value = 0.5 - amount * 0.485
  radialScale = 1.008
  paintChannel(
    null,
    ribbon,
    count,
    limit,
    'char',
    'ribbon',
    side,
    radius * 0.012,
    radius * 0.004,
    radius * 0.0015,
    salt,
    time,
    0.02,
    1,
    1,
    0,
    0,
  )
  radialScale = 1
}

function hideLine(line: THREE.Line) {
  line.visible = false
}

function hideMesh(mesh: THREE.Mesh) {
  mesh.visible = false
}

const forkBearing = { v: 0 }

export function StormLines({ storm }: { storm: Storm }) {
  const glowTime = useRef(0)
  const pool = useMemo(() => {
    const cores: THREE.Line[] = []
    const bodies: THREE.Mesh[] = []
    const chars: THREE.Mesh[] = []
    for (let i = 0; i < SURFACE; i++) {
      cores.push(makeArc(true, 4, true))
      bodies.push(makeRibbon(true, 3))
      chars.push(makeRibbon(true, 1, true))
    }
    cores.push(makeArc(false, 6, true))
    bodies.push(makeRibbon(false, 5))
    return { cores, bodies, chars }
  }, [])

  useEffect(() => {
    return () => {
      for (const line of pool.cores) {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      for (const mesh of [...pool.bodies, ...pool.chars]) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
    }
  }, [pool])

  useFrame(({ camera }, delta) => {
    glowTime.current += delta
    const time = glowTime.current
    camera.getWorldDirection(viewDir)
    const opacity = storm.opacity
    const whiteOn = opacity > 0.03 && storm.draw > 0.02 && storm.radius > 0
    const charOn = storm.char > 0.02 && storm.radius > 0
    if (!whiteOn && !charOn) {
      for (const line of pool.cores) hideLine(line)
      for (const mesh of pool.bodies) hideMesh(mesh)
      for (const mesh of pool.chars) hideMesh(mesh)
      return
    }

    shellFrame(storm.origin)
    const power = storm.power
    const reach = 0.55 + power * 2.45
    const leaders = 1 + Math.min(LEADER_MAX - 1, Math.floor(power * 7.2))
    const baseBearing = hash(storm.seed + 1.7) * Math.PI * 2
    const pathWave = whiteOn ? storm.wave : storm.scorchWave
    const pathShake = whiteOn ? storm.shake : storm.scorchShake
    const shownDraw = whiteOn ? storm.draw : 1

    for (let i = 0; i < LEADER_MAX; i++) {
      const leader = pool.cores[i]
      const leaderBody = pool.bodies[i]
      const branch = pool.cores[LEADER_MAX + i]
      const branchBody = pool.bodies[LEADER_MAX + i]
      const leaderChar = pool.chars[i]
      const branchChar = pool.chars[LEADER_MAX + i]
      if (i >= leaders) {
        hideLine(leader)
        hideMesh(leaderBody)
        hideLine(branch)
        hideMesh(branchBody)
        hideMesh(leaderChar)
        hideMesh(branchChar)
        continue
      }
      const bearing = baseBearing + i * 2.399963
      const len = reach * (i === 0 ? 1 : 0.62 + hash(storm.seed + i * 4.1) * 0.38)
      const count = displaceBearing(
        0.012,
        len,
        bearing,
        storm.seed + i * 9.2,
        0.32,
        pathWave + i * 0.17,
        pathShake,
      )
      layOnShell(count, storm.radius)
      const tip = 0.012 + (len - 0.012) * shownDraw
      if (whiteOn) {
        const look = boltLook(opacity, i + 1, storm)
        const spread = storm.radius * (0.008 + look.peak * 0.012)
        paintBolt(
          leader,
          leaderBody,
          count,
          look,
          tip,
          'ribbon',
          side,
          spread,
          storm.seed + i * 9.2,
          time,
        )
      } else {
        hideLine(leader)
        hideMesh(leaderBody)
      }
      if (charOn) {
        paintChar(leaderChar, count, storm.char, storm.radius, storm.seed + i * 9.2, time, tip)
      } else {
        hideMesh(leaderChar)
      }

      const branched = hash(storm.seed + i * 6.4 + 2) < 0.15 + power * 0.7
      if (!branched) {
        hideLine(branch)
        hideMesh(branchBody)
        hideMesh(branchChar)
        continue
      }
      const forkTheta = len * (0.34 + hash(storm.seed + i * 2.2) * 0.28)
      if (tip < forkTheta + 0.02) {
        hideLine(branch)
        hideMesh(branchBody)
        hideMesh(branchChar)
        continue
      }
      sampleTheta(count, forkTheta, held, forkBearing)
      const peel =
        (hash(storm.seed + i * 8.8) < 0.5 ? -1 : 1) * (0.7 + hash(storm.seed + i) * 0.8)
      const branchLen = len * (0.28 + hash(storm.seed + i * 3.3) * 0.22)
      const grown = Math.min(1, (tip - forkTheta) / branchLen)
      const bCount = displaceBearing(
        forkTheta,
        forkTheta + branchLen,
        forkBearing.v + peel * 0.15,
        storm.seed + 40 + i * 13,
        0.38,
        pathWave + i * 0.23,
        pathShake,
      )
      layOnShell(bCount, storm.radius)
      bufA[0].copy(held)
      const branchTip = forkTheta + branchLen * grown
      if (whiteOn) {
        const look = boltLook(opacity * 0.9, 20 + i, storm)
        const spread = storm.radius * (0.006 + look.peak * 0.01)
        paintBolt(
          branch,
          branchBody,
          bCount,
          look,
          branchTip,
          'ribbon',
          side,
          spread,
          storm.seed + 40 + i * 13,
          time,
        )
      } else {
        hideLine(branch)
        hideMesh(branchBody)
      }
      if (charOn) {
        paintChar(
          branchChar,
          bCount,
          storm.char * 0.9,
          storm.radius,
          storm.seed + 40 + i * 13,
          time,
          branchTip,
        )
      } else {
        hideMesh(branchChar)
      }
    }

    const plasma = pool.cores[SURFACE]
    const plasmaBody = pool.bodies[SURFACE]
    span.copy(storm.aim).sub(storm.origin)
    const arcReach = span.length()
    const showArc = whiteOn && storm.arc > 0 && arcReach > storm.radius * 0.08
    if (!showArc) {
      hideLine(plasma)
      hideMesh(plasmaBody)
    } else {
      const swing = 0.46 + hash(storm.seed + 8.2) * 0.2
      const n = layArc(storm.origin, storm.aim, storm.seed + 3.4, swing, storm.wave, storm.shake)
      const look = boltLook(opacity, 50, storm)
      const spread = Math.min(arcReach * (0.005 + look.peak * 0.008), storm.radius * 0.028)
      paintBolt(plasma, plasmaBody, n, look, undefined, 'flat', side, spread, storm.seed + 3.4, time)
    }
  }, -1)

  return (
    <>
      {pool.chars.map((mesh, index) => (
        <primitive key={`char-${index}`} object={mesh} />
      ))}
      {pool.bodies.map((mesh, index) => (
        <primitive key={`body-${index}`} object={mesh} />
      ))}
      {pool.cores.map((line, index) => (
        <primitive key={`core-${index}`} object={line} />
      ))}
    </>
  )
}
