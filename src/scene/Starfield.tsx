import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Radial band the stars occupy. */
const SHELL_NEAR = 34
const SHELL_SPAN = 62
/** Share of stars printed in the brighter of the two tones. */
const BRIGHT_SHARE = 0.14

function createPointGeometry(count: number): THREE.BufferGeometry {
  const position = new Float32Array(count * 3)
  const size = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const r = SHELL_NEAR + Math.random() * SHELL_SPAN
    const theta = Math.random() * Math.PI * 2
    // acos of a uniform variate, so the points are even over the sphere rather
    // than bunched at the poles.
    const phi = Math.acos(2 * Math.random() - 1)

    position[i * 3] = Math.sin(phi) * Math.cos(theta) * r
    position[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r
    position[i * 3 + 2] = Math.cos(phi) * r

    // Mostly small, with a few that carry the composition.
    size[i] =
      Math.random() < 1 - BRIGHT_SHARE
        ? 0.12 + Math.random() * 0.1
        : 0.26 + Math.random() * 0.18
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  return geometry
}

const POINT_VERTEX = /* glsl */ `
uniform float uViewportHeight;

attribute float aSize;

varying float vTone;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vTone = aSize > 0.25 ? 1.0 : 0.4;

  // Proper perspective sizing rather than three's fixed scale factor. Floored at
  // a few pixels so the smallest dots still survive the panel's ink spread.
  float depth = max(0.001, -mvPosition.z);
  gl_PointSize = clamp(
    aSize * projectionMatrix[1][1] * uViewportHeight * 0.5 / depth,
    2.0,
    22.0
  );
}
`

const POINT_FRAGMENT = /* glsl */ `
varying float vTone;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;

  // Two flat tones, hard edge, no halo, no twinkle: a dot of pigment, not a light.
  float disc = 1.0 - smoothstep(0.5, 0.65, r);
  float ink = disc * vTone;
  gl_FragColor = vec4(vec3(ink), ink);
}
`

const drawingBuffer = new THREE.Vector2()

/** Sparse printed dots that give the void a sense of scale. */
export function Starfield({ count = 225 }: { count?: number }) {
  const groupRef = useRef<THREE.Group>(null)

  const geometry = useMemo(() => createPointGeometry(count), [count])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uViewportHeight: { value: 900 },
        },
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.008
    }
    state.gl.getDrawingBufferSize(drawingBuffer)
    material.uniforms.uViewportHeight.value = drawingBuffer.y
  })

  return (
    <group ref={groupRef}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}
