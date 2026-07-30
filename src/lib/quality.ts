export type QualityTier = 'high' | 'medium' | 'static'

type NavigatorWithHints = Navigator & { deviceMemory?: number }

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ?? canvas.getContext('webgl'),
    )
  } catch {
    return false
  }
}

/**
 * A recruiter opening this on 4G will close it before a heavy scene loads, so
 * capability is measured up front and the scene is downgraded or skipped.
 */
export function detectQuality(): QualityTier {
  if (typeof window === 'undefined') return 'static'
  if (prefersReducedMotion() || !hasWebGL()) return 'static'

  const nav = navigator as NavigatorWithHints
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 640

  if (cores <= 2 || memory <= 2) return 'static'
  if (cores <= 4 || (coarsePointer && smallViewport)) return 'medium'
  return 'high'
}

export function dprFor(tier: QualityTier): [number, number] {
  switch (tier) {
    // Retina density keeps crater rims crisp; text is DOM so canvas DPR only
    // pays for the spheres. Cap below 2× to stay fill-rate friendly.
    case 'high':
      return [1, 1.75]
    case 'medium':
      return [1, 1.25]
    case 'static':
      return [1, 1]
    default: {
      const exhaustive: never = tier
      return exhaustive
    }
  }
}
