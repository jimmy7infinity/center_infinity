# Space Flyer Minigame — Design Spec

**Date:** 2026-08-01  
**Status:** Approved for planning  
**Scope:** Modular minigame shell + first game (space flyer easter egg)

## Goal

Let visitors discover a short flying easter egg by triple-clicking the **hero** logo. Page chrome fades away; they fly a small ship around the existing planets for 30 seconds, then warp back to the hero via the site’s existing loop effect — no full reload.

## Non-goals (v1)

- Score, collectibles, combat, or win conditions
- Full minigame registry / random game rotation
- Esc-to-quit (timer is the only exit)
- Static / no-WebGL fallback gameplay
- External 3D ship models or audio

## Decisions

| Topic | Choice |
|--------|--------|
| Controls | Hybrid: pointer aims · W / hold click thrusts · A/D strafe · arrows mirror |
| Camera | Third-person chase cam |
| Planets | Soft bounce (no clip-through) |
| Architecture | Thin game-mode shell + one flyer game |
| Exit | Reuse existing loop/warp → hero (not reload, not full intro replay) |
| Trigger | Header logo only (not hero mark) |

## Architecture

Game shell owns lifecycle; the flyer is the first plugged-in game.

```
Header logo ×3 within 1s
        ↓
gameMode.enter('space-flyer')
        ↓
  fade UI · pause section paging · freeze beat CameraRig · mount flyer
        ↓
  30s play (chase cam, hybrid controls, soft planet bounce)
        ↓
gameMode.exit() → existing loop/warp → hero
```

### Modules

| Path | Role |
|------|------|
| `src/lib/gameMode.ts` | Singleton: `active`, `gameId`, `startedAt`, `enter` / `exit`, subscribe |
| `src/game/types.ts` | Tiny `Minigame` contract for future games |
| `src/game/spaceFlyer/` | Ship, controls, chase cam, collisions |
| Hooks in `scroll.ts`, `Scene.tsx`, `Overlay.tsx` | Pause/resume, veil, trigger, mount point |

Matches existing patterns: mutable module singletons (`scrollState`, `pointerState`) rather than Zustand/Context.

### Integration seams

- **Trigger:** Header brand link in `Overlay.tsx` — click counter (1s window); on third click `preventDefault` + `stopPropagation` so `#top` / section jump does not fire. Hero mark stays non-interactive so storm/lightning space-clicks keep working.
- **UI hide:** Dedicated `--game-veil` (same consumers as warp veil / chrome hide) so game fade does not fight intro/loop `--warp-veil` state. Extend `useWarpHide` (or equivalent) to respect game active.
- **Scroll:** Pause Lenis and wheel/touch/key section paging while active.
- **Camera:** Detach beat-driven `CameraRig`; chase cam drives camera and `publishCamera` for foreground debris sync.
- **Exit:** `triggerLoop`-style path — warp streaks + veil, snap to hero, restore scroll/camera, clear game state so a second run works.

## Gameplay

### Ship

Procedural geometry (body + wings + soft engine glow). No external asset for v1.

### Controls

| Input | Action |
|-------|--------|
| Mouse / touch move | Aim nose |
| W or hold click / hold touch | Thrust forward |
| A / D | Light strafe |
| Arrow keys | Mirror WASD |

Brief on-screen hint (~2s) at start: “point · W to thrust”.

### Camera

Chase slightly above/behind the ship with gentle lag. Keep dual-canvas sync via `publishCamera`.

### World

- Existing shells + starfield remain visible.
- Storm / lightning and section paging disabled while active.
- Soft sphere bounce off each planet (nudge velocity along contact normal).
- Soft world bounds so the ship cannot wander indefinitely off-map.

### Duration & HUD

- 30s countdown in a corner (subtle).
- No score. Pure fly.
- At 0 → exit sequence.

## Enter / exit sequence

### Enter (~0.4–0.6s)

1. Validate: scene ready, WebGL tier, game not already active, intro warp not mid-flight.
2. Raise veil / hide chrome.
3. Pause Lenis + section paging.
4. Spawn ship near hero camera; hand control to chase cam.

### During

Only planets, stars, ship, timer, and the brief control hint. No nav, copy, or section dots.

### Exit (timer → 0)

1. Unmount ship; restore `CameraRig` + scroll.
2. Fire existing loop/warp to hero.
3. Clear game state; hero logo trigger armed again.

## Edge cases

- **Header logo:** Single click still navigates `#top`; triple-click within 1s starts the flyer.
- **Hero logo:** Non-interactive mark again — storm space-clicks work through the hero cluster.
- **Static tier / scene not ready:** Triple-click does nothing special.
- **Second run:** Supported after a clean exit.
- **No Esc exit in v1.**

## Verification (manual)

1. Triple-click hero logo within 1s → UI fades → ship + timer appear.
2. Fly with pointer + W / A/D; skim a planet → soft bounce, no clip-through.
3. After 30s → warp streaks → land on hero; site paging works again.
4. Repeat run works.
5. Header logo still only returns home.
6. On static / no-WebGL tier, hero triple-click does not break the page.

## Future extension

A second minigame registers under the same `gameMode` shell (same enter/veil/exit contract). v1 does not build a randomizer or multi-game menu.
