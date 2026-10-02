import * as THREE from 'three'
import type { LunarSurface } from './lunarSurface'

export type ShellMaterialUniforms = {
  uLightDir: THREE.IUniform<THREE.Vector3>
  uLightColor: THREE.IUniform<THREE.Color>
  uIntensity: THREE.IUniform<number>
  uTint: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
  uTerminator: THREE.IUniform<number>
  uAmbient: THREE.IUniform<number>
  /** Cel bands across the terminator; 0 keeps the smooth falloff. */
  uToonSteps: THREE.IUniform<number>
  /** Unlit hemisphere matches this so crescents vanish into the void like the logo. */
  uVoidColor: THREE.IUniform<THREE.Color>
  uNormalMap: THREE.IUniform<THREE.Texture | null>
  uAlbedoMap: THREE.IUniform<THREE.Texture | null>
  uDetailMap: THREE.IUniform<THREE.Texture | null>
  uDetailRepeat: THREE.IUniform<THREE.Vector2>
  uNormalScale: THREE.IUniform<number>
  uDetailScale: THREE.IUniform<number>
  uDetailTone: THREE.IUniform<number>
  uAlbedoAmount: THREE.IUniform<number>
  /** Point on the surface the strike leaves from. */
  uBoltOrigin: THREE.IUniform<THREE.Vector3>
  uPlanetCenter: THREE.IUniform<THREE.Vector3>
  uTime: THREE.IUniform<number>
  /** 0..1 strike visibility (hold, then fade). */
  uLightning: THREE.IUniform<number>
  /** 0..1 how far the leader's tip has raced out. */
  uLightningDraw: THREE.IUniform<number>
  /** 0..1 stacked click charge: reach, branches, brightness. */
  uLightningPower: THREE.IUniform<number>
  /** Rerolls bolt paths when a strike fires. */
  uLightningSeed: THREE.IUniform<number>
}

export type ShellMaterialOptions = {
  tint: THREE.ColorRepresentation
  /** Omit for geometry without sphere UVs; lighting then uses vertex normals. */
  surface?: LunarSurface
  normalScale?: number
  /** Strength of the tiled micro-relief, which carries close-range crispness. */
  detailScale?: number
  /** Micro-scale reflectance variation from the same tile. */
  detailTone?: number
  /** 0 leaves the shell a flat tint; 1 uses the generated reflectance in full. */
  albedoAmount?: number
  lightDir?: THREE.Vector3
  lightColor?: THREE.ColorRepresentation
  intensity?: number
  terminator?: number
  /** Cel bands across the terminator; omit for a smooth falloff. */
  toonSteps?: number
  opacity?: number
  /**
   * Fill on the unlit hemisphere. Keep at 0 for logo-style crescents — any
   * ambient lifts the dark side above the void and the full sphere reads.
   */
  ambient?: number
  /** Must match the scene clear colour so unlit faces disappear into space. */
  voidColor?: THREE.ColorRepresentation
  /** Compiles the click strike in; only the hero shells take clicks. */
  lightning?: boolean
}

/** Fallback only; every caller passes an explicit direction from its keyframes. */
const DEFAULT_LIGHT_DIR = new THREE.Vector3(6, -7, 9).normalize()

const VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldNormal;

#ifdef SHELL_LIGHTNING
varying vec3 vWorldPosition;
#endif

#ifdef SHELL_SURFACE
varying vec2 vUv;
varying vec3 vWorldTangent;
varying vec3 vWorldBitangent;
varying vec3 vObjectNormal;
#endif

void main() {
  vec3 objectNormal = normalize(normal);
  mat3 normalMat = mat3(modelMatrix);
  vWorldNormal = normalize(normalMat * objectNormal);

#ifdef SHELL_SURFACE
  vUv = uv;
  vObjectNormal = objectNormal;

  // Analytical tangent basis for the sphere's UV parametrisation. Screen-space
  // derivatives would jump by a full unit across the u=1/u=0 seam and stamp a
  // hard line there, so the basis is derived from uv instead.
  float u = uv.x * 6.28318530718;
  float v = uv.y * 3.14159265359;
  float sinV = sin(v);
  float sinU = sin(u);
  float cosU = cos(u);

  // three.js builds the sphere as P = (-cos(u)sin(v), cos(v), sin(u)sin(v)),
  // so dP/du runs along (+sin(u)sin(v), 0, cos(u)sin(v)).
  vec3 dPdu = vec3(sinV * sinU, 0.0, sinV * cosU);
  float dPduLen = length(dPdu);
  vec3 objectTangent = dPduLen > 1e-4 ? dPdu / dPduLen : vec3(1.0, 0.0, 0.0);
  vec3 objectBitangent = normalize(cross(objectNormal, objectTangent));

  vWorldTangent = normalize(normalMat * objectTangent);
  vWorldBitangent = normalize(normalMat * objectBitangent);
#endif

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
#ifdef SHELL_LIGHTNING
  vWorldPosition = worldPos.xyz;
#endif
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

const FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uIntensity;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uTerminator;
uniform float uAmbient;
uniform float uToonSteps;
uniform vec3 uVoidColor;

varying vec3 vWorldNormal;

#ifdef SHELL_SURFACE
uniform sampler2D uNormalMap;
uniform sampler2D uAlbedoMap;
uniform sampler2D uDetailMap;
uniform vec2 uDetailRepeat;
uniform float uNormalScale;
uniform float uDetailScale;
uniform float uDetailTone;
uniform float uAlbedoAmount;
varying vec2 vUv;
varying vec3 vWorldTangent;
varying vec3 vWorldBitangent;
varying vec3 vObjectNormal;
#endif

#ifdef SHELL_LIGHTNING
uniform vec3 uBoltOrigin;
uniform vec3 uPlanetCenter;
uniform float uTime;
uniform float uLightning;
uniform float uLightningDraw;
uniform float uLightningPower;
uniform float uLightningSeed;
varying vec3 vWorldPosition;

float boltHash11(float n) {
  return fract(sin(n) * 43758.5453123);
}
float boltHash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float boltVnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = boltHash21(i);
  float b = boltHash21(i + vec2(1.0, 0.0));
  float c = boltHash21(i + vec2(0.0, 1.0));
  float d = boltHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float boltFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * boltVnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
/** Shortest unsigned angle between two bearings, 0..π. */
float boltDeltaAng(float a, float pathA) {
  return abs(atan(sin(a - pathA), cos(a - pathA)));
}
/**
 * Distance to a RAY from the origin along pathA — not a full diameter.
 * Plain sin(theta)*sin(dAng) is zero at dAng=π, which mirrored every bolt
 * through the click. Far-side samples are pushed away.
 */
float boltRayDist(float th, float a, float pathA) {
  float dAng = boltDeltaAng(a, pathA);
  float cross = abs(asin(clamp(sin(th) * sin(dAng), -1.0, 1.0)));
  float opposite = smoothstep(0.75, 1.25, dAng);
  return mix(cross, 10.0, opposite);
}
/** Continuous jagged wander along the path. */
float boltZig(float r, float s) {
  return (boltFbm(vec2(r * 14.0 + s, s * 0.41)) - 0.5) * 0.85
    + (boltFbm(vec2(r * 28.0 + s * 1.3, 3.1)) - 0.5) * 0.45
    + (boltVnoise(vec2(r * 48.0, s)) - 0.5) * 0.28;
}

/**
 * The strike, in geodesic coords from the click point: the tip races out along
 * one jagged leader and branches peel off only once it has passed their fork.
 * Charge stretches the reach and unlocks branches.
 */
vec3 lightningLight() {
  float flash = clamp(uLightning, 0.0, 1.0);
  float draw = clamp(uLightningDraw, 0.0, 1.0);
  if (flash < 0.01 || draw < 0.001) return vec3(0.0);
  vec3 originNormal = normalize(uBoltOrigin - uPlanetCenter);
  vec3 surfNormal = normalize(vWorldPosition - uPlanetCenter);
  // Stable tangent frame — avoid a hard axis swap near world-up.
  vec3 T = cross(vec3(0.0, 1.0, 0.0), originNormal);
  if (dot(T, T) < 1e-4) T = cross(vec3(1.0, 0.0, 0.0), originNormal);
  T = normalize(T);
  vec3 B = cross(originNormal, T);
  float theta = acos(clamp(dot(surfNormal, originNormal), -1.0, 1.0));
  float ang = atan(dot(surfNormal, B), dot(surfNormal, T));

  float TAU = 6.2831853;
  float power = clamp(uLightningPower, 0.0, 1.0);
  float shellR = max(length(uBoltOrigin - uPlanetCenter), 1e-4);
  float seed = uLightningSeed;
  float reach = mix(0.16, 0.95, power);

  float holdFlicker = draw >= 0.995
    ? (0.78 + 0.22 * boltHash11(floor(uTime * 28.0) + seed))
    : 1.0;
  // A one-pixel hairline at any distance, sized in screen pixels. The falloff
  // must end hard: the ink pass prints anything above ~1% light, so a soft
  // tail prints as solid ink and the line reads thick.
  float px = fwidth(theta);
  float thickness = px * 0.6;
  float glowW = px * 1.6;
  vec3 white = vec3(1.0);

  vec3 core = vec3(0.0);
  vec3 glow = vec3(0.0);

  float mainBase = boltHash11(seed + 0.7) * TAU;
  float mainLen = reach * (0.75 + boltHash11(seed + 1.3) * 0.25);
  float mainTip = mainLen * draw;
  float mainAng = mainBase + boltZig(theta, seed);
  float mainD = boltRayDist(theta, ang, mainAng);
  float mainFace = 1.0 - smoothstep(0.65, 1.1, boltDeltaAng(ang, mainAng));
  float mainAlong = smoothstep(0.0, 0.004, theta)
    * (1.0 - smoothstep(mainTip * 0.92, mainTip, theta));
  float mainLine = (1.0 - smoothstep(0.0, thickness, mainD)) * mainFace;
  float mainEmit = (1.0 - smoothstep(0.0, glowW, mainD)) * mainFace;
  float tipGlow = exp(-abs(theta - mainTip) * 28.0)
    * smoothstep(0.01, 0.12, draw)
    * (1.0 - smoothstep(0.94, 1.0, draw))
    * mainFace;
  core += white * (mainLine * mainAlong * 1.7 + tipGlow * mainLine * 1.35) * holdFlicker;
  glow += white * mainEmit * mainAlong * holdFlicker * 0.5;

  float branchBudget = mix(1.0, 5.0, power);
  for (int b = 0; b < 5; b++) {
    float fb = float(b);
    float bSeed = seed * 1.9 + fb * 19.3;
    float bh0 = boltHash11(bSeed + 0.3);
    float bh1 = boltHash11(bSeed + 1.1);
    float bh2 = boltHash11(bSeed + 2.4);
    float bh3 = boltHash11(bSeed + 3.7);
    float bLive = step(fb, branchBudget - 0.05) * step(0.3, bh3);
    float forkR = mainLen * (0.22 + bh0 * 0.55);
    float bLen = mainLen * (0.12 + bh1 * 0.2 + bh2 * 0.2) * mix(0.8, 1.2, power);
    float bDraw = clamp((mainTip - forkR) / max(bLen, 1e-3), 0.0, 1.0);
    float forkOk = bLive * step(0.001, bDraw);

    float side = bh1 < 0.5 ? -1.0 : 1.0;
    float peel = side * (0.45 + bh2 * 0.95);
    float forkAng = mainBase + boltZig(forkR, seed);
    float alongBranch = max(theta - forkR, 0.0);
    float peelT = clamp(alongBranch / max(bLen, 1e-3), 0.0, 1.0);
    float branchAng = forkAng + peel * peelT + boltZig(alongBranch, bSeed) * 0.55;

    float bD = boltRayDist(theta, ang, branchAng);
    float bFace = 1.0 - smoothstep(0.65, 1.1, boltDeltaAng(ang, branchAng));
    float bTip = forkR + bLen * bDraw;
    float bAlong = smoothstep(forkR, forkR + 0.006, theta)
      * (1.0 - smoothstep(bTip * 0.9, bTip, theta));
    float bLine = (1.0 - smoothstep(0.0, thickness * 0.85, bD)) * bFace;
    float bEmit = (1.0 - smoothstep(0.0, glowW, bD)) * bFace;
    float bTipG = exp(-abs(theta - bTip) * 28.0)
      * smoothstep(0.02, 0.2, bDraw)
      * (1.0 - smoothstep(0.92, 1.0, bDraw))
      * bFace;
    core += white * (bLine * bAlong * 1.5 + bTipG * bLine * 1.2)
      * forkOk * holdFlicker * (0.65 + bh2 * 0.25);
    glow += white * bEmit * bAlong * forkOk * holdFlicker * 0.35;
  }

  float brightMul = mix(1.35, 2.4, power);
  // Kept near the top pigment state: any brighter and the ink pass's spread
  // bleeds the line into its neighbours and it prints thick.
  core = clamp(core * flash * brightMul, 0.0, 1.2);
  glow = clamp(glow * flash * brightMul, 0.0, 0.6);
  return core * 1.2 + glow * 0.04;
}
#endif

void main() {
  vec3 L = normalize(uLightDir);
  float albedo = 1.0;

#ifdef SHELL_SURFACE
  vec3 baseNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;

  // The equirect mapping collapses in u at the poles, smearing the detail tile
  // into a radial sunburst wherever a pole rotates towards camera. Near the
  // poles the tile is read through a top-down projection instead, which has no
  // singularity there. The two mappings disagree on tangent orientation, but at
  // this frequency that is invisible next to the smearing it removes.
  vec2 polarUv = vObjectNormal.xz * (uDetailRepeat.y * 0.5) + 0.5;
  float polarBlend = smoothstep(0.55, 0.9, abs(vObjectNormal.y));
  vec3 detailNormal = mix(
    texture2D(uDetailMap, vUv * uDetailRepeat).xyz,
    texture2D(uDetailMap, polarUv).xyz,
    polarBlend
  ) * 2.0 - 1.0;

  // Slopes add and z stays with the base map. A whiteout blend flattens the
  // micro-relief exactly where it matters most — near the terminator, where
  // grazing light is what makes the grain visible at all.
  vec3 mapNormal = vec3(
    baseNormal.xy * uNormalScale + detailNormal.xy * uDetailScale,
    baseNormal.z
  );

  mat3 tbn = mat3(
    normalize(vWorldTangent),
    normalize(vWorldBitangent),
    normalize(vWorldNormal)
  );
  vec3 N = normalize(tbn * mapNormal);

  // Stored with a mean of 1.0 over a 0..2.5 range; see albedoToCanvas.
  float reflectance = texture2D(uAlbedoMap, vUv).r * 2.5;
  // The detail tile's z carries micro-relief tone rather than a normal
  // component, which keeps the surface from going plastic where it faces the
  // light head-on and shading flattens out.
  reflectance *= 1.0 + detailNormal.z * uDetailTone;
  albedo = mix(1.0, reflectance, uAlbedoAmount);
#else
  vec3 N = normalize(vWorldNormal);
#endif

  float ndotl = dot(N, L);
  float lit = smoothstep(-uTerminator, uTerminator, ndotl);
  lit = pow(lit, 1.35);
  if (uToonSteps > 0.5) {
    // Bands round *up*, with the first edge near the faintest visible light.
    // Rounding to nearest erases the soft limb and the crescents read as
    // shrunken and shifted. Edges are antialiased to one screen pixel.
    float band = lit * uToonSteps - 0.15;
    float edge = fwidth(band);
    lit = clamp(
      (floor(band) + 1.0 + smoothstep(1.0 - edge, 1.0, fract(band))) / uToonSteps,
      0.0,
      1.0
    );
  }
  // Soft fill for debris only. Shells pass ambient=0 so the dark hemisphere
  // collapses exactly onto uVoidColor — the logo crescent read.
  lit = uAmbient + (1.0 - uAmbient) * lit;

  vec3 litSurface = uTint * albedo * uLightColor * uIntensity;
  // Mix through the void rather than multiplying toward black: pure black on a
  // charcoal backdrop would still silhouette the full sphere.
  vec3 rgb = mix(uVoidColor, litSurface, lit * uOpacity);

#ifdef SHELL_LIGHTNING
  rgb += lightningLight() * uOpacity;
#endif

  gl_FragColor = vec4(rgb, 1.0);
}
`

export function createShellMaterial(opts: ShellMaterialOptions): THREE.ShaderMaterial {
  const lightDir = opts.lightDir ?? DEFAULT_LIGHT_DIR
  const surface = opts.surface

  const uniforms: ShellMaterialUniforms = {
    uLightDir: { value: lightDir.clone().normalize() },
    uLightColor: { value: new THREE.Color(opts.lightColor ?? '#dfe6f5') },
    uIntensity: { value: opts.intensity ?? 8.5 },
    uTint: { value: new THREE.Color(opts.tint) },
    uOpacity: { value: opts.opacity ?? 0 },
    uTerminator: { value: opts.terminator ?? 0.08 },
    uAmbient: { value: opts.ambient ?? 0 },
    uToonSteps: { value: opts.toonSteps ?? 0 },
    uVoidColor: { value: new THREE.Color(opts.voidColor ?? '#0e1016') },
    uNormalMap: { value: surface?.normalMap ?? null },
    uAlbedoMap: { value: surface?.albedoMap ?? null },
    uDetailMap: { value: surface?.detailMap ?? null },
    uDetailRepeat: {
      value: surface?.detailRepeat.clone() ?? new THREE.Vector2(1, 1),
    },
    uNormalScale: { value: opts.normalScale ?? 1 },
    uDetailScale: { value: opts.detailScale ?? 0.6 },
    uDetailTone: { value: opts.detailTone ?? 0.28 },
    uAlbedoAmount: { value: opts.albedoAmount ?? 1 },
    uBoltOrigin: { value: new THREE.Vector3() },
    uPlanetCenter: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uLightning: { value: 0 },
    uLightningDraw: { value: 0 },
    uLightningPower: { value: 0 },
    uLightningSeed: { value: 0 },
  }

  const defines: Record<string, number> = {}
  if (surface) defines.SHELL_SURFACE = 1
  if (opts.lightning) defines.SHELL_LIGHTNING = 1

  return new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
  })
}

export function getShellMaterialUniforms(
  material: THREE.ShaderMaterial,
): ShellMaterialUniforms {
  return material.uniforms as ShellMaterialUniforms
}
