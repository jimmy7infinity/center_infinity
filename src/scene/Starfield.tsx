import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../lib/scroll'

/** Radial band the stars occupy, and the distance the warp scrolls them through. */
const SHELL_NEAR = 26
const SHELL_SPAN = 68
/** World units per second of travel at full warp. */
const WARP_SPEED = 190

const STREAK_VERTEX = /* glsl */ `
uniform float uWarp;
uniform float uTravel;

attribute float aTail;
attribute float aSpeed;

varying float vTail;
varying float vSpeed;

void main() {
  vTail = aTail;
  vSpeed = aSpeed;

  vec3 dir = normalize(position);
  float distance = length(position);

  // Scrolls inward and wraps. uTravel only accumulates while warping, so at rest
  // the modulo is the identity and every star sits exactly where it was seeded.
  // Travel is uniform across stars — that keeps the wrap seamless, and matches
  // real forward motion, where nearer stars sweep faster purely from parallax.
  float wrapped = ${SHELL_NEAR.toFixed(1)} + mod(
    distance - ${SHELL_NEAR.toFixed(1)} - uTravel,
    ${SHELL_SPAN.toFixed(1)}
  );

  // The tail trails outward, away from the direction of travel.
  float streak = uWarp * (2.0 + 46.0 * aSpeed);
  vec3 world = dir * (wrapped + aTail * streak);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
}
`

const STREAK_FRAGMENT = /* glsl */ `
uniform float uWarp;
uniform vec3 uColor;

varying float vTail;
varying float vSpeed;

void main() {
  // Bright at the head, falling away along the tail.
  float falloff = pow(1.0 - vTail, 1.6);
  float alpha = uWarp * falloff * (0.4 + 0.6 * vSpeed);
  gl_FragColor = vec4(uColor * (0.7 + 2.6 * uWarp), alpha);
}
`

function createStreakGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 2 * 3)
  const tails = new Float32Array(count * 2)
  const speeds = new Float32Array(count * 2)

  for (let i = 0; i < count; i++) {
    const radius = SHELL_NEAR + Math.random() * SHELL_SPAN
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const x = radius * Math.sin(phi) * Math.cos(theta)
    const y = radius * Math.sin(phi) * Math.sin(theta)
    const z = radius * Math.cos(phi)
    const speed = 0.35 + Math.random() * 0.65

    for (let end = 0; end < 2; end++) {
      const v = i * 2 + end
      positions[v * 3] = x
      positions[v * 3 + 1] = y
      positions[v * 3 + 2] = z
      tails[v] = end
      speeds[v] = speed
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aTail', new THREE.BufferAttribute(tails, 1))
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
  return geometry
}

function createPointGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const radius = 35 + Math.random() * 40
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)

    // Mostly small stars with a few brighter, larger ones.
    sizes[i] =
      Math.random() < 0.85
        ? 0.5 + Math.random() * 0.5
        : 1.2 + Math.random() * 1.3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('pointScale', new THREE.BufferAttribute(sizes, 1))
  return geometry
}

/**
 * Faint drifting points give the void a sense of scale as the camera moves; a
 * second line layer stretches the same shell into hyperjump streaks when the
 * warp beat takes over.
 */
export function Starfield({ count = 900 }: { count?: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const travelRef = useRef(0)

  const pointGeometry = useMemo(() => createPointGeometry(count), [count])
  const streakGeometry = useMemo(() => createStreakGeometry(count), [count])

  const pointMaterial = useMemo(() => {
    const material = new THREE.PointsMaterial({
      color: '#eef3ff',
      size: 0.32,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'uniform float size;',
        'uniform float size;\nattribute float pointScale;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * pointScale;',
      )
    }

    return material
  }, [])

  const streakMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uWarp: { value: 0 },
          uTravel: { value: 0 },
          uColor: { value: new THREE.Color('#dfe9ff') },
        },
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      pointGeometry.dispose()
      streakGeometry.dispose()
      pointMaterial.dispose()
      streakMaterial.dispose()
    }
  }, [pointGeometry, streakGeometry, pointMaterial, streakMaterial])

  useFrame((_, delta) => {
    const warp = scrollState.warp

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.008
    }

    travelRef.current = (travelRef.current + delta * warp * WARP_SPEED) % SHELL_SPAN
    streakMaterial.uniforms.uTravel.value = travelRef.current
    streakMaterial.uniforms.uWarp.value = warp

    // The points stay as streak heads but step back as the streaks take over.
    pointMaterial.opacity = 1 - 0.55 * warp
  })

  return (
    <group ref={groupRef}>
      <points geometry={pointGeometry} material={pointMaterial} />
      <lineSegments geometry={streakGeometry} material={streakMaterial} />
    </group>
  )
}
