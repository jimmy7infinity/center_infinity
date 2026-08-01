import * as THREE from 'three'

/** Segments along a bolt — same ribbon idea as the site’s shooting stars. */
const TRAIL_SEGMENTS = 14

const CORE = new THREE.Color('#ffe4d6')
const GLOW = new THREE.Color('#ff2a2a')

const vertexShader = /* glsl */ `
attribute float aSide;
attribute float aAlong;

uniform vec3 uHead;
uniform vec3 uTail;
uniform float uHeadWidth;
uniform float uTailWidth;

varying float vAlong;
varying float vAcross;

void main() {
  vAlong = aAlong;
  vAcross = aSide;

  vec3 axis = uHead - uTail;
  float len = length(axis);
  vec3 forward = len > 1e-5 ? axis / len : vec3(0.0, 0.0, -1.0);
  vec3 mid = mix(uTail, uHead, 1.0 - aAlong);
  vec3 toCam = normalize(cameraPosition - mid);
  vec3 right = cross(forward, toCam);
  float rLen = length(right);
  right = rLen > 1e-5 ? right / rLen : normalize(cross(forward, vec3(0.0, 1.0, 0.0)));

  float taper = pow(1.0 - aAlong, 1.55);
  float width = mix(uTailWidth, uHeadWidth, taper);
  vec3 pos = mix(uHead, uTail, aAlong) + right * aSide * width;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uCoreColor;
uniform vec3 uGlowColor;
uniform float uOpacity;

varying float vAlong;
varying float vAcross;

void main() {
  float across = 1.0 - abs(vAcross);
  float spine = pow(across, 1.8);
  float glow = pow(across, 0.55);
  float tipFade = 1.0 - smoothstep(0.15, 1.0, vAlong);
  float headBoost = 1.0 - smoothstep(0.0, 0.28, vAlong);

  vec3 color = mix(uGlowColor, uCoreColor, spine * (0.45 + headBoost * 0.55));
  color += uCoreColor * headBoost * 0.5;
  float alpha = tipFade * mix(glow * 0.55, spine, 0.35) * uOpacity;
  alpha *= mix(1.35, 0.2, vAlong);

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`

export type ShotStreak = {
  mesh: THREE.Mesh
  uniforms: {
    uHead: THREE.IUniform<THREE.Vector3>
    uTail: THREE.IUniform<THREE.Vector3>
    uHeadWidth: THREE.IUniform<number>
    uTailWidth: THREE.IUniform<number>
    uCoreColor: THREE.IUniform<THREE.Color>
    uGlowColor: THREE.IUniform<THREE.Color>
    uOpacity: THREE.IUniform<number>
  }
}

function createTrailGeometry(): THREE.BufferGeometry {
  const seg = TRAIL_SEGMENTS
  const verts = (seg + 1) * 2
  const positions = new Float32Array(verts * 3)
  const sides = new Float32Array(verts)
  const alongs = new Float32Array(verts)
  const indices: number[] = []

  for (let i = 0; i <= seg; i++) {
    const along = i / seg
    const a = i * 2
    const b = a + 1
    sides[a] = -1
    sides[b] = 1
    alongs[a] = along
    alongs[b] = along
    if (i < seg) {
      const c = (i + 1) * 2
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1))
  geometry.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1))
  geometry.setIndex(indices)
  return geometry
}

export function createShotStreak(): ShotStreak {
  const uniforms = {
    uHead: { value: new THREE.Vector3() },
    uTail: { value: new THREE.Vector3() },
    uHeadWidth: { value: 0.038 },
    uTailWidth: { value: 0.0015 },
    uCoreColor: { value: CORE.clone() },
    uGlowColor: { value: GLOW.clone() },
    uOpacity: { value: 0 },
  }

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(createTrailGeometry(), material)
  mesh.frustumCulled = false
  mesh.visible = false
  mesh.renderOrder = 8

  return { mesh, uniforms }
}

export function updateShotStreak(
  streak: ShotStreak,
  head: THREE.Vector3,
  direction: THREE.Vector3,
  alive: boolean,
  trailLength = 3.2,
) {
  if (!alive) {
    streak.mesh.visible = false
    streak.uniforms.uOpacity.value = 0
    return
  }
  streak.uniforms.uHead.value.copy(head)
  streak.uniforms.uTail.value
    .copy(head)
    .addScaledVector(direction, -trailLength)
  streak.uniforms.uOpacity.value = 0.95
  streak.mesh.visible = true
}

export function disposeShotStreak(streak: ShotStreak) {
  streak.mesh.geometry.dispose()
  ;(streak.mesh.material as THREE.Material).dispose()
}
