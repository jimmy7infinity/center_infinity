import * as THREE from 'three'
import { beatIndex, type BeatId } from '../lib/beats'
import type { PlanetKind } from './lunarSurface'

const DEG = Math.PI / 180
const FOV_HALF = 21 * DEG

/** Nominal camera depth that the `fx`/`fy` composition fractions are authored against. */
const FRAME_REFERENCE_Z = 27

/**
 * Scroll-driven pose for one shell at a given beat.
 *
 * `fx`/`fy` are composition fractions (0..1, y down) rather than world
 * coordinates: they are resolved against the live aspect ratio every frame, so
 * the same table frames correctly on a phone and an ultrawide.
 *
 * `light` is the world-space direction **toward** the light source, matching the
 * Lambert convention where `dot(N, light)` is positive on the lit hemisphere.
 */
export type ShellKeyframe = {
  at: number
  fx: number
  fy: number
  z: number
  light: [number, number, number]
  intensity: number
}

export type ShellMotion = {
  id: 'A' | 'B' | 'C' | 'D'
  surfaceKind: PlanetKind
  /** Diameter as a fraction of the smaller viewport axis at `referenceZ`. */
  diameter: number
  referenceZ: number
  normalScale: number
  /**
   * Strength of the tiled micro-relief. The shells that come closest to camera
   * magnify the base map most, so they lean hardest on the detail tile.
   */
  detailScale: number
  tint: string
  segments: number
  lightColor: string
  terminator: number
  spinAxis: [number, number, number]
  /** Radians per second. */
  spinRate: number
  keyframes: ShellKeyframe[]
}

/** Mutable output of {@link sampleShellKeyframe}; reuse one instance per consumer. */
export type ShellSample = {
  position: THREE.Vector3
  lightDir: THREE.Vector3
  intensity: number
}

export type CameraKeyframe = {
  at: number
  position: [number, number, number]
  /** World point the camera looks at — this is what makes the move read as a turn. */
  target: [number, number, number]
  fov: number
}

export type CameraPose = {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

/** Vertical world span of the frustum at depth `z`, from the reference camera. */
function viewHeightAt(z: number): number {
  return 2 * (FRAME_REFERENCE_Z - z) * Math.tan(FOV_HALF)
}

/**
 * The composition is laid out in units of the *smaller* viewport axis.
 *
 * On landscape that is the height, which reproduces the desktop framing these
 * numbers were tuned against. On portrait it becomes the width, so the whole
 * cluster scales down to fit instead of overflowing the sides — which is what
 * used to bury the copy under an oversized moon on phones.
 */
function compositionUnit(z: number, aspect: number): number {
  const viewHeight = viewHeightAt(z)
  return Math.min(viewHeight * aspect, viewHeight)
}

/**
 * On portrait the composition is only as wide as the viewport, so it lands in the
 * vertical middle — right where the copy goes. Lifting it by a fixed fraction of
 * the frame height splits the screen instead: scene above, copy below.
 */
const PORTRAIT_LIFT_FRAMES = 0.18

function resolveFrame(
  fx: number,
  fy: number,
  z: number,
  aspect: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const unit = compositionUnit(z, aspect)
  // `unit / aspect` is the frame height at this depth when aspect < 1, so the
  // lift is the same share of the screen at every depth.
  const lift = aspect < 1 ? PORTRAIT_LIFT_FRAMES * (unit / aspect) : 0
  return out.set((fx - 0.5) * unit, (0.5 - fy) * unit + lift, z)
}

export function resolveShellRadius(
  motion: ShellMotion,
  aspect: number,
): number {
  return (motion.diameter * compositionUnit(motion.referenceZ, aspect)) / 2
}

/**
 * Light directions. A negative `tiltZ` puts the source behind the shells so the
 * camera at +Z sees a rim crescent rather than a flat, fully-lit face.
 */
function above(tiltX = 0, tiltZ = -0.6): [number, number, number] {
  const v = new THREE.Vector3(tiltX, 1, tiltZ).normalize()
  return [v.x, v.y, v.z]
}

function below(tiltX = 0, tiltZ = -0.6): [number, number, number] {
  const v = new THREE.Vector3(tiltX, -1, tiltZ).normalize()
  return [v.x, v.y, v.z]
}

function from(x: number, y: number, z: number): [number, number, number] {
  const v = new THREE.Vector3(x, y, z).normalize()
  return [v.x, v.y, v.z]
}

function kf(
  beat: BeatId,
  fx: number,
  fy: number,
  z: number,
  light: [number, number, number],
  intensity: number,
): ShellKeyframe {
  return { at: beatIndex(beat), fx, fy, z, light, intensity }
}

/**
 * Four nested crescents. The `hero` beat is the logo composition; every later
 * beat is a deliberately distinct tableau, and because beats are pinned to
 * sections each one lands exactly when its section is centred.
 *
 * Shells are ordered back-to-front by `z` at the hero beat so the nested
 * crescents stay visible under opaque blending: B sits in front of A, D in
 * front of C.
 */
export const SHELL_MOTIONS: ShellMotion[] = [
  {
    id: 'A',
    surfaceKind: 'jupiter',
    diameter: 0.70,
    referenceZ: -4,
    normalScale: 0.52,
    detailScale: 0.72,
    tint: '#7e8798',
    segments: 96,
    lightColor: '#dce6f5',
    terminator: 0.18,
    spinAxis: [0.12, 1, 0.05],
    spinRate: -0.016,
    keyframes: [
      kf('hero', 0.5, 0.42, -4, above(-0.12, -0.65), 0.76),
      kf('services', 0.85, 0.34, -12, above(-0.55, -0.7), 0.78),
      kf('work-1', 0.82, 0.68, -14, above(-0.7, -0.65), 0.8),
      kf('work-2', 0.2, 0.72, -16, below(-0.8, -0.6), 0.7),
      kf('work-3', 0.72, 0.22, -18, above(-0.45, -0.7), 0.82),
      kf('work-4', 0.85, 0.5, -13, above(-0.8, -0.6), 0.82),
      kf('work-5', 0.55, 0.3, -20, above(-0.3, -0.75), 0.84),
      // The one dominant close moon. Lit hard from the right so the mass that
      // overlaps the left-hand copy is unlit, keeping the text legible.
      kf('contact', 0.86, 0.52, -8, from(0.9, 0.35, -0.45), 0.9),
      // Sweeps past the camera during the jump and fades on surface crossing.
      kf('warp', 0.2, 0.55, 20, from(0.6, 0.4, -0.5), 0.9),
    ],
  },
  {
    id: 'B',
    surfaceKind: 'moon',
    diameter: 0.38,
    referenceZ: 5.5,
    normalScale: 0.58,
    detailScale: 0.62,
    tint: '#8e96a6',
    segments: 96,
    lightColor: '#dce6f5',
    terminator: 0.18,
    spinAxis: [0.15, 0.75, 0.65],
    spinRate: -0.038,
    keyframes: [
      kf('hero', 0.5, 0.31, 5.5, above(0.05, -0.6), 0.88),
      kf('services', 0.86, 0.22, 4, above(0.75, -0.6), 0.84),
      kf('work-1', 0.66, 0.3, 7, above(0.5, -0.65), 0.9),
      kf('work-2', 0.84, 0.24, 8, above(0.85, -0.6), 0.94),
      kf('work-3', 0.78, 0.76, 5, below(0.6, -0.6), 0.88),
      kf('work-4', 0.68, 0.26, 2, above(0.35, -0.65), 0.86),
      kf('work-5', 0.32, 0.7, 6, below(-0.7, -0.6), 0.84),
      kf('contact', 0.22, 0.16, -6, above(-0.4, -0.7), 0.8),
      kf('warp', 0.72, 0.4, 18, above(0.4, -0.6), 0.9),
    ],
  },
  {
    id: 'C',
    surfaceKind: 'venus',
    diameter: 0.48,
    referenceZ: -3.2,
    normalScale: 0.54,
    detailScale: 0.66,
    tint: '#828a9a',
    segments: 96,
    lightColor: '#d0dced',
    terminator: 0.16,
    spinAxis: [0.85, 0.15, 0.1],
    spinRate: 0.026,
    keyframes: [
      kf('hero', 0.51, 0.62, -3.2, below(0.08, -0.68), 0.75),
      kf('services', 0.26, 0.82, -9, below(-0.75, -0.65), 0.78),
      kf('work-1', 0.76, 0.6, -4.5, below(0.5, -0.6), 0.82),
      kf('work-2', 0.72, 0.78, -8, below(0.65, -0.6), 0.84),
      kf('work-3', 0.88, 0.45, -1, below(0.85, -0.6), 0.86),
      kf('work-4', 0.28, 0.78, -7, below(-0.6, -0.65), 0.82),
      kf('work-5', 0.8, 0.68, -10, below(0.5, -0.65), 0.8),
      kf('contact', 0.34, 0.9, -14, below(-0.2, -0.7), 0.7),
      kf('warp', 0.3, 0.7, 16, below(-0.3, -0.6), 0.85),
    ],
  },
  {
    id: 'D',
    surfaceKind: 'ice',
    diameter: 0.19,
    referenceZ: 4,
    normalScale: 0.56,
    detailScale: 0.58,
    tint: '#9aa4b4',
    segments: 96,
    lightColor: '#d0dced',
    terminator: 0.16,
    spinAxis: [0.45, 0.45, 0.75],
    spinRate: 0.052,
    keyframes: [
      kf('hero', 0.5, 0.65, 4, below(-0.12, -0.58), 0.9),
      kf('services', 0.8, 0.72, 5, below(0.7, -0.6), 0.86),
      kf('work-1', 0.9, 0.18, 4.5, above(0.85, -0.6), 0.92),
      kf('work-2', 0.28, 0.24, 6, above(-0.6, -0.6), 0.9),
      kf('work-3', 0.18, 0.74, 5.5, below(-0.75, -0.6), 0.88),
      kf('work-4', 0.88, 0.72, 6.5, below(0.8, -0.6), 0.94),
      kf('work-5', 0.64, 0.42, 2, above(0.3, -0.65), 0.9),
      kf('contact', 0.6, 0.14, -12, above(0.5, -0.6), 0.86),
      kf('warp', 0.5, 0.3, 14, above(0.2, -0.6), 0.9),
    ],
  },
]

/**
 * The camera translates modestly but re-aims a lot: swinging the look target
 * across the scene is what sells the sense of turning and sweeps new regions of
 * the starfield through frame. The warp beat breaks the pattern and charges
 * straight ahead on a wide lens.
 */
export const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { at: beatIndex('hero'), position: [0, 0, 27], target: [0, 0, -2], fov: 42 },
  {
    at: beatIndex('services'),
    position: [-1.5, 0.4, 25.2],
    target: [1.6, -0.3, -4],
    fov: 43,
  },
  {
    at: beatIndex('work-1'),
    position: [1.6, -0.5, 24.4],
    target: [-1.8, 0.4, -5],
    fov: 44,
  },
  {
    at: beatIndex('work-2'),
    position: [-2, 0.7, 23.8],
    target: [2, -0.6, -6],
    fov: 45,
  },
  {
    at: beatIndex('work-3'),
    position: [2.2, 0.1, 23.2],
    target: [-1.6, 0.7, -6],
    fov: 45,
  },
  {
    at: beatIndex('work-4'),
    position: [-1.4, -0.8, 22.8],
    target: [1.4, 0.9, -5],
    fov: 44,
  },
  {
    at: beatIndex('work-5'),
    position: [0.9, 1, 23.6],
    target: [-0.9, -0.9, -6],
    fov: 43,
  },
  {
    at: beatIndex('contact'),
    position: [-1.8, 0.1, 22],
    target: [2.4, 0.1, -4],
    fov: 43,
  },
  { at: beatIndex('warp'), position: [0, 0, 12.5], target: [0, 0, -24], fov: 56 },
]

function bracket<T extends { at: number }>(
  frames: T[],
  t: number,
): { a: T; b: T; u: number } {
  const last = frames.length - 1
  let i = 0
  while (i < last && frames[i + 1].at < t) i += 1
  const a = frames[i]
  const b = frames[Math.min(i + 1, last)]
  const span = b.at - a.at
  return { a, b, u: span > 0 ? (t - a.at) / span : 0 }
}

const _lerpDir = new THREE.Vector3()

/**
 * Interpolate a shell pose at `beat` and write into `out`.
 *
 * No heap allocations: writes into the Vector3 instances already on `out`, so
 * callers should keep one `ShellSample` per shell and pass it every frame.
 */
export function sampleShellKeyframe(
  keyframes: ShellKeyframe[],
  beat: number,
  aspect: number,
  out: ShellSample,
): void {
  if (keyframes.length === 0) {
    out.position.set(0, 0, 0)
    out.lightDir.set(0, 1, 0)
    out.intensity = 0
    return
  }

  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  const t = THREE.MathUtils.clamp(beat, first.at, last.at)
  const { a, b, u } = bracket(keyframes, t)

  resolveFrame(
    THREE.MathUtils.lerp(a.fx, b.fx, u),
    THREE.MathUtils.lerp(a.fy, b.fy, u),
    THREE.MathUtils.lerp(a.z, b.z, u),
    aspect,
    out.position,
  )

  _lerpDir
    .set(
      THREE.MathUtils.lerp(a.light[0], b.light[0], u),
      THREE.MathUtils.lerp(a.light[1], b.light[1], u),
      THREE.MathUtils.lerp(a.light[2], b.light[2], u),
    )
    .normalize()
  out.lightDir.copy(_lerpDir)

  out.intensity = THREE.MathUtils.lerp(a.intensity, b.intensity, u)
}

export function sampleCameraKeyframe(beat: number, out: CameraPose): void {
  const last = CAMERA_KEYFRAMES[CAMERA_KEYFRAMES.length - 1]
  const t = THREE.MathUtils.clamp(beat, CAMERA_KEYFRAMES[0].at, last.at)
  const { a, b, u } = bracket(CAMERA_KEYFRAMES, t)

  out.position.set(
    THREE.MathUtils.lerp(a.position[0], b.position[0], u),
    THREE.MathUtils.lerp(a.position[1], b.position[1], u),
    THREE.MathUtils.lerp(a.position[2], b.position[2], u),
  )
  out.target.set(
    THREE.MathUtils.lerp(a.target[0], b.target[0], u),
    THREE.MathUtils.lerp(a.target[1], b.target[1], u),
    THREE.MathUtils.lerp(a.target[2], b.target[2], u),
  )
  out.fov = THREE.MathUtils.lerp(a.fov, b.fov, u)
}
