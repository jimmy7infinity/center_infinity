import * as THREE from 'three'

/**
 * Procedural lunar surface: an equirectangular base pass for the features you
 * can name (basins, crater rims, maria edges) plus a small repeating tile for
 * the grain you can only feel.
 *
 * The frequency ladder is the whole game here. Every layer is stored at a
 * resolution where its finest octave still spans at least two texels, so
 * nothing is sampled below Nyquist, and each layer is upsampled at most once.
 * An earlier version built all relief at a quarter resolution and upsampled it
 * twice, which turned the derivative into flat facets — the "old video game"
 * look. It also asked for noise periods up to 11x the storage width, so the
 * layers that were supposed to supply fine detail were just aliased hash.
 */

const WIDTH = 2048
const HEIGHT = 1024

/**
 * Micro-relief is tiled rather than baked into the base map. At this repeat it
 * resolves like an 8192x4096 equirect map for 1/32 of the pixels, which is the
 * only way to stay crisp when a shell fills the frame. The u repeat must be a
 * whole number so the tile still meets itself at the longitude seam.
 */
const DETAIL_SIZE = 512
const DETAIL_REPEAT_U = 8
const DETAIL_REPEAT_V = 4

const ANISOTROPY = 12

/**
 * Relative reflectance of the two terrain types. Absolute level does not matter:
 * the map is rescaled so its mean is exactly 1.0, which keeps the shell
 * keyframe intensities calibrated no matter how this contrast is retuned.
 */
const HIGHLAND_ALBEDO = 1.04
const MARIA_ALBEDO = 0.63
const ICE_HIGHLAND_ALBEDO = 1.12
const ICE_MARIA_ALBEDO = 0.78
const ALBEDO_ENCODE_RANGE = 2.5

const EINK_MIN = 0.12
const EINK_MAX = 0.82

export type PlanetKind = 'moon' | 'jupiter' | 'venus' | 'ice'

type CraterKind = 'basin' | 'medium' | 'small' | 'secondary'

interface CraterSpec {
  x: number
  y: number
  radius: number
  depth: number
  rimHeight: number
  ejecta: number
  rimCenter: number
  rimWidth: number
  floorEnd: number
  /**
   * How recently it was excavated, 0..1. Fresh impacts expose unweathered
   * regolith, so they read as bright rims and ejecta blankets rather than as
   * relief. Distribution is deliberately lopsided: most craters are ancient.
   */
  freshness: number
  /** Darkening of the floor from ponded melt, 0..1, large craters only. */
  darkFloor: number
}

interface NoiseLayer {
  data: Float32Array
  width: number
  height: number
}

/**
 * Integer bit-mixing hash. Replaces a `Math.sin(dot)` hash, which was both an
 * order of magnitude slower — it gated how much detail we could afford — and
 * visibly structured, contributing its own patterning to the surface.
 */
function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 0x6f1b_c1f9) ^ Math.imul(y | 0, 0x27d4_eb2f)
  h = Math.imul(h ^ seed, 0x85eb_ca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2_ae35)
  h ^= h >>> 16
  return (h >>> 0) / 0x1_0000_0000
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** A period of 0 means that axis does not wrap. */
function wrapIndex(i: number, period: number) {
  if (period <= 0) return i
  return ((i % period) + period) % period
}

/**
 * Value noise that repeats exactly every `periodX`/`periodY` lattice cells.
 *
 * The base map is wrapped around a sphere, so any mismatch between u=1 and u=0
 * is a genuine cliff in the height field, and the Sobel pass below reports that
 * cliff faithfully as a hard vertical seam. Latitude does not wrap, so callers
 * pass periodY = 0 for the base map and DETAIL_SIZE for the tile.
 */
function valueNoise(
  x: number,
  y: number,
  seed: number,
  periodX: number,
  periodY: number,
) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smoothstep(0, 1, x - xi)
  const yf = smoothstep(0, 1, y - yi)

  const x0 = wrapIndex(xi, periodX)
  const x1 = wrapIndex(xi + 1, periodX)
  const y0 = wrapIndex(yi, periodY)
  const y1 = wrapIndex(yi + 1, periodY)

  const a = hash2(x0, y0, seed)
  const b = hash2(x1, y0, seed)
  const c = hash2(x0, y1, seed)
  const d = hash2(x1, y1, seed)

  return (
    a * (1 - xf) * (1 - yf) +
    b * xf * (1 - yf) +
    c * (1 - xf) * yf +
    d * xf * yf
  )
}

/**
 * Octaves double in frequency — exactly 2, not 2.05 — so every octave's period
 * stays a whole number of lattice cells and the sum is still seamless.
 */
function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  periodX: number,
  periodY: number,
) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    value +=
      valueNoise(
        x * frequency,
        y * frequency,
        seed + i,
        periodX * frequency,
        periodY * frequency,
      ) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / total
}

/**
 * `periodU` is both the horizontal scale and the wrap period, in whole cells
 * across 360° of longitude. Keep `periodU * 2 ** (octaves - 1) <= width / 2` or
 * the finest octave aliases.
 */
function buildNoiseLayer(
  width: number,
  height: number,
  periodU: number,
  scaleV: number,
  seed: number,
  octaves: number,
): NoiseLayer {
  const finest = periodU * 2 ** (octaves - 1)
  if (finest > width / 2) {
    throw new Error(
      `Noise layer aliases: finest octave period ${finest} exceeds Nyquist ${width / 2}`,
    )
  }

  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const v = (y / height) * scaleV
    for (let x = 0; x < width; x++) {
      const u = (x / width) * periodU
      data[y * width + x] = fbm(u, v, seed, octaves, periodU, 0)
    }
  }
  return { data, width, height }
}

/** Wraps in u (longitude is cyclic) and clamps in v (the poles are not). */
function sampleLayer(layer: NoiseLayer, u: number, v: number) {
  const fx = u * layer.width
  const fy = v * (layer.height - 1)
  const ix = Math.floor(fx)
  const iy = Math.max(0, Math.min(layer.height - 1, Math.floor(fy)))
  const x0 = wrapIndex(ix, layer.width)
  const x1 = wrapIndex(ix + 1, layer.width)
  const y1 = Math.min(layer.height - 1, iy + 1)
  const tx = fx - ix
  const ty = Math.max(0, Math.min(1, fy - iy))

  const rowA = iy * layer.width
  const rowB = y1 * layer.width
  const a = layer.data[rowA + x0] * (1 - tx) + layer.data[rowA + x1] * tx
  const b = layer.data[rowB + x0] * (1 - tx) + layer.data[rowB + x1] * tx
  return a * (1 - ty) + b * ty
}

function wrappedDelta(x: number, cx: number, width: number) {
  let dx = x - cx
  if (dx > width * 0.5) dx -= width
  if (dx < -width * 0.5) dx += width
  return dx
}

function craterOuter(crater: CraterSpec) {
  return crater.ejecta > 0.008 || crater.freshness > 0.25 ? 1.55 : 1.22
}

function craterHeightProfile(dist: number, crater: CraterSpec) {
  const t = dist / crater.radius
  if (t > craterOuter(crater)) return 0

  let h = 0

  if (t < crater.floorEnd) {
    const ft = t / crater.floorEnd
    const bowl = 1 - ft * ft
    h -= crater.depth * bowl * (1 - 0.18 * ft)
  }

  const rimDist = Math.abs(t - crater.rimCenter) / crater.rimWidth
  if (rimDist < 1) {
    const rim = 1 - rimDist
    h += crater.rimHeight * rim * rim * rim * rim
  }

  if (crater.ejecta > 0.008 && t > 0.86 && t < 1.38) {
    const et = (t - 0.86) / 0.52
    h += crater.ejecta * Math.sin(et * Math.PI) * (1 - et) * (1 - et)
  }

  return h
}

/**
 * Reflectance, separate from relief. Shading alone cannot produce the tonal
 * range of a real lunar photograph: the bright rays around a fresh crater and
 * the dark basalt of a mare are differences in what the ground reflects, not in
 * which way it faces.
 */
function craterAlbedoProfile(dist: number, crater: CraterSpec) {
  const outer = craterOuter(crater)
  const t = dist / crater.radius
  if (t > outer) return 0

  let a = 0

  // Every crater gets a faint bright rim and dark floor whatever its age. Only
  // the fresh ones get the dramatic ejecta blanket. Without the age-independent
  // part, craters disappear wherever the surface faces the light directly and
  // shading has no contrast left to reveal them — which is most of a lit disc.
  const rimDist = Math.abs(t - crater.rimCenter) / (crater.rimWidth * 2.6)
  if (rimDist < 1) {
    const rim = 1 - rimDist
    a += (0.055 + crater.freshness * 0.34) * rim * rim
  }

  if (crater.freshness > 0.02 && t > crater.rimCenter) {
    const et = (t - crater.rimCenter) / (outer - crater.rimCenter)
    const fade = 1 - et
    a += crater.freshness * 0.26 * fade * fade
  }

  if (t < crater.floorEnd) {
    const ft = t / crater.floorEnd
    a -= (0.05 + crater.darkFloor) * (1 - ft * ft)
  }

  return a
}

function makeCrater(
  x: number,
  y: number,
  radius: number,
  kind: CraterKind,
  seed: number,
): CraterSpec {
  const rNorm = radius / 70
  const jitter = hash2(Math.round(x), Math.round(y), seed)
  // Cubed so the bright, obviously-recent craters stay rare; most of the
  // surface is ancient and tonally flat, which is what makes the few fresh
  // ones read as fresh.
  const fresh = hash2(Math.round(x) + 7919, Math.round(y) + 104_729, seed + 3)
  const freshness = fresh * fresh * fresh

  switch (kind) {
    case 'basin': {
      return {
        x,
        y,
        radius,
        depth: 0.34 + jitter * 0.22,
        rimHeight: 0.12 + jitter * 0.08,
        ejecta: 0.035 + jitter * 0.03,
        rimCenter: 0.72 + jitter * 0.05,
        rimWidth: 0.065 + jitter * 0.018,
        floorEnd: 0.54 + jitter * 0.05,
        freshness: freshness * 0.7,
        darkFloor: 0.1 + jitter * 0.12,
      }
    }
    case 'medium': {
      return {
        x,
        y,
        radius,
        depth: 0.18 + jitter * 0.14 + rNorm * 0.06,
        rimHeight: 0.085 + jitter * 0.06,
        ejecta: 0.022 + jitter * 0.025,
        rimCenter: 0.74 + jitter * 0.05,
        rimWidth: 0.052 + jitter * 0.014,
        floorEnd: 0.5 + jitter * 0.06,
        freshness,
        darkFloor: jitter > 0.6 ? 0.06 + jitter * 0.06 : 0,
      }
    }
    case 'secondary': {
      return {
        x,
        y,
        radius,
        depth: 0.13 + jitter * 0.1,
        rimHeight: 0.065 + jitter * 0.045,
        ejecta: 0.012 + jitter * 0.015,
        rimCenter: 0.76 + jitter * 0.045,
        rimWidth: 0.046 + jitter * 0.012,
        floorEnd: 0.48 + jitter * 0.05,
        freshness,
        darkFloor: 0,
      }
    }
    case 'small': {
      return {
        x,
        y,
        radius,
        depth: 0.07 + jitter * 0.07 + rNorm * 0.03,
        rimHeight: 0.042 + jitter * 0.035,
        ejecta: 0.004 + jitter * 0.008,
        rimCenter: 0.78 + jitter * 0.04,
        rimWidth: 0.038 + jitter * 0.01,
        floorEnd: 0.44 + jitter * 0.05,
        freshness,
        darkFloor: 0,
      }
    }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled crater kind: ${_exhaustive}`)
    }
  }
}

/**
 * Impact crater diameters follow a power law, and getting that distribution
 * right matters more than the count: a uniform spread reads as evenly-sized
 * polka dots, which is a large part of why procedural craters look fake.
 */
function powerLawRadius(u: number, min: number, max: number, exponent: number) {
  return Math.min(max, min * Math.pow(Math.max(u, 1e-4), -1 / exponent))
}

function addSecondaryCluster(
  craters: CraterSpec[],
  parent: CraterSpec,
  seed: number,
  maxCount: number,
  minRadius: number,
) {
  const count =
    2 + Math.floor(hash2(Math.round(parent.x), Math.round(parent.y), seed) * maxCount)
  for (let j = 0; j < count; j++) {
    const angle = hash2(j, Math.round(parent.x), seed + 11) * Math.PI * 2
    const dist = parent.radius * (1.1 + hash2(j, Math.round(parent.y), seed + 17) * 1.75)
    const sx = (parent.x + Math.cos(angle) * dist + WIDTH) % WIDTH
    const sy = Math.min(HEIGHT - 1, Math.max(0, parent.y + Math.sin(angle) * dist))
    const sr =
      minRadius +
      hash2(j, Math.round(parent.radius), seed + 23) *
        Math.min(parent.radius * 0.18, 4.2)
    craters.push(makeCrater(sx, sy, sr, 'secondary', seed + j * 31))
  }
}

/**
 * Craters below about two texels cannot be resolved by the base map — they
 * arrive as grey mush that flattens everything around them — so the smallest
 * ones live in the detail tile instead.
 */
const BASE_MIN_CRATER_RADIUS = 2.6

type CraterDensity = 'full' | 'light' | 'dense'

function buildCraterField(density: CraterDensity = 'full'): CraterSpec[] {
  const craters: CraterSpec[] = []

  const basinCount = density === 'light' ? 3 : 5
  const mediumCount = density === 'light' ? 450 : density === 'dense' ? 900 : 900
  const smallCount =
    density === 'light' ? 2600 : density === 'dense' ? 7800 : 5200

  for (let i = 0; i < basinCount; i++) {
    const x = hash2(i, 1, 5) * WIDTH
    const y = hash2(i, 2, 9) * HEIGHT
    const radius = 12 + hash2(i, 3, 13) * 12
    const basin = makeCrater(x, y, radius, 'basin', 100 + i)
    craters.push(basin)
    if (hash2(i, 4, 19) > 0.35) {
      addSecondaryCluster(craters, basin, 200 + i * 17, 4, BASE_MIN_CRATER_RADIUS)
    }
  }

  for (let i = 0; i < mediumCount; i++) {
    const x = hash2(i, 5, 27) * WIDTH
    const y = hash2(i, 6, 33) * HEIGHT
    const radius = powerLawRadius(hash2(i, 7, 41), 3.4, 13, 2.1)
    const medium = makeCrater(x, y, radius, 'medium', 400 + i)
    craters.push(medium)
    if (radius > 7 && hash2(i, 8, 47) > 0.68) {
      addSecondaryCluster(craters, medium, 500 + i * 13, 3, BASE_MIN_CRATER_RADIUS)
    }
  }

  for (let i = 0; i < smallCount; i++) {
    const x = hash2(i, 9, 53) * WIDTH
    const y = hash2(i, 10, 59) * HEIGHT
    const radius = powerLawRadius(hash2(i, 11, 61), BASE_MIN_CRATER_RADIUS, 4.4, 2.6)
    craters.push(makeCrater(x, y, radius, 'small', 700 + i))
  }

  // Large first: rims of later, smaller impacts should sit on top.
  craters.sort((a, b) => b.radius - a.radius)
  return craters
}

/**
 * Terrain and reflectance in one pass. Relief is assembled from layers whose
 * storage matches their frequency: the continental and maria fields are
 * genuinely low frequency and upsampled 4x, the highland and regolith fields
 * carry mid detail and are upsampled 2x, craters are stamped at full
 * resolution, and everything below that is the detail tile's job.
 */
function buildBaseFields() {
  const mariaMask = buildNoiseLayer(512, 256, 6, 3.15, 7, 4)
  const continental = buildNoiseLayer(512, 256, 14, 6.75, 3, 4)
  const mariaDetail = buildNoiseLayer(512, 256, 28, 14.4, 17, 3)
  const highlandDetail = buildNoiseLayer(1024, 512, 64, 32, 11, 3)
  const regolith = buildNoiseLayer(1024, 512, 168, 84, 19, 2)
  const mottle = buildNoiseLayer(1024, 512, 96, 48, 29, 2)

  const heights = new Float32Array(WIDTH * HEIGHT)
  const albedo = new Float32Array(WIDTH * HEIGHT)

  for (let y = 0; y < HEIGHT; y++) {
    const v = y / (HEIGHT - 1)
    const row = y * WIDTH
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH

      const maria = smoothstep(0.34, 0.66, sampleLayer(mariaMask, u, v))
      const highland = 1 - maria
      const cont = sampleLayer(continental, u, v)
      const reg = sampleLayer(regolith, u, v)

      const mariaRelief =
        cont * 0.05 + sampleLayer(mariaDetail, u, v) * 0.09 + reg * 0.05
      const highlandRelief =
        cont * 0.2 + sampleLayer(highlandDetail, u, v) * 0.3 + reg * 0.34

      heights[row + x] = mariaRelief * maria + highlandRelief * highland

      albedo[row + x] =
        HIGHLAND_ALBEDO * highland +
        MARIA_ALBEDO * maria +
        (sampleLayer(mottle, u, v) - 0.5) * 0.09 +
        (cont - 0.5) * 0.06 +
        (reg - 0.5) * 0.05 * highland
    }
  }

  return { heights, albedo }
}

interface StormSpec {
  x: number
  y: number
  radiusX: number
  radiusY: number
  strength: number
}

function stampStorm(
  heights: Float32Array,
  albedo: Float32Array,
  storm: StormSpec,
) {
  const outerX = storm.radiusX * 1.35
  const outerY = storm.radiusY * 1.35
  const xStart = Math.floor(storm.x - outerX)
  const xEnd = Math.ceil(storm.x + outerX)
  const y0 = Math.max(0, Math.floor(storm.y - outerY))
  const y1 = Math.min(HEIGHT - 1, Math.ceil(storm.y + outerY))

  for (let y = y0; y <= y1; y++) {
    const dy = (y - storm.y) / outerY
    const row = y * WIDTH
    for (let xi = xStart; xi <= xEnd; xi++) {
      const dx = wrappedDelta(xi, storm.x, WIDTH) / outerX
      const dist = Math.hypot(dx, dy)
      if (dist > 1) continue
      const falloff = 1 - dist * dist
      const bump = storm.strength * falloff * falloff
      const index = row + wrapIndex(xi, WIDTH)
      heights[index] += bump * 0.08
      albedo[index] += bump * 0.14
    }
  }
}

/** Banded gas-giant look: horizontal domain-warped noise plus soft storm ovals. */
function buildJupiterFields() {
  const warpLayer = buildNoiseLayer(512, 256, 8, 4, 41, 3)
  const bandLayer = buildNoiseLayer(1024, 512, 32, 16, 43, 4)
  const fineBand = buildNoiseLayer(1024, 512, 96, 48, 47, 3)

  const heights = new Float32Array(WIDTH * HEIGHT)
  const albedo = new Float32Array(WIDTH * HEIGHT)

  for (let y = 0; y < HEIGHT; y++) {
    const v = y / (HEIGHT - 1)
    const row = y * WIDTH
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH
      const warp = (sampleLayer(warpLayer, u, v) - 0.5) * 0.38
      const bandCoord = u * 26 + warp
      const bands =
        sampleLayer(bandLayer, bandCoord * 0.09, v) * 0.62 +
        sampleLayer(fineBand, bandCoord * 0.17, v * 1.8) * 0.38

      heights[row + x] = (bands - 0.5) * 0.16 + warp * 0.035
      albedo[row + x] =
        0.7 +
        bands * 0.24 +
        (sampleLayer(fineBand, u * 52, v * 28) - 0.5) * 0.07
    }
  }

  for (let i = 0; i < 9; i++) {
    stampStorm(heights, albedo, {
      x: hash2(i, 131, 3) * WIDTH,
      y: hash2(i, 137, 5) * HEIGHT,
      radiusX: 18 + hash2(i, 139, 7) * 26,
      radiusY: 10 + hash2(i, 149, 11) * 18,
      strength: 0.55 + hash2(i, 151, 13) * 0.35,
    })
  }

  return { heights, albedo }
}

/** Ridged filament albedo with gentler relief — fewer craters applied later. */
function buildVenusFields() {
  const ridgeBase = buildNoiseLayer(1024, 512, 48, 24, 51, 4)
  const ridgeFine = buildNoiseLayer(1024, 512, 128, 64, 53, 3)
  const swirl = buildNoiseLayer(512, 256, 12, 6, 57, 3)

  const heights = new Float32Array(WIDTH * HEIGHT)
  const albedo = new Float32Array(WIDTH * HEIGHT)

  for (let y = 0; y < HEIGHT; y++) {
    const v = y / (HEIGHT - 1)
    const row = y * WIDTH
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH
      const r1 = 1 - Math.abs(sampleLayer(ridgeBase, u, v) * 2 - 1)
      const r2 = 1 - Math.abs(sampleLayer(ridgeFine, u * 2.4, v * 2.1) * 2 - 1)
      const ridge = r1 * 0.68 + r2 * 0.32
      const twist = (sampleLayer(swirl, u * 3.2, v * 2.8) - 0.5) * 0.12

      heights[row + x] = (ridge - 0.5) * 0.09 + twist * 0.04
      albedo[row + x] = 0.66 + ridge * 0.3 + twist * 0.08
    }
  }

  return { heights, albedo }
}

/** Brighter icy regolith — same maria/highland split as the moon, lifted albedo. */
function buildIceFields() {
  const mariaMask = buildNoiseLayer(512, 256, 6, 3.15, 7, 4)
  const continental = buildNoiseLayer(512, 256, 14, 6.75, 3, 4)
  const mariaDetail = buildNoiseLayer(512, 256, 28, 14.4, 17, 3)
  const highlandDetail = buildNoiseLayer(1024, 512, 64, 32, 11, 3)
  const regolith = buildNoiseLayer(1024, 512, 168, 84, 19, 2)
  const mottle = buildNoiseLayer(1024, 512, 96, 48, 29, 2)
  const frost = buildNoiseLayer(1024, 512, 220, 110, 37, 2)

  const heights = new Float32Array(WIDTH * HEIGHT)
  const albedo = new Float32Array(WIDTH * HEIGHT)

  for (let y = 0; y < HEIGHT; y++) {
    const v = y / (HEIGHT - 1)
    const row = y * WIDTH
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH

      const maria = smoothstep(0.38, 0.62, sampleLayer(mariaMask, u, v))
      const highland = 1 - maria
      const cont = sampleLayer(continental, u, v)
      const reg = sampleLayer(regolith, u, v)
      const micro = sampleLayer(frost, u, v)

      const mariaRelief =
        cont * 0.04 + sampleLayer(mariaDetail, u, v) * 0.07 + reg * 0.04
      const highlandRelief =
        cont * 0.16 +
        sampleLayer(highlandDetail, u, v) * 0.26 +
        reg * 0.28 +
        (micro - 0.5) * 0.06

      heights[row + x] = mariaRelief * maria + highlandRelief * highland

      albedo[row + x] =
        ICE_HIGHLAND_ALBEDO * highland +
        ICE_MARIA_ALBEDO * maria +
        (sampleLayer(mottle, u, v) - 0.5) * 0.08 +
        (cont - 0.5) * 0.05 +
        (reg - 0.5) * 0.04 * highland +
        (micro - 0.5) * 0.06
    }
  }

  return { heights, albedo }
}

function buildPlanetBaseFields(kind: PlanetKind) {
  switch (kind) {
    case 'moon':
      return buildBaseFields()
    case 'jupiter':
      return buildJupiterFields()
    case 'venus':
      return buildVenusFields()
    case 'ice':
      return buildIceFields()
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled planet kind: ${_exhaustive}`)
    }
  }
}

function craterDensityFor(kind: PlanetKind): CraterDensity {
  switch (kind) {
    case 'moon':
      return 'full'
    case 'jupiter':
    case 'venus':
      return 'light'
    case 'ice':
      return 'dense'
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled planet kind: ${_exhaustive}`)
    }
  }
}

function applyEinkBias(kind: PlanetKind, value: number): number {
  switch (kind) {
    case 'moon':
      return value
    case 'jupiter':
      return value
    case 'venus':
      return value * 1.04 + 0.02
    case 'ice':
      return value * 1.06 + 0.03
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled planet kind: ${_exhaustive}`)
    }
  }
}

function stampCrater(
  heights: Float32Array,
  albedo: Float32Array,
  crater: CraterSpec,
) {
  const outer = crater.radius * craterOuter(crater)
  const outerSq = outer * outer
  const xStart = Math.floor(crater.x - outer)
  const xEnd = Math.ceil(crater.x + outer)
  const y0 = Math.max(0, Math.floor(crater.y - outer))
  const y1 = Math.min(HEIGHT - 1, Math.ceil(crater.y + outer))

  for (let y = y0; y <= y1; y++) {
    const dy = y - crater.y
    const row = y * WIDTH
    // Unclamped in x so craters straddling the seam land on both sides of it.
    for (let xi = xStart; xi <= xEnd; xi++) {
      const dx = wrappedDelta(xi, crater.x, WIDTH)
      const distSq = dx * dx + dy * dy
      if (distSq > outerSq) continue
      const dist = Math.sqrt(distSq)
      const index = row + wrapIndex(xi, WIDTH)
      heights[index] += craterHeightProfile(dist, crater)
      albedo[index] += craterAlbedoProfile(dist, crater)
    }
  }
}

/**
 * Converts a height field to a tangent-space normal map with a Sobel filter.
 * A normal map costs one texture fetch per fragment, where three.js bump
 * mapping costs three plus derivative instructions — and these spheres cover
 * the whole viewport, so that difference dominates the frame time.
 */
function heightsToNormalCanvas(
  heights: Float32Array,
  width: number,
  height: number,
  strength: number,
  wrapV: boolean,
  /**
   * Replaces the z component with the height itself, centred on 0.5. Only for
   * the detail tile, whose z the shader never reads — it takes z from the base
   * map — so the channel is free to carry micro-scale tone instead.
   */
  packHeightIntoBlue = false,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for normal map')

  const out = ctx.createImageData(width, height)
  const data = out.data

  let toneMean = 0
  let toneScale = 0
  if (packHeightIntoBlue) {
    for (let i = 0; i < heights.length; i++) toneMean += heights[i]
    toneMean /= heights.length
    let deviation = 0
    for (let i = 0; i < heights.length; i++) {
      deviation += (heights[i] - toneMean) ** 2
    }
    // Two standard deviations spans the encodable range, so the handful of
    // extreme crater floors clip rather than compressing everything else.
    toneScale = 1 / (2 * Math.sqrt(deviation / heights.length) || 1)
  }

  for (let y = 0; y < height; y++) {
    const ym = wrapV ? (y - 1 + height) % height : Math.max(0, y - 1)
    const yp = wrapV ? (y + 1) % height : Math.min(height - 1, y + 1)
    const row = y * width
    const rowM = ym * width
    const rowP = yp * width

    for (let x = 0; x < width; x++) {
      const xm = (x - 1 + width) % width
      const xp = (x + 1) % width
      const dx =
        heights[rowM + xm] +
        2 * heights[row + xm] +
        heights[rowP + xm] -
        (heights[rowM + xp] + 2 * heights[row + xp] + heights[rowP + xp])
      const dy =
        heights[rowM + xm] +
        2 * heights[rowM + x] +
        heights[rowM + xp] -
        (heights[rowP + xm] + 2 * heights[rowP + x] + heights[rowP + xp])

      const nx = dx * strength
      const ny = dy * strength
      const len = Math.hypot(nx, ny, 1)

      const i = (row + x) * 4
      data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      data[i + 2] = packHeightIntoBlue
        ? Math.round(
            Math.min(
              255,
              Math.max(
                0,
                (0.5 + (heights[row + x] - toneMean) * toneScale) * 255,
              ),
            ),
          )
        : Math.round((1 / len) * 0.5 * 255 + 127.5)
      data[i + 3] = 255
    }
  }

  ctx.putImageData(out, 0, 0)
  return canvas
}

function albedoToCanvas(albedo: Float32Array, kind: PlanetKind): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for albedo map')

  const out = ctx.createImageData(WIDTH, HEIGHT)
  const data = out.data

  let sum = 0
  for (let i = 0; i < albedo.length; i++) sum += albedo[i]
  const gain = albedo.length / (sum || 1)

  const normalized = new Float32Array(albedo.length)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < albedo.length; i++) {
    const v = albedo[i] * gain
    normalized[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min || 1

  for (let i = 0; i < albedo.length; i++) {
    const t = (normalized[i] - min) / span
    const curved = EINK_MIN + t * (EINK_MAX - EINK_MIN)
    const biased = applyEinkBias(kind, curved)
    const encoded = Math.round(
      Math.min(
        255,
        Math.max(0, (biased / ALBEDO_ENCODE_RANGE) * 255),
      ),
    )
    const o = i * 4
    data[o] = encoded
    data[o + 1] = encoded
    data[o + 2] = encoded
    data[o + 3] = 255
  }

  ctx.putImageData(out, 0, 0)
  return canvas
}

/**
 * A seamless tile of micro-relief: dense small craters plus regolith grain,
 * wrapped in both axes so it can repeat across the sphere. This is where the
 * close-range crispness comes from — detail at this frequency cannot fit in an
 * equirect map we can afford to generate.
 *
 * Weighted towards craters over grain on purpose. Grain at the texel scale
 * minifies into sparkle, and near the terminator — where a narrow lit band
 * turns any normal perturbation into a hard on/off decision — that sparkle
 * reads as glitter rather than rock. Craters carry structure that survives
 * mipmapping.
 */
function buildDetailCanvas(kind: PlanetKind): HTMLCanvasElement {
  const size = DETAIL_SIZE
  const heights = new Float32Array(size * size)
  const grainFreq = kind === 'ice' ? 64 : 48
  const grainMix = kind === 'ice' ? 0.38 : 0.28

  for (let y = 0; y < size; y++) {
    const row = y * size
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * 16
      const gy = (y / size) * 16
      const fx = (x / size) * grainFreq
      const fy = (y / size) * grainFreq
      heights[row + x] =
        fbm(gx, gy, 71, 4, 16, 16) * (1 - grainMix) +
        fbm(fx, fy, 83, 2, grainFreq, grainFreq) * grainMix
    }
  }

  const craters =
    kind === 'ice' ? 4800 : kind === 'jupiter' || kind === 'venus' ? 1800 : 3400
  for (let i = 0; i < craters; i++) {
    const cx = hash2(i, 91, 3) * size
    const cy = hash2(i, 97, 5) * size
    const radius = powerLawRadius(hash2(i, 101, 7), 1.7, 11, 2.4)
    const jitter = hash2(i, 103, 11)
    const depth = 0.5 + jitter * 0.5
    const rimHeight = 0.22 + jitter * 0.2

    const outer = radius * 1.24
    const outerSq = outer * outer
    for (let yi = Math.floor(cy - outer); yi <= Math.ceil(cy + outer); yi++) {
      const dy = wrappedDelta(yi, cy, size)
      const row = wrapIndex(yi, size) * size
      for (let xi = Math.floor(cx - outer); xi <= Math.ceil(cx + outer); xi++) {
        const dx = wrappedDelta(xi, cx, size)
        const distSq = dx * dx + dy * dy
        if (distSq > outerSq) continue
        const t = Math.sqrt(distSq) / radius
        let h = 0
        if (t < 0.62) {
          const ft = t / 0.62
          h -= depth * (1 - ft * ft)
        }
        const rimDist = Math.abs(t - 0.84) / 0.3
        if (rimDist < 1) {
          const rim = 1 - rimDist
          h += rimHeight * rim * rim
        }
        heights[row + wrapIndex(xi, size)] += h
      }
    }
  }

  return heightsToNormalCanvas(
    heights,
    size,
    size,
    kind === 'venus' ? 0.32 : 0.42,
    true,
    true,
  )
}

export interface LunarSurface {
  normalMap: THREE.Texture
  albedoMap: THREE.Texture
  detailMap: THREE.Texture
  detailRepeat: THREE.Vector2
}

const surfaceCache = new Map<PlanetKind, LunarSurface>()

function normalStrengthFor(kind: PlanetKind): number {
  switch (kind) {
    case 'moon':
      return 1.1
    case 'jupiter':
      return 0.85
    case 'venus':
      return 0.65
    case 'ice':
      return 1.05
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled planet kind: ${_exhaustive}`)
    }
  }
}

function bakePlanetSurface(kind: PlanetKind): LunarSurface {
  const { heights, albedo } = buildPlanetBaseFields(kind)
  for (const crater of buildCraterField(craterDensityFor(kind))) {
    stampCrater(heights, albedo, crater)
  }

  const normalMap = new THREE.CanvasTexture(
    heightsToNormalCanvas(
      heights,
      WIDTH,
      HEIGHT,
      normalStrengthFor(kind),
      false,
    ),
  )
  const albedoMap = new THREE.CanvasTexture(albedoToCanvas(albedo, kind))
  const detailMap = new THREE.CanvasTexture(buildDetailCanvas(kind))

  for (const texture of [normalMap, albedoMap]) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
  }
  detailMap.wrapS = THREE.RepeatWrapping
  detailMap.wrapT = THREE.RepeatWrapping

  for (const texture of [normalMap, albedoMap, detailMap]) {
    texture.colorSpace = THREE.NoColorSpace
    texture.anisotropy = ANISOTROPY
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
  }

  return {
    normalMap,
    albedoMap,
    detailMap,
    detailRepeat: new THREE.Vector2(DETAIL_REPEAT_U, DETAIL_REPEAT_V),
  }
}

/**
 * Generated at runtime instead of shipped as image files. One baked surface per
 * planet kind, cached for the lifetime of the module.
 */
export function createPlanetSurface(kind: PlanetKind): LunarSurface {
  const existing = surfaceCache.get(kind)
  if (existing) return existing

  const surface = bakePlanetSurface(kind)
  surfaceCache.set(kind, surface)
  return surface
}

/** @deprecated Use {@link createPlanetSurface} with `'moon'`. */
export function createLunarSurface(): LunarSurface {
  return createPlanetSurface('moon')
}
