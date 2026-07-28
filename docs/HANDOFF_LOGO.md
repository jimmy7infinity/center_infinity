# Handoff — align the scene with the Center Infinity logo

Repo: `/Users/jimmyinfinity/Projects/center_infinity`
Baseline commit: `4b9e221` (working site, ~55 FPS production on Apple M4)

## Objective

The hero scene currently renders four nested spheres lit by **two scene-wide
directional lights**. The logo has four spheres **each with its own light
source** — two lit from above, two lit from below. Three changes:

1. **Per-shell light sources.** Every sphere gets its own independently
   controllable light direction, colour, and intensity.
2. **First paint matches the logo.** On load, before any scrolling, the
   composition should read as the logo. Today the shells fade in from
   `opacity: 0` and the camera damps in from a different position, so the first
   ~400 ms is not the logo.
3. **Scroll moves the spheres and their lights, not just the camera.** Today
   only `CameraRig` responds to scroll (`Shells.tsx:109-143`); sphere positions
   are static and lighting never changes.

## Prerequisite (blocking)

Save the logo reference image to `docs/reference/logo.png`. Every visual check
below compares a screenshot against that file. Ask the user for it if absent —
do not guess the composition from this document alone.

## Target composition

Four spheres, staggered vertically, forming nested crescents around a dark
hollow centre. Approximate framing in a square viewport, as fractions of frame
width/height:

| Shell | Diameter | Centre (x, y) | Lit from | Notes |
|-------|----------|---------------|----------|-------|
| A | ~0.82 | 0.50, 0.46 | **Above**, slightly left | Largest; bright arc across the top |
| B | ~0.44 | 0.50, 0.37 | **Above** | Overlaps A; visible maria/dark patches |
| C | ~0.57 | 0.51, 0.66 | **Below** | Bright arc along the bottom edge |
| D | ~0.22 | 0.50, 0.69 | **Below**, slightly left | Smallest; short bright crescent |

Treat these as a starting point for art direction, not exact truth. The
acceptance test is visual comparison against `docs/reference/logo.png`.

## Required approach: per-shell lighting via a custom shader

**Do not attempt three.js light layers.** Lights are filtered against
`camera.layers`, not per-mesh layers — see `object.layers.test( camera.layers )`
in `node_modules/three/build/three.module.js:17387`. Light state is global per
render, so layers cannot restrict a light to one mesh. This was verified, not
assumed.

Instead replace `meshLambertMaterial` with a small custom `ShaderMaterial` (or
patch Lambert through `onBeforeCompile`) carrying per-shell uniforms:

```
uLightDir     vec3   normalised, world space
uLightColor   vec3
uIntensity    float
uTint         vec3
uOpacity      float
uNormalMap    sampler2D
uNormalScale  float
uTerminator   float   softness of the light/dark edge
```

Fragment shader is essentially `max(dot(N, L), 0.0)` with a `smoothstep` on the
terminator, times tint and intensity. Keep `transparent: true`,
`depthWrite: false`, `blending: THREE.AdditiveBlending` — that additive
behaviour is what lets unlit hemispheres fall away to black so outer shells do
not occlude inner ones. Do not change it.

This should be **faster** than the current material: no light loops, no shadow,
fog, or PBR uniforms. If FPS drops, something is wrong.

Normal mapping needs a tangent basis. For sphere geometry either derive tangents
analytically from the UVs or perturb using screen-space derivatives of world
position and UV. Removing the normal map is not acceptable — the surface must
stay cratered.

## Scroll animation

Give each shell a declarative keyframe table so the motion is tunable without
touching logic. Something in the spirit of:

```ts
type ShellKeyframe = {
  at: number                        // scroll progress 0..1
  position: [number, number, number]
  lightDir: [number, number, number]
  intensity: number
}
```

Interpolate by progress each frame, then damp toward the interpolated target so
motion keeps its current inertia. Read scroll from the existing
`scrollState` singleton in `src/lib/scroll.ts` — it is a mutable object read
inside `useFrame` specifically to avoid a re-render per frame. **Do not** move
scroll into React state.

Progress `0` must equal the logo composition.

## First-paint requirement

- Initialise the camera to its progress-0 target rather than damping in from the
  `Canvas` default.
- On the first frame, snap positions/opacity to target; damp on subsequent
  frames. A `hasInitialised` ref is enough.
- If an intro transition is wanted, fade the whole canvas up from black so the
  logo composition is what appears — do not fade shells in individually.

## Constraints — do not regress

- **Performance budget: ≥50 FPS** on Apple M4, production build, measured at
  scroll 0 / 0.45 / 1.0. Baseline is ~55. An earlier version of this scene ran
  at 14 FPS; the scene is **fill-rate bound**, so the guardrails in
  `README.md` ("Performance notes") all still apply. In particular keep
  `mesh.visible = false` for faded shells — an invisible shell at `opacity: 0`
  still shades every pixel it covers.
- Keep the three capability tiers in `src/lib/quality.ts` working, including the
  WebGL-free `static` tier. Verify reduced motion still renders zero canvases.
- Keep all copy as real DOM in `src/ui/Overlay.tsx`. Do not move text into WebGL.
- Keep the 3D bundle a lazy `import()` (`src/App.tsx`) and ship no new fetched
  assets — surface detail is generated at runtime in
  `src/scene/lunarTexture.ts`.
- `pnpm typecheck` and `pnpm build` must pass. TypeScript is strict with
  `noUnusedLocals`/`noUnusedParameters`.

## Known risk

With four independent lights and additive blending, two overlapping lit
crescents will sum toward white. The logo keeps them distinct. If overlaps blow
out, reduce per-shell intensity or soften the terminator rather than abandoning
additive blending.

## Verification recipe

Dev server: `pnpm dev` → `http://localhost:5173`. Production check:
`pnpm build && pnpm preview --port 4173`.

Measure FPS in **real Chromium via the Playwright MCP**, not Cursor's embedded
browser — the embedded one under-reports by roughly 40%:

```js
async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const measure = async () => {
    let f = 0; const s = performance.now();
    await new Promise(res => {
      const t = () => { f++; performance.now() - s < 2000 ? requestAnimationFrame(t) : res(); };
      requestAnimationFrame(t);
    });
    return +(f / ((performance.now() - s) / 1000)).toFixed(1);
  };
  const max = document.documentElement.scrollHeight - innerHeight;
  await sleep(1800); const hero = await measure();
  window.scrollTo({ top: max * 0.45, behavior: 'instant' }); await sleep(1400);
  const mid = await measure();
  window.scrollTo({ top: max, behavior: 'instant' }); await sleep(1400);
  const end = await measure();
  return { hero, mid, end };
}
```

Reduced-motion fallback check, via CDP `Emulation.setEmulatedMedia` with
`prefers-reduced-motion: reduce`, then reload and assert
`document.querySelectorAll('canvas').length === 0`.

## Acceptance criteria

- [ ] Logo reference saved at `docs/reference/logo.png`
- [ ] Each shell has an independent light direction; two lit from above, two from below
- [ ] First painted frame matches the logo (screenshot compared side by side)
- [ ] Scrolling visibly moves sphere positions **and** light directions, not only the camera
- [ ] Production FPS ≥50 at scroll 0 / 0.45 / 1.0 on M4
- [ ] `pnpm typecheck` and `pnpm build` clean
- [ ] Reduced motion still renders zero WebGL canvases
- [ ] No new network-fetched assets
- [ ] `README.md` updated to describe per-shell lighting and scroll-driven shells
