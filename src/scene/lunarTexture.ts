import * as THREE from 'three'

const WIDTH = 2048
const HEIGHT = 1024

function hash2(x: number, y: number, seed: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smoothstep(x - xi)
  const yf = smoothstep(y - yi)

  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)

  return (
    a * (1 - xf) * (1 - yf) +
    b * xf * (1 - yf) +
    c * (1 - xf) * yf +
    d * xf * yf
  )
}

function fbm(x: number, y: number, seed: number, octaves: number) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2.1
  }
  return value / total
}

/**
 * Craters read as depth because of the bright rim next to the dark floor, so
 * each one is drawn as a light ring over a darker disc rather than a flat blob.
 */
function stampCrater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  const rim = ctx.createRadialGradient(x, y, radius * 0.55, x, y, radius)
  rim.addColorStop(0, 'rgba(0, 0, 0, 0)')
  rim.addColorStop(0.72, 'rgba(255, 255, 255, 0.24)')
  rim.addColorStop(1, 'rgba(255, 255, 255, 0)')

  const floor = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.72)
  floor.addColorStop(0, 'rgba(0, 0, 0, 0.3)')
  floor.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = floor
  ctx.beginPath()
  ctx.arc(x, y, radius * 0.72, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Converts the height field to a tangent-space normal map with a Sobel filter.
 * A normal map costs one texture fetch per fragment, where three.js bump
 * mapping costs three plus derivative instructions — and these spheres cover
 * the whole viewport, so that difference dominates the frame time.
 */
function heightToNormalMap(
  height: Uint8ClampedArray,
  strength: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for normal map')

  const out = ctx.createImageData(WIDTH, HEIGHT)
  const at = (x: number, y: number) => {
    const wx = (x + WIDTH) % WIDTH
    const wy = Math.min(HEIGHT - 1, Math.max(0, y))
    return height[(wy * WIDTH + wx) * 4] / 255
  }

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx =
        at(x - 1, y - 1) +
        2 * at(x - 1, y) +
        at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
      const dy =
        at(x - 1, y - 1) +
        2 * at(x, y - 1) +
        at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))

      const nx = dx * strength
      const ny = dy * strength
      const len = Math.hypot(nx, ny, 1)

      const i = (y * WIDTH + x) * 4
      out.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      out.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      out.data[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127.5)
      out.data[i + 3] = 255
    }
  }

  ctx.putImageData(out, 0, 0)
  return canvas
}

let cached: THREE.CanvasTexture | null = null

/**
 * Generated at runtime instead of shipped as image files: it keeps the initial
 * payload at zero bytes and lets the surface be re-tuned without a texture bake.
 * One texture is shared by every shell, so this runs once.
 */
export function createLunarTexture() {
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable for lunar texture')

  const image = ctx.createImageData(WIDTH, HEIGHT)
  const data = image.data

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const u = (x / WIDTH) * 20
      const v = (y / HEIGHT) * 10
      const base = fbm(u, v, 3, 4)
      const detail = fbm(u * 14, v * 14, 11, 5)
      const grain = fbm(u * 28, v * 28, 19, 3)
      const value = Math.min(
        1,
        Math.max(0, base * 0.48 + detail * 0.38 + grain * 0.14),
      )
      const byte = Math.round(110 + value * 105)

      const i = (y * WIDTH + x) * 4
      data[i] = byte
      data[i + 1] = byte
      data[i + 2] = byte
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)

  // Large basins first, then progressively finer pitting on top.
  for (let i = 0; i < 10; i++) {
    stampCrater(
      ctx,
      hash2(i, 1, 5) * WIDTH,
      hash2(i, 2, 9) * HEIGHT,
      4 + hash2(i, 3, 13) * 6,
    )
  }
  for (let i = 0; i < 720; i++) {
    stampCrater(
      ctx,
      hash2(i, 4, 21) * WIDTH,
      hash2(i, 5, 27) * HEIGHT,
      1.6 + hash2(i, 6, 33) * 2.4,
    )
  }
  for (let i = 0; i < 1600; i++) {
    stampCrater(
      ctx,
      hash2(i, 7, 41) * WIDTH,
      hash2(i, 8, 47) * HEIGHT,
      0.7 + hash2(i, 9, 53) * 1.5,
    )
  }
  for (let i = 0; i < 3400; i++) {
    stampCrater(
      ctx,
      hash2(i, 10, 59) * WIDTH,
      hash2(i, 11, 61) * HEIGHT,
      0.4 + hash2(i, 12, 67) * 0.8,
    )
  }

  const heightData = ctx.getImageData(0, 0, WIDTH, HEIGHT).data
  const normalCanvas = heightToNormalMap(heightData, 1.5)

  const normalMap = new THREE.CanvasTexture(normalCanvas)
  normalMap.wrapS = THREE.RepeatWrapping
  normalMap.wrapT = THREE.ClampToEdgeWrapping
  normalMap.colorSpace = THREE.NoColorSpace
  normalMap.anisotropy = 8
  normalMap.generateMipmaps = true
  normalMap.minFilter = THREE.LinearMipmapLinearFilter
  normalMap.magFilter = THREE.LinearFilter

  cached = normalMap
  return cached
}
