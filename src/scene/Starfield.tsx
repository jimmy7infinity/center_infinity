import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Faint drifting points give the void a sense of scale as the camera moves. */
export function Starfield({ count = 900 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null)

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Shell behind moons; material opts out of scene fog.
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

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('pointScale', new THREE.BufferAttribute(sizes, 1))
    return geo
  }, [count])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      color: '#eef3ff',
      size: 0.32,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'uniform float size;',
        'uniform float size;\nattribute float pointScale;',
      )
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * pointScale;',
      )
    }

    return mat
  }, [])

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.008
    }
  })

  return (
    <points ref={pointsRef} geometry={geometry} material={material} />
  )
}
