# Space Flyer Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triple-click the hero logo to enter a 30s third-person space flyer around the existing planets, then warp-loop back to the hero.

**Architecture:** Mutable `gameMode` singleton (same pattern as `scrollState`) pauses section paging, raises `--game-veil`, freezes beat `CameraRig`, and mounts `SpaceFlyer` in the background Canvas. Exit restores site systems and calls exported `triggerSiteLoop()`.

**Tech Stack:** React 19, R3F, Three.js, Lenis, existing shell probes for collision. No new deps. Verification via `pnpm typecheck` + manual browser (no unit test runner in repo).

## Global Constraints

- Trigger is the **hero** BrandMark only (not header).
- Duration exactly 30 seconds; timer-only exit.
- Soft planet bounce via live shell probes; soft world bounds.
- Hybrid controls: pointer aim, W/hold-click thrust, A/D strafe, arrows mirror.
- Static / no-WebGL: enter is a no-op.
- Do not fight `--warp-veil`; use dedicated `--game-veil`.
- Match existing singleton + CSS-var patterns; no Zustand.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/gameMode.ts` | Singleton lifecycle, veil CSS, subscribe |
| `src/game/types.ts` | `GameId` + thin `Minigame` type |
| `src/game/spaceFlyer/controls.ts` | Keyboard / pointer / touch input state |
| `src/game/spaceFlyer/SpaceFlyer.tsx` | Ship mesh, physics, chase cam, collisions |
| `src/game/spaceFlyer/index.ts` | Public mount export |
| `src/ui/GameHud.tsx` | Timer + brief control hint |
| Modify `src/lib/scroll.ts` | Pause paging; export `triggerSiteLoop` |
| Modify `src/scene/Shells.tsx` | Export probe iterator; skip CameraRig + storm in game |
| Modify `src/scene/Scene.tsx` | Mount SpaceFlyer when active |
| Modify `src/ui/Overlay.tsx` | Hero triple-click; GameHud |
| Modify `src/ui/useWarpHide.ts` | Hide chrome when game active |
| Modify `src/index.css` | `--game-veil` + warp-veil multiply |
| Modify `src/lib/pointer.ts` | Skip spaceClick while game active |

---

### Task 1: gameMode shell + scroll pause + veil CSS

**Files:**
- Create: `src/game/types.ts`, `src/lib/gameMode.ts`
- Modify: `src/lib/scroll.ts`, `src/index.css`, `src/ui/useWarpHide.ts`

**Interfaces:**
- Produces: `enterGame(id)`, `exitGame()`, `isGameActive()`, `subscribeGameMode`, `getGameTimeLeft()`, `canEnterGame()`, `setSectionPagingPaused`, `triggerSiteLoop`, `--game-veil`

- [ ] **Step 1:** Add types + `gameMode` singleton with enter/exit writing `--game-veil`, pausing paging, notifying subscribers; exit calls `triggerSiteLoop` after clearing active.
- [ ] **Step 2:** In `scroll.ts`, gate wheel/touch/key paging on `pagingPaused`; export `setSectionPagingPaused` + `triggerSiteLoop` (public wrapper around `triggerLoop`).
- [ ] **Step 3:** CSS: `--game-veil: 0` on `html`; `warp-veil` opacity multiplies both veils. `useWarpHide` returns true when game active OR warp threshold.
- [ ] **Step 4:** Run `pnpm typecheck` — expect pass for these modules.

---

### Task 2: Space flyer (ship, controls, chase cam, bounce)

**Files:**
- Create: `src/game/spaceFlyer/controls.ts`, `SpaceFlyer.tsx`, `index.ts`
- Modify: `src/scene/Shells.tsx`, `src/scene/Scene.tsx`

**Interfaces:**
- Consumes: `isGameActive`, `exitGame`, `getGameTimeLeft` / `gameMode.startedAt`, shell probes
- Produces: `<SpaceFlyer />` R3F component that drives camera + `publishCamera`

- [ ] **Step 1:** Export `forEachShellProbe(cb)` from `Shells.tsx`. `CameraRig` early-returns when `isGameActive()`. Storm/cursor lightning skipped when game active.
- [ ] **Step 2:** Implement controls module (keys + pointer aim NDC + thrust/strafe flags); attach/detach on mount.
- [ ] **Step 3:** Implement `SpaceFlyer`: spawn near hero cam, aim via unprojected pointer, thrust/strafe, damp velocity, soft bounce vs probes, world bounds ~35u from origin, chase cam lag, call `exitGame()` when time left ≤ 0.
- [ ] **Step 4:** Mount in `BackgroundScene` when subscribed game active.
- [ ] **Step 5:** `pnpm typecheck`.

---

### Task 3: Hero trigger + HUD

**Files:**
- Create: `src/ui/GameHud.tsx`
- Modify: `src/ui/Overlay.tsx`, `src/lib/pointer.ts`

- [ ] **Step 1:** Hero logo button/handler: 3 clicks within 1000ms → `enterGame('space-flyer')` if `canEnterGame()`; `stopPropagation`.
- [ ] **Step 2:** `GameHud` — countdown + ~2s hint; mount in Overlay chrome layer when active.
- [ ] **Step 3:** `pointer.ts` `onClick`: if `isGameActive()` return before latching `spaceClick`.
- [ ] **Step 4:** `pnpm typecheck` + manual verify checklist from spec.

---

## Manual verification

1. Triple-click hero logo → UI fades, ship + timer.
2. Fly; skim planet → bounce.
3. 30s → warp → hero usable.
4. Second run works; header logo still home-only.
5. Static tier: no break.
