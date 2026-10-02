/** The warp mesh's grid and well. All lengths in CSS pixels. */
export const MESH_CELL = 30
export const MESH_WELL_RADIUS = 170
/** sRGB share of the panel's light pigment a grid line adds. */
export const MESH_LINE_ALPHA = 0.055

/** Live well state, written by the mesh each frame it animates. */
export const meshField = {
  /** Well centre, viewport CSS pixels from the top left. */
  x: -1e4,
  y: -1e4,
  /** Share of the distance to the well a point is pulled at its centre. */
  pull: 0,
}
