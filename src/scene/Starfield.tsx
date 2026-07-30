import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { scrollState } from '../lib/scroll'

/** Radial band the stars occupy, and the distance the warp scrolls them through. */
const SHELL_NEAR = 34
const SHELL_SPAN = 62
/** World units per second of travel at full warp. */
const WARP_SPEED = 190

/**
 * Weighted toward cool white, with a handful of warm ones. Real star fields are
 * not monochrome, and the variation is most of what stops a point field from
 * looking like dust on the lens.
 */
const STAR_COLOURS: Array<[string, number]> = [
  ['#ffffff', 0.4],
  ['#dce8ff', 0.28],
  ['#a8c6ff', 0.16],
  ['#ffe0bd', 0.11],
  ['#ffbf91', 0.05],
]

type StarSeeds = {
  count: number
  /** Seed positions; radius is re-derived in the shader so the warp can wrap it. */
  position: Float32Array
  direction: Float32Array
  radius: Float32Array
  /** World-space diameter, before perspective. */
  size: Float32Array
  phase: Float32Array
  speed: Float32Array
  colour: Float32Array
}

function pickColour(): THREE.Color {
  let roll = Math.random()
  for (const [hex, weight] of STAR_COLOURS) {
    roll -= weight
    if (roll <= 0) return new THREE.Color(hex)
  }
  return new THREE.Color(STAR_COLOURS[0][0])
}

/**
 * One set of seeds drives both layers, so a streak is literally the star it
 * came from stretching rather than a second field faded in over the top.
 */
function createStarSeeds(count: number): StarSeeds {
  const position = new Float32Array(count * 3)
  const direction = new Float32Array(count * 3)
  const radius = new Float32Array(count)
  const size = new Float32Array(count)
  const phase = new Float32Array(count)
  const speed = new Float32Array(count)
  const colour = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const r = SHELL_NEAR + Math.random() * SHELL_SPAN
    const theta = Math.random() * Math.PI * 2
    // acos of a uniform variate, so the points are even over the sphere rather
    // than bunched at the poles.
    const phi = Math.acos(2 * Math.random() - 1)

    const dx = Math.sin(phi) * Math.cos(theta)
    const dy = Math.sin(phi) * Math.sin(theta)
    const dz = Math.cos(phi)

    direction[i * 3] = dx
    direction[i * 3 + 1] = dy
    direction[i * 3 + 2] = dz
    radius[i] = r

    position[i * 3] = dx * r
    position[i * 3 + 1] = dy * r
    position[i * 3 + 2] = dz * r

    // Mostly small, with a few that carry the composition.
    size[i] =
      Math.random() < 0.86
        ? 0.12 + Math.random() * 0.1
        : 0.26 + Math.random() * 0.18
    phase[i] = Math.random()
    speed[i] = 0.35 + Math.random() * 0.65

    const c = pickColour()
    colour[i * 3] = c.r
    colour[i * 3 + 1] = c.g
    colour[i * 3 + 2] = c.b
  }

  return { count, position, direction, radius, size, phase, speed, colour }
}

/** Shared by both layers: inward travel that wraps within the shell. */
const WRAP_GLSL = /* glsl */ `
uniform float uTravel;

float wrapRadius(float radius) {
  return ${SHELL_NEAR.toFixed(1)} + mod(
    radius - ${SHELL_NEAR.toFixed(1)} - uTravel,
    ${SHELL_SPAN.toFixed(1)}
  );
}

// Stars vanish at the near edge and reappear at the far one. Unfaded, that pop
// is the most visible thing on screen during a jump.
float edgeFade(float wrapped, float warp) {
  float u = (wrapped - ${SHELL_NEAR.toFixed(1)}) / ${SHELL_SPAN.toFixed(1)};
  float fade = min(smoothstep(0.0, 0.1, u), smoothstep(1.0, 0.9, u));
  return mix(1.0, fade, warp);
}
`

const POINT_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uWarp;
uniform float uFade;
uniform float uViewportHeight;

attribute float aSize;
attribute float aPhase;
attribute vec3 aColour;

varying vec3 vColour;
varying float vAlpha;

${WRAP_GLSL}

void main() {
  vec3 dir = normalize(position);
  float wrapped = wrapRadius(length(position));

  vec4 mvPosition = modelViewMatrix * vec4(dir * wrapped, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Two detuned frequencies, so the field never pulses in unison the way a
  // single sine makes it.
  float twinkle =
    0.66 +
    0.24 * sin(uTime * 2.1 + aPhase * 6.2831) +
    0.10 * sin(uTime * 0.77 + aPhase * 12.566);

  vColour = aColour;
  vAlpha = twinkle * uFade * edgeFade(wrapped, uWarp);

  // Proper perspective sizing rather than three's fixed scale factor: this one
  // stays correct when the camera's field of view changes across the beats.
  // Floored at a few pixels: a gaussian squeezed into one pixel loses almost
  // all of its energy to the falloff and the star simply disappears.
  float depth = max(0.001, -mvPosition.z);
  gl_PointSize = clamp(
    aSize * projectionMatrix[1][1] * uViewportHeight * 0.5 / depth,
    2.0,
    22.0
  );
}
`

const POINT_FRAGMENT = /* glsl */ `
varying vec3 vColour;
varying float vAlpha;

void main() {
  vec2 offset = gl_PointCoord - 0.5;
  float r = length(offset) * 2.0;
  if (r > 1.0) discard;

  // A flat disc still reads as a sprite. A tight gaussian core inside a wide,
  // faint halo is what actually looks like a point light through a lens — and
  // it is the reason these are no longer square.
  float core = exp(-r * r * 8.0);
  float halo = pow(1.0 - r, 2.5) * 0.32;
  // Over 1 on purpose: the buffer is HDR here, and letting the cores clip is
  // what gives bloom something to catch and keeps the pinpoints reading as hot.
  float intensity = (core * 1.9 + halo) * vAlpha;

  gl_FragColor = vec4(vColour * intensity, intensity);
}
`

const STREAK_VERTEX = /* glsl */ `
uniform float uWarp;

/** x: across the ribbon, -0.5..0.5. y: along it, 0 at the head. */
attribute vec2 aCorner;
attribute vec3 iDirection;
attribute float iRadius;
attribute float iSize;
attribute float iSpeed;
attribute vec3 iColour;

varying float vAlong;
varying float vAcross;
varying float vSpeed;
varying vec3 vColour;
varying float vFade;

${WRAP_GLSL}

void main() {
  float wrapped = wrapRadius(iRadius);
  float stretch = uWarp * (2.0 + 46.0 * iSpeed);

  vec4 headView = modelViewMatrix * vec4(iDirection * wrapped, 1.0);
  vec4 tailView = modelViewMatrix * vec4(iDirection * (wrapped + stretch), 1.0);

  // Billboarding in view space is a quarter turn in xy — the camera looks down
  // -z there, so no cross product with a view vector is needed. Degenerate only
  // when the streak points straight at the lens, where it covers a pixel anyway.
  vec3 spine = tailView.xyz - headView.xyz;
  vec2 across = normalize(vec2(-spine.y, spine.x) + vec2(1e-5));

  // Deliberately not the point's own size. Reusing that puts the brightest
  // stars — which are also the largest — into slabs tens of pixels wide once
  // they wrap close to the camera. Compressing the range keeps the widest
  // ribbon a ribbon.
  float width = (0.045 + iSize * 0.2) * (0.6 + 1.1 * uWarp);

  vec3 view = mix(headView.xyz, tailView.xyz, aCorner.y);
  view.xy += across * aCorner.x * width;

  vAlong = aCorner.y;
  vAcross = aCorner.x * 2.0;
  vSpeed = iSpeed;
  vColour = iColour;
  vFade = edgeFade(wrapped, uWarp);

  gl_Position = projectionMatrix * vec4(view, 1.0);
}
`

const STREAK_FRAGMENT = /* glsl */ `
uniform float uWarp;

varying float vAlong;
varying float vAcross;
varying float vSpeed;
varying vec3 vColour;
varying float vFade;

void main() {
  // Soft across the width and tapering along the tail. Without the first of
  // these the quad's own edges are visible, which is what made the old
  // single-pixel lines read as wireframe rather than as light.
  float across = 1.0 - vAcross * vAcross;
  // The leading ramp rounds off what is otherwise a square cap at the head of
  // the quad — the one part of the ribbon that gives away that it is geometry.
  float along = smoothstep(0.0, 0.05, vAlong) * pow(1.0 - vAlong, 1.7);
  float intensity = across * across * along * uWarp * (0.3 + 0.7 * vSpeed) * vFade;

  gl_FragColor = vec4(vColour * intensity * 2.4, intensity);
}
`

function createPointGeometry(seeds: StarSeeds): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(seeds.position, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(seeds.size, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(seeds.phase, 1))
  geometry.setAttribute('aColour', new THREE.BufferAttribute(seeds.colour, 3))
  // The shader re-derives every position from the wrap, so the seed bounds are
  // meaningless and an automatic sphere would cull the field at the wrong time.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    SHELL_NEAR + SHELL_SPAN,
  )
  return geometry
}

function createStreakGeometry(seeds: StarSeeds): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.instanceCount = seeds.count

  // One quad, reused per star.
  const corners = new Float32Array([
    -0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1,
  ])
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])

  geometry.setAttribute(
    'iDirection',
    new THREE.InstancedBufferAttribute(seeds.direction, 3),
  )
  geometry.setAttribute(
    'iRadius',
    new THREE.InstancedBufferAttribute(seeds.radius, 1),
  )
  geometry.setAttribute(
    'iSize',
    new THREE.InstancedBufferAttribute(seeds.size, 1),
  )
  geometry.setAttribute(
    'iSpeed',
    new THREE.InstancedBufferAttribute(seeds.speed, 1),
  )
  geometry.setAttribute(
    'iColour',
    new THREE.InstancedBufferAttribute(seeds.colour, 3),
  )

  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    SHELL_NEAR + SHELL_SPAN * 2,
  )
  return geometry
}

const drawingBuffer = new THREE.Vector2()

/**
 * Faint drifting points give the void a sense of scale as the camera moves. The
 * same seeds feed a second, instanced layer that stretches each star into a
 * soft ribbon when the warp takes over, so the two layers are the same field in
 * two states rather than a cross-fade between two different ones.
 */
export function Starfield({ count = 900 }: { count?: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const streakRef = useRef<THREE.Mesh>(null)
  const travelRef = useRef(0)
  const timeRef = useRef(0)

  const seeds = useMemo(() => createStarSeeds(count), [count])
  const pointGeometry = useMemo(() => createPointGeometry(seeds), [seeds])
  const streakGeometry = useMemo(() => createStreakGeometry(seeds), [seeds])

  const pointMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uTravel: { value: 0 },
          uWarp: { value: 0 },
          uFade: { value: 1 },
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

  const streakMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTravel: { value: 0 },
          uWarp: { value: 0 },
        },
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
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

  useFrame((state, delta) => {
    const warp = scrollState.warp
    timeRef.current += delta

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.008
    }

    travelRef.current =
      (travelRef.current + delta * warp * WARP_SPEED) % SHELL_SPAN

    state.gl.getDrawingBufferSize(drawingBuffer)

    const point = pointMaterial.uniforms
    point.uTime.value = timeRef.current
    point.uTravel.value = travelRef.current
    point.uWarp.value = warp
    point.uViewportHeight.value = drawingBuffer.y
    // The heads stay lit under the streaks, but step back so the streaks are
    // what the eye follows.
    point.uFade.value = 1 - 0.45 * warp

    streakMaterial.uniforms.uTravel.value = travelRef.current
    streakMaterial.uniforms.uWarp.value = warp

    // Below this the ribbons are sub-pixel and contribute nothing but overdraw.
    if (streakRef.current) streakRef.current.visible = warp > 0.004
  })

  return (
    <group ref={groupRef}>
      <points geometry={pointGeometry} material={pointMaterial} frustumCulled={false} />
      <mesh
        ref={streakRef}
        geometry={streakGeometry}
        material={streakMaterial}
        visible={false}
        frustumCulled={false}
        renderOrder={2}
      />
    </group>
  )
}
