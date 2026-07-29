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
  uNormalMap: THREE.IUniform<THREE.Texture | null>
  uAlbedoMap: THREE.IUniform<THREE.Texture | null>
  uDetailMap: THREE.IUniform<THREE.Texture | null>
  uDetailRepeat: THREE.IUniform<THREE.Vector2>
  uNormalScale: THREE.IUniform<number>
  uDetailScale: THREE.IUniform<number>
  uDetailTone: THREE.IUniform<number>
  uAlbedoAmount: THREE.IUniform<number>
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
  /** Fill on the unlit hemisphere. 0 keeps the hard logo terminator. */
  ambient?: number
}

/** Fallback only; every caller passes an explicit direction from its keyframes. */
const DEFAULT_LIGHT_DIR = new THREE.Vector3(6, -7, 9).normalize()

const VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldNormal;

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
  lit = uAmbient + (1.0 - uAmbient) * lit;

  vec3 rgb = uTint * albedo * uLightColor * uIntensity * lit * uOpacity;
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
    uNormalMap: { value: surface?.normalMap ?? null },
    uAlbedoMap: { value: surface?.albedoMap ?? null },
    uDetailMap: { value: surface?.detailMap ?? null },
    uDetailRepeat: {
      value: surface?.detailRepeat.clone() ?? new THREE.Vector2(1, 1),
    },
    uNormalScale: { value: opts.normalScale ?? 1 },
    uDetailScale: { value: opts.detailScale ?? 0.6 },
    uDetailTone: { value: opts.detailTone ?? 0.2 },
    uAlbedoAmount: { value: opts.albedoAmount ?? 1 },
  }

  return new THREE.ShaderMaterial({
    uniforms,
    defines: surface ? { SHELL_SURFACE: 1 } : {},
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
