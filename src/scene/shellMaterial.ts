import * as THREE from 'three'

export type ShellMaterialUniforms = {
  uLightDir: THREE.IUniform<THREE.Vector3>
  uLightColor: THREE.IUniform<THREE.Color>
  uIntensity: THREE.IUniform<number>
  uTint: THREE.IUniform<THREE.Color>
  uOpacity: THREE.IUniform<number>
  uNormalMap: THREE.IUniform<THREE.Texture>
  uNormalScale: THREE.IUniform<number>
  uTerminator: THREE.IUniform<number>
}

export type ShellMaterialOptions = {
  tint: THREE.ColorRepresentation
  normalMap: THREE.Texture
  normalScale: number
  lightDir?: THREE.Vector3
  lightColor?: THREE.ColorRepresentation
  intensity?: number
  terminator?: number
  opacity?: number
}

export type ShellMaterialUniformUpdate = {
  lightDir?: THREE.Vector3
  lightColor?: THREE.ColorRepresentation
  intensity?: number
  tint?: THREE.ColorRepresentation
  opacity?: number
  normalMap?: THREE.Texture
  normalScale?: number
  terminator?: number
}

/** Matches the scene key light at [-6, 7, -9] shining toward the origin. */
const DEFAULT_LIGHT_DIR = new THREE.Vector3(6, -7, 9).normalize()

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldTangent;
varying vec3 vWorldBitangent;

void main() {
  vUv = uv;

  vec3 objectNormal = normalize(normal);

  // Analytical tangent basis for sphere UV parametrisation (avoids derivative extension).
  float u = uv.x * 6.28318530718;
  float v = uv.y * 3.14159265359;
  float sinV = sin(v);
  float cosV = cos(v);
  float sinU = sin(u);
  float cosU = cos(u);

  vec3 dPdu = vec3(-sinV * sinU, 0.0, sinV * cosU);
  float dPduLen = length(dPdu);
  vec3 objectTangent = dPduLen > 1e-4 ? dPdu / dPduLen : vec3(1.0, 0.0, 0.0);
  vec3 objectBitangent = normalize(cross(objectNormal, objectTangent));

  mat3 normalMat = mat3(modelMatrix);
  vWorldNormal = normalize(normalMat * objectNormal);
  vWorldTangent = normalize(normalMat * objectTangent);
  vWorldBitangent = normalize(normalMat * objectBitangent);

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
uniform sampler2D uNormalMap;
uniform float uNormalScale;
uniform float uTerminator;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldTangent;
varying vec3 vWorldBitangent;

void main() {
  vec3 mapNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  mapNormal.xy *= uNormalScale;

  mat3 tbn = mat3(
    normalize(vWorldTangent),
    normalize(vWorldBitangent),
    normalize(vWorldNormal)
  );
  vec3 N = normalize(tbn * mapNormal);

  vec3 L = normalize(uLightDir);
  float ndotl = dot(N, L);
  float lit = smoothstep(-uTerminator, uTerminator, ndotl);

  vec3 rgb = uTint * uLightColor * uIntensity * lit;
  gl_FragColor = vec4(rgb, uOpacity);
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
    uNormalMap: { value: opts.normalMap },
    uNormalScale: { value: opts.normalScale },
    uTerminator: { value: opts.terminator ?? 0.08 },
  }

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

export function getShellMaterialUniforms(
  material: THREE.ShaderMaterial,
): ShellMaterialUniforms {
  return material.uniforms as ShellMaterialUniforms
}

export function updateShellMaterialUniforms(
  material: THREE.ShaderMaterial,
  updates: ShellMaterialUniformUpdate,
): void {
  const uniforms = getShellMaterialUniforms(material)

  if (updates.lightDir !== undefined) {
    uniforms.uLightDir.value.copy(updates.lightDir).normalize()
  }
  if (updates.lightColor !== undefined) {
    uniforms.uLightColor.value.set(updates.lightColor)
  }
  if (updates.intensity !== undefined) {
    uniforms.uIntensity.value = updates.intensity
  }
  if (updates.tint !== undefined) {
    uniforms.uTint.value.set(updates.tint)
  }
  if (updates.opacity !== undefined) {
    uniforms.uOpacity.value = updates.opacity
  }
  if (updates.normalMap !== undefined) {
    uniforms.uNormalMap.value = updates.normalMap
  }
  if (updates.normalScale !== undefined) {
    uniforms.uNormalScale.value = updates.normalScale
  }
  if (updates.terminator !== undefined) {
    uniforms.uTerminator.value = updates.terminator
  }
}
