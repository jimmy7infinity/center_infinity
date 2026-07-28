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
Lenis  →  scrollState (mutable singleton)  →  useFrame  →  camera position
                                                      └→  shell position / lightDir / intensity
```

Scroll is written to a plain mutable object rather than React state, so moving
the camera and shells never triggers a re-render. `CameraRig` and each shell
damp toward their targets each frame, which keeps motion frame-rate independent
and adds inertia on top of Lenis' own smoothing.

Shell pose and lighting are declared as keyframes in `src/scene/shellKeyframes.ts`
(position, `lightDir`, intensity per shell). `Shells.tsx` samples
`scrollState.progress` each frame and damps toward the interpolated targets.
Progress **0** is the Center Infinity logo composition (`docs/reference/logo.png`):
four nested crescents with A and B top-lit, C and D bottom-lit. On first paint
each shell snaps to that progress-0 pose rather than fading in individually.

Each shell uses a custom `ShaderMaterial` in `src/scene/shellMaterial.ts` with
its own `uLightDir`, intensity, and color — no scene-wide lights. The fragment
shader shades a lit crescent from that direction; the dark hemisphere stays
opaque. Materials use **NormalBlending with `depthWrite: true`**, so shells
occlude each other. The starfield and shooting stars still use additive
blending. Radii and offsets are deliberately irregular so the lit arcs don't
line up concentrically.

Surface detail is generated at runtime in `src/scene/lunarTexture.ts` — value-noise
fbm plus stamped craters on a 2D canvas, converted to a tangent-space normal map
with a Sobel filter. Nothing is fetched, so the scene ships zero texture bytes.

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

Measured on an Apple M4, production build: ~55 FPS throughout the scroll.
Before these changes the same scene ran at 14 FPS.

## Capability tiers

`src/lib/quality.ts` picks a tier up front from `prefers-reduced-motion`, WebGL
availability, core count, device memory, and pointer type:

- **high** — full effect chain
- **medium** — bloom and vignette only, `dpr` 1
- **static** — no WebGL at all; `StaticBackdrop` renders a CSS-only backdrop

The 3D bundle is a lazy `import()`, so the copy paints before Three.js is
fetched, and the static tier never downloads it.

## Content

Projects and services live in `src/content/projects.ts`. The scene is
content-agnostic — adding a project does not touch the WebGL code.
