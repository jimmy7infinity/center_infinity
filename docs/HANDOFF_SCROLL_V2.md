# Handoff v2 — section-anchored scroll, five projects, warp outro

Repo: `/Users/jimmyinfinity/Projects/center_infinity`
Baseline commit: `8063e99` — logo composition landed, 60 FPS at all scroll positions.

Read `docs/HANDOFF_LOGO.md` first for the constraints that still apply. This
document supersedes its scroll-animation section.

## What is already good — do not regress it

- The progress-0 composition matches the logo. Preserve it exactly.
- 60 FPS at hero / mid / contact on Apple M4, `dpr` 1, buffer = CSS size.
- `shellKeyframes.ts` — declarative per-shell table with zero-allocation
  sampling. This is the right abstraction; extend it, do not replace it.
- `shellMaterial.ts` — per-shell custom shader with its own light direction.

## Root cause of the "unintentional ending"

Measured on a 1448×735 viewport. Keyframes are authored at global progress
`0 / 0.25 / 0.5 / 0.75 / 1.0`, but sections rest at:

| Section | Rests at progress |
|---|---|
| Hero | 0.000 |
| Services | 0.242 |
| HireLoop | 0.496 |
| Dispose | 0.645 (between beats) |
| Locus | 0.794 |
| **Contact heading** | **0.969** |

Progress `1.0` is the document bottom — the footer. **The tableau authored for
the contact section is never displayed.** The visible pose is always a
transition between beats 0.75 and 1.0, where the camera moves only from
`z 11.5` to `z 10.5` — hence no drama.

The beats that do line up (Services ≈ 0.25, HireLoop ≈ 0.5) are coincidence from
current section heights. Adding projects desynchronises all of them. Fix the
anchoring **before** adding project sections.

---

## Task 1 — Section-anchored scroll progress (enabling change, do first)

Replace "global progress" as the animation driver with a section-relative beat
coordinate.

In `src/lib/scroll.ts`, extend the existing mutable singleton (keep it mutable —
it is read inside `useFrame` specifically to avoid a re-render per frame; do NOT
move this into React state):

```ts
export const scrollState = {
  progress: number,   // keep: global 0..1, still useful
  velocity: number,   // keep: needed by the warp
  beat: number,       // NEW: continuous section coordinate, e.g. 3.5 = halfway through section 3
  sectionIndex: number,
  sectionLocal: number, // 0..1 within the current section
}
```

Sections register their DOM element (a `registerSection(id, el)` helper plus a
`useSection` hook is fine). Recompute offsets on scroll, on resize, and after
fonts load — use a `ResizeObserver` on `main`, not a one-shot measurement.

Then re-author `SHELL_MOTIONS` and `CAMERA_KEYFRAMES` against `beat` instead of
progress: `at: 2` is the settled pose for section 2, `at: 2.5` is mid-transition.
Every section now gets a real settled tableau regardless of its content height.

**Acceptance:** changing a section's text length must not shift any tableau.

## Task 2 — Restore the hero copy

`Hero` is currently an empty `<section>` (stripped in `93b6c3e`). The first
screen is beautiful and says nothing, which is the most costly problem on the
site. Restore a headline, one supporting line, and the location/eyebrow label —
recover the wording from commit `4b9e221` unless the user supplies new copy.

Composition constraint: the logo has a dark hollow centre. Place the copy so it
sits in negative space, and verify legibility against a screenshot rather than
assuming.

## Task 3 — Aspect-aware framing (mobile is broken)

`viewportToWorld` and `radiusFromDiameter` in `shellKeyframes.ts` assume a square
viewport (`viewW = viewH`) and size radii off the vertical FOV. On a 390×844
phone the moons render roughly 1.8× wider than the screen and the nested-logo
reading is destroyed.

Size the composition against `min(viewWidth, viewHeight)` and map x by true
aspect, so the logo reads at any aspect ratio. Verify at **390×844**,
**768×1024**, and **1920×1080**.

## Task 4 — Five project sections, one visible at a time

Restructure `Work` in `src/ui/Overlay.tsx`: currently one section containing
three stacked `<article>`s. Each project becomes its own full-height section with
its own beat, so only one project is legible at a time and the scroll between
them is a deliberate transition.

Build for **five** projects. Three are real (HireLoop, Dispose, Locus); add two
as clearly-marked placeholders in `src/content/projects.ts` — give them an
explicit `placeholder: true` flag and visibly provisional copy so they can never
be mistaken for shipped work or accidentally deployed as filler.

Section length is art direction: full-height sections give 8 screens of
scrolling, which may be too long. Tune section height (1.0–1.5 viewports) so the
transitions feel like the dramatic part rather than the waiting part.

Keep the persistent "Start a project" nav link — with five sections, contact must
stay one click away.

## Task 5 — Contact beat: one dominant close moon

The current contact tableau has four moons competing in the right half with large
blown-out washes, and the "START A PROJECT" label is nearly illegible over a pale
limb.

Author the contact beat with **one large moon close on the right** and the other
three pushed far back or off-frame. A single dominant subject is the goal.

Hard requirement: the left half must stay dark enough for the heading, email
link, and footer to read. Verify with a screenshot, and check the eyebrow label
specifically — it is the first thing to become illegible.

## Task 6 — Warp / hyperjump on the starfield

Add a velocity-driven warp to `Starfield.tsx`: stars stretch into streaks along
the view axis, length and brightness scaling with a smoothed
`scrollState.velocity`, plus an explicit `uWarp` uniform the outro can drive to
maximum.

Implementation note: `pointsMaterial` cannot stretch. Use an
`InstancedBufferGeometry` of camera-facing quads with a custom shader that
elongates each along the forward axis by `uWarp`. Reuse the existing star
distribution — do not add fetched assets. Additive blending, `depthWrite: false`,
consistent with the rest of the scene.

Subtle at normal scroll speed; unmistakable at maximum.

## Task 7 — Intentional loop back to the hero

**Not** a seamless infinite scroll. The contact section must settle and be
restable — it is the section that converts, and users should arrive at it rather
than fall through it.

Sequence:

1. Contact section settles normally at its own beat.
2. Add scroll runway *after* it (roughly 1–1.5 viewports).
3. Scrolling into that runway ramps `uWarp` up.
4. At maximum warp — when streaks hide the cut — jump to the top using
   `lenis.scrollTo(0, { immediate: true })` (`getLenis()` is already exported),
   then ramp `uWarp` back down as the hero re-forms.
5. Cooldown flag so the jump cannot immediately re-fire.

Do not break anchor links (`#top`, `#work`, `#contact`) or the back button.
**Skip the runway and the loop entirely** under `prefers-reduced-motion` and in
the `static` tier — no scroll hijacking for those users.

## Task 8 — Fix the drifting rocks

The rock currently reads as white faceted origami. Two causes:

1. `createRockGeometry` uses `IcosahedronGeometry(1, 0)` / `DodecahedronGeometry(1, 0)`
   — 20 and 12 flat faces. Subdivide (detail 2–3) before jittering.
2. `Scene.tsx:74-75` holds the only remaining scene lights: `ambientLight 0.25`
   and a `directionalLight` at `z: +12` — in front, on the camera's side. Every
   moon is backlit by its own shader, so the rock is the single front-lit object
   in the scene and looks pasted on.

Light the rocks consistently with the moons — either drive them with the same
shell shader or match the backlight direction of the nearest moon. The red edge
is chromatic-aberration fringing at the viewport edge and will resolve once the
rock is no longer blown out.

## Task 9 — Give the camera a real look-target

`camera.lookAt(0, 0, -2)` is hard-coded, so the camera never turns; the apparent
turning is shells moving past a fixed orientation. Add a keyframed look-target
alongside position and fov so transitions can actually swing the view.

---

## Constraints

- **60 FPS** on Apple M4, production build, at every settled beat *and* mid
  transition. Current baseline is 60 — do not trade it away. The scene is
  fill-rate bound; the guardrails in `README.md` still apply.
- Measure in **real Chromium via the Playwright MCP**. Cursor's embedded browser
  under-reports by ~40%.
- Keep all copy as real DOM. Keep the three capability tiers working, including
  the WebGL-free `static` tier (assert zero `<canvas>` under reduced motion).
- Ship no new network-fetched assets. Surface detail is generated at runtime.
- Keep additive blending on stars/warp; shells now use opaque NormalBlending with
  depth staggering — do not revert that, it is what keeps nested moons visible.
- `pnpm typecheck` and `pnpm build` must pass. TypeScript is strict with
  `noUnusedLocals` / `noUnusedParameters`.
- `dpr` is currently `[1, 1]` in every tier, which is how 60 FPS was reached. If
  you raise it, re-measure.

## Acceptance criteria

- [ ] Tableaux are section-anchored; editing section copy shifts no composition
- [ ] Hero has a headline and supporting copy, legible against the scene
- [ ] Logo composition reads correctly at 390×844, 768×1024, and 1920×1080
- [ ] Five project sections, one legible at a time; two clearly flagged as placeholders
- [ ] Contact beat has one dominant close moon; heading, email, eyebrow label and footer all legible
- [ ] Warp is subtle at normal speed, dramatic at maximum
- [ ] Loop fires only after the contact section settles, hides the cut, cannot re-fire immediately, and is disabled under reduced motion
- [ ] Rocks read as rock and share the moons' lighting direction
- [ ] Camera look-target is keyframed
- [ ] 60 FPS at every settled beat and mid transition
- [ ] `pnpm typecheck` and `pnpm build` clean
- [ ] Anchor links and back button still work

## Verification recipe

`pnpm dev` → `http://localhost:5173`. Production: `pnpm build && pnpm preview --port 4173`.

FPS snippet is in `docs/HANDOFF_LOGO.md`. Additionally:

- **Beat anchoring:** assert each section's settled beat is an integer by
  scrolling each section to centre and reading `scrollState.beat`.
- **Regression guard:** artificially double a project's description length and
  confirm no tableau moves.
- **Mobile:** `browser_resize` to 390×844, reload, screenshot the hero.
- **Reduced motion:** CDP `Emulation.setEmulatedMedia` with
  `prefers-reduced-motion: reduce`, reload, assert zero canvases and no scroll
  hijack.
