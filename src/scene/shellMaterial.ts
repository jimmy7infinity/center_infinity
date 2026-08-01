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
  /** Integrated storm spin phase (radians, always ≥0) — CPU-accumulated. */
  uStormAngle: THREE.IUniform<number>
  /** ±1 — fixed spin direction for the life of the cell (never derived from angle). */
  uStormSpinSign: THREE.IUniform<number>
  /** 0..1 — how far the storm has spread from the eye (pattern scale stays fixed). */
  uStormGrow: THREE.IUniform<number>
  /** Per-storm random seed so each hover is a different cell. */
  uStormSeed: THREE.IUniform<number>
  /** Surface point under the cursor (not the lifted light). */
  uStormCenter: THREE.IUniform<THREE.Vector3>
  /** Shell centre — storm swirl is authored in the tangent plane here. */
  uPlanetCenter: THREE.IUniform<THREE.Vector3>
  /** 0..1 — current flash opacity (click-driven, brief ambient). */
  uLightning: THREE.IUniform<number>
  /** 0..1 — how far the stroke has drawn from the eye (arc grow). */
  uLightningDraw: THREE.IUniform<number>
  /** 0..1 — stacked click intensity (bolt count / hold / brightness). */
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
uniform float uStormSpinSign;
uniform float uStormGrow;
uniform float uStormSeed;
uniform vec3 uStormCenter;
uniform vec3 uPlanetCenter;
uniform float uLightning;
uniform float uLightningDraw;
uniform float uLightningPower;
uniform float uLightningSeed;
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
/** Shortest unsigned angle between two bearings, 0..π. */
float boltDeltaAng(float a, float pathA) {
  return abs(atan(sin(a - pathA), cos(a - pathA)));
}
/**
 * Distance to a RAY from the eye along pathA — not a full diameter.
 * Plain sin(theta)*sin(dAng) is zero at dAng=π, which mirrored every bolt
 * through the click. Far-side samples are pushed away.
 */
float boltRayDist(float th, float a, float pathA) {
  float dAng = boltDeltaAng(a, pathA);
  float cross = abs(asin(clamp(sin(th) * sin(dAng), -1.0, 1.0)));
  float opposite = smoothstep(0.75, 1.25, dAng);
  return mix(cross, 10.0, opposite);
}
/** Continuous jagged wander — higher freq / amplitude for a sharp bolt path. */
float boltZig(float r, float s) {
  return (stormFbm(vec2(r * 14.0 + s, s * 0.41)) - 0.5) * 0.85
    + (stormFbm(vec2(r * 28.0 + s * 1.3, 3.1)) - 0.5) * 0.45
    + (stormVnoise(vec2(r * 48.0, s)) - 0.5) * 0.28;
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
  // Weather cell: calm eye, soft vapour edge, mildly spiral-spun cloud
  // texture, thin lightning.
  //
  // Authored in geodesic coords on the sphere (azimuthal equidistant from the
  // eye) so cloud density stays consistent as the front creeps around the body.
  // Tangent-plane UVs were stretching everything past the cursor.
  vec3 stormNormal = normalize(uStormCenter - uPlanetCenter);
  vec3 surfNormal = normalize(vWorldPosition - uPlanetCenter);
  // Stable tangent frame — avoid a hard axis swap that pops UVs when the eye
  // drifts near world-up.
  vec3 stormT = cross(vec3(0.0, 1.0, 0.0), stormNormal);
  float tLen2 = dot(stormT, stormT);
  if (tLen2 < 1e-4) {
    stormT = cross(vec3(1.0, 0.0, 0.0), stormNormal);
  }
  stormT = normalize(stormT);
  vec3 stormB = cross(stormNormal, stormT);

  float cosTheta = clamp(dot(surfNormal, stormNormal), -1.0, 1.0);
  float theta = acos(cosTheta); // geodesic angle from eye, 0..π
  float ang = atan(dot(surfNormal, stormB), dot(surfNormal, stormT));
  float TAU = 6.2831853;
  float seed = uStormSeed;

  // uCursorRange = max geodesic coverage angle (radians).
  float shellR = max(length(uStormCenter - uPlanetCenter), 1e-4);
  float maxAngle = max(uCursorRange, 1e-4);
  float spread = max(maxAngle, 0.0);
  // Phase is always ≥0 on the CPU; direction is a fixed ±1 for this cell.
  // Deriving sign from spin itself flipped the spiral when angle crossed 0.
  float spinSign = uStormSpinSign >= 0.0 ? 1.0 : -1.0;
  float spin = uStormAngle * spinSign;
  float grow = clamp(uStormGrow, 0.0, 1.0);

  // Billow texture revolves around the eye with a very mild spiral warp —
  // low tightness so the chalk clouds stay readable, not arm graphics.
  float rRef = max(theta, 0.014);
  float mildDiff = spin * (0.18 / (0.28 + rRef * 2.2));
  float mildSpiral = 0.16 * log(rRef * 4.0 + 0.3) * spinSign;
  float spunAng = ang + spin + mildDiff - mildSpiral;
  vec2 geoUV = vec2(theta * cos(spunAng), theta * sin(spunAng));
  vec2 uv = geoUV * 2.35;

  // Seed offsets the domain so each storm is a different weather cell.
  float crawlAmt = uTime * 0.035;
  vec2 wp = uv * (1.45 + stormHash11(seed + 0.2) * 0.55)
    + vec2(stormHash11(seed), stormHash11(seed + 1.7)) * 4.0;
  vec2 q = vec2(
    stormFbm(wp + vec2(0.0, crawlAmt)),
    stormFbm(wp + vec2(5.2, 1.3 - crawlAmt * 0.7))
  );
  vec2 s = vec2(
    stormFbm(wp + 3.4 * q + vec2(1.7, 9.2)),
    stormFbm(wp + 3.4 * q + vec2(8.3, 2.8))
  );
  float cloud = stormFbm(wp + 3.2 * s);
  float cloudHi = stormFbm(wp * 2.4 + 2.0 * s + vec2(crawlAmt * 0.4, -crawlAmt * 0.3));

  // --- Soft vapour body (no tentacles) -------------------------------------
  float eyeRad = 0.002 + grow * 0.03 + stormHash11(seed + 8.0) * 0.004;

  // Angularly lobed reach so growth isn't a perfect disc.
  float lobeA = stormFbm(vec2(cos(ang) * 1.7 + seed * 0.1, sin(ang) * 1.7 + seed * 0.13));
  float lobeB = stormFbm(vec2(cos(ang * 2.0 + 1.3) * 2.4, sin(ang * 2.0 + 1.3) * 2.4 + seed));
  float lobeC = stormVnoise(vec2(ang * 0.55 + seed, grow * 0.8 + seed * 0.2));
  float reachMul = 0.5 + 0.65 * lobeA + 0.3 * (lobeB - 0.5) + 0.2 * (lobeC - 0.5);
  // Track spread only — no min blot. CPU eases coverage so early spread ≈ 0.
  float softR = max(spread * reachMul, 1e-4);

  float fall = exp(-pow(theta / softR, 1.15));
  float mist = clamp(cloud * 1.35 + cloudHi * 0.45, 0.0, 1.0);
  float fringeZone = smoothstep(softR * 0.35, softR * 1.05, theta);
  float fray = mix(0.75 + 0.25 * mist, mist * mist, fringeZone);
  float vapourMask = clamp(fall * fray, 0.0, 1.0);
  vapourMask *= 1.0 - smoothstep(softR * 0.8, softR * 1.5, theta);

  float body = clamp(vapourMask, 0.0, 1.0);
  float envelope = body * uStormStrength;
  float eye = smoothstep(0.0, eyeRad * (0.8 + 0.4 * cloud), theta);
  envelope *= eye;
  // Soft fringe only — keep the body opaque so the chalk texture stays dense.
  envelope *= mix(1.0, vapourMask, 0.45);
  // Soft birth — short enough to read soon, long enough to avoid a chalk pop.
  float birth = smoothstep(0.0, 0.16, grow);
  envelope *= birth;

  // Convective cells locked to the spun UV frame — hold until the cell has size.
  float cells = 0.0;
  float cellGate = smoothstep(0.12, 0.4, grow);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h0 = stormHash11(fi * 13.7 + 4.2 + seed);
    float h1 = stormHash11(fi * 29.3 + 8.6 + seed);
    float h2 = stormHash11(fi * 41.9 + 3.1 + seed);
    float cr = 0.04 + h1 * 0.7;
    float ca = h0 * TAU;
    float revealed = smoothstep(cr * 0.55, cr * 1.05, spread) * cellGate;
    vec2 cpos = vec2(cos(ca), sin(ca)) * cr;
    float sx = 0.07 + h2 * 0.12;
    float sy = 0.05 + h0 * 0.1;
    float rot = h1 * TAU;
    vec2 d = geoUV - cpos;
    float cs = cos(rot);
    float sn = sin(rot);
    d = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
    float ell = length(d / vec2(sx, sy));
    float blob = 1.0 - smoothstep(0.55, 1.35, ell);
    cells += blob * (0.45 + h2 * 0.55) * revealed;
  }
  cells = clamp(cells * 0.55, 0.0, 1.0) * body;

  float billow = smoothstep(0.2, 0.72, cloud);
  float denseCore = smoothstep(0.3, 0.8, cloudHi);
  float density = (billow * 0.85 + cells * 0.55 + denseCore * 0.45) * envelope;
  float cover = clamp(density * mix(0.2, 1.15, birth), 0.0, 1.0);
  vec3 cloudHiCol = vec3(0.96, 0.98, 1.0);
  vec3 cloudLoCol = vec3(0.55, 0.60, 0.70);
  float loft = clamp(billow * 0.55 + denseCore * 0.5, 0.0, 1.0);
  vec3 vapour = mix(cloudLoCol, cloudHiCol, loft);
  // Keep a whisper of the planet tint so it sits on the surface.
  vapour = mix(uTint * 1.15, vapour, 0.92);
  vapour *= 0.72 + 0.28 * albedo;
  // Soft under-shadow, then opaque chalk overpaint — the overpaint is what reads.
  rgb *= 1.0 - cover * 0.22 * uOpacity;
  rgb = mix(rgb, vapour, cover * 0.82 * uOpacity);

  // Lightning — animated strike from the click eye: tip races out along one
  // jagged leader; branches peel from that channel only after the tip reaches
  // their fork, then grow outward. Ray (not diameter). Thin core, soft glow.
  vec3 boltRgb = vec3(0.0);
  vec3 boltLight = vec3(0.0);
  float power = clamp(uLightningPower, 0.0, 1.0);
  float draw = clamp(uLightningDraw, 0.0, 1.0);
  float ambientGate = step(0.9988, stormHash11(floor(uTime * 0.18) + seed * 2.7));
  float ambientFlash = ambientGate * 0.16 * step(0.25, grow);
  float flash = max(uLightning, ambientFlash) * step(0.12, grow);
  float drawAmt = max(draw, ambientGate);
  float brightMul = mix(1.35, 2.4, power);
  if (flash > 0.01 && drawAmt > 0.001) {
    float strikeSeed = uLightningSeed + ambientGate * 41.0;
    vec3 coreCol = vec3(0.97, 0.92, 1.0);
    vec3 glowCol = vec3(0.62, 0.38, 1.0);
    float holdFlicker = drawAmt >= 0.995
      ? (0.78 + 0.22 * stormHash11(floor(uTime * 28.0) + strikeSeed))
      : 1.0;
    // Fine hairline with a whisper of glow — readable without reading as thick.
    float thickness = 0.00052 / shellR;
    float glowW = thickness * 22.0;

    float mainBase = stormHash11(strikeSeed + 0.7) * TAU;
    float mainLen = maxAngle * (0.5 + stormHash11(strikeSeed + 1.3) * 0.48)
      * mix(0.9, 1.2, power);
    float mainTip = mainLen * drawAmt;

    float mainAng = mainBase + boltZig(theta, strikeSeed);
    float mainD = boltRayDist(theta, ang, mainAng);
    float mainFace = 1.0 - smoothstep(0.65, 1.1, boltDeltaAng(ang, mainAng));
    float mainAlong = smoothstep(0.0, 0.004, theta)
      * (1.0 - smoothstep(mainTip * 0.92, mainTip, theta));
    float mainLine = exp(-(mainD * mainD) / max(thickness * thickness, 1e-12)) * mainFace;
    float mainEmit = exp(-(mainD * mainD) / max(glowW * glowW, 1e-12)) * mainFace;
    float tipGlow = exp(-abs(theta - mainTip) * 28.0)
      * smoothstep(0.01, 0.12, drawAmt)
      * (1.0 - smoothstep(0.94, 1.0, drawAmt))
      * mainFace;
    float mainStr = (mainLine * mainAlong * 1.7 + tipGlow * mainLine * 1.35) * holdFlicker;
    boltRgb += mix(glowCol, coreCol, clamp(mainLine + tipGlow, 0.0, 1.0)) * mainStr;
    boltLight += glowCol * mainEmit * mainAlong * holdFlicker * 0.5;

    // Connected branches: attach at fork on the main path, peel gradually,
    // tip grows from the fork after the leader passes (not a pop-in).
    float branchBudget = mix(2.0, 5.0, power);
    for (int b = 0; b < 5; b++) {
      float fb = float(b);
      float bSeed = strikeSeed * 1.9 + fb * 19.3;
      float bh0 = stormHash11(bSeed + 0.3);
      float bh1 = stormHash11(bSeed + 1.1);
      float bh2 = stormHash11(bSeed + 2.4);
      float bh3 = stormHash11(bSeed + 3.7);
      float bLive = step(fb, branchBudget - 0.05) * step(0.3, bh3);
      float forkR = mainLen * (0.22 + bh0 * 0.55);
      float bLen = mainLen * (0.12 + bh1 * 0.2 + bh2 * 0.2) * mix(0.8, 1.2, power);
      // Branch draw clock: 0 until leader hits fork, then tip races along bLen.
      float bDraw = clamp((mainTip - forkR) / max(bLen, 1e-3), 0.0, 1.0);
      float forkOk = bLive * step(0.001, bDraw);

      float side = bh1 < 0.5 ? -1.0 : 1.0;
      float peel = side * (0.45 + bh2 * 0.95);
      // Same angle as the leader at the fork — stays attached.
      float forkAng = mainBase + boltZig(forkR, strikeSeed);
      float alongBranch = max(theta - forkR, 0.0);
      float peelT = clamp(alongBranch / max(bLen, 1e-3), 0.0, 1.0);
      float branchAng = forkAng + peel * peelT + boltZig(alongBranch, bSeed) * 0.55;

      float bD = boltRayDist(theta, ang, branchAng);
      float bFace = 1.0 - smoothstep(0.65, 1.1, boltDeltaAng(ang, branchAng));
      float bTip = forkR + bLen * bDraw;
      float bAlong = smoothstep(forkR, forkR + 0.006, theta)
        * (1.0 - smoothstep(bTip * 0.9, bTip, theta));
      float bLine = exp(-(bD * bD) / max(thickness * thickness * 1.05, 1e-12)) * bFace;
      float bEmit = exp(-(bD * bD) / max(glowW * glowW, 1e-12)) * bFace;
      float bTipG = exp(-abs(theta - bTip) * 28.0)
        * smoothstep(0.02, 0.2, bDraw)
        * (1.0 - smoothstep(0.92, 1.0, bDraw))
        * bFace;
      float bStr = (bLine * bAlong * 1.5 + bTipG * bLine * 1.2)
        * forkOk * holdFlicker * (0.65 + bh2 * 0.25);
      boltRgb += mix(glowCol, coreCol, clamp(bLine + bTipG, 0.0, 1.0)) * bStr;
      boltLight += glowCol * bEmit * bAlong * forkOk * holdFlicker * 0.35;
    }
  }
  // Don't bury the bolt in soft vapour — storm presence is enough.
  float boltGate = max(envelope, uStormStrength * 0.55);
  boltRgb = clamp(boltRgb * flash * brightMul * boltGate, 0.0, 3.8);
  boltLight = clamp(boltLight * flash * brightMul * boltGate, 0.0, 1.5);
  rgb += boltRgb * 1.75 * uOpacity;
  rgb += boltLight * 0.4 * uOpacity;
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
    uStormSpinSign: { value: 1 },
    uStormGrow: { value: 0 },
    uStormSeed: { value: 0 },
    uStormCenter: { value: new THREE.Vector3() },
    uPlanetCenter: { value: new THREE.Vector3() },
    uLightning: { value: 0 },
    uLightningDraw: { value: 0 },
    uLightningPower: { value: 0 },
    uLightningSeed: { value: 0 },
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
