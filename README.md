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
```

Scroll is written to a plain mutable object rather than React state, so moving
the camera never triggers a re-render. `CameraRig` damps toward the target each
frame, which keeps motion frame-rate independent and adds inertia on top of
Lenis' own smoothing.

The four shells in `src/scene/Shells.tsx` use **additive blending with
`depthWrite: false`**. That is what produces the overlapping-crescent look: the
unlit hemisphere of each sphere is black, and black contributes nothing under
additive blending, so outer shells never occlude inner ones. Radii and offsets
are deliberately irregular so the lit arcs don't line up concentrically.

Surface detail is generated at runtime in `src/scene/lunarTexture.ts` — value-noise
fbm plus stamped craters on a 2D canvas, converted to a tangent-space normal map
with a Sobel filter. Nothing is fetched, so the scene ships zero texture bytes.

## Performance notes

These spheres cover the entire viewport up close, so the scene is **fill-rate
bound**. The things that matter, in order of impact:

| Decision | Why |
|---|---|
| `mesh.visible = false` once faded | A shell at opacity 0 still shades every pixel it covers |
| Normal map, not bump map | Bump mapping costs 3 texture fetches + derivatives per fragment; a normal map costs 1 |
| `dpr` capped at 1.25 | All text is DOM, so canvas density only affects soft bloomed gradients |
| `MeshLambertMaterial` | Matte rock with no environment reflections does not need a PBR BRDF |
| `Bloom resolutionScale={0.5}` | The glow is broad and soft; half resolution is indistinguishable |

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
