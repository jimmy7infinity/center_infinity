import * as THREE from 'three'

/**
 * Dark rock body with a cold mineral shimmer — fresnel rim + slow sparkle
 * so orbit debris stays readable against the void without looking lit-up.
 */

const vertexShader = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uVoidColor;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uIntensity;
uniform float uAmbient;
uniform float uTerminator;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimStrength;
uniform vec3 uShimmerColor;
uniform float uShimmerStrength;
uniform float uTime;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightDir);

  float ndl = dot(N, L);
  float lit = smoothstep(-uTerminator, uTerminator, ndl);
  vec3 body = mix(uVoidColor, uTint * uLightColor * uIntensity, lit);
  body += uTint * uAmbient;

  // Glancing rim — icy coat that catches the eye on silhouettes.
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
  body += uRimColor * fresnel * uRimStrength;

  // Slow mineral sparkle: sparse glints that crawl with time / orientation.
  vec3 sparkCell = floor(N * 18.0 + vec3(uTime * 0.35, uTime * 0.21, -uTime * 0.17));
  float spark = hash31(sparkCell);
  spark = smoothstep(0.88, 0.98, spark);
  float glint = spark * pow(max(dot(reflect(-V, N), L), 0.0), 8.0);
  glint += spark * fresnel * 0.65;
  // Second slower layer for a living coat.
  vec3 sparkCell2 = floor(N * 11.0 + vec3(-uTime * 0.12, uTime * 0.19, uTime * 0.08));
  float spark2 = smoothstep(0.9, 0.99, hash31(sparkCell2));
  glint += spark2 * fresnel * 0.45;

  body += uShimmerColor * glint * uShimmerStrength;

  gl_FragColor = vec4(body, 1.0);
}
`

export type RockCoatUniforms = {
  uTint: THREE.IUniform<THREE.Color>
  uVoidColor: THREE.IUniform<THREE.Color>
  uLightDir: THREE.IUniform<THREE.Vector3>
  uLightColor: THREE.IUniform<THREE.Color>
  uIntensity: THREE.IUniform<number>
  uAmbient: THREE.IUniform<number>
  uTerminator: THREE.IUniform<number>
  uRimColor: THREE.IUniform<THREE.Color>
  uRimPower: THREE.IUniform<number>
  uRimStrength: THREE.IUniform<number>
  uShimmerColor: THREE.IUniform<THREE.Color>
  uShimmerStrength: THREE.IUniform<number>
  uTime: THREE.IUniform<number>
}

export function createRockCoatMaterial(): THREE.ShaderMaterial {
  const uniforms: RockCoatUniforms = {
    uTint: { value: new THREE.Color('#4a5160') },
    uVoidColor: { value: new THREE.Color('#12151c') },
    uLightDir: { value: new THREE.Vector3(-0.55, 0.86, -0.5).normalize() },
    uLightColor: { value: new THREE.Color('#d5e0ef') },
    uIntensity: { value: 0.85 },
    uAmbient: { value: 0.08 },
    uTerminator: { value: 0.4 },
    uRimColor: { value: new THREE.Color('#b9d4f0') },
    uRimPower: { value: 2.8 },
    uRimStrength: { value: 0.55 },
    uShimmerColor: { value: new THREE.Color('#e8f2ff') },
    uShimmerStrength: { value: 0.7 },
    uTime: { value: 0 },
  }

  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader,
    fragmentShader,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  })
}

export function getRockCoatUniforms(
  material: THREE.ShaderMaterial,
): RockCoatUniforms {
  return material.uniforms as unknown as RockCoatUniforms
}
