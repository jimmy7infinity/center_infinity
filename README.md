# Center Infinity

Studio site for [Center Infinity](https://centerinfinity.com). A scroll-driven
WebGL field of nested, rim-lit crescent moons — the logo as a living scene —
with copy layered over it as real DOM.

Triple-click the hero mark to enter a short space-flyer easter egg; finish or
time out and the existing warp loop returns you to the hero.

## Commands

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # typecheck + production build
pnpm preview    # serve dist/
pnpm start      # production static server (Railway / PORT)
pnpm typecheck
```

## Stack

React 19 · TypeScript · Vite · Three.js · React Three Fiber · postprocessing ·
Lenis · Tailwind CSS v4

Typography: Switzer (UI) · Science Gothic (hero wordmark) · Geist Mono (data) ·
Orbitron (arcade GAME OVER)

## How the scene works

```text
Lenis + hard section pager
        ↓
scrollState (mutable singleton: beat, warp, jump)
        ↓
useFrame → camera pose + shell poses / lights
        ↓
cameraBridge → foreground debris canvas (rocks / meteors)
```

Scroll is written to a plain mutable object rather than React state, so moving
the camera and shells never triggers a re-render. Shells and the camera ease
toward their beat targets each frame (frame-rate independent damping).

### Hard section paging

Wheel, touch, and keys advance **exactly one beat** per gesture
(`src/lib/scroll.ts`). Mid-glide input is ignored so a trackpad flick cannot
chain past the next composition. The right-rail / mobile dots may jump to any
beat. During the flyer minigame, paging is paused.

### Beats are anchored to sections, not to a global percentage

The animation clock is `scrollState.beat`, not a 0–1 document fraction. The
timeline is declared once in `src/lib/beats.ts`; each id is stamped onto one
element as `data-beat`, and `scroll.ts` measures the scroll offset at which each
of those elements sits centred in the viewport. An integer beat therefore means
"this section is centred and its tableau is exactly composed", however tall the
sections happen to be. Fractional beats interpolate between neighbours.

Adding a section means three edits: an id in `BEATS`, a `data-beat` on the
markup, and a keyframe at that index in every shell / camera table. A mismatch
logs a warning in dev.

### Composition is resolved against the live aspect ratio

Keyframes in `src/scene/shellKeyframes.ts` store composition fractions
(`fx`, `fy`, `z`) rather than world coordinates, resolved every frame in units of
the **smaller** viewport axis. On landscape that is the height; on portrait it
becomes the width, so the cluster scales down to fit and lifts into the upper
half to leave room for copy.

Beat `hero` is the Center Infinity logo composition (`docs/reference/logo.png`):
four nested crescents with A and B top-lit, C and D bottom-lit. The hero camera
looks slightly up so the cluster sits a touch below centre.

### Dual canvases

Background WebGL owns the moons and starfield. A second canvas above the DOM
carries drifting rocks and shooting stars so debris can cross in front of the
type. Both share pose via `src/lib/cameraBridge.ts`.

### Cursor storms and lightning

Hovering a moon grows a soft weather cell (`SHELL_CURSOR_LIGHT` in
`shellMaterial.ts`) — chalky vapour with a mild spiral, calm eye, and geodesic
coverage that eases in from a speck. Clicking the storm fires a thin violet
bolt that grows from the eye as a jagged ray (not a mirrored diameter); stacked
clicks raise charge (brightness, hold, branches). Clicking empty space spawns
comets through the click (pooled, spam-friendly, capped).

### One lighting model, no scene lights

`src/scene/shellMaterial.ts` is a custom `ShaderMaterial` with its own
`uLightDir`, intensity, tint, and terminator — there are no lights in the scene
at all. Drifting rocks share the same material (without surface maps), which
keeps them tonally consistent with the moons.

Materials use **NormalBlending with `depthWrite: true`**, so shells and rocks
occlude each other and the stars behind them. The starfield uses additive
blending.

### Surface detail is generated, and seamless

`src/scene/lunarSurface.ts` builds a height field from value-noise fbm plus
stamped craters, then emits three maps: a tangent-space **normal map** via a
Sobel filter, a **reflectance map**, and a small **tiled detail map** for
micro-relief. Nothing is fetched, so the scene ships zero texture bytes. It
costs roughly 500 ms once, on a `static`-tier-exempt path.

Five properties are load-bearing and easy to break:

- **The frequency ladder is deliberate.** Every layer is stored at a resolution
  where its finest octave still spans two texels, and is upsampled at most once.
  `buildNoiseLayer` throws if a layer would alias.
- **Micro-relief is tiled, not baked in.** At `DETAIL_REPEAT` the 512px tile
  resolves like a much larger equirect for fine pixels without generating a
  giant map.
- **Reflectance is separate from relief.** Shading alone cannot produce the tonal
  range of a lunar photograph. The map is rescaled to a mean of exactly 1.0.
- **The noise is periodic.** The map wraps around a sphere; octaves and crater
  stamping wrap in x and clamp in y so the UV seam stays invisible.
- **The tangent basis is analytical.** The shader derives the basis from `uv`
  using three.js' sphere parametrisation, avoiding screen-space derivative jumps
  across the seam.

Near the poles the equirect mapping collapses in u, so the detail tile is read
through a top-down projection and blended in by latitude. The detail tile's blue
channel carries micro-scale tone rather than a normal component.

### The warp outro loops back

The final beat is a tall runway. `scrollState.jump` (true hyperjump — intro,
runway, loop flash) clears solid bodies; `scrollState.warp` also includes a
small velocity stretch for the starfield. Chrome hides on `jump`, not velocity
warp, so section paging does not flash the header.

At the end of the runway the screen is almost entirely streaks, so `scroll.ts`
cuts to the top and holds the warp briefly while the hero recomposes.

### Space flyer easter egg

Triple-click the hero crescent within 1s → `gameMode.enter('space-flyer')`.
UI fades, section paging pauses, and `src/game/spaceFlyer/` mounts a chase-cam
flight around the existing moons (Kenney Space Kit speeder, CC0 — see
`public/models/`). Session achievements live in `src/lib/achievements.ts`.
Design notes: `docs/superpowers/specs/2026-08-01-space-flyer-minigame-design.md`.

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
warp, and 59 FPS at 3.7M pixels (2560x1440). Before these changes the same scene
ran at 14 FPS.

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
