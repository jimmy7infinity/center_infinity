import * as THREE from 'three'
import type { PlanetKind } from './lunarSurface'

const DEG = Math.PI / 180
const FOV_HALF = 21 * DEG

/** Nominal camera depth that the `fx`/`fy` composition fractions are authored against. */
const FRAME_REFERENCE_Z = 27

/**
 * Where one shell sits in the hero composition.
 *
 * `fx`/`fy` are composition fractions (0..1, y down) rather than world
 * coordinates: they are resolved against the live aspect ratio every frame, so
 * the same pose frames correctly on a phone and an ultrawide.
 *
 * `light` is the world-space direction **toward** the light source, matching the
 * Lambert convention where `dot(N, light)` is positive on the lit hemisphere.
 */
export type ShellPose = {
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
  pose: ShellPose
}

/** Mutable output of {@link resolveShellPose}; reuse one instance per consumer. */
export type ShellSample = {
  position: THREE.Vector3
  lightDir: THREE.Vector3
  intensity: number
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
 * Portrait keeps the cluster vertically centred (no extra lift) so fx/fy/z and
 * diameters match the desktop authoring — only the composition unit shrinks to
 * the viewport width, which scales the whole silhouette uniformly.
 */
function resolveFrame(
  fx: number,
  fy: number,
  z: number,
  aspect: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const unit = compositionUnit(z, aspect)
  return out.set((fx - 0.5) * unit, (0.5 - fy) * unit, z)
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

function pose(
  fx: number,
  fy: number,
  z: number,
  light: [number, number, number],
  intensity: number,
): ShellPose {
  return { fx, fy, z, light, intensity }
}

/**
 * Four nested crescents forming the logo. Depth is staged far→near
 * A → C → B → D so the 2D silhouette holds while the world spheres keep
 * flyable gaps between every pair.
 */
export const SHELL_MOTIONS: ShellMotion[] = [
  {
    id: 'A',
    surfaceKind: 'jupiter',
    diameter: 0.70,
    referenceZ: -21,
    normalScale: 0.52,
    detailScale: 0.72,
    tint: '#7e8798',
    segments: 96,
    lightColor: '#dce6f5',
    terminator: 0.18,
    spinAxis: [0.12, 1, 0.05],
    spinRate: -0.016,
    pose: pose(0.5, 0.42, -21, above(-0.12, -0.65), 0.76),
  },
  {
    id: 'B',
    surfaceKind: 'moon',
    diameter: 0.38,
    referenceZ: 10,
    normalScale: 0.58,
    detailScale: 0.62,
    tint: '#8e96a6',
    segments: 96,
    lightColor: '#dce6f5',
    terminator: 0.18,
    spinAxis: [0.15, 0.75, 0.65],
    spinRate: -0.038,
    pose: pose(0.5, 0.31, 10, above(0.05, -0.6), 0.88),
  },
  {
    id: 'C',
    surfaceKind: 'venus',
    diameter: 0.48,
    referenceZ: 0,
    normalScale: 0.54,
    detailScale: 0.66,
    tint: '#828a9a',
    segments: 96,
    lightColor: '#d0dced',
    terminator: 0.16,
    spinAxis: [0.85, 0.15, 0.1],
    spinRate: 0.026,
    pose: pose(0.5, 0.62, 0, below(0.08, -0.68), 0.75),
  },
  {
    id: 'D',
    surfaceKind: 'ice',
    diameter: 0.19,
    referenceZ: 16,
    normalScale: 0.56,
    detailScale: 0.58,
    tint: '#9aa4b4',
    segments: 96,
    lightColor: '#d0dced',
    terminator: 0.16,
    spinAxis: [0.45, 0.45, 0.75],
    spinRate: 0.052,
    pose: pose(0.5, 0.65, 16, below(-0.12, -0.58), 0.9),
  },
]

/**
 * Slight look-up so the crescent cluster sits a touch below centre. Framed
 * wider through the lens rather than by dollying back: the shells span ~37
 * units of depth, so moving the camera would shrink the near ones far more
 * than the far ones and break the mark's arrangement.
 */
export const HERO_CAMERA = {
  position: [0, -0.2, FRAME_REFERENCE_Z],
  target: [0, 1.15, -2],
  fov: 52,
} as const

/** Where the cluster sits. `panel` is the right half of a project page. */
export type ShellPlacement = 'hero' | 'panel'

/**
 * Composition `fx` is resolved with a 42° frame, then drawn by a 52° camera,
 * so a fraction of that frame is not a fraction of the screen. This converts.
 */
const SCREEN_PER_FRAME = Math.tan(FOV_HALF) / Math.tan((HERO_CAMERA.fov / 2) * DEG)

/** `fx` that lands on the middle of the right half of the screen. */
function panelFx(aspect: number): number {
  const screenOffset = 0.24
  return 0.5 + (screenOffset * Math.max(aspect, 1)) / SCREEN_PER_FRAME
}

/**
 * How far to shrink the cluster so the largest shell fits that panel.
 * 1 on a normal desktop; lower when the viewport is too narrow for it.
 */
export function panelFit(aspect: number): number {
  const widthFraction = (0.7 / Math.max(aspect, 1)) * SCREEN_PER_FRAME
  return Math.min(1, 0.4 / widthFraction)
}

/**
 * Resolve a shell's pose against the live aspect and write into `out`.
 * No heap allocations — keep one `ShellSample` per shell.
 */
export function resolveShellPose(
  motion: ShellMotion,
  aspect: number,
  out: ShellSample,
  placement: ShellPlacement = 'hero',
): void {
  const { fx, fy, z, light, intensity } = motion.pose
  const frameFx = placement === 'panel' ? panelFx(aspect) + (fx - 0.5) : fx
  resolveFrame(frameFx, fy, z, aspect, out.position)
  out.lightDir.set(light[0], light[1], light[2]).normalize()
  out.intensity = intensity
}
