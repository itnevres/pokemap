# Task C2 coordinator record

**Closed 2026-10-01.** Final code commit `1c1b78d` (report `f74c813`). Base `3f1668a`.

## Flow
- Spec `task-C2-spec.md` (`361744e`, drafted while C1 ran). Facts re-measured: `MapTree` has uncontrolled
  `<details open>` groups and no scroll; GBC already wired (`onSelectMap`, separate `jumpTarget` from its
  F1 fix); GBA not wired, and `App.tsx` passed `jumpToMap={selected}`, so naive wiring would re-create
  F1 (first canvas click jumps). Spec: `MapTree` effect on `[selected]` with a filter-focus guard;
  `setup.ts` jsdom `scrollIntoView` stub; `WorldCanvas` `onSelectMap`; App `jumpTarget` +
  `changeSelection` (dirty guard shared by tree and world clicks).
- Sonnet implementer `417e00f..649b59b` (report `eed9ec9`): gate 1,980 / 0. One load-only failure in the
  first full run (`WorldCanvas` "jump to map > pans/zooms … when jumpToken changes"), passed alone.
- Opus spec review ✅ (`21314ff`): 12/12 spec mutants + 9/10 extras red (X5, dungeon `onSelectMap`,
  unpinned). The spec's G4 claim was wrong for G4a (bump only, no target), so the implementer's extra
  "after a tree jump" test was required. **Probe P1 real** (coordinator-raised, both families): a world
  click never updates `jumpTarget`, so Map → World re-entry jumped to the stale tree target (GBA,
  and GBC since its F1 fix). **Probe P2:** the flake's `waitFor(clearRect)` is already true at mount (the
  draw runs with `world` null), so the synchronous highlight read raced the jump effect's re-render.
  Sonnet quality review approved: QR-1 Important = P1, 5 Minor.
- Coordinator decision on P1: the quality review's fix (entering World from another mode jumps to the
  current selection: `enterWorld` sets `jumpTarget = selected`, bumps the token, no-op when already in
  World), not the spec review's (a) (world click sets the target + both canvases' jump effects record a
  null-target token). App-only, no shared canvas effect touched, and it restores GBA's pre-C2 "World
  entry centres on the selected map" for every selection source.
- Fix round, same implementer: `886c2a7` (GBA enterWorld), `f3011f0` (GBC), `89267b8` (P2 test-only
  de-flake: `waitFor` on the highlight + the promised 0/0/100/100 rect), `1c1b78d` (comments QR-2/QR-3,
  DESIGN.md QR-6); SR-F2 dungeon test, QR-4 positive control, QR-5 sleeps → `act`. Gate 1,987 / 0.
- Existing-test edits (named): `MapTree.test.tsx` and `GbcApp.test.tsx` import lines widened
  (`beforeEach, afterEach` / `act`); the `WorldCanvas.test.tsx` flaky jump test (P2, reason above);
  `setup.ts` +2 (infrastructure). No other existing test changed.

## Mutation re-run on `1c1b78d` (coordinator, node harness: anchor ×1, in-memory restore, byte-compare)
12 red, 1 equivalent; tree clean before/after.

| ID | Change | Result | Red test |
|---|---|---|---|
| E1 / E1b | World button = `setMode("world")` (App / GbcApp) | red / red | "…tree-click A, world-click B, Map, World … centres on B" + "…only a world click on B … jumps to B" |
| E2 / E2b | `enterWorld` without `setJumpTarget` | red / red | same two |
| E3 / E3b | `enterWorld` without the token bump | **green / green: equivalent** | none. Both world canvases remount on every mode entry, so the fresh `appliedJumpTokenRef` treats any existing token as unapplied. Kept: it states the jump request explicitly and holds if a canvas ever stays mounted across modes |
| E4 / E4b | no already-in-World guard | red / red | "pressing World while already in World does not re-jump" |
| X5 | dungeon canvas gets `onSelectMap` | red | App "in Dungeon mode a canvas click on a map does not change the app's selection" |
| G3 | `jumpToMap={selected}` | red | App GBA F1-mirror; "…only a world click on B…" |
| G4a | world click bumps `selectVersion` | red | App "a canvas click after a tree jump … does not re-jump" |
| G4b | GBC world click sets `jumpTarget` | red | GbcApp F1 test; "world-click B only…" |
| G7 | GbcApp omits `onSelectMap` | red | GbcApp "a canvas click on a map makes its tree row current and scrolls it into view" (+2) |

## Live verify: criterion 5, both families (Playwright; same 5183/5184 setup as C1)
Target chosen by sampling the canvas with hover and taking the hit whose tree row is lowest; its group
collapsed (`details.open = false`) and the sidebar scrolled to 0 before a real single click.

| Check | GBA (subject, Fit world 2%) | GBC (PerfPlus, 7%) |
|---|---|---|
| map clicked (tree row offset) | `SixIsland_RuinValley` (30,505 px) | `CherrygroveCity` (10,755 px) |
| group collapsed → open | ✓ | ✓ |
| sidebar `scrollTop` 0 → | 29,745, row fully visible | 9,995, row fully visible |
| row `aria-current` | true | true |
| view did not jump | zoom 2% kept, no jump highlight | 7% kept, no highlight |
| `scrollWidth === clientWidth` | ✓ | ✓ |
| Map → World re-entry (P1 fix) | 99%, highlight centred on the map (offset 0,0), hover at centre = `SixIsland_RuinValley` | covered by the GbcApp tests |

## Phase C close (coordinator, quiet machine)
`npm test` 1,987 pass / 0 fail (118 files), typecheck clean, `vite build` OK. GBA subject `git status
--porcelain` + HEAD identical to the phase start; `.pokemap/dungeons.json` and `world.json` sha1
unchanged; PerfPlus identical, still no `.pokemap/`. Live-verify servers stopped; 5173 (another
session's Vite, PID 9676) left alone. This session's Playwright logs removed from `.playwright-mcp/`.
