import * as THREE from 'three'

/**
 * Scroll-driven pose for one shell at a given progress point.
 *
 * `lightDir` is the world-space direction **toward** the light source (same
 * convention as Lambert: `dot(N, lightDir)` is positive on the lit hemisphere).
 * Consumers normalise it; values here are pre-normalised for readability.
 */
export type ShellKeyframe = {
  at: number
  position: [number, number, number]
  lightDir: [number, number, number]
  intensity: number
}

export type ShellMotion = {
  id: 'A' | 'B' | 'C' | 'D'
  radius: number
  spin: number
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
}

const DEG = Math.PI / 180

/**
 * Vertical span of the view frustum (world units) at distance `d` from the
 * camera. Matches fov 42° and camera z ≈ 17 looking at the origin region.
 */
function viewHeightAtDistance(d: number): number {
  return 2 * d * Math.tan(21 * DEG)
}

/**
 * Map square-viewport centre fractions (0..1, y down) to world x/y at depth z.
 * Camera sits at z ≈ 17 on progress 0; shells are placed on staggered z planes.
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

/** Normalised direction toward a light above or below the shell. */
function lightFromAbove(tiltX = 0, tiltZ = 0.3): [number, number, number] {
  const v = new THREE.Vector3(tiltX, 1, tiltZ).normalize()
  return [v.x, v.y, v.z]
}

function lightFromBelow(tiltX = 0, tiltZ = 0.3): [number, number, number] {
  const v = new THREE.Vector3(tiltX, -1, tiltZ).normalize()
  return [v.x, v.y, v.z]
}

/**
 * Four nested crescents. Progress 0 matches the logo composition: A and B
 * top-lit, C and D bottom-lit, staggered vertically around a dark centre.
 */
export const SHELL_MOTIONS: ShellMotion[] = [
  {
    id: 'A',
    radius: 6.4,
    spin: -0.015,
    normalScale: 0.34,
    tint: '#737882',
    segments: 128,
    lightColor: '#dfe6f5',
    terminator: 0.22,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.5, 0.46, -5.2),
        lightDir: lightFromAbove(-0.28, 0.28),
        intensity: 1.35,
      },
      {
        at: 0.45,
        position: [0.75, 0.15, -3.4],
        lightDir: lightFromAbove(-0.12, 0.42),
        intensity: 1.15,
      },
      {
        at: 1,
        position: [1.15, -0.35, -1.6],
        lightDir: lightFromAbove(0.08, 0.52),
        intensity: 0.95,
      },
    ],
  },
  {
    id: 'B',
    radius: 2.25,
    spin: -0.036,
    normalScale: 0.45,
    tint: '#949aa6',
    segments: 112,
    lightColor: '#dfe6f5',
    terminator: 0.24,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.5, 0.37, -0.4),
        lightDir: lightFromAbove(0, 0.25),
        intensity: 1.45,
      },
      {
        at: 0.45,
        position: [-0.55, 0.85, -1.1],
        lightDir: lightFromAbove(0.12, 0.38),
        intensity: 1.25,
      },
      {
        at: 1,
        position: [-0.95, 0.25, -1.9],
        lightDir: lightFromAbove(0.22, 0.45),
        intensity: 1.05,
      },
    ],
  },
  {
    id: 'C',
    radius: 3.95,
    spin: 0.024,
    normalScale: 0.4,
    tint: '#848993',
    segments: 128,
    lightColor: '#c8d0e0',
    terminator: 0.26,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.51, 0.66, -2.4),
        lightDir: lightFromBelow(0.1, 0.32),
        intensity: 1.3,
      },
      {
        at: 0.45,
        position: [-0.35, -1.15, -0.9],
        lightDir: lightFromBelow(-0.05, 0.4),
        intensity: 1.1,
      },
      {
        at: 1,
        position: [0.45, -0.35, -0.35],
        lightDir: lightFromBelow(0.15, 0.48),
        intensity: 0.92,
      },
    ],
  },
  {
    id: 'D',
    radius: 1.15,
    spin: 0.05,
    normalScale: 0.42,
    tint: '#a8b2c4',
    segments: 96,
    lightColor: '#c8d0e0',
    terminator: 0.28,
    keyframes: [
      {
        at: 0,
        position: viewportToWorld(0.5, 0.69, 1.2),
        lightDir: lightFromBelow(-0.22, 0.26),
        intensity: 1.4,
      },
      {
        at: 0.45,
        position: [0.35, -0.95, 0.15],
        lightDir: lightFromBelow(-0.14, 0.36),
        intensity: 1.2,
      },
      {
        at: 1,
        position: [0.65, -0.15, -0.75],
        lightDir: lightFromBelow(-0.08, 0.46),
        intensity: 1.0,
      },
    ],
  },
]

const _lerpDir = new THREE.Vector3()

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
    return
  }

  if (keyframes.length === 1) {
    const k = keyframes[0]
    out.position.set(k.position[0], k.position[1], k.position[2])
    out.lightDir.set(k.lightDir[0], k.lightDir[1], k.lightDir[2]).normalize()
    out.intensity = k.intensity
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
}
