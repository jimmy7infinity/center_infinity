import * as THREE from 'three'

export type ShellMaterialUniforms = {
  uLightDir: THREE.IUniform<THREE.Vector3>
  uLightColor: THREE.IUniform<THREE.Color>
  uIntensity: THREE.IUniform<number>
  uTint: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
  uNormalMap: THREE.IUniform<THREE.Texture | null>
  uNormalScale: THREE.IUniform<number>
  uTerminator: THREE.IUniform<number>
  uAmbient: THREE.IUniform<number>
}

export type ShellMaterialOptions = {
  tint: THREE.ColorRepresentation
  /** Omit for geometry without sphere UVs; lighting then uses vertex normals. */
  normalMap?: THREE.Texture
  normalScale?: number
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

#ifdef SHELL_NORMAL_MAP
varying vec2 vUv;
varying vec3 vWorldTangent;
varying vec3 vWorldBitangent;
#endif

void main() {
  vec3 objectNormal = normalize(normal);
  mat3 normalMat = mat3(modelMatrix);
  vWorldNormal = normalize(normalMat * objectNormal);

#ifdef SHELL_NORMAL_MAP
  vUv = uv;

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

#ifdef SHELL_NORMAL_MAP
uniform sampler2D uNormalMap;
uniform float uNormalScale;
varying vec2 vUv;
varying vec3 vWorldTangent;
varying vec3 vWorldBitangent;
#endif

void main() {
  vec3 L = normalize(uLightDir);

#ifdef SHELL_NORMAL_MAP
  vec3 mapNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  mapNormal.xy *= uNormalScale;

  mat3 tbn = mat3(
    normalize(vWorldTangent),
    normalize(vWorldBitangent),
    normalize(vWorldNormal)
  );
  vec3 N = normalize(tbn * mapNormal);
#else
  vec3 N = normalize(vWorldNormal);
#endif

  float ndotl = dot(N, L);
  float lit = smoothstep(-uTerminator, uTerminator, ndotl);
  lit = pow(lit, 1.35);
  lit = uAmbient + (1.0 - uAmbient) * lit;

  vec3 rgb = uTint * uLightColor * uIntensity * lit * uOpacity;
  gl_FragColor = vec4(rgb, 1.0);
}
`

export function createShellMaterial(opts: ShellMaterialOptions): THREE.ShaderMaterial {
  const lightDir = opts.lightDir ?? DEFAULT_LIGHT_DIR

  const uniforms: ShellMaterialUniforms = {
    uLightDir: { value: lightDir.clone().normalize() },
    uLightColor: { value: new THREE.Color(opts.lightColor ?? '#dfe6f5') },
    uIntensity: { value: opts.intensity ?? 8.5 },
    uTint: { value: new THREE.Color(opts.tint) },
    uOpacity: { value: opts.opacity ?? 0 },
    uNormalMap: { value: opts.normalMap ?? null },
    uNormalScale: { value: opts.normalScale ?? 1 },
    uTerminator: { value: opts.terminator ?? 0.08 },
    uAmbient: { value: opts.ambient ?? 0 },
  }

  return new THREE.ShaderMaterial({
    uniforms,
    defines: opts.normalMap ? { SHELL_NORMAL_MAP: 1 } : {},
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
