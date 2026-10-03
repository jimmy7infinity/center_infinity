import { Effect, EffectAttribute } from 'postprocessing'
import * as THREE from 'three'

/**
 * Display-referred (sRGB) tones of a dark-mode e-ink panel under full room
 * light. The panel never reaches true black or white — that compressed range is
 * most of the look. Keep these in sync with `--color-void` and `--color-rim` so
 * the DOM and the canvas read as one surface.
 */
const INK_SURFACE = new THREE.Color('#323230')
const INK_LIGHT = new THREE.Color('#e2dfd8')

/**
 * Raw values for shaders that write straight to the drawing buffer (no output
 * encoding), so they land on exactly the same displayed grey as the panel.
 */
const INK_SURFACE_SRGB = INK_SURFACE.clone().convertLinearToSRGB()
export const INK_SURFACE_DISPLAY = new THREE.Color().setRGB(
  INK_SURFACE_SRGB.r,
  INK_SURFACE_SRGB.g,
  INK_SURFACE_SRGB.b,
  THREE.LinearSRGBColorSpace,
)

/** Seconds for a ghost to fade most of the way out — one slow e-ink refresh. */
const GHOST_FADE_SECONDS = 0.45
/** History is only ever a faint smear, so a quarter-area buffer is plenty. */
const HISTORY_SCALE = 0.5

/** Shared by the panel pass and the history pass so both see the same tone. */
const TONE_GLSL = /* glsl */ `
uniform float uBlackPoint;
uniform float uExposure;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float lumOf(const in vec3 rgb) {
  return dot(max(rgb, 0.0), LUMA);
}

// Scene luminance → perceptual pigment tone, 0 = bare panel.
float toneOf(float lum) {
  // The scene's void must collapse to exactly the bare panel.
  lum = max(lum - uBlackPoint, 0.0) * uExposure;
  // Soft shoulder: the shells are lit well past 1.0, and a hard clip turns
  // their highlights into flat plates.
  return pow(1.0 - exp(-lum), 1.0 / 2.2);
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uSurface;
uniform vec3 uLight;
uniform float uLevels;
uniform float uSoftness;
uniform float uGhost;
uniform float uShadowCurve;
uniform sampler2D uHistory;

${TONE_GLSL}

float lumAt(const in vec2 uv) {
  return lumOf(texture2D(inputBuffer, uv).rgb);
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Pigment sits under a front layer, so edges are never pixel-crisp. A slight
  // spread is what separates "ink in a panel" from "pixels on a screen".
  vec2 o = texelSize * uSoftness;
  float lum = lumAt(uv) * 0.4
    + (lumAt(uv + vec2(o.x, 0.0)) + lumAt(uv - vec2(o.x, 0.0))
      + lumAt(uv + vec2(0.0, o.y)) + lumAt(uv - vec2(0.0, o.y))) * 0.15;
  float perceptual = toneOf(lum);

  // A handful of pigment states with hard edges, matching the cel bands the
  // shells already draw. The narrow ramp only antialiases the step.
  float x = perceptual * uLevels;
  float stepped = (floor(x) + smoothstep(0.44, 0.56, fract(x))) / uLevels;

  // Ghosting: pigment that has not fully settled from the previous image. Only
  // where the panel has just gone darker, and kept off the stepped scale — a
  // ghost is a faint smear, not another band.
  float ghost = max(texture2D(uHistory, uv).r - perceptual, 0.0) * uGhost;

  // Pull the lower pigment states down toward the panel while the top state
  // stays put, so dark surface detail reads as ink rather than mid-grey haze.
  float pigment = pow(clamp(stepped, 0.0, 1.0), uShadowCurve);

  vec3 panel = mix(uSurface, uLight, clamp(pigment + ghost, 0.0, 1.0));

  // The whole planet, including lightning, prints as ink. Warm color stays on
  // the foreground canvas (player meteors), which never reaches this pass.
  outputColor = vec4(srgbToLinear(panel), inputColor.a);
}
`

const HISTORY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const HISTORY_FRAGMENT = /* glsl */ `
uniform sampler2D uCurrent;
uniform sampler2D uPrevious;
uniform float uBlend;
varying vec2 vUv;

${TONE_GLSL}

void main() {
  float current = toneOf(lumOf(texture2D(uCurrent, vUv).rgb));
  float previous = texture2D(uPrevious, vUv).r;
  gl_FragColor = vec4(vec3(mix(previous, current, uBlend)), 1.0);
}
`

function createHistoryTarget() {
  return new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    type: THREE.HalfFloatType,
  })
}

/** Greyscale, stepped, softly spread: the scene as an e-ink panel draws it. */
export class InkEffect extends Effect {
  private historyRead = createHistoryTarget()
  private historyWrite = createHistoryTarget()
  private readonly historyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly historyMaterial: THREE.ShaderMaterial
  private readonly historyScene = new THREE.Scene()
  private readonly historyQuad: THREE.Mesh

  constructor() {
    const blackPoint = new THREE.Uniform(0.008)
    const exposure = new THREE.Uniform(2.6)

    super('InkEffect', FRAGMENT, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ['uSurface', new THREE.Uniform(INK_SURFACE_SRGB.clone())],
        ['uLight', new THREE.Uniform(INK_LIGHT.clone().convertLinearToSRGB())],
        ['uLevels', new THREE.Uniform(6)],
        ['uSoftness', new THREE.Uniform(0.75)],
        ['uGhost', new THREE.Uniform(0.22)],
        ['uShadowCurve', new THREE.Uniform(1.75)],
        ['uHistory', new THREE.Uniform<THREE.Texture | null>(null)],
        ['uBlackPoint', blackPoint],
        ['uExposure', exposure],
      ]),
    })

    // Same uniform objects, so the history always tones exactly like the panel.
    this.historyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCurrent: { value: null },
        uPrevious: { value: null },
        uBlend: { value: 1 },
        uBlackPoint: blackPoint,
        uExposure: exposure,
      },
      vertexShader: HISTORY_VERTEX,
      fragmentShader: HISTORY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    })
    this.historyQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.historyMaterial,
    )
    this.historyQuad.frustumCulled = false
    this.historyScene.add(this.historyQuad)
  }

  /** Ink spread in CSS pixels, independent of DPR. */
  setPixelRatio(dpr: number) {
    const uniform = this.uniforms.get('uSoftness')
    if (uniform) uniform.value = 0.75 * Math.max(1, dpr)
  }

  override setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width * HISTORY_SCALE))
    const h = Math.max(1, Math.round(height * HISTORY_SCALE))
    this.historyRead.setSize(w, h)
    this.historyWrite.setSize(w, h)
  }

  override update(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
  ) {
    const dt = Math.min(deltaTime ?? 1 / 60, 0.1)
    const uniforms = this.historyMaterial.uniforms
    uniforms.uCurrent.value = inputBuffer.texture
    uniforms.uPrevious.value = this.historyRead.texture
    uniforms.uBlend.value = 1 - Math.exp((-3 * dt) / GHOST_FADE_SECONDS)

    const previousTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.historyWrite)
    renderer.render(this.historyScene, this.historyCamera)
    renderer.setRenderTarget(previousTarget)

    const swap = this.historyRead
    this.historyRead = this.historyWrite
    this.historyWrite = swap

    const history = this.uniforms.get('uHistory')
    if (history) history.value = this.historyRead.texture
  }

  override dispose() {
    super.dispose()
    this.historyRead.dispose()
    this.historyWrite.dispose()
    this.historyMaterial.dispose()
    this.historyQuad.geometry.dispose()
  }
}
