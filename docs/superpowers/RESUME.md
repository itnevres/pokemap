# PokeMap: current state (2026-10-19, read first; Plan 10a merged via #20; Plan 10a2 Pokémon Indicator merged via #21; Plan 10a3 save integrity done on `plan-10a3-save-integrity` (final review clean), unpushed; next: push/merge with the user's OK)

PokeMap is a Porymap-parity map editor with two engine families:
- **GBA:** pokeemerald-family decomps. Plans 0-5.
- **GBC:** Pokémon Crystal now, Yellow later. Plans 6+, with its own roadmap and invariants G1-G7.

This file holds the state; the traps and lessons live in `docs/superpowers/LESSONS.md` (chapterized, with a table of contents). The prompt for the next session is written fresh at each handoff, so none is kept here.

## Git state: read before branching

- **`master` is current. Branch new work from it.** Every merge uses a merge commit, never a rebase or squash, so every SHA cited in the docs and task reports stays valid:
  - Plan 6, with the world-view and dungeon-mode plans and Plan 2 and its follow-ups: [itnevres/pokemap#1](https://github.com/itnevres/pokemap/pull/1) → `075cefb` (2026-09-25).
  - Plan 6b: [itnevres/pokemap#3](https://github.com/itnevres/pokemap/pull/3) → `ce020d9`. Its tree equals 6b HEAD `243cbef`.
  - Plan 6c: [itnevres/pokemap#11](https://github.com/itnevres/pokemap/pull/11) → `a16b604` (2026-10-07). Its tree equals 6c HEAD `22237b4`.
  - Plan 7: [itnevres/pokemap#13](https://github.com/itnevres/pokemap/pull/13) → `dbb1761` (2026-10-12). Its tree equals Plan 7 HEAD `5bfffaf`.
  - Plan 8: [itnevres/pokemap#15](https://github.com/itnevres/pokemap/pull/15) → `b71efab` (2026-10-13). Its tree equals Plan 8 HEAD.
  - Docs since (no code): LESSONS chapters [#16](https://github.com/itnevres/pokemap/pull/16) → `741132d`; Plans 9-18 roadmap [#17](https://github.com/itnevres/pokemap/pull/17) → `37247cb` (2026-10-14).
- **The main checkout is back on `master`** (2026-10-14). Its only untracked entry is `.codex/` (Codex's local config; leave it).
- **Plan 9 + 9F: merged to `master` via [#19](https://github.com/itnevres/pokemap/pull/19) (2026-10-15, merge commit).** Branch `plan-9-family-shell` holds Plan 9 (final review: `task-reports/pokemap-plan-9-family-shell/final-review.md`), follow-ups A-E (`60cbd5d`..`4e886c1`) and Plan 9F (`21e7e22`..`46d663e`, last code commit `1a7995e`). **Gate at `1a7995e`: 2,837 pass / 0 fail, 181 files**, typecheck and UI build pass (measured 2026-10-15). The p9 scratch worktree was removed 2026-10-16. Issue #4 is closed.
- **Plan 10a: merged to `master` via [#20](https://github.com/itnevres/pokemap/pull/20) (2026-10-17, merge commit).** Branch `plan-10a-switch-and-signs`: D1 save-or-discard prompt and the Sign tool in both families, plus the Task 8 F1 fix (`882d0c3`). **Gate at `882d0c3`: 2,991 pass / 0 fail / 192 files; typecheck and UI build pass (measured 2026-10-17).** Ledger with rulings and deferred minors: `.superpowers/sdd/2026-10-16-pokemap-plan-10a-switch-and-signs/progress.md`. Live acceptance: `task-reports/pokemap-plan-10a-switch-and-signs/task-8-live.md`. Rulings: spec S9a, S10a; deferred minors in spec S11. The scratch worktree `C:/Users/Serve/AppData/Local/Temp/claude/C--Programming-Projects-PokeMap/p10/wt` can be removed after the merge. Another stale worktree, `…/a062df57…/scratchpad/codex-t1` (detached `17be80b`), also exists; check it before removing.
- **Plan 10a2 (Pokémon Indicator): merged to `master` via [#21](https://github.com/itnevres/pokemap/pull/21) → `8691b02` (2026-10-19, merge commit; branch tip `878d5a2`).** Code `0ddf85a`..`64ab790`, live report `5312378`. **Gate at `64ab790`: 3,191 tests, 3,190 pass + 1 known flake (GbcAppEditing "beforeunload…", passes alone) / 195 files; typecheck and UI build pass.** Ledger (rulings, deferred minors, Codex thread ids): `.superpowers/sdd/2026-10-17-pokemap-plan-10a2-pokemon-indicator/progress.md`. Live acceptance: `task-reports/pokemap-plan-10a2-pokemon-indicator/task-6-live.md`. Task 6 fix review (`99d5d0e..64ab790`): spec ✅, quality approved. Final whole-branch review (Codex gpt-6-astra): 3 findings fixed in `669d99e` (overlong later words in `wrapSign`, comment-aware GBA label guard, suggestion refusals in the dialog); 2 inherited save-model gaps deferred (multi-file save not atomic; commit not bound to the previewed plan). **Gate at `669d99e`: 3,201 pass / 0 fail / 195 files; typecheck and UI build pass.**
- **Plan 10a3 (save integrity): branch `plan-10a3-save-integrity` from `878d5a2` (10a2 tip, now on `master` via #21), unpushed, Tasks 1-5 done (2026-10-19).** Fixes 10a2 final-review I1/I2: all-or-nothing multi-file save (`core/src/write/atomic.ts` `writeFilesAtomically`, `a030c28`); prepared saves + `planFingerprint` used by both commits (`99ffdab`); the hub binds commit to the previewed plan (`GET plan` returns `fingerprint`, `POST commit` takes `{ fingerprint }`, 409 `PLAN_CHANGED` with a `notice`, commits the prepared entries it fingerprinted; `b6dd485`); the Save dialog posts the fingerprint and shows the notice (`0fa2629`). Spec `specs/2026-10-19-pokemap-plan-10a3-save-integrity-design.md` (rulings R1-R10), plan `plans/2026-10-19-pokemap-plan-10a3-save-integrity.md`. **Gate at `0fa2629`: 3,277 pass / 0 fail / 201 files; typecheck and UI build pass.** Live acceptance (GBA Route101, GBC Route33; second-tab edit refused with the notice, disk unchanged, re-reviewed save goes through; subjects byte-identical after): `task-reports/pokemap-plan-10a3-save-integrity/task-5-live.md`. Ledger: `.superpowers/sdd/2026-10-19-pokemap-plan-10a3-save-integrity/progress.md` (rulings, deferred minors, Codex thread ids). Final whole-branch review (Codex gpt-6-astra): 1 Important fixed in `7018a95` (a save-prepare failure now shows in the plan as refusal `SAVE_PREPARE_FAILED`), re-review "Addressed"; 5 deferred minors judged OK to defer (ledger). **Gate at `7018a95`: 3,277 pass / 0 fail / 201 files; typecheck and UI build pass.** **Open:** push/merge with the user's OK.
- **Windows gate on `master` after Plan 10a2: 3,201 pass / 0 fail, 195 files** (measured 2026-10-18 at `669d99e`, the last code commit); typecheck and the UI build pass. Older baselines (2,202 / 2 with the `world.test.ts` local-state pair, fixed by `ef248a3`) are in this file's git history.
  - Rerun any single failure in isolation before calling it a regression. Known load-only flakes are in `LESSONS.md` (Testing chapter).
- **Cloud baseline: not re-measured since 2026-09-25,** when the then-`master` gave 1,271 / 6. Re-measure it at the next cloud session. Failures expected from local-only state that git doesn't carry:
  - (a) `porymap.project.cfg` (Porymap-generated, gitignored) in the subject and in pokefirered: 3 tests.
  - (b) The subject's uncommitted 2026-08-30 resize of `LAYOUT_NAVEL_ROCK_ZYGARDE_CHAMBER` (+561 blocks): 2 tests.
  - (c) The subject's local `.pokemap/world.json`: its manual placements (1 test). On Windows, `dungeonAutoLayout:false` also accounts for the 2 `world.test.ts` failures above.

## External baselines (re-measured 2026-10-17, after the Plan 10a live check; a change is a finding)

- GBA subject `C:\Programming Projects\Pokemon Game\game`: HEAD `718b89f73`, 8 porcelain lines (the user's own; never restore), `.pokemap/world.json` SHA-1 `9c8ab2a…`, `dungeons.json` `f73f9b7…`, `data/layouts/LittlerootTown/map.bin` `bdc3ddce2…`.
- PerfPlus `C:\Programming Projects\pokecrystal-PerfPlus`: HEAD `81ededbe3`, clean, no `.pokemap`; `maps/NewBarkTown.blk` `0b7d45d…`, `.asm` `56f87ef…`.
- pret `C:\Programming Projects\Pokemon Game\refs\pokecrystal`: `3bc8daa41`, clean.

## Unified UI direction (user, 2026-10-13)

**Goal:** GBA and GBC get the same UI/UX: the same buttons, layout, colouring and features. A feature added once shows up in both, even when each engine does the work differently underneath. The approach: one shell (`FamilyApp` over an engine adapter, with capability flags for things only one engine can do), then a shared canvas core (one render/interaction layer; the adapter supplies tile drawing, geometry and family overlays).

User rulings on the differences that exist today:
- **Switching maps with unsaved changes:** both families warn and offer a choice to **save or discard** (today GBA only confirms-to-discard; GBC discards on the server, then switches).
- **Sign composer:** superseded by roadmap D2 amended (2026-10-16): the GBA composer is really a species sprite (object event) and becomes the **Pokémon Indicator** in both families (Plan 10a2); a new **Sign tool** (readable signs) comes to both families in Plan 10a.
- **Manual placements, the defects banner, the dungeon filter cache** (GBC-only today): **shared features**.
- **Toolbars:** decided 2026-10-14 from a side-by-side comparison: the GBC rail layout and icon + label tool buttons for both families.

The 2026-10-14 issue review and interview produced the roadmap `plans/2026-10-14-pokemap-roadmap-unified-ui.md`: decisions D1-D16, the issue map, the toolbar comparison, and Plans 9-18 (shell, parity features, canvas leaf extractions, canvas core, then #5/#6, GBC editing gaps, #9, #8, #10, #7).

**2026-10-16 roadmap amendment (user approved; D17-D18):** Plans 10-14 stay in order; then 14A shared stamps/saved patterns → 14B terrain painting (water/paths first; forests/cliffs in a later phase) → 14C adjacent-map creation with real reciprocal connections → 15 → 16 → 17 (reusing 14C creation) → 17A 2D collision-aware walking preview. Plan 18 triage remains independent. These future additions are planned, not implemented; current implementation status is recorded below. Maintenance ledger: low-risk docs-only change, edited inline because this small two-file amendment needs the current conversation's approved decisions; no product behavior changed.

## Where each line of work stands

| Line of work | State | Needs |
|---|---|---|
| Plan 6: GBC foundation, read-only | **Done and merged 2026-09-25.** See the plan's STATUS banner for the real file map | — |
| Unified UI: one shell + shared canvas core (Plans 9+) | Roadmap `plans/2026-10-14-pokemap-roadmap-unified-ui.md` (Plans 9-18 plus 14A-14C and 17A; D1-D18). **Plan 9 done and merged (#19):** spec `specs/2026-10-14-pokemap-plan-9-family-shell-design.md`, plan `plans/2026-10-14-pokemap-plan-9-family-shell.md`, rulings R1-R5 in the spec, live acceptance `task-reports/pokemap-plan-9-family-shell/task-12-live.md`; follow-ups A-E (viewport helper, contenteditable shortcut guard, Fit test, GBC switchError, re-render lag `followup-O2-lag.md`). **Plan 9F palette done and merged (#19):** spec addendum `specs/2026-10-15-pokemap-plan-9-palette-addendum.md` (R-F3 amended: fold candidates farther than rowCount/4 from the middle are ignored; a GBA drag across the two columns selects nothing), plan `plans/2026-10-15-pokemap-plan-9f-palette.md`, design in `packages/ui/DESIGN.md` "Rail palette", live acceptance `task-reports/pokemap-plan-9-family-shell/followup-F-live.md`. Shared pieces: `packages/ui/src/shared/{paletteFold.ts,useUniformRows.ts,PaletteFrame.tsx,FoldedGrid.tsx}`; rail 272 px. Deferred minors (not bugs, nobody blocked): a cross-column drag is dropped with no feedback; each 30 ms thumbnail batch re-renders the GBA palette; GBC scroll-spy does not re-run when the fold/search remounts cells; search input has no aria-label; stale "horizontal strip" comment on `.gbc-metatile-palette`. Still deferred to later plans: F2 GBA greyed row after drag-to-place (Plan 10b D3), m3 two "Collision" buttons (Plan 11). **Plan 10 split (user, 2026-10-16):** 10a = D1 save-or-discard + Sign tool, spec `specs/2026-10-16-pokemap-plan-10a-switch-and-signs-design.md`, plan `plans/2026-10-16-pokemap-plan-10a-switch-and-signs.md` (9 tasks, tiers tagged); 10a2 = Pokémon Indicator (rename GBA "Add Wild Sign" + GBC port); 10b = D3 + F2, D6, D8. **Plan 10a Tasks 1-7 done** (D1 switch prompt; charmap/wrap; GBC+GBA sign blocks; linked names/species; sign routes + linked refresh both families; Sign tool `G`, SignEditor, Save-dialog Linked-signs notice). Decisions this session: user ruling S9a (GBC species signs skip header fishing without reachable water, matching the encounter panel; recorded in the spec); save refuses two `ScriptReplace` entries for one path (`script-replace-duplicate`); a linked sign that cannot refresh (missing landmark/charmap entry) blocks every save of that map, and a GBA map with sign bg_events but no `scripts.inc` refuses saves (S10 "never a partial write"; recorded as spec S10a). **Tasks 8-9 done:** live acceptance passed (`task-8-live.md`), F1 Sign editor size fixed 2026-10-17. | Plan 10a2 (Pokémon Indicator): spec `specs/2026-10-17-pokemap-plan-10a2-pokemon-indicator-design.md` (user rulings I1-I4: rename; dialog kept, move by event drag; GBC own sprite else `SPRITE_MONSTER`; Edit Indicator for species/text), plan `plans/2026-10-17-pokemap-plan-10a2-pokemon-indicator.md` (7 tasks, tiers tagged; Codex astra plan review applied). Done and merged via #21 (see Git state). Planning finding: Plan 10a shipped GBA sign wrap width 18, now `SIGN_WIDTH` in `core/src/signs/wrap.ts`. Task 6 live found and fixed two bugs: moving an unsaved (pending-insert) event broke the GBA save plan (pre-existing `event/move`), and suggestions ignored staged objects; the Save dialog now shows plan-load refusals. Known pre-existing limit left alone: GBA moves after a pending deletion target the wrong original index (Indicator update refuses that case). Plan 10a3 (save integrity, fixes the two deferred save gaps): done, see Git state. |
| Plan 8: unify GBA/GBC UI over an engine adapter | **Done and merged 2026-10-13** ([itnevres/pokemap#15](https://github.com/itnevres/pokemap/pull/15)). Shared modules are mapped in `packages/ui/DESIGN.md` "Shared modules (Plan 8)"; the plan's STATUS banner and `task-reports/pokemap-plan-8-ui-engine-adapter/` (ledger + `_archive/`) hold the rest. Task 7 was reduced (no EngineAdapter yet); Task 8 measured what the canvases still duplicate (`_archive/task-8-measurement.md`). Deferred follow-up from the final review: a discard does not wait for queued stroke links (`strokeSettled().then(discard)`). | — |
| Issues #5/#6: warp destination popups, `scope=dungeon` (Codex) | **WIP-committed 2026-10-14 as `946bb61` on branch `issues-5-6-warp-popups` (pushed; base `ef248a3`, pre-Plan 8). Unverified:** its gate collected 0 tests (EPERM), no gate was run for the WIP commit, and there is no live acceptance. Its record is `task-reports/warp-dungeon-issues/coordinator.md` on that branch. **User decision 2026-10-12: park it until Plan 8 finishes; superseded 2026-10-14: it lands after the canvas core, ported onto it (roadmap Plan 13).** Do not merge the branch as is. | Roadmap Plan 13 (after the canvas core): port onto the core, focused and full gate, live check, a named reason for the changed GBA tests, then commit |
| Plan 7: GBC editing | **Done and merged 2026-10-12** ([itnevres/pokemap#13](https://github.com/itnevres/pokemap/pull/13) → `dbb1761`), Claude-audited. Tasks 1–7 and Task 5b accepted; final gate 2,574 pass/0 fail, typecheck/build pass. Plan STATUS and archived acceptance reports hold details. | — |
| 6c: hub, encounter border, world UX (both families) | **Done and merged 2026-10-07** ([itnevres/pokemap#11](https://github.com/itnevres/pokemap/pull/11) → `a16b604`). Phases A-F; the close-out is `_archive/task-F1-closeout.md`. (A 2026-09-30: hub, picker/switcher, criterion 1. B 2026-10-01: GBC front sprites + real GBC icon route, species-summary adapters, `pickBorderSide`, shared `EncounterBorder` replacing both gutters in both world views, the border in both map views; criterion 2. C 2026-10-01: `LensPanel` split into toggles + an in-flow `LensLegend` row (`world-canvas__legend-row`) with real empty-maps (jump like a tree click) and unused-species (names + icons) lists, both `focusEmptyMaps` deleted; `MapTree` reveals the selected row; GBA world single-click selects in the tree without jumping, and entering World centres on the selection (both apps); criteria 3-5 live-verified. D 2026-10-04: GBC visibility, sidecar and drag placement; near-warp auto-layout in core for both families; GBC warp markers, preview and Dungeon tab; conflict acceptance in both families with a badge-only right-click action that E3 absorbs; criteria 6-7 live-verified in both families). `plans/2026-09-28-pokemap-plan-6c-hub-encounters-world.md`: 17 tasks in phases A-F. Run one phase per coordinator session. The user decisions U1-U4 are binding. E 2026-10-06:
- E1: `MapCanvas` has one view state (follow-ups D1/D2 done) and a controlled `view`/`onViewChange`.
- E2: `MapEditingWorkspace` and `useMapEditing` were extracted from `App`.
- E3: `WorldContextMenu` serves both families, with a keyboard open and a guard for Chromium's native `contextmenu` echo.
- E4: GBA in-context editing. A double-click puts a chromeless MapCanvas overlay on the stable world canvas; saves go through `SaveDialog`, refetch that one tile with `?v=n`, and clear the server `pngCache` on commit.
- Criterion 8 was live-verified with a real NewBarkTown write, then restored byte-identical by reverse paint.

Deferred from E and F1:
- At 1024 wide in context mode, the world toolbar is cramped: the zoom readout overlaps "Method". Hiding the world's Unplaced sidebar while in context would fix it.
- MapCanvas's Grid/Collision/Events/Encounters toggles aren't reachable in context (accepted limitation).
- A refreshed world tile is blank until its new image loads.
- After "Open in Map view", focus falls to `body`.
- GBC has no "Shift+mousedown, no movement, no POST" pin. The same guard as GBA's exists in the code.
- At narrow widths, the Pencil metatile strip (240 px) leaves a short world area in context mode.
- The encounter sprite tooltip clips at the viewport's left edge when a strip sits there (seen in F1 on GBA Route102).

Evidence: `task-reports/pokemap-plan-6c-hub-encounters-world/_archive/task-{E1,E2,E3,E4}-coordinator.md` plus `task-{A1,A2,B1,B2,B3,B4,C1,C2,D3,D4}-coordinator.md` and `phase-D-review.md`. **R1 from D is fixed** (`6aa47ae`): `placeNearWarps` now treats manual placements as fixed obstacles. Deferred from D: the conflict popup issues (screen-anchored, no close on pan, no toast dismiss) were fixed by E3's `WorldContextMenu`; the legend's "Accepted" entry was added in the Phase D nits commit; GBC World mode fetches `/api/world` twice, once in `GbcApp` for tree visibility and once in the canvas, which is deliberate parity with GBA's `App.tsx` (about 80 ms warm; folding the two would need canvas-remount freshness handling, so it was left). Deferred from A: a POST body read after a hub swap still runs on the disposed handler (A1 SR-F3); browse doesn't list symlinked dirs; a browse 403 shows only the status code. Deferred from B: in the GBA map editor with Encounters on, a stroke dragged onto a sprite ends early (`mouseleave`; revisit in E1/E4); count badges overlap at Fit all; a map taller than the viewport at 1× shows its side strip starting off-screen. Deferred from C: in the dungeon view the empty-maps copy still ends "Click to list them." with no list button (the list is hidden there by design); an open lens list re-renders with every pan frame (not profiled; memoise if it shows); no Escape-to-close on the lists; a cancelled dirty-session confirm after a GBA world click leaves the canvas outline on the clicked map while the tree keeps the old one | GBA subject + PerfPlus + a browser |
| 6b: GBC app layer (server + UI, read-only) | **Done and merged** ([itnevres/pokemap#3](https://github.com/itnevres/pokemap/pull/3) → `ce020d9`). Plan: `plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md`; its STATUS banner holds the real file map. The close-out evidence is in `task-reports/pokemap-plan-6b-gbc-app-layer/_archive/task-7-closeout.md` | — |
| 4 remaining GBA follow-up fixes (A/B/C/D) | **Task D is done:** D1/D2 in 6c E1, and D3 earlier, in 6b. Tasks A-C are planned, not started. **D3** (the styles.css `*/` comment) was already fixed in 6b at `5629602`, with the user's go-ahead. It was worse than recorded: it also swallowed the `.species-spotlight` rule and put the spotlight dropdown off-screen.<br>Also seen in 6b's close-out, and not yet in the plan:<br>- ~~in GBA's world toolbar, the open lens legend popover covers the Encounters toggle~~ **fixed by 6c C1** (the legend is now an in-flow row; `elementFromPoint` verified at 1280/1024, both families);<br>- at mid zoom, gutter strips of adjacent maps overlap (both families; the gutters are now 6c B3's `EncounterBorder`).<br>Evidence: `task-reports/pokemap-plan-6b-gbc-app-layer/_archive/task-4-spec-review.md` A/B and `_archive/task-7-closeout.md` | GBA corpus (now available in the cloud) + live browser verify (Chromium is available in the cloud) |
| Plan 3: GBA data editors | Not started, lower priority | Windows machine |
| Plans 4-5 | Not started / backlog | — |

## Environments

- **Windows machine** (`C:\Programming Projects\PokeMap`): has the GBA subject decomp, the reference engines and the PerfPlus checkout, so the full suite runs.
- **Cloud session** (claude.ai/code): **the SessionStart hook `.claude/hooks/session-start.sh` sets everything up** (registered in `.claude/settings.json`; it only runs when `CLAUDE_CODE_REMOTE=true`, so the Windows machine is unaffected). It:
  - runs `npm install` and reverts the lockfile churn;
  - fetches the 5 GBA reference engines and PerfPlus into `$HOME/pokemap-corpus/` at the pinned commits verified on 2026-09-25;
  - finds the GBA subject;
  - writes `pokemap.config.json` with cloud paths and marks it `git update-index --skip-worktree`, so it never shows as modified and can't be committed.
  It takes ~20 s on a fresh container and ~1 s on a re-run.
  - **The GBA subject `itnevres/pokemon-three-region` is PRIVATE.** Select it alongside `itnevres/pokemap` when starting the session, or attach it mid-session and re-run the hook with `CLAUDE_CODE_REMOTE=true .claude/hooks/session-start.sh`. If it is missing, the hook warns, and the GBA corpus test files fail at collection. The GBC suite is unaffected.
  - **Cloud baseline:** see Git state. It has not been re-measured since 6b and 6c merged. To make the cloud fully green, do these on the Windows machine:
    - commit and push the NavelRock Zygarde resize;
    - `git add -f porymap.project.cfg` in the subject, or accept those 3 as cloud-only skips;
    - commit `.pokemap/world.json`.
  - Pinned reference SHAs live in the hook. Bump them deliberately, and re-measure any pinned counts when you do.

## GBC facts from Plan 6 (short list; the full truth is in the findings doc)

- **Format truth:** `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md`. Its Decisions section is binding.
- **Data defects** (they never throw, and the CLI prints them to stderr):
  - the CeruleanCave2F and CeruleanCaveB1 oversize `.blk` are loaded as the first w×h bytes and marked `writable: false`, so Plan 7 must refuse writes to them;
  - `data/wild/kanto_grass.asm` has no `db -1` terminator.
- **World:** the 2 connection conflicts (a 1-block misclosure in the Route16/17/18/Fuchsia loop) are **genuine retail data**. Vanilla pret has identical lines. `render-world` prints them as `note:` lines. Kanto and Johto are separate components, because the ferry is a warp.
- **Atlas:** every probability is derived from engine asm, with file:line citations in `atlas.ts`.
  - Fishing is only reported on maps that have a WATER_TILE-category collision; 319 maps have a FISHGROUP but no water.
  - Known over-approximation: walled-in water (Route16/18) still counts as fishable.
- **Carry-forward for Plan 7:**
  - `asmSplice` refusals lack file/map context; wrap them at the call site.
  - `asmSplice` can only replace an argument, so event add/delete needs a new line insert/remove primitive.
  - Warp `destWarp` is a 1-based positional index, so the renumbering footgun is real.

## Where everything is

| Thing | Path |
|---|---|
| Plan 0: GBA roadmap, invariants I1-I8, test-design rules §7, plan status table | `docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md` |
| Plan 1 (29 tasks, done) | `docs/superpowers/plans/2026-08-26-pokemap-plan-1-foundation-world.md` |
| World View Usability (done) / Dungeon Mode and Warp Tools (done) | `docs/superpowers/plans/2026-09-07-world-view-usability.md`, `2026-09-08-dungeon-mode-and-warp-tools.md` |
| Plan 2: Editing (19/19 done, plus 6 follow-ups; full TDD-step text as executed) | `docs/superpowers/plans/2026-08-26-pokemap-plan-2-editing.md` |
| 4 remaining GBA follow-up fixes (not started) | `docs/superpowers/plans/2026-09-23-pokemap-followups-remaining.md` |
| Plans 3-5 (GBA; task-level only, not started) | same directory |
| GBC roadmap: invariants G1-G7, phase/status table §6 | `docs/superpowers/plans/2026-09-23-pokemap-plan-6-gbc-roadmap.md` |
| Plan 6: GBC foundation (done; STATUS banner holds the real file map) | `docs/superpowers/plans/2026-09-23-pokemap-plan-6-gbc-foundation.md` |
| Plan 6b: GBC app layer (done; STATUS banner holds the real file map) | `docs/superpowers/plans/2026-09-25-pokemap-plan-6b-gbc-app-layer.md` |
| 6b task reports: specs, implementer reports, reviews, screenshots, baseline fails, the close-out | `docs/superpowers/task-reports/pokemap-plan-6b-gbc-app-layer/` (all reports in `_archive/`) |
| Plan 6c: hub, encounter border, world UX (done; STATUS banner holds the real file map) | `docs/superpowers/plans/2026-09-28-pokemap-plan-6c-hub-encounters-world.md` |
| 6c task reports: baseline, executed specs, reviews, coordinator records, close-out | `docs/superpowers/task-reports/pokemap-plan-6c-hub-encounters-world/_archive/` (everything archived at F1; the close-out is `task-F1-closeout.md`) |
| Plan 7: GBC editing (done; STATUS banner) | `docs/superpowers/plans/2026-09-23-pokemap-plan-7-gbc-editing.md` |
| Plan 8: shared GBA/GBC UI modules (done; STATUS banner) | `docs/superpowers/plans/2026-10-12-pokemap-plan-8-ui-engine-adapter.md` |
| GBC format truth (binding Decisions) | `docs/superpowers/specs/2026-09-23-pokemap-gbc-format-findings.md` |
| GBA design spec and feature specs | `docs/superpowers/specs/2026-08-26-pokemap-design.md`, `2026-09-07-*.md` |
| Design system, binding on all UI tasks | `packages/ui/DESIGN.md` |
| Subject decomp, GBA (read-only, I8) | `C:\Programming Projects\Pokemon Game\game` |
| Reference engines, GBA | `C:\Programming Projects\Pokemon Game\refs\` |
| Subject decomp, GBC (writable through the app since Plan 7, G7) | `C:\Programming Projects\pokecrystal-PerfPlus` (cloud: clone, see Environments) |
| GBC reference corpus (Plan 7 G5 gate) | `C:\Programming Projects\Pokemon Game\refs\pokecrystal` (pret, `3bc8daa`); in a cloud session, clone it from GitHub |
| pokeyellow (not yet planned) | `C:\Programming Projects\Pokemon Game\refs\pokeyellow` |
| Archived task reports (full implementer/reviewer detail) | `docs/superpowers/task-reports/{pokemap-plan-2-editing,pokemap-plan-2-followups,pokemap-plan-6-gbc-foundation,pokemap-plan-6b-gbc-app-layer}/_archive/` |

`git log --oneline` is the real story. Each `fix:` commit on top of a `feat:` records exactly what a review found and why. Plan 2's substantive ones: Task 11's rect-race, Task 13's SaveDialog crash and modal-focus regression, Task 14's silent-failure gaps, Task 18's dry-run/refusal asymmetry, Task 19's map-name races, and the live-render follow-up. Plan 6's: Task 8's four located-refusal rounds, and Task 9/11's mutation-pin rounds.

## Running it

See the root [LAUNCH.md](../../LAUNCH.md) for manual PowerShell and Git Bash launch steps and the launch-guide maintenance rule.

```bash
npx tsx packages/server/src/serve.ts        # the hub on 127.0.0.1:5174: reopens ~/.pokemap/recent.json's newest project, else the UI shows the project picker (POKEMAP_HOME overrides ~/.pokemap)
npx tsx packages/server/src/serve.ts --gbc  # the hub with pokemap.config.json's gbc.projectPath opened (Crystal); a positional root also works, and the family is auto-detected
npm run dev --workspace=@pokemap/ui         # Vite on 5173, proxies /api
# GBC, CLI only:
npx tsx packages/cli/src/index.ts --project <PerfPlus> render NewBarkTown -o out.png [--border 3] [--time nite]
npx tsx packages/cli/src/index.ts --project <PerfPlus> query|encounters <Map> ; where <species> ; coverage [--unused]
npx tsx packages/cli/src/index.ts --project <PerfPlus> render-world --bbox x,y,w,h [--scale 8] -o world.png
```

`.claude/launch.json` lets the browser tooling start `ui`, `server` or `server-gbc` by name. The two servers share port 5174, so only one runs at a time. **Open
the app and click things, every time, not just once.** Plan 2 caught a real,
otherwise-invisible bug this way on Task 11 (see below).

## Open items carried forward from Plan 1 (still true, still open)

- 19 connection conflicts (`CONFLICT_BASELINE`) — real decomp
  inconsistencies, not a bug. Full list in commit `361a662`.
- 14 real maps have more `mons` slots than declared weights in
  `wild_encounters.json` — documented in `encounters.ts`, background task
  `task_b2fa2dff`.
- `pokeemerald-expansion` names its second constant set `_FRLG` where
  split detection assumes `_EMERALD`. This is still open after Plan 2's
  Task 19. It is documented as a known, out-of-scope gap in
  `packages/core/src/project.ts`'s `hasSplitConstants` doc comment. Fix it
  before relying on split detection for that engine.
- `WorldCanvas.tsx` is ~2,057 lines with one known clean extraction seam
  (lens/spotlight overlays). Not urgent.
