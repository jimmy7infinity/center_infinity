import * as THREE from 'three'

const WIDTH = 2048
const HEIGHT = 1024
const MIN_CRATER_RADIUS = 1.5
const NORMAL_STRENGTH = 1.52
const ANISOTROPY = 12

type CraterKind = 'basin' | 'medium' | 'small' | 'secondary' | 'micro'

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
}

interface NoiseLayer {
  data: Float32Array
  width: number
  height: number
}

function hash2(x: number, y: number, seed: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function wrapIndex(i: number, period: number) {
  return ((i % period) + period) % period
}

/**
 * Value noise that repeats exactly every `periodX` lattice cells.
 *
 * This map is wrapped around a sphere, so any mismatch between u=1 and u=0 is a
 * genuine cliff in the height field. The Sobel pass below reports that cliff
 * faithfully, which is what produced the hard vertical seam that looked like two
 * hemispheres stitched together.
 */
function valueNoise(x: number, y: number, seed: number, periodX: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smoothstep(0, 1, x - xi)
  const yf = smoothstep(0, 1, y - yi)

  const x0 = wrapIndex(xi, periodX)
  const x1 = wrapIndex(xi + 1, periodX)

  const a = hash2(x0, yi, seed)
  const b = hash2(x1, yi, seed)
  const c = hash2(x0, yi + 1, seed)
  const d = hash2(x1, yi + 1, seed)

  return (
    a * (1 - xf) * (1 - yf) +
    b * xf * (1 - yf) +
    c * (1 - xf) * yf +
    d * xf * yf
  )
}

/**
 * Octaves double in frequency — exactly 2, not 2.05 — so every octave's period
 * stays a whole number of lattice cells and the summed field is still seamless.
 */
function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  periodX: number,
) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    value +=
      valueNoise(x * frequency, y * frequency, seed + i, periodX * frequency) *
      amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / total
}

/**
 * `periodU` must be a whole number of noise cells across the full 360° of
 * longitude — it is both the horizontal scale and the wrap period.
 */
function buildNoiseLayer(
  layerWidth: number,
  layerHeight: number,
  periodU: number,
  scaleV: number,
  offsetU: number,
  offsetV: number,
  seed: number,
  octaves: number,
): NoiseLayer {
  const data = new Float32Array(layerWidth * layerHeight)
  for (let y = 0; y < layerHeight; y++) {
    const v = (y / layerHeight) * scaleV + offsetV
    for (let x = 0; x < layerWidth; x++) {
      const u = (x / layerWidth) * periodU + offsetU
      data[y * layerWidth + x] = fbm(u, v, seed, octaves, periodU)
    }
  }
  return { data, width: layerWidth, height: layerHeight }
}

/** Wraps in x (longitude is cyclic) and clamps in y (the poles are not). */
function sampleLayer(layer: NoiseLayer, x: number, y: number) {
  const fx = (x / WIDTH) * layer.width
  const fy = (y / HEIGHT) * (layer.height - 1)
  const x0 = wrapIndex(Math.floor(fx), layer.width)
  const x1 = wrapIndex(x0 + 1, layer.width)
  const y0 = Math.max(0, Math.min(layer.height - 1, Math.floor(fy)))
  const y1 = Math.min(layer.height - 1, y0 + 1)
  const tx = fx - Math.floor(fx)
  const ty = Math.max(0, fy - y0)

  const i00 = y0 * layer.width + x0
  const i10 = y0 * layer.width + x1
  const i01 = y1 * layer.width + x0
  const i11 = y1 * layer.width + x1

  const a = layer.data[i00] * (1 - tx) + layer.data[i10] * tx
  const b = layer.data[i01] * (1 - tx) + layer.data[i11] * tx
  return a * (1 - ty) + b * ty
}

function wrappedDelta(x: number, cx: number, width: number) {
  let dx = x - cx
  if (dx > width * 0.5) dx -= width
  if (dx < -width * 0.5) dx += width
  return dx
}

function craterProfile(dist: number, crater: CraterSpec) {
  const t = dist / crater.radius
  const outer = crater.ejecta > 0.008 ? 1.52 : 1.22
  if (t > outer) return 0

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

function makeCrater(
  x: number,
  y: number,
  radius: number,
  kind: CraterKind,
  seed: number,
): CraterSpec {
  const rNorm = radius / 70
  const jitter = hash2(x, y, seed)

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
      }
    }
    case 'micro': {
      return {
        x,
        y,
        radius,
        depth: 0.035 + jitter * 0.04,
        rimHeight: 0.028 + jitter * 0.02,
        ejecta: 0,
        rimCenter: 0.8 + jitter * 0.035,
        rimWidth: 0.028 + jitter * 0.008,
        floorEnd: 0.4 + jitter * 0.04,
      }
    }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unhandled crater kind: ${_exhaustive}`)
    }
  }
}

function addSecondaryCluster(
  craters: CraterSpec[],
  parent: CraterSpec,
  seed: number,
  maxCount: number,
) {
  const count = 2 + Math.floor(hash2(parent.x, parent.y, seed) * maxCount)
  for (let j = 0; j < count; j++) {
    const angle = hash2(j, parent.x, seed + 11) * Math.PI * 2
    const dist =
      parent.radius * (1.1 + hash2(j, parent.y, seed + 17) * 1.75)
    const sx = (parent.x + Math.cos(angle) * dist + WIDTH) % WIDTH
    const sy = Math.min(
      HEIGHT - 1,
      Math.max(0, parent.y + Math.sin(angle) * dist),
    )
    const sr =
      MIN_CRATER_RADIUS +
      hash2(j, parent.radius, seed + 23) *
        Math.min(parent.radius * 0.18, 4.2)
    if (sr < MIN_CRATER_RADIUS) continue
    craters.push(makeCrater(sx, sy, sr, 'secondary', seed + j * 31))
  }
}

function buildCombinedReliefLayer(
  layerWidth: number,
  layerHeight: number,
  components: { layer: NoiseLayer; weight: number }[],
): NoiseLayer {
  const data = new Float32Array(layerWidth * layerHeight)
  for (let y = 0; y < layerHeight; y++) {
    const fy = (y / layerHeight) * HEIGHT
    for (let x = 0; x < layerWidth; x++) {
      const fx = (x / layerWidth) * WIDTH
      let value = 0
      for (const component of components) {
        value += sampleLayer(component.layer, fx, fy) * component.weight
      }
      data[y * layerWidth + x] = value
    }
  }
  return { data, width: layerWidth, height: layerHeight }
}

let craterFieldCache: CraterSpec[] | null = null
let noiseLayersCache: {
  mariaMask: NoiseLayer
  mariaRelief: NoiseLayer
  highlandRelief: NoiseLayer
} | null = null

function getNoiseLayers() {
  if (noiseLayersCache) return noiseLayersCache

  const mariaMask = buildNoiseLayer(WIDTH / 4, HEIGHT / 4, 6, 3.15, 2.1, 1.3, 7, 4)
  const continental = buildNoiseLayer(WIDTH / 4, HEIGHT / 4, 14, 6.75, 0, 0, 3, 4)
  const mariaDetail = buildNoiseLayer(WIDTH / 4, HEIGHT / 4, 28, 14.4, 0, 0, 17, 3)
  const highlandDetail = buildNoiseLayer(
    WIDTH / 4,
    HEIGHT / 4,
    61,
    30.6,
    0,
    0,
    11,
    4,
  )
  const regolith = buildNoiseLayer(WIDTH / 8, HEIGHT / 8, 396, 198, 0, 0, 19, 3)
  const microGrain = buildNoiseLayer(
    WIDTH / 16,
    HEIGHT / 16,
    936,
    468,
    0,
    0,
    29,
    3,
  )
  const sparkleGrain = buildNoiseLayer(
    WIDTH / 16,
    HEIGHT / 16,
    1404,
    702,
    0.37,
    0.19,
    37,
    2,
  )

  noiseLayersCache = {
    mariaMask,
    mariaRelief: buildCombinedReliefLayer(WIDTH / 4, HEIGHT / 4, [
      { layer: continental, weight: 0.05 },
      { layer: mariaDetail, weight: 0.09 },
      { layer: regolith, weight: 0.038 },
      { layer: microGrain, weight: 0.012 },
    ]),
    highlandRelief: buildCombinedReliefLayer(WIDTH / 4, HEIGHT / 4, [
      { layer: continental, weight: 0.2 },
      { layer: highlandDetail, weight: 0.28 },
      { layer: regolith, weight: 0.3 },
      { layer: microGrain, weight: 0.16 },
      { layer: sparkleGrain, weight: 0.14 },
    ]),
  }

  return noiseLayersCache
}

function buildCraterField(): CraterSpec[] {
  if (craterFieldCache) return craterFieldCache

  const craters: CraterSpec[] = []

  for (let i = 0; i < 5; i++) {
    const x = hash2(i, 1, 5) * WIDTH
    const y = hash2(i, 2, 9) * HEIGHT
    const radius = 12 + hash2(i, 3, 13) * 12
    const basin = makeCrater(x, y, radius, 'basin', 100 + i)
    craters.push(basin)
    if (hash2(i, 4, 19) > 0.35) {
      addSecondaryCluster(craters, basin, 200 + i * 17, 4)
    }
  }

  for (let i = 0; i < 520; i++) {
    const x = hash2(i, 5, 27) * WIDTH
    const y = hash2(i, 6, 33) * HEIGHT
    const radius = 3 + hash2(i, 7, 41) * 9
    const medium = makeCrater(x, y, radius, 'medium', 400 + i)
    craters.push(medium)
    if (radius > 7 && hash2(i, 8, 47) > 0.68) {
      addSecondaryCluster(craters, medium, 500 + i * 13, 3)
    }
  }

  for (let i = 0; i < 4800; i++) {
    const x = hash2(i, 9, 53) * WIDTH
    const y = hash2(i, 10, 59) * HEIGHT
    const radius = MIN_CRATER_RADIUS + hash2(i, 11, 61) * 1.7
    craters.push(makeCrater(x, y, radius, 'small', 700 + i))
  }

  for (let i = 0; i < 2200; i++) {
    const x = hash2(i, 12, 67) * WIDTH
    const y = hash2(i, 13, 71) * HEIGHT
    const radius = MIN_CRATER_RADIUS + hash2(i, 14, 73) * 0.55
    craters.push(makeCrater(x, y, radius, 'micro', 900 + i))
  }

  craters.sort((a, b) => b.radius - a.radius)
  craterFieldCache = craters
  return craters
}

function sampleLayerBilinear(
  layer: NoiseLayer,
  u: number,
  v: number,
): number {
  const fx = u * layer.width
  const fy = v * (layer.height - 1)
  const x0 = wrapIndex(Math.floor(fx), layer.width)
  const x1 = wrapIndex(x0 + 1, layer.width)
  const y0 = Math.max(0, Math.min(layer.height - 1, Math.floor(fy)))
  const y1 = Math.min(layer.height - 1, y0 + 1)
  const tx = fx - Math.floor(fx)
  const ty = Math.max(0, fy - y0)

  const i00 = y0 * layer.width + x0
  const i10 = y0 * layer.width + x1
  const i01 = y1 * layer.width + x0
  const i11 = y1 * layer.width + x1

  const a = layer.data[i00] * (1 - tx) + layer.data[i10] * tx
  const b = layer.data[i01] * (1 - tx) + layer.data[i11] * tx
  return a * (1 - ty) + b * ty
}

function fillBaseHeight(heights: Float32Array) {
  const layers = getNoiseLayers()
  const lowWidth = WIDTH / 2
  const lowHeight = HEIGHT / 2
  const lowRes = new Float32Array(lowWidth * lowHeight)

  for (let y = 0; y < lowHeight; y++) {
    const v = y / (lowHeight - 1)
    for (let x = 0; x < lowWidth; x++) {
      const u = x / lowWidth
      const px = u * WIDTH
      const py = v * HEIGHT
      const mariaMask = smoothstep(
        0.34,
        0.66,
        sampleLayer(layers.mariaMask, px, py),
      )
      const highlandMask = 1 - mariaMask
      const mariaRelief = sampleLayer(layers.mariaRelief, px, py)
      const highlandRelief = sampleLayer(layers.highlandRelief, px, py)
      lowRes[y * lowWidth + x] =
        mariaRelief * mariaMask + highlandRelief * highlandMask
    }
  }

  for (let y = 0; y < HEIGHT; y++) {
    const v = y / (HEIGHT - 1)
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH
      heights[y * WIDTH + x] = sampleLayerBilinear(
        { data: lowRes, width: lowWidth, height: lowHeight },
        u,
        v,
      )
    }
  }
}

function stampCraterHeight(heights: Float32Array, crater: CraterSpec) {
  const outer = crater.radius * (crater.ejecta > 0.008 ? 1.52 : 1.22)
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
      heights[row + wrapIndex(xi, WIDTH)] += craterProfile(
        Math.sqrt(distSq),
        crater,
      )
    }
  }
}

function normalizeHeights(heights: Float32Array): Float32Array {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]
    if (h < min) min = h
    if (h > max) max = h
  }

  const range = max - min || 1
  const normalized = new Float32Array(heights.length)
  for (let i = 0; i < heights.length; i++) {
    normalized[i] = (heights[i] - min) / range
  }
  return normalized
}

/**
 * Converts the height field to a tangent-space normal map with a Sobel filter.
 * A normal map costs one texture fetch per fragment, where three.js bump
 * mapping costs three plus derivative instructions — and these spheres cover
 * the whole viewport, so that difference dominates the frame time.
 */
function heightsToNormalMap(
  heights: Float32Array,
  strength: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for normal map')

  const out = ctx.createImageData(WIDTH, HEIGHT)
  const data = out.data

  for (let y = 0; y < HEIGHT; y++) {
    const y0 = Math.max(0, y - 1)
    const y1 = Math.min(HEIGHT - 1, y + 1)
    const row = y * WIDTH
    const row0 = y0 * WIDTH
    const row1 = y1 * WIDTH

    for (let x = 0; x < WIDTH; x++) {
      const xm = (x - 1 + WIDTH) % WIDTH
      const xp = (x + 1) % WIDTH
      const dx =
        heights[row0 + xm] +
        2 * heights[row + xm] +
        heights[row1 + xm] -
        (heights[row0 + xp] + 2 * heights[row + xp] + heights[row1 + xp])
      const dy =
        heights[row0 + xm] +
        2 * heights[row0 + x] +
        heights[row0 + xp] -
        (heights[row1 + xm] + 2 * heights[row1 + x] + heights[row1 + xp])

      const nx = dx * strength
      const ny = dy * strength
      const len = Math.hypot(nx, ny, 1)

      const i = (row + x) * 4
      data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127.5)
      data[i + 3] = 255
    }
  }

  ctx.putImageData(out, 0, 0)
  return canvas
}

function generateHeightField(): Float32Array {
  const heights = new Float32Array(WIDTH * HEIGHT)
  fillBaseHeight(heights)

  for (const crater of buildCraterField()) {
    stampCraterHeight(heights, crater)
  }

  return heights
}

let cached: THREE.CanvasTexture | null = null

/**
 * Generated at runtime instead of shipped as image files: it keeps the initial
 * payload at zero bytes and lets the surface be re-tuned without a texture bake.
 * One texture is shared by every shell, so this runs once.
 */
export function createLunarTexture() {
  if (cached) return cached

  const heights = generateHeightField()
  const normalized = normalizeHeights(heights)
  const normalCanvas = heightsToNormalMap(normalized, NORMAL_STRENGTH)

  const normalMap = new THREE.CanvasTexture(normalCanvas)
  normalMap.wrapS = THREE.RepeatWrapping
  normalMap.wrapT = THREE.ClampToEdgeWrapping
  normalMap.colorSpace = THREE.NoColorSpace
  normalMap.anisotropy = ANISOTROPY
  normalMap.generateMipmaps = true
  normalMap.minFilter = THREE.LinearMipmapLinearFilter
  normalMap.magFilter = THREE.LinearFilter

  cached = normalMap
  return cached
}
