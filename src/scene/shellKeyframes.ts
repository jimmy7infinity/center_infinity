import * as THREE from 'three'

/**
 * Scroll-driven pose for one shell at a given progress point.
 *
 * `lightDir` is the world-space direction **toward** the light source (same
 * convention as Lambert: `dot(N, lightDir)` is positive on the lit hemisphere).
 * Consumers normalise it; values here are pre-normalised for readability.
 *
 * `spinAxis` is a local tumble axis (need not be unit length; sampled output
 * is normalised). `spinRate` is radians per second.
 */
export type ShellKeyframe = {
  at: number
  position: [number, number, number]
  lightDir: [number, number, number]
  intensity: number
  spinAxis: [number, number, number]
  spinRate: number
}

export type ShellMotion = {
  id: 'A' | 'B' | 'C' | 'D'
  radius: number
  normalScale: number
  tint: string
  segments: number
  lightColor: string
  terminator: number
  keyframes: ShellKeyframe[]
}

/** Mutable output of {@link sampleShellKeyframe}; reuse one instance per consumer. */
export type ShellSample = {
  position: THREE.Vector3
  lightDir: THREE.Vector3
  intensity: number
  spinAxis: THREE.Vector3
  spinRate: number
}

const DEG = Math.PI / 180

/**
 * Progress-0 depth layers. Camera at z ≈ 17 looks toward −Z; higher z is closer.
 * B/D must sit in front of A/C: Z_B − r_B > Z_A + r_A (and same for D vs C).
 */
const Z_A = -4.0
const Z_B = 5.5
const Z_C = -3.2
const Z_D = 4.0

/**
 * Vertical span of the view frustum (world units) at distance `d` from the
 * camera. Matches fov 42° and camera z ≈ 17 looking at the origin region.
 */
function viewHeightAtDistance(d: number): number {
  return 2 * d * Math.tan(21 * DEG)
}

/**
 * Map square-viewport centre fractions (0..1, y down) to world x/y at depth z.
 * Camera sits at z ≈ 17 on progress 0; shells use staggered z so nested crescents
 * remain visible under opaque NormalBlending.
 */
function viewportToWorld(
  fx: number,
  fy: number,
  z: number,
): [number, number, number] {
  const d = 17 - z
  const viewH = viewHeightAtDistance(d)
  const viewW = viewH
  const x = (fx - 0.5) * viewW
  const y = (0.5 - fy) * viewH
  return [x, y, z]
}

/** World-space radius so a shell projects to `diameterFrac` of the viewport. */
function radiusFromDiameter(diameterFrac: number, z: number): number {
  const d = 17 - z
  return diameterFrac * d * Math.tan(21 * DEG)
}

/**
 * Normalised direction toward a light above or below the shell.
 * Negative `tiltZ` places the source behind the shells (−Z) so the camera at +Z
 * sees rim crescents instead of front-face discs.
 */
function lightFromAbove(tiltX = 0, tiltZ = -0.6): [number, number, number] {
  const v = new THREE.Vector3(tiltX, 1, tiltZ).normalize()
  return [v.x, v.y, v.z]
}

function lightFromBelow(tiltX = 0, tiltZ = -0.6): [number, number, number] {
  const v = new THREE.Vector3(tiltX, -1, tiltZ).normalize()
  return [v.x, v.y, v.z]
}

/**
 * Four nested crescents. Progress 0 matches the logo composition with depth
 * layering so B (in front of A) and D (in front of C) stay visible. Scroll
 * beats at 0 / 0.25 / 0.5 / 0.75 / 1.0 form intentional, spaced tableaux.
 */
export const SHELL_MOTIONS: ShellMotion[] = [
  {
    id: 'A',
    radius: radiusFromDiameter(0.82, Z_A),
    normalScale: 0.32,
    tint: '#858a94',
    segments: 96,
    lightColor: '#e8edf8',
    terminator: 0.12,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.5, 0.46, Z_A),
        lightDir: lightFromAbove(-0.12, -0.65),
        intensity: 0.76,
        spinAxis: [0, 1, 0],
        spinRate: -0.015,
      },
      {
        at: 0.25,
        position: viewportToWorld(0.3, 0.22, -5.0),
        lightDir: lightFromAbove(-0.85, -0.32),
        intensity: 0.8,
        spinAxis: [0.3, 0.9, 0.15],
        spinRate: -0.016,
      },
      {
        at: 0.5,
        position: viewportToWorld(0.18, 0.22, -5.5),
        lightDir: lightFromAbove(-0.55, -0.26),
        intensity: 0.82,
        spinAxis: [0.55, 0.7, 0.25],
        spinRate: -0.018,
      },
      {
        at: 0.75,
        position: viewportToWorld(0.22, 0.22, -6.0),
        lightDir: lightFromAbove(-0.7, -0.34),
        intensity: 0.84,
        spinAxis: [0.75, 0.5, 0.2],
        spinRate: -0.02,
      },
      {
        at: 1,
        position: viewportToWorld(0.22, 0.46, -5.0),
        lightDir: lightFromAbove(-0.95, -0.38),
        intensity: 0.8,
        spinAxis: [0.9, 0.25, 0.1],
        spinRate: -0.022,
      },
    ],
  },
  {
    id: 'B',
    radius: radiusFromDiameter(0.44, Z_B),
    normalScale: 0.4,
    tint: '#9ca1ad',
    segments: 96,
    lightColor: '#e8edf8',
    terminator: 0.12,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.5, 0.36, Z_B),
        lightDir: lightFromAbove(0.05, -0.6),
        intensity: 0.88,
        spinAxis: [0.15, 0.75, 0.65],
        spinRate: -0.036,
      },
      {
        at: 0.25,
        position: viewportToWorld(0.78, 0.22, 5.0),
        lightDir: lightFromAbove(0.85, -0.32),
        intensity: 0.82,
        spinAxis: [0.35, 0.55, 0.75],
        spinRate: -0.038,
      },
      {
        at: 0.5,
        position: viewportToWorld(0.22, 0.78, 5.0),
        lightDir: lightFromAbove(-0.45, -0.24),
        intensity: 0.84,
        spinAxis: [0.65, 0.25, 0.7],
        spinRate: -0.04,
      },
      {
        at: 0.75,
        position: viewportToWorld(0.3, 0.3, 5.5),
        lightDir: lightFromAbove(-0.35, -0.3),
        intensity: 0.82,
        spinAxis: [0.8, 0.2, 0.55],
        spinRate: -0.042,
      },
      {
        at: 1,
        position: viewportToWorld(0.62, 0.48, 5.5),
        lightDir: lightFromAbove(0.55, -0.3),
        intensity: 0.8,
        spinAxis: [0.85, 0.15, 0.45],
        spinRate: -0.044,
      },
    ],
  },
  {
    id: 'C',
    radius: radiusFromDiameter(0.57, Z_C),
    normalScale: 0.36,
    tint: '#90959f',
    segments: 96,
    lightColor: '#d8e0ec',
    terminator: 0.1,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.51, 0.66, Z_C),
        lightDir: lightFromBelow(0.08, -0.62),
        intensity: 0.75,
        spinAxis: [0.85, 0.15, 0.1],
        spinRate: 0.024,
      },
      {
        at: 0.25,
        position: viewportToWorld(0.3, 0.78, -4.0),
        lightDir: lightFromBelow(-0.85, -0.32),
        intensity: 0.8,
        spinAxis: [0.55, 0.45, 0.2],
        spinRate: 0.026,
      },
      {
        at: 0.5,
        position: viewportToWorld(0.78, 0.22, -4.5),
        lightDir: lightFromBelow(0.55, -0.26),
        intensity: 0.82,
        spinAxis: [0.35, 0.65, 0.3],
        spinRate: 0.028,
      },
      {
        at: 0.75,
        position: viewportToWorld(0.65, 0.65, -3.5),
        lightDir: lightFromBelow(0.15, -0.28),
        intensity: 0.8,
        spinAxis: [0.2, 0.8, 0.35],
        spinRate: 0.03,
      },
      {
        at: 1,
        position: viewportToWorld(0.78, 0.42, -3.5),
        lightDir: lightFromBelow(0.65, -0.34),
        intensity: 0.78,
        spinAxis: [0.1, 0.9, 0.3],
        spinRate: 0.032,
      },
    ],
  },
  {
    id: 'D',
    radius: radiusFromDiameter(0.22, Z_D),
    normalScale: 0.38,
    tint: '#b4bcc8',
    segments: 96,
    lightColor: '#d8e0ec',
    terminator: 0.1,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.5, 0.68, Z_D),
        lightDir: lightFromBelow(-0.12, -0.58),
        intensity: 0.9,
        spinAxis: [0.45, 0.45, 0.75],
        spinRate: 0.05,
      },
      {
        at: 0.25,
        position: viewportToWorld(0.78, 0.78, 4.5),
        lightDir: lightFromBelow(0.85, -0.32),
        intensity: 0.84,
        spinAxis: [0.55, 0.35, 0.75],
        spinRate: 0.052,
      },
      {
        at: 0.5,
        position: viewportToWorld(0.78, 0.78, 4.5),
        lightDir: lightFromBelow(0.45, -0.24),
        intensity: 0.84,
        spinAxis: [0.7, 0.45, 0.55],
        spinRate: 0.054,
      },
      {
        at: 0.75,
        position: viewportToWorld(0.78, 0.78, 4.0),
        lightDir: lightFromBelow(0.55, -0.3),
        intensity: 0.82,
        spinAxis: [0.45, 0.55, 0.65],
        spinRate: 0.056,
      },
      {
        at: 1,
        position: viewportToWorld(0.62, 0.58, 4.0),
        lightDir: lightFromBelow(0.45, -0.28),
        intensity: 0.8,
        spinAxis: [0.35, 0.65, 0.6],
        spinRate: 0.058,
      },
    ],
  },
]

const _lerpDir = new THREE.Vector3()
const _lerpSpinAxis = new THREE.Vector3()

/**
 * Interpolate shell pose at `progress` and write into `out`.
 *
 * Allocation strategy: no heap allocations — writes into pre-existing
 * Vector3 instances on `out`. Callers should keep one `ShellSample` (with
 * reused Vector3s) per shell and pass it every frame.
 */
export function sampleShellKeyframe(
  keyframes: ShellKeyframe[],
  progress: number,
  out: ShellSample,
): void {
  if (keyframes.length === 0) {
    out.position.set(0, 0, 0)
    out.lightDir.set(0, 1, 0)
    out.intensity = 0
    out.spinAxis.set(0, 1, 0)
    out.spinRate = 0
    return
  }

  if (keyframes.length === 1) {
    const k = keyframes[0]
    out.position.set(k.position[0], k.position[1], k.position[2])
    out.lightDir.set(k.lightDir[0], k.lightDir[1], k.lightDir[2]).normalize()
    out.intensity = k.intensity
    out.spinAxis
      .set(k.spinAxis[0], k.spinAxis[1], k.spinAxis[2])
      .normalize()
    out.spinRate = k.spinRate
    return
  }

  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  const t = THREE.MathUtils.clamp(progress, first.at, last.at)

  let i = 0
  while (i < keyframes.length - 1 && keyframes[i + 1].at < t) {
    i += 1
  }

  const a = keyframes[i]
  const b = keyframes[Math.min(i + 1, keyframes.length - 1)]
  const span = b.at - a.at
  const u = span > 0 ? (t - a.at) / span : 0

  out.position.set(
    THREE.MathUtils.lerp(a.position[0], b.position[0], u),
    THREE.MathUtils.lerp(a.position[1], b.position[1], u),
    THREE.MathUtils.lerp(a.position[2], b.position[2], u),
  )

  _lerpDir
    .set(
      THREE.MathUtils.lerp(a.lightDir[0], b.lightDir[0], u),
      THREE.MathUtils.lerp(a.lightDir[1], b.lightDir[1], u),
      THREE.MathUtils.lerp(a.lightDir[2], b.lightDir[2], u),
    )
    .normalize()
  out.lightDir.copy(_lerpDir)

  out.intensity = THREE.MathUtils.lerp(a.intensity, b.intensity, u)

  _lerpSpinAxis
    .set(
      THREE.MathUtils.lerp(a.spinAxis[0], b.spinAxis[0], u),
      THREE.MathUtils.lerp(a.spinAxis[1], b.spinAxis[1], u),
      THREE.MathUtils.lerp(a.spinAxis[2], b.spinAxis[2], u),
    )
    .normalize()
  out.spinAxis.copy(_lerpSpinAxis)

  out.spinRate = THREE.MathUtils.lerp(a.spinRate, b.spinRate, u)
}
