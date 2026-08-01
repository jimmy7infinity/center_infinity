import * as THREE from 'three'

const MAX_BURSTS = 12
const PIECES_PER_BURST = 12
const SPARKS_PER_BURST = 16
const BURST_LIFE = 0.9
const SHARD_VARIANTS = 3

export type RockBurstSystem = {
  pieceMeshes: THREE.InstancedMesh[]
  sparkMesh: THREE.InstancedMesh
  update: (dt: number) => void
  spawn: (origin: THREE.Vector3, size: number) => void
  dispose: () => void
}

type Piece = {
  alive: boolean
  life: number
  maxLife: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  spin: THREE.Euler
  tumble: THREE.Vector3
  scale: number
  /** Which shard mesh variant draws this piece. */
  variant: number
}

type Burst = {
  alive: boolean
  pieces: Piece[]
  sparks: Piece[]
}

const _matrix = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _zero = new THREE.Vector3(0, 0, 0)
const _dir = new THREE.Vector3()

function createPiece(): Piece {
  return {
    alive: false,
    life: 0,
    maxLife: 1,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    spin: new THREE.Euler(),
    tumble: new THREE.Vector3(),
    scale: 1,
    variant: 0,
  }
}

function createBurst(): Burst {
  return {
    alive: false,
    pieces: Array.from({ length: PIECES_PER_BURST }, () => createPiece()),
    sparks: Array.from({ length: SPARKS_PER_BURST }, () => createPiece()),
  }
}

function hideInstance(mesh: THREE.InstancedMesh, index: number) {
  _scale.set(0, 0, 0)
  _matrix.compose(_zero, _quat.identity(), _scale)
  mesh.setMatrixAt(index, _matrix)
}

/** Compact craggy boulder — same idea as site rocks, lighter for FX. */
function createShardGeometry(seed: number): THREE.BufferGeometry {
  let s = seed >>> 0
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }

  const geometry = new THREE.IcosahedronGeometry(1, 2)
  const position = geometry.attributes.position
  const dir = new THREE.Vector3()
  const lobes = Array.from({ length: 6 }, () => ({
    axis: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
    amp: 0.08 + rng() * 0.16,
    freq: 1.8 + rng() * 3.5,
    phase: rng() * Math.PI * 2,
  }))

  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize()
    let radius = 1
    for (const lobe of lobes) {
      radius += lobe.amp * Math.cos(dir.dot(lobe.axis) * lobe.freq + lobe.phase)
    }
    position.setXYZ(i, dir.x * radius, dir.y * radius, dir.z * radius)
  }
  position.needsUpdate = true
  geometry.scale(1, 0.7 + rng() * 0.25, 0.78 + rng() * 0.28)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * Chunk + spark pool — dark rock shards (not flat triangles) + blue sparks.
 */
export function createRockBurstSystem(): RockBurstSystem {
  const bursts = Array.from({ length: MAX_BURSTS }, () => createBurst())
  const perVariant = MAX_BURSTS * PIECES_PER_BURST

  const shardGeos = Array.from({ length: SHARD_VARIANTS }, (_, i) =>
    createShardGeometry(0xc0ffee + i * 9973),
  )
  const pieceMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })

  const pieceMeshes = shardGeos.map((geometry) => {
    const mesh = new THREE.InstancedMesh(geometry, pieceMat, perVariant)
    mesh.frustumCulled = false
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(mesh.count * 3),
      3,
    )
    for (let i = 0; i < mesh.count; i++) hideInstance(mesh, i)
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  })

  const sparkGeo = new THREE.SphereGeometry(1, 6, 6)
  const sparkMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const sparkMesh = new THREE.InstancedMesh(
    sparkGeo,
    sparkMat,
    MAX_BURSTS * SPARKS_PER_BURST,
  )
  sparkMesh.frustumCulled = false
  sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(sparkMesh.count * 3),
    3,
  )
  for (let i = 0; i < sparkMesh.count; i++) hideInstance(sparkMesh, i)
  sparkMesh.instanceMatrix.needsUpdate = true

  // Per-variant write cursors rebuilt each frame.
  const variantWrite = new Int32Array(SHARD_VARIANTS)

  const spawn = (origin: THREE.Vector3, size: number) => {
    const burst = bursts.find((entry) => !entry.alive) ?? bursts[0]
    burst.alive = true

    for (let i = 0; i < burst.pieces.length; i++) {
      const piece = burst.pieces[i]
      piece.alive = true
      piece.variant = i % SHARD_VARIANTS
      piece.maxLife = BURST_LIFE * (0.7 + Math.random() * 0.5)
      piece.life = piece.maxLife
      _dir
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
      piece.position.copy(origin).addScaledVector(_dir, size * 0.18 * Math.random())
      piece.velocity
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(1.6 + Math.random() * 3.4)
      piece.velocity.y += 0.5 + Math.random() * 1.1
      piece.tumble.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
      )
      piece.spin.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      )
      piece.scale = size * (0.16 + Math.random() * 0.32)
    }

    for (const spark of burst.sparks) {
      spark.alive = true
      spark.variant = 0
      spark.maxLife = BURST_LIFE * (0.35 + Math.random() * 0.45)
      spark.life = spark.maxLife
      spark.position.copy(origin)
      spark.velocity
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(3 + Math.random() * 6)
      spark.tumble.set(0, 0, 0)
      spark.spin.set(0, 0, 0)
      spark.scale = size * (0.03 + Math.random() * 0.055)
    }
  }

  const update = (dt: number) => {
    variantWrite.fill(0)
    let sparkIndex = 0
    const sparkColors = sparkMesh.instanceColor!.array as Float32Array

    // Clear unused instance slots at end of each variant after writing actives.
    for (const burst of bursts) {
      if (!burst.alive) continue
      let anyAlive = false

      for (const piece of burst.pieces) {
        if (!piece.alive) continue
        piece.life -= dt
        if (piece.life <= 0) {
          piece.alive = false
          continue
        }
        anyAlive = true
        piece.velocity.multiplyScalar(Math.exp(-1.8 * dt))
        piece.position.addScaledVector(piece.velocity, dt)
        piece.spin.x += piece.tumble.x * dt
        piece.spin.y += piece.tumble.y * dt
        piece.spin.z += piece.tumble.z * dt

        const mesh = pieceMeshes[piece.variant]
        const index = variantWrite[piece.variant]
        variantWrite[piece.variant] = index + 1
        if (index >= mesh.count) continue

        const fade = piece.life / piece.maxLife
        _quat.setFromEuler(piece.spin)
        _scale.setScalar(piece.scale * (0.55 + fade * 0.45))
        _matrix.compose(piece.position, _quat, _scale)
        mesh.setMatrixAt(index, _matrix)
        const colors = mesh.instanceColor!.array as Float32Array
        // Dark landing-page rock greys.
        colors[index * 3] = 0.28 * fade
        colors[index * 3 + 1] = 0.3 * fade
        colors[index * 3 + 2] = 0.34 * fade
      }

      for (const spark of burst.sparks) {
        const index = sparkIndex
        sparkIndex += 1
        if (!spark.alive) {
          hideInstance(sparkMesh, index)
          continue
        }
        spark.life -= dt
        if (spark.life <= 0) {
          spark.alive = false
          hideInstance(sparkMesh, index)
          continue
        }
        anyAlive = true
        spark.velocity.multiplyScalar(Math.exp(-2.4 * dt))
        spark.position.addScaledVector(spark.velocity, dt)
        const fade = spark.life / spark.maxLife
        _quat.identity()
        _scale.setScalar(spark.scale * (0.4 + fade * 0.9))
        _matrix.compose(spark.position, _quat, _scale)
        sparkMesh.setMatrixAt(index, _matrix)
        sparkColors[index * 3] = 0.55 * fade + 0.25
        sparkColors[index * 3 + 1] = 0.75 * fade + 0.2
        sparkColors[index * 3 + 2] = 1
      }

      burst.alive = anyAlive
    }

    // Hide leftover spark slots + unused shard slots.
    for (; sparkIndex < sparkMesh.count; sparkIndex += 1) {
      hideInstance(sparkMesh, sparkIndex)
    }
    for (let v = 0; v < SHARD_VARIANTS; v++) {
      const mesh = pieceMeshes[v]
      for (let i = variantWrite[v]; i < mesh.count; i++) hideInstance(mesh, i)
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
    }
    sparkMesh.instanceMatrix.needsUpdate = true
    sparkMesh.instanceColor!.needsUpdate = true
  }

  const dispose = () => {
    for (const geo of shardGeos) geo.dispose()
    pieceMat.dispose()
    sparkGeo.dispose()
    sparkMat.dispose()
  }

  return { pieceMeshes, sparkMesh, update, spawn, dispose }
}
