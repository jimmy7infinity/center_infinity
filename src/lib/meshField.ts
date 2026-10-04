/** The warp mesh's grid and well. All lengths in CSS pixels. */
export const MESH_CELL = 30
export const MESH_WELL_RADIUS = 170
/** sRGB share of the panel's light pigment a grid line adds. */
export const MESH_LINE_ALPHA = 0.055

/** A stationary well. The cursor well lives on `meshField` itself. */
export type MeshWell = {
  /** Viewport CSS pixels from the top left. */
  x: number
  y: number
  /** Share of the distance to the well a point is pulled at its centre. */
  pull: number
  /** Gaussian falloff radius, CSS pixels. */
  radius: number
}

/** Live well state, written by the mesh each frame it animates. */
export const meshField = {
  /** Cursor well centre, viewport CSS pixels from the top left. */
  x: -1e4,
  y: -1e4,
  /** Share of the distance to the cursor well a point is pulled at its centre. */
  pull: 0,
  /** Fixed wells, replaced as a whole when a page needs them. */
  wells: [] as MeshWell[],
}

const wellListeners = new Set<() => void>()

/** Replace the fixed wells and ask the mesh to redraw. Identical input is ignored. */
export function setMeshWells(next: readonly MeshWell[]) {
  const current = meshField.wells
  if (
    current.length === next.length &&
    current.every(
      (well, i) =>
        well.x === next[i].x &&
        well.y === next[i].y &&
        well.pull === next[i].pull &&
        well.radius === next[i].radius,
    )
  ) {
    return
  }
  meshField.wells = next.map((well) => ({
    x: well.x,
    y: well.y,
    pull: well.pull,
    radius: well.radius,
  }))
  for (const listener of wellListeners) listener()
}

export function subscribeMeshWells(listener: () => void) {
  wellListeners.add(listener)
  return () => {
    wellListeners.delete(listener)
  }
}
