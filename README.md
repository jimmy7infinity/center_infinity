# Center Infinity

Studio site. A scroll-driven WebGL scene of nested, rim-lit spheres that the
camera travels inward through, with the copy layered over it as real DOM.

## Commands

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build
pnpm preview    # serve dist/
pnpm typecheck
```

## Stack

React 19 · TypeScript · Vite · Three.js · React Three Fiber · postprocessing ·
Lenis · Tailwind CSS v4

## How the scene works

```text
Lenis  →  scrollState (mutable singleton)  →  useFrame  →  camera position + look target
             ↑ beat, warp                            └→  shell position / lightDir / intensity
             │
   section anchors ([data-beat])
```

Scroll is written to a plain mutable object rather than React state, so moving
the camera and shells never triggers a re-render. `CameraRig` and each shell
damp toward their targets each frame, which keeps motion frame-rate independent
and adds inertia on top of Lenis' own smoothing.

### Beats are anchored to sections, not to a global percentage

The animation clock is `scrollState.beat`, not a 0–1 document fraction. The
timeline is declared once in `src/lib/beats.ts`; each id is stamped onto one
element as `data-beat`, and `scroll.ts` measures the scroll offset at which each
of those elements sits centred in the viewport. An integer beat therefore means
"this section is centred and its tableau is exactly composed", however tall the
sections happen to be. Fractional beats interpolate between neighbours.

This is why adding a section means three edits: an id in `BEATS`, a `data-beat`
on the markup, and a keyframe at that index in every table. A mismatch logs a
warning in dev.

### Composition is resolved against the live aspect ratio

Keyframes in `src/scene/shellKeyframes.ts` store composition fractions
(`fx`, `fy`, `z`) rather than world coordinates, resolved every frame in units of
the **smaller** viewport axis. On landscape that is the height, which reproduces
the desktop framing the numbers were tuned against; on portrait it becomes the
width, so the cluster scales down to fit instead of overflowing, and lifts into
the upper half to leave the lower half for copy.

Beat `hero` is the Center Infinity logo composition (`docs/reference/logo.png`):
four nested crescents with A and B top-lit, C and D bottom-lit. On first paint
each shell snaps to that pose rather than fading in individually.

### One lighting model, no scene lights

`src/scene/shellMaterial.ts` is a custom `ShaderMaterial` with its own
`uLightDir`, intensity, tint, and terminator — there are no lights in the scene
at all. The drifting rocks share the same material (with `SHELL_NORMAL_MAP`
undefined, since they have no sphere UVs), which is what keeps them tonally
consistent with the moons instead of reading as flat front-lit shapes.

Materials use **NormalBlending with `depthWrite: true`**, so shells and rocks
occlude each other and the stars behind them. The starfield uses additive
blending. Radii and offsets are deliberately irregular so the lit arcs don't line
up concentrically.

### Surface detail is generated, and seamless

`src/scene/lunarTexture.ts` builds a height field from value-noise fbm plus
stamped craters, then converts it to a tangent-space normal map with a Sobel
filter. Nothing is fetched, so the scene ships zero texture bytes.

Two properties are load-bearing and easy to break:

- **The noise is periodic in x.** The map wraps around a sphere, so a mismatch
  between u=1 and u=0 is a real cliff that the Sobel pass renders as a hard
  vertical seam. Octaves double by exactly 2 and every lattice period is a whole
  number of cells; layer sampling and crater stamping wrap in x and clamp in y.
- **The tangent basis is analytical.** Screen-space derivatives jump by a full
  unit across the UV seam. The shader derives the basis from `uv` instead, using
  three.js' sphere parametrisation `P = (-cos u sin v, cos v, sin u sin v)`.

### The warp outro loops back

The final beat is a tall runway. `scrollState.warp` ramps across it and drives a
second starfield layer of radial line segments that stretch and scroll inward,
plus a `--warp-veil` CSS variable that dissolves the DOM copy. At the end of the
runway the screen is almost entirely streaks, so `scroll.ts` cuts to the top and
holds the warp briefly while the hero recomposes — the jump itself is invisible.

The loop is deliberate rather than an infinite scroll: it only fires at the very
end of the runway, it is disabled when smoothing is off, and there is a real
"Back to the top" link in the footer.

## Performance notes

Four logo-sized shells overlap and cover the entire viewport up close, so the
scene is **fill-rate bound**. Each visible shell shades every pixel it covers.
The things that matter, in order of impact:

| Decision | Why |
|---|---|
| `mesh.visible = false` once faded | A shell at opacity 0 still shades every pixel it covers |
| Normal map, not bump map | Bump mapping costs 3 texture fetches + derivatives per fragment; a normal map costs 1 |
| `dpr` capped at 1 | All text is DOM, so canvas density only affects soft bloomed gradients |
| Custom per-shell shader | Per-shell `uLightDir` and intensity — no scene-wide light loops |
| `Bloom resolutionScale={0.4}` | The glow is broad and soft; sub-half resolution is indistinguishable |

Measured on an Apple M4, production build: 60 FPS at every beat including the
warp. Before these changes the same scene ran at 14 FPS.

## Capability tiers

`src/lib/quality.ts` picks a tier up front from `prefers-reduced-motion`, WebGL
availability, core count, device memory, and pointer type:

- **high** — full effect chain
- **medium** — bloom and vignette only, `dpr` 1
- **static** — no WebGL at all; `StaticBackdrop` renders a CSS-only backdrop

The 3D bundle is a lazy `import()`, so the copy paints before Three.js is
fetched, and the static tier never downloads it.

## Content

Projects and services live in `src/content/projects.ts`. There are five project
slots, each with its own full-height section and its own scene beat, so exactly
one project is on screen at a time. Slots 04 and 05 are marked
`placeholder: true` and render with a visibly provisional treatment — replace
the copy and drop the flag.

Adding a **sixth** project is not content-only: it needs a new beat (see
`src/lib/beats.ts`) and a keyframe for it in each shell and camera table.
