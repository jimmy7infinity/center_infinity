import * as THREE from 'three'

/**
 * Shares the background Canvas camera pose with the foreground debris Canvas
 * so rocks/meteors stay locked to the same view while rendering above the DOM.
 */
export const cameraBridge = {
  position: new THREE.Vector3(0, 0, 27),
  target: new THREE.Vector3(0, 0, -2),
  fov: 42,
  ready: false,
}

export function publishCamera(
  position: THREE.Vector3,
  target: THREE.Vector3,
  fov: number,
) {
  cameraBridge.position.copy(position)
  cameraBridge.target.copy(target)
  cameraBridge.fov = fov
  cameraBridge.ready = true
}
