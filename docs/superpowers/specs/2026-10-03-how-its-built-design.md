# How it's built

Employer-facing technical read on each project page. The client breakdown stays the default. A control turns the notes over, and the same turn brings them back.

## Door

The whole left side is the cube: work index, status, name, tagline, the control, and the notes. It has thickness, so the turn shows an edge, not a flat card. The turn is 2200ms. The slab is closed on all four edges so the spin does not open a hole. The other face is the dossier and fills that same panel — the leaf scrolls inside the face, and Prev and Next sit on the bottom edge. The control is on both faces and reads `</> How it's built`, then `</> Overview`. Overview plays the same turn back. Clicks wait until the turn finishes.

The colour screen stays where it is. On a phone it stays below the card.

Leaving the project opens the client face again, on Abstract. Reduced motion swaps with no turn and no flash. A project with no technical read has no control.

## Dossier

Four leaves, in order, moved with Prev and Next. Prev is inactive on the first leaf. Next is inactive on the last. Changing leaves reprints that leaf only, with the same short e-ink flash the device uses between pages. The rest of the panel stays still.

1. **Abstract** — What, Why, How. What is the system. Why is why it should exist. How is the mechanism.
2. **Shape** — the model and the path, as a short contract, then one line.
3. **Decisions** — the call that embodies the choice, then one line.
4. **Boundaries** — the invariant that would be a bug if it broke, then one line.

Copy for the five visible projects lives in `src/content/technical.ts`. Snippets are trimmed from those products. They are display text, not imports. Center Infinity's subject is the device. Dispose, Boost, Studio Eternity, and LookingLocal are shown as software.

## Where it lives

- `src/content/technical.ts` — the reads
- `src/content/projects.ts` — optional `technical` on a project
- `src/ui/ProjectDossier.tsx` — the card and the control
- `src/ui/dossier.css` — the turn and the leaf reprint
- `src/ui/Pages.tsx` and `src/ui/Overlay.tsx` — the card sits in the project page; the page passes whether it is on screen

The turn is CSS on the ink column. The WebGL scene is not involved.
