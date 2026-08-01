import { useEffect, useMemo } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BoosterJet } from './BoosterJet'

/** Readable craft that still sits small against the hero moons. */
export const SHIP_VISUAL_SCALE = 0.15

const CHROME = new THREE.Color('#dce6f4')
const CHROME_TRIM = new THREE.Color('#a8bdd8')

/**
 * Equirectangular void HDR-ish map: dark ash, cool upper rim, bright sun.
 * Floor is only slightly lifted so chrome stays metal, not a glowing hull.
 */
function createSpaceEnvMap(gl: THREE.WebGLRenderer): THREE.Texture {
  const width = 512
  const height = 256
  const data = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width
      const v = y / height
      const theta = u * Math.PI * 2
      const phi = v * Math.PI
      const dirX = Math.sin(phi) * Math.cos(theta)
      const dirY = Math.cos(phi)
      const dirZ = Math.sin(phi) * Math.sin(theta)

      // Modest floor vs pure void — enough to read edges, not wash the metal.
      let r = 22
      let g = 24
      let b = 30

      const up = Math.max(0, dirY)
      r += up * 52
      g += up * 72
      b += up * 108

      const down = Math.max(0, -dirY)
      r += down * 12
      g += down * 14
      b += down * 18

      const sun = Math.pow(
        Math.max(0, dirX * -0.35 + dirY * 0.82 + dirZ * -0.45),
        42,
      )
      r += sun * 235
      g += sun * 245
      b += sun * 255

      const fill = Math.pow(
        Math.max(0, dirX * 0.55 + dirY * 0.15 + dirZ * 0.55),
        10,
      )
      r += fill * 40
      g += fill * 62
      b += fill * 115

      const i = (y * width + x) * 4
      data[i] = Math.min(255, r)
      data[i + 1] = Math.min(255, g)
      data[i + 2] = Math.min(255, b)
      data[i + 3] = 255
    }
  }

  const equirect = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  equirect.colorSpace = THREE.SRGBColorSpace
  equirect.needsUpdate = true

  const pmrem = new THREE.PMREMGenerator(gl)
  const envMap = pmrem.fromEquirectangular(equirect).texture
  equirect.dispose()
  pmrem.dispose()
  return envMap
}

function createChromeMaterial(
  tone: THREE.Color,
  envMap: THREE.Texture,
  roughness: number,
) {
  return new THREE.MeshPhysicalMaterial({
    color: tone,
    metalness: 1,
    roughness,
    envMap,
    envMapIntensity: 1.55,
    clearcoat: 0.55,
    clearcoatRoughness: Math.min(0.35, roughness + 0.05),
    reflectivity: 1,
  })
}

/**
 * Kenney Space Kit speeder (CC0) — chrome hull reflecting a cold space IBL.
 */
export function ShipModel() {
  const gl = useThree((state) => state.gl)
  const gltf = useLoader(GLTFLoader, '/models/craft_speeder.glb')

  const envMap = useMemo(() => createSpaceEnvMap(gl), [gl])

  const { scene, aftZ, materials } = useMemo(() => {
    const root = gltf.scene.clone(true)
    // Model noses +Z; flyer group faces −Z.
    root.rotation.y = Math.PI

    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    root.position.sub(center)
    const aft = box.max.z - center.z

    const built: THREE.Material[] = []
    let meshIndex = 0
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.castShadow = false
      obj.receiveShadow = false
      const prev = obj.material
      const list = Array.isArray(prev) ? prev : [prev]
      const next = list.map(() => {
        const trim = meshIndex % 3 === 1
        meshIndex += 1
        const mat = createChromeMaterial(
          trim ? CHROME_TRIM : CHROME,
          envMap,
          trim ? 0.22 : 0.1,
        )
        built.push(mat)
        return mat
      })
      obj.material = Array.isArray(prev) ? next : next[0]
    })

    return { scene: root, aftZ: aft, materials: built }
  }, [gltf.scene, envMap])

  useEffect(() => {
    return () => {
      for (const mat of materials) mat.dispose()
      envMap.dispose()
    }
  }, [materials, envMap])

  return (
    <group scale={SHIP_VISUAL_SCALE}>
      <primitive object={scene} />
      <BoosterJet aftZ={aftZ} />
    </group>
  )
}

/** Tiny placeholder while the GLB streams in. */
export function ShipFallback() {
  return (
    <group scale={SHIP_VISUAL_SCALE}>
      <mesh>
        <boxGeometry args={[0.9, 0.35, 1.5]} />
        <meshStandardMaterial color={CHROME} metalness={1} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0, -0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.25, 0.6, 8]} />
        <meshStandardMaterial
          color={CHROME_TRIM}
          metalness={1}
          roughness={0.25}
        />
      </mesh>
    </group>
  )
}
