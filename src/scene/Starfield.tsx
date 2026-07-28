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
      // Farther shell so depth feels deeper; keeps stars behind the moons.
      const radius = 40 + Math.random() * 50
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
      sizes[i] = 0.55 + Math.random() * 0.9
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('pointScale', new THREE.BufferAttribute(sizes, 1))
    return geo
  }, [count])

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      color: '#c8d2e6',
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
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
