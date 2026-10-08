# Task 5 coordinator record

- Final code commit: `a33313d`. Report commit: `550ed2c`.
- Rate limits cut the implementer off twice. Each time the resume recipe held: verify first, then SendMessage to the same agent.
- Reviews:
  - spec review (Opus): ISSUES 0/2/6, with 11 survivors. The World-path dirty guards were untested, and so was the whole `GbcMapEditing` wiring;
  - quality review (Sonnet): CHANGES_REQUESTED 0/6/9:
    - the paint error text was lost;
    - a failed discard in World was silent;
    - out-of-order responses;
    - the 1024 layout;
    - palette semantics;
    - `NaN` in the inspector inputs.

  One fix round addressed everything, adding a seq guard, pencil-drag dedupe, palette `<button aria-pressed>` cells, string drafts in the inspector, `switchError` at `<main>` level, and a single right-hand rail (palette over inspector).
- Accepted: the palette is always shown, not gated like GBA's (read-only browsing predates editing; commented). The same-map re-click skips the confirm. R10 is equivalent.

## Coordinator mutation re-run on `550ed2c` (code = `a33313d`)

`mutate.mjs` over `packages/ui/test/gbc`: anchor asserted to match once, in-memory restore, byte compare, IDs OK (5).

| ID | Mutation | Result |
|---|---|---|
| R1 | a world click skips the dirty guard | red (4 World-path tests) |
| R3 | the beforeunload cleanup is a no-op | red |
| R8 | warp renumber warnings never set | red |
| R12 | the Discard confirm removed | red |
| I3 | the seq guard disabled | red (out-of-order test) |

## Live verification (2026-10-08, real PerfPlus, scratch hub 5184 + Vite 5183, Playwright `browser_run_code_unsafe`, `visibilityState` "visible")

- **Snapshot first:** `maps/NewBarkTown.blk` SHA-1 `0b7d45d…`, `maps/NewBarkTown.asm` `56f87ef…`, empty porcelain.
- **Layout:** at 1280×860, no horizontal overflow and a 740 px canvas. At 1024×768, no overflow and a 484 px canvas; the palette and inspector share one rail.
- **Paint:**
  - Dropper on block (5,4) picked metatile 0x1;
  - Pencil 0x7 painted a visibly distinct water tile, rendered live (`&v=` refresh);
  - the Save dialog showed "maps/NewBarkTown.blk -- 1 block changed";
  - after commit, `cmp -l` shows exactly one byte: offset 46 (index 45 = (5,4)), 1 → 7. The asm was unchanged.
- **Reverse paint** with 0x1, then commit: `cmp` gives `.blk` IDENTICAL.
- **Event:**
  - select bg event #0 (NewBarkTownSign) at step (8,8);
  - inspector "X (steps)" 8 → 9 + Enter;
  - plan: "maps/NewBarkTown.asm -- event block edited";
  - after commit, `diff` shows exactly line 296, `bg_event  8,  8,` → `bg_event  9,  8,`;
  - moved back and committed: asm IDENTICAL.
- **End state:** both files are byte-identical to the snapshots; PerfPlus porcelain is empty; no `.pokemap`.
- **Console:** only a favicon 404, plus a Canvas2D `willReadFrequently` performance warning (`GbcMapCanvas.tsx:434`, pre-existing readback). No errors from the app.
- **Found live (deferred, both families):**
  - once a paint tool is selected there's no way to deselect it, so event selection needs a reload. GBA's `Toolbar` behaves the same: parity, not a regression. Candidate follow-up: Escape or a re-click clears the tool;
  - after a viewport resize, the map isn't recentred (Fit fixes it).
