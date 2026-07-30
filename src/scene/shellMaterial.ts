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
  /** World position of the cursor light; see `cursorLight` in the options. */
  uCursorPos: THREE.IUniform<THREE.Vector3>
  /** Allowed above 1 so the hot centre clips and bloom picks it up. */
  uCursorColor: THREE.IUniform<THREE.Color>
  uCursorStrength: THREE.IUniform<number>
  uCursorRange: THREE.IUniform<number>
  /**
   * 0..1 — how much the lit patch reveals a warm stone cast instead of staying
   * pure grey under the cursor colour.
   */
  uCursorWarmth: THREE.IUniform<number>
  uWarmReveal: THREE.IUniform<THREE.Color>
  /** Splash-cursor-style storm: recent surface hits as xyz + age (0..1). */
  uSplats: THREE.IUniform<THREE.Vector4[]>
  uTime: THREE.IUniform<number>
  uStormStrength: THREE.IUniform<number>
  /** 0..1 — how long the pointer has been dwelling on this shell. */
  uDwell: THREE.IUniform<number>
  /** Integrated storm spin angle (radians) — CPU-accumulated, not time×rate. */
  uStormAngle: THREE.IUniform<number>
  /** 0..1 — how far the storm has spread from the eye (pattern scale stays fixed). */
  uStormGrow: THREE.IUniform<number>
  /** Per-storm random seed so each hover is a different cell. */
  uStormSeed: THREE.IUniform<number>
  /** Surface point under the cursor (not the lifted light). */
  uStormCenter: THREE.IUniform<THREE.Vector3>
  /** Shell centre — storm swirl is authored in the tangent plane here. */
  uPlanetCenter: THREE.IUniform<THREE.Vector3>
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
  opacity?: number
  /**
   * Fill on the unlit hemisphere. Keep at 0 for logo-style crescents — any
   * ambient lifts the dark side above the void and the full sphere reads.
   */
  ambient?: number
  /** Must match the scene clear colour so unlit faces disappear into space. */
  voidColor?: THREE.ColorRepresentation
  /**
   * Compiles in a second, local light driven by the cursor. Off by default so
   * the debris shader stays as cheap as it was.
   */
  cursorLight?: boolean
  cursorColor?: THREE.ColorRepresentation
  /** Multiplier on the cursor colour, taking it into HDR for bloom. */
  cursorGain?: number
}

/** Fallback only; every caller passes an explicit direction from its keyframes. */
const DEFAULT_LIGHT_DIR = new THREE.Vector3(6, -7, 9).normalize()

const VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldNormal;

#ifdef SHELL_CURSOR_LIGHT
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
#ifdef SHELL_CURSOR_LIGHT
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
uniform vec3 uVoidColor;

varying vec3 vWorldNormal;

#ifdef SHELL_CURSOR_LIGHT
uniform vec3 uCursorPos;
uniform vec3 uCursorColor;
uniform float uCursorStrength;
uniform float uCursorRange;
uniform float uCursorWarmth;
uniform vec3 uWarmReveal;
uniform vec4 uSplats[8];
uniform float uTime;
uniform float uStormStrength;
uniform float uDwell;
uniform float uStormAngle;
uniform float uStormGrow;
uniform float uStormSeed;
uniform vec3 uStormCenter;
uniform vec3 uPlanetCenter;
varying vec3 vWorldPosition;
#endif

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

#ifdef SHELL_CURSOR_LIGHT
float stormHash11(float n) {
  return fract(sin(n) * 43758.5453123);
}
float stormHash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float stormVnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = stormHash21(i);
  float b = stormHash21(i + vec2(1.0, 0.0));
  float c = stormHash21(i + vec2(0.0, 1.0));
  float d = stormHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float stormFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * stormVnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
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
  // Soft fill for debris only. Shells pass ambient=0 so the dark hemisphere
  // collapses exactly onto uVoidColor — the logo crescent read.
  lit = uAmbient + (1.0 - uAmbient) * lit;

  vec3 litSurface = uTint * albedo * uLightColor * uIntensity;
  // Mix through the void rather than multiplying toward black: pure black on a
  // charcoal backdrop would still silhouette the full sphere.
  vec3 rgb = mix(uVoidColor, litSurface, lit * uOpacity);

#ifdef SHELL_CURSOR_LIGHT
  // Cyclone-like weather cell: calm eye, broken rainbands, irregular outline,
  // overlapping cloud lobes, thin lightning — not a clean circular spiral.
  vec3 stormNormal = normalize(uStormCenter - uPlanetCenter);
  vec3 refAxis = abs(stormNormal.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 stormT = normalize(cross(refAxis, stormNormal));
  vec3 stormB = cross(stormNormal, stormT);

  // Fixed spatial scale — growth opens a front, it does not zoom the pattern.
  vec3 fromEye = vWorldPosition - uStormCenter;
  vec2 uv = vec2(dot(fromEye, stormT), dot(fromEye, stormB)) / max(uCursorRange, 1e-4);
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float TAU = 6.2831853;
  float seed = uStormSeed;

  float spin = uStormAngle;
  float crawl = uTime * 0.035;

  // Seed offsets the domain so each storm is a different weather cell.
  vec2 wp = uv * (1.45 + stormHash11(seed + 0.2) * 0.55) + vec2(stormHash11(seed), stormHash11(seed + 1.7)) * 4.0;
  vec2 q = vec2(
    stormFbm(wp + vec2(0.0, spin * 0.15 + crawl)),
    stormFbm(wp + vec2(5.2, 1.3 - spin * 0.11))
  );
  vec2 s = vec2(
    stormFbm(wp + 3.4 * q + vec2(1.7, 9.2 + spin * 0.08)),
    stormFbm(wp + 3.4 * q + vec2(8.3, 2.8 - spin * 0.06))
  );
  float cloud = stormFbm(wp + 3.2 * s);
  float cloudHi = stormFbm(wp * 2.4 + 2.0 * s + vec2(-spin * 0.2, spin * 0.17));

  // Generally circular once mature, but the rim is waved / streaked.
  float rimWave =
      0.10 * sin(ang * (2.5 + stormHash11(seed + 3.1) * 2.0) + spin * 0.55 + seed)
    + 0.07 * sin(ang * (4.5 + stormHash11(seed + 4.2) * 2.5) - spin * 0.35 + 1.3)
    + 0.05 * sin(ang * 8.0 + spin * 0.2 + cloud * 2.0)
    + 0.14 * (cloud - 0.5)
    + 0.09 * (cloudHi - 0.5);

  float streakHint = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float h0 = stormHash11(fi * 17.13 + 2.7 + seed);
    float h1 = stormHash11(fi * 31.91 + 5.1 + seed);
    float h2 = stormHash11(fi * 47.33 + 9.4 + seed);
    float armCount = 3.0 + floor(h0 * 3.0);
    float twist = 2.2 + h1 * 3.8;
    float phase = h2 * TAU + spin * (0.35 + h0 * 0.9);
    float width = 0.12 + h1 * 0.38;
    float bandAng = ang + r * twist + phase;
    float sector = abs(fract(bandAng / TAU * armCount + 0.5) - 0.5) * 2.0;
    float lobe = 1.0 - smoothstep(0.0, width, sector);
    float along = r * (4.0 + h0 * 5.0) + spin * (0.6 + h1) + fi * 1.7;
    float breaks = smoothstep(0.3, 0.55, stormVnoise(vec2(along, fi * 3.1 + seed)));
    streakHint += lobe * breaks * (0.5 + h2 * 0.5);
  }
  streakHint = clamp(streakHint * 0.35, 0.0, 1.0);

  // --- Organic growth -------------------------------------------------------
  // Not a radial disc expand. Early: seeded tendrils shoot out in random
  // directions at staggered times/lengths. Mid: they thicken. Late: mass fills
  // the gaps into a (still irregular) storm body. Pattern UVs stay fixed.
  float grow = clamp(uStormGrow, 0.0, 1.0);

  float tendrilField = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float h0 = stormHash11(fi * 19.7 + seed * 1.1);
    float h1 = stormHash11(fi * 33.1 + seed * 1.7 + 2.0);
    float h2 = stormHash11(fi * 47.9 + seed * 2.3 + 4.0);
    float h3 = stormHash11(fi * 61.3 + seed * 0.9 + 6.0);
    float h4 = stormHash11(fi * 73.1 + seed * 1.4 + 8.0);

    // Random direction + mild curve so rays aren't perfect spokes.
    float rayAng = h0 * TAU;
    float curve = (h1 - 0.5) * 2.2;
    float pathAng = rayAng + r * curve + (stormVnoise(vec2(r * 3.5, fi + seed)) - 0.5) * 0.55;

    float dAng = abs(atan(sin(ang - pathAng), cos(ang - pathAng)));
    // Thin at birth, thicken as the storm matures (fills sideways from the ray).
    float baseW = 0.028 + h2 * 0.055;
    float thickMul = mix(1.0, 3.8 + h3 * 2.2, smoothstep(0.22, 0.92, grow));
    float thickness = baseW * thickMul;
    thickness *= 0.65 + 0.7 * stormVnoise(vec2(r * 7.0 + seed, fi * 2.1));

    float line = exp(-(dAng * dAng) / max(thickness * thickness, 1e-5));

    // Staggered start + different final lengths — some streaks lead, some lag.
    float startG = h3 * 0.42;
    float span = 0.38 + h4 * 0.35;
    float rayT = clamp((grow - startG) / span, 0.0, 1.0);
    rayT = rayT * rayT * (3.0 - 2.0 * rayT);
    float maxLen = 0.38 + h1 * 0.95;
    float len = 0.04 + maxLen * rayT;

    // Soft tip that advances with the ray (reads as growing, not clipping).
    float shaft = (1.0 - smoothstep(len * 0.62, len, r)) * smoothstep(0.0, 0.035, r);
    float tip = exp(-abs(r - len) * (7.0 + h2 * 6.0)) * rayT;

    // Occasional side branch that peels off mid-growth.
    float branch = 0.0;
    float branchOn = step(0.48, h4) * smoothstep(0.2, 0.55, grow);
    float bAng = pathAng + (h0 - 0.5) * 1.1;
    float bd = abs(atan(sin(ang - bAng), cos(ang - bAng)));
    float bLen = len * (0.35 + h2 * 0.4);
    float bLine = exp(-(bd * bd) / (thickness * thickness * 1.6));
    float bAlong = (1.0 - smoothstep(bLen * 0.7, bLen, r)) * smoothstep(len * 0.15, len * 0.35, r);
    branch = bLine * bAlong * branchOn * 0.7;

    tendrilField += (line * (shaft + tip * 0.85) + branch) * (0.55 + h2 * 0.55);
  }
  tendrilField = clamp(tendrilField, 0.0, 1.6);

  // Small eye seed always present once growth starts.
  float eyeSeed = (1.0 - smoothstep(0.08, 0.22, r)) * smoothstep(0.0, 0.12, grow);

  // Mature body — only fades in late, after streaks have claimed direction.
  float rCore = r - rimWave;
  float core = 1.0 - smoothstep(0.52, 0.92, rCore);
  float fringe = streakHint * (1.0 - smoothstep(0.55, 1.28, r - rimWave * 0.5));
  float tendrilCloud = smoothstep(0.45, 0.75, cloud) * (1.0 - smoothstep(0.7, 1.2, r + rimWave * 0.3));
  float matureBody = clamp(core + fringe * 0.9 + tendrilCloud * 0.45, 0.0, 1.0);
  float fillIn = smoothstep(0.42, 0.98, grow);
  fillIn *= fillIn; // stay streaky longer

  // Streaks dominate early; body fills the gaps late. Never a clean disc expand.
  float envelope = clamp(
    eyeSeed * 0.85 + tendrilField * 0.95 + matureBody * fillIn,
    0.0,
    1.0
  ) * uStormStrength;
  float eyeSize = 0.10 + stormHash11(seed + 8.0) * 0.08;
  float eye = smoothstep(0.0, eyeSize + 0.04 * cloud, r);
  envelope *= max(eye, tendrilField * 0.35); // tendrils can cross the calm eye rim

  // Broken rainbands — seeded so arm count / twist / gaps differ per storm.
  float bands = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float h0 = stormHash11(fi * 17.13 + 2.7 + seed);
    float h1 = stormHash11(fi * 31.91 + 5.1 + seed);
    float h2 = stormHash11(fi * 47.33 + 9.4 + seed);
    float h3 = stormHash11(fi * 61.07 + 1.8 + seed);
    float armCount = 3.0 + floor(h0 * 3.0);
    float twist = 2.2 + h1 * 3.8;
    float phase = h2 * TAU + spin * (0.35 + h3 * 0.9);
    float width = 0.10 + h1 * 0.42;
    float bandReach = 0.28 + h2 * 0.78;
    float dens = 0.35 + h3 * 0.75;

    float bandAng = ang + r * twist + phase;
    float sector = abs(fract(bandAng / TAU * armCount + 0.5) - 0.5) * 2.0;
    float lobe = 1.0 - smoothstep(0.0, width, sector);

    float along = r * (4.0 + h0 * 5.0) + spin * (0.6 + h1) + fi * 1.7;
    float breaks = smoothstep(0.28, 0.52, stormVnoise(vec2(along, fi * 3.1 + seed)));
    breaks *= smoothstep(0.4, 0.7, stormVnoise(vec2(along * 0.55 + 2.0, fi + 8.0 + seed)));

    float radial = smoothstep(bandReach + 0.25, bandReach - 0.08, r)
      * smoothstep(0.08, 0.22 + h2 * 0.1, r);
    bands += lobe * breaks * radial * dens;
  }
  // Bands ride the tendrils early, then settle into full rainband structure.
  bands = clamp(bands * 0.42, 0.0, 1.0) * mix(clamp(tendrilField, 0.0, 1.0), 1.0, fillIn);

  // Overlapping convective cells — positions/sizes vary with seed.
  float cells = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h0 = stormHash11(fi * 13.7 + 4.2 + seed);
    float h1 = stormHash11(fi * 29.3 + 8.6 + seed);
    float h2 = stormHash11(fi * 41.9 + 3.1 + seed);
    float ca = h0 * TAU + spin * (0.2 + h1 * 0.5);
    float cr = 0.22 + h1 * 0.55;
    vec2 cpos = vec2(cos(ca), sin(ca)) * cr;
    float sx = 0.14 + h2 * 0.28;
    float sy = 0.10 + h0 * 0.22;
    float rot = h1 * TAU;
    vec2 d = uv - cpos;
    float cs = cos(rot);
    float sn = sin(rot);
    d = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
    float ell = length(d / vec2(sx, sy));
    float blob = 1.0 - smoothstep(0.55, 1.35, ell);
    blob *= 0.45 + h2 * 0.55;
    cells += blob;
  }
  cells = clamp(cells * 0.55, 0.0, 1.0) * fillIn;

  // Soft vapour body from domain-warped cloud + bands + cells.
  float billow = smoothstep(0.22, 0.78, cloud);
  float denseCore = smoothstep(0.35, 0.85, cloudHi);
  float density = billow * 0.55 + bands * 0.7 + cells * 0.55 + denseCore * 0.25;
  density = pow(clamp(density, 0.0, 1.0), 1.05) * envelope;

  float cover = clamp(density, 0.0, 1.0);
  rgb *= 1.0 - cover * 0.42 * uOpacity;
  // Steel-blue vapour — colder than the rock, sits with rim/glow without painting it.
  vec3 vapour = mix(uTint, vec3(0.42, 0.50, 0.62), 0.78);
  vapour *= 0.48 + 0.52 * albedo;
  // Slightly darker rainbands / brighter overcast patches.
  vapour *= 0.78 + 0.30 * billow - 0.14 * bands;
  rgb = mix(rgb, vapour, cover * 0.58 * uOpacity);

  // Thin lightning filaments — jagged, random segment lengths, short flashes.
  float bolt = 0.0;
  float flashGate = step(0.78, stormHash11(floor(uTime * 11.0) + 19.0 + seed));
  float flashGate2 = step(0.88, stormHash11(floor(uTime * 7.3) + 41.0 + seed));
  float flash = max(flashGate, flashGate2 * 0.7) * (0.55 + 0.45 * uDwell) * smoothstep(0.35, 0.8, grow);
  if (flash > 0.01) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float boltSeed = floor(uTime * (2.0 + fi * 0.37)) + fi * 17.0 + seed * 3.0;
      float h0 = stormHash11(boltSeed + 1.1);
      float h1 = stormHash11(boltSeed + 2.3);
      float h2 = stormHash11(boltSeed + 3.7);
      float h3 = stormHash11(boltSeed + 5.9);

      // Gate some bolts (no continue — keep WebGL1-friendly).
      float live = step(0.45, h0);

      float baseAng = h1 * TAU;
      float twist = (h2 - 0.5) * 1.8;
      // Jagged angular path along radius.
      float jag = (stormVnoise(vec2(r * 14.0 + boltSeed * 0.1, fi * 2.7)) - 0.5) * 0.55;
      jag += (stormVnoise(vec2(r * 28.0, boltSeed)) - 0.5) * 0.22;
      float pathAng = baseAng + r * twist + jag;

      float dAng = abs(atan(sin(ang - pathAng), cos(ang - pathAng)));
      float thickness = 0.006 + h3 * 0.012; // very thin
      float line = exp(-(dAng * dAng) / (thickness * thickness));

      // Random radial segment (broken bolts, not full spokes).
      float seg0 = 0.12 + h2 * 0.45;
      float segLen = 0.12 + h3 * 0.55;
      float seg1 = seg0 + segLen;
      float along = smoothstep(seg0, seg0 + 0.025, r) * (1.0 - smoothstep(seg1 - 0.02, seg1, r));

      // Occasional short branch off the main path.
      float bAng = pathAng + (h0 - 0.5) * 0.9;
      float bd = abs(atan(sin(ang - bAng), cos(ang - bAng)));
      float b0 = seg0 + h2 * segLen * 0.5;
      float b1 = b0 + 0.08 + h3 * 0.18;
      float bAlong = smoothstep(b0, b0 + 0.02, r) * (1.0 - smoothstep(b1 - 0.015, b1, r));
      float branch = exp(-(bd * bd) / (thickness * thickness * 1.4)) * bAlong * 0.65 * step(0.55, h1);

      bolt += (line * along + branch) * (0.55 + h0 * 0.45) * live;
    }
  }
  bolt = clamp(bolt * flash * envelope, 0.0, 1.5);
  // Ice-blue filaments — kin to --color-demo / glow, not pure white.
  vec3 lightning = vec3(0.68, 0.82, 1.0);
  rgb += lightning * bolt * 0.5 * uOpacity;
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
    uCursorPos: { value: new THREE.Vector3() },
    // Deliberately past white: the buffer is HDR, so letting the centre of the
    // pool clip is what gives bloom something to bite on and stops the light
    // reading as a flat blue gel laid over the rock.
    uCursorColor: {
      value: new THREE.Color(opts.cursorColor ?? '#8fd8ff').multiplyScalar(
        opts.cursorGain ?? 2.1,
      ),
    },
    uCursorStrength: { value: 0 },
    uCursorRange: { value: 1 },
    uCursorWarmth: { value: 0 },
    uWarmReveal: { value: new THREE.Color('#c4a882') },
    uSplats: {
      value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1)),
    },
    uTime: { value: 0 },
    uStormStrength: { value: 0 },
    uDwell: { value: 0 },
    uStormAngle: { value: 0 },
    uStormGrow: { value: 0 },
    uStormSeed: { value: 0 },
    uStormCenter: { value: new THREE.Vector3() },
    uPlanetCenter: { value: new THREE.Vector3() },
  }

  const defines: Record<string, number> = {}
  if (surface) defines.SHELL_SURFACE = 1
  if (opts.cursorLight) defines.SHELL_CURSOR_LIGHT = 1

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
