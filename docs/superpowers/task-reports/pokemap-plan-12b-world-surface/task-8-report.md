# Task 8 conductor report: GBA world canvas onto `WorldSurface` (High)

Tier: High. It replaces the GBA canvas and moves the world fetch and reconciliation (save/ledger ownership); GBA behaviour changes under P12-4c/d/e/j/m/n/o/p/r/s.

## Delegation

- Codex `gpt-6.1-sol` in scratch worktree `wt-t8` (base `a09fbcf`). Brief: `task-8-brief.md`. Free Aider hops skipped: the task spans more than 3 files and needs repo exploration (delegate skill: go straight to Codex).
- Pass 1 (Codex, ~233k tokens): `gba/worldSurface.tsx`, wrapper `components/WorldCanvas.tsx` (2114 → 80 lines), `canvas/worldColours.ts` (drawDiamond, levelColorMap, themedLevelColorMap moved; WorldSurface import line only), new `test/WorldCanvasSurface.test.tsx` (13 tests). No existing test edited. Notes: `task-8-impl-notes.md` (adapter field origins, reconciliation line-by-line vs old `WorldCanvas.tsx:490-527`, three surface gaps).
- Pass 2 (Codex): test rebases per the inventory below. Brief: `task-8-rebase-brief.md`.

## Step 1: new tests on the old source

`WorldCanvasSurface.test.tsx` copied into the main checkout (`a09fbcf`, old GBA canvas), run alone, removed: **13/13 fail**, each on its missing feature: P12-4c no Map-view call; P12-4d no alert; P12-4e pre-fit tile requested / 6% not 31%; P12-4m 100% rect; P12-4n Enter not wired / no stepped context keys; P12-4o marker click selected the map; P12-4p no restarted highlight; P12-4r Far not fetched / fetch without Warps; P12-4s no alert (old GBA cached the failure, so the retry step is never reached); P12-4j 100% not 120%.

## Step 1: existing tests against the new wrapper (before any test change)

First run (focused GBA set: `WorldCanvas*`, `App*`, `test/world`, `shell/worldParity`, `test/canvas`, `test/gba`): 76 failed.

Diagnostic: the surface's initial fit was temporarily replaced by the old default view (zoom 1, pan 0, fitted at once), then restored (file copied back; diff shows only the import line). With that patch only 15 failed: the 13 new tests (expected), P12-4j bound (`WorldCanvas.test.tsx` computeFit zoomBounds), P12-4m 100% jump rect, P12-4c Ctrl/plain double-click, and **6 `App.test.tsx` world-click tests asserting the jump readout "63%" (now "38%")**. Every other failure is the P12-4e first-load fit alone.

## Finding and user ruling: P12-4m amended

The six `App.test.tsx` tests were not on the plan's P12-4m list, so they were a finding. The user asked for screenshots of the behaviour. Live (real `serve.ts` on 5184 with the port preload, scratch `POKEMAP_HOME`, old UI `a09fbcf` on 5183, new UI wt-t8 on 5185, guard blocking commits and world writes, 0 blocked), tree click on Route119 in World: old GBA 34% (fills the height), new 21% (60%). Route101 is capped at 100% in both. Screenshots: `task-8-shots/p12-4m-old-jump-Route119-34pct.png`, `p12-4m-new-jump-Route119-21pct.png`.

User (2026-10-27): "GBC and GBA should act the same and I like the old jump where the map is zoomed in bigger." Recorded as an amendment to P12-4m in the spec (line 34): both families jump with GBA's old fill, `JUMP_FILL_FRACTION` 1, still clamped. Conductor inline edit (3 lines, `canvas/worldView.ts` constant + comment, `gbc/worldSurface.tsx` comment). Live re-check on 5185: Route119 34%, Route101 100%, same as old GBA (`task-8-shots/p12-4m-amended-jump-Route119-34pct.png`). GBA subject HEAD `26a2e3d1e`, same 9 porcelain lines, `.pokemap` identical to the backup; PerfPlus clean, no `.pokemap`.

Full UI run after the amendment (wt-t8): 96 failed / 1895 passed / 123 files. GBC and shared failures are all 60% jump pins (amendment). Inventory: `task-8-inventory.md`.

## Rebase pass (Codex)

`gpt-6.1-sol` was at capacity ("Selected model is at capacity", no edits); the next hop `gpt-6-sol` did the pass (~189k tokens). No assertion deleted: `expect(` lines balance in every changed file except `WorldCanvas.test.tsx` (+2, the P12-4c Map-view assertions). Per-test rulings: `task-8-impl-notes.md` "Pass 2 rebase inventory".

Full UI run after the pass: 4 failed / 1987 passed. Conductor inline fixes (small, test-only, logged here):
1. `gbc/GbcAppContext.test.tsx` (3 tests, amended P12-4m): with the full jump, OlivineCity fills the 200x200 view and OlivinePort leaves it, so "the other map" was no longer on screen. `enterWorldAfterJump` now runs the jump in a 400x200 viewport (`stubViewport(400, 200)`, `JUMP_RECT`): zoom min(400/10, 200/10) = 20 (63%), pan (100, 0); City x [100,300), Port x [300,500) visible to 400. Clicks moved to City (200,100) and Port (350,100). Every assertion kept. 26/26.
2. `canvas/WorldSurface.test.tsx` hidden-map jump: readout 16/16 = "100%" (was 75% at the 60% fill). 16/16.
3. `AppWorldContextMenu.test.tsx` (P12-4e, not in the inventory): it passed in the suite only because the fit landed after its right-click; alone it failed on the new wrapper (passes alone on `a09fbcf`). Rebased: wait for the fitted readout "63%" (two singletons, fit of every placement: zoom min(400/21, 100/10) = 10, round(10/16·100) = 63) and right-click Route1 at (255,50) (pan x (400-210)/2 = 95, Route1 screen x [205,305)). 2/2 twice.

## Mutation matrix (conductor; each file restored and hash-checked by `run.py`)

| Mutation | Result (full UI run) |
|---|---|
| M1 ledger snapshot + keep set inside the `setRaw` updater | red: 2 `world/placementResync.test.tsx` cases ("a GET issued before a save's acknowledgement keeps the local position...") |
| M2 vertical-link layer dropped (`drawExtraLayers` renamed) | red: "draws dive and emerge vertical links as distinctly-coloured badges" |
| M3 `drawnByDefault` returns true | red: 5 (indoor art not fetched, hidden count, 3 encounter-border cases) |
| M4 first fit replaced by the old default view (zoom 1, pan 0) | red: 197 (P12-4e tests and the new P12-4e cases) |
| M5 `JUMP_FILL_FRACTION` back to 0.6 | red: 34 (every amended-P12-4m jump test, GBA 100% jump tests) |
| M6 world scale floor 1/1024 (P12-4j) | red: 4 (computeFit default floor, worldView P12-4j) |
| M7 no-handler double-click fallback removed (P12-4c) | red: 7 (P12-4c GBA/GBC/surface cases) |
| M8 first fit zoom x1.25 | red: 156 |
| M9 first fit pan +13/+7 | red: 122 |
| M10 first fit pan +60 | run hung (a test's wait loop never ends); killed at the 30 min timeout, file restored. Dropped. |

`AppWorldContextMenu` showed red in M1/M2/M6/M7 too: that was the fit race fixed above, not those mutations.

Coverage of the rebases: every amended-P12-4m, P12-4j and P12-4c rebase is red under M5/M6/M7. 35 P12-4e fixture rebases (mostly `WorldCanvas.test.tsx`, plus `AppContextEdit`/`AppContextStroke` and one `WorldCanvasContext` case) stay green under M4, M8 and M9: their fixtures were changed so the fit is the old view (z1 at GBA's max scale, so a zoom mutation is clamped away) with 100x100 targets that absorb a 13 px shift. Their assertions are the original feature assertions (toggle, marquee, drag, menus, badges), unchanged; they guard feature logic rather than the fit. Open for review: whether that meets the rebase rule's "shown red by a mutation of the logic it guards".

## Gate (before the review fix round)

**3,803 pass / 0 fail / 233 files** (baseline 3,790 / 232: +13 tests in the new `WorldCanvasSurface.test.tsx`). Typecheck and UI build pass. GBA subject HEAD `26a2e3d1e`, same 9 porcelain lines; PerfPlus clean, no `.pokemap`.

## Reviews (Codex `gpt-6-astra` hit its usage limit until 00:20; Claude Opus `high-risk-reviewer` fallback, logged)

- Spec (`task-8-spec-review.md`): Approved with fixes. 1 Important (I1: P12-4e made unchanged GBA tests vacuous, e.g. `WorldCanvas.test.tsx:1849`, `:2587`; sweep needed), 10 Minor.
- Quality (`task-8-quality-review.md`): Approved with fixes. 5 Minor.
- Fix round: pending (next conductor). Committed as a gated checkpoint first.
