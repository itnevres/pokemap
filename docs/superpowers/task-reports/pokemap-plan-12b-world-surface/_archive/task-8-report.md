# Task 8 conductor report: GBA world canvas onto `WorldSurface` (High)

Tier: High. It replaces the GBA canvas and moves the world fetch and reconciliation (save/ledger ownership); GBA behaviour changes under P12-4c/d/e/j/m/n/o/p/r/s.

## Delegation

- Codex `gpt-6.1-sol` in scratch worktree `wt-t8` (base `a09fbcf`). Brief: `task-8-brief.md`. Free Aider hops skipped: the task spans more than 3 files and needs repo exploration (delegate skill: go straight to Codex).
- Pass 1 (Codex, ~233k tokens): `gba/worldSurface.tsx`, wrapper `components/WorldCanvas.tsx` (2114 → 80 lines), `canvas/worldColours.ts` (drawDiamond, levelColorMap, themedLevelColorMap moved; WorldSurface import line only), new `test/WorldCanvasSurface.test.tsx` (13 tests). No existing test edited. Notes: `task-8-impl-notes.md` (adapter field origins, reconciliation line-by-line vs old `WorldCanvas.tsx:490-527`, three surface gaps).
- Pass 2 (Codex): test rebases per the inventory below. Brief: `task-8-rebase-brief.md`.

## Step 1: new tests on the old source

`WorldCanvasSurface.test.tsx` copied into the main checkout (`a09fbcf`, old GBA canvas), run alone, removed: **13/13 fail** (before the P12-4m amendment; after it the P12-4m case asserts GBA's old full fill and passes on the old source, so 12/13 are red there and P12-4m is guarded by mutation M5), each on its missing feature: P12-4c no Map-view call; P12-4d no alert; P12-4e pre-fit tile requested / 6% not 31%; P12-4m 100% rect; P12-4n Enter not wired / no stepped context keys; P12-4o marker click selected the map; P12-4p no restarted highlight; P12-4r Far not fetched / fetch without Warps; P12-4s no alert (old GBA cached the failure, so the retry step is never reached); P12-4j 100% not 120%.

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
- Fix round: conductor 11, below. Committed as a gated checkpoint (`ec63e49`) first.

## Fix round (conductor 11, 2026-10-27)

Delegation: Anthropic direct (conductor inline), reason "under ~10 minutes of tool calls, where writing the brief costs more than doing it": every edit was designed while reading the findings (each fixture and literal derived here), so a brief would have been the edit itself. Codex was also at its usage limit until 00:20 (probe: `ERROR: You've hit your usage limit`).

- **I1** (vacuous P12-4e tests):
  - `WorldCanvas.test.tsx` "draws and fetches art only for maps in mapFilter": `fourMapsWorld(outside)` takes OutsideDungeon's position; this test puts it at (10,0), inside the filter fit's view (30x10 at z 10/3, pan (0,100/3): world [0,30)x[-10,20)), so only the filter source restriction keeps it unfetched. Other users of the fixture keep (0,20).
  - "right-click on a badge whose map body is not under the pointer": singleton Frame at (90,90,10,10) makes the all-placement fit [0,100)^2, z1 pan 0, so the badge stays at (0,10), off both bodies.
  - Sweep of the other "zoom 1 / pan 0 / default view" comments: :500 drag pan and :529 wheel pivot are zoom-invariant and still discriminate (comments rewritten for z10, M1). The warp-marker tests (:1709-1802), the badge-key test (:1054) and the encounter-border tests (:2310-2324) use P12-4e anchors that make the fit z1/pan0, so their "zoom 1" premise is true; their assertions pin 1.2^n zoom from 1 and fail otherwise.
  - Mutations, each red after the fix and green on the pre-fix `WorldCanvas.test.tsx` (vacuity confirmed): A `inScope(p.map) &&` dropped from `drawn` → 1 red (the mapFilter test; 157/157 before); B `badge?.map ??` dropped from the context-menu target → 1 red (the badge-body test; 157/157 before).
- **Rebase-rule closure** (35 fixture rebases): sampled feature mutations over `WorldCanvas`, `WorldCanvasContext`, `AppContextEdit`, `AppContextStroke` (157 tests): C marquee `contains` → `intersects` → 1 red ("Ctrl+drag right selects only maps fully enclosed"); D culling disabled (`visible = drawn`) → 6 red (culls, warp marker visibility, late-save menu, 3 encounter-border cases); E stacked-badge offset dropped → 2 red (two same-map badges; accepted-key redraw). Runner restored and sha-checked each file. Ruling recorded: a fixture rebase that neutralises the fit is guarded by its feature mutation, not a fit mutation.
- **Minor fixes:** M1 stale derivations (:500, :529); M2 stale comment deleted (`AppWorldContextMenu.test.tsx:93`); M3 P12-4c citation added; M4 explicit 0.6 scale-before-clamp assertion and retitled test (`canvas/worldView.test.ts`); M5/Q1 "60%" comment in `WorldSurface.tsx` and the plan's P12-4m wording (STATUS notes the amendment); M6/Q4 `GbcApp.test.tsx` centring fixture back to the original gap (Port x11) in a 300x200 viewport (fit 100/7 = 45%, jump z20 = 63%, City's jump leaves Port at x [270,470)), so no overlap or hit-order reliance; M7 stable `NO_LEVELS`; M8 `isWarpsPayload` comment; M10 duplicate rows and "B 255,50" in the notes; Q2 `worldColours.ts` header rewritten, `levelColorMap` JSDoc moved above it and trimmed; Q3 compat re-exports kept with a note (Task 9 inventory deletes unused ones); Q5 this report and the notes. M10's AppContextEdit/AppContextStroke note: those literal rebases are among the files the mutation sample above ran. M9 (toggle before load is a no-op) left as is: Task 6 surface behaviour, unreachable in practice, reads as a fix.
- Focused: `WorldCanvas`, `GbcApp`, `worldView`, `AppWorldContextMenu` 165/165.
- Gate after the fix round: **3,803 pass / 0 fail / 233 files**; typecheck and UI build pass; subjects unchanged (GBA `26a2e3d1e`, same 9 porcelain lines; PerfPlus clean). Re-review: brief `task-8-rereview-brief.md` (Codex `gpt-6-astra` once its limit resets at 00:20).
