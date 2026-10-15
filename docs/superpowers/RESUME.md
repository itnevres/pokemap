# PokeMap: current state (2026-10-14 evening, read first; Plan 9 Tasks 1-7 done, next: Task 8)

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
- **Plan 9 branch `plan-9-family-shell`** (local, unpushed) lives in a scratch worktree under the 2026-10-14 session's scratchpad (`…/4de66aba…/scratchpad/p9`; `git worktree list` shows the path). Tasks 1-7 are committed and reviewed (`fd16fcc`..`e42cc2f`); gate there **2,725 pass / 0 fail, 173 files**, typecheck and UI build pass (measured 2026-10-14 at `e42cc2f`). The SDD ledger (git-ignored) is `p9/.superpowers/sdd/2026-10-14-pokemap-plan-9-family-shell/progress.md`; it lists every hop, ruling and deferred minor. If the scratch path is gone: `git -c core.longpaths=true worktree add <new path> plan-9-family-shell` (the ledger is then lost; rebuild it from `git log` and `task-reports/pokemap-plan-9-family-shell/_archive/`).
- **Windows gate on `master` after Plan 8: 2,703 pass / 0 fail, 171 files** (measured 2026-10-13 at `6560014`, the last code commit); typecheck and the UI build pass. Older baselines (2,202 / 2 with the `world.test.ts` local-state pair, fixed by `ef248a3`) are in this file's git history.
  - Rerun any single failure in isolation before calling it a regression. Known load-only flakes are in `LESSONS.md` (Testing chapter).
- **Cloud baseline: not re-measured since 2026-09-25,** when the then-`master` gave 1,271 / 6. Re-measure it at the next cloud session. Failures expected from local-only state that git doesn't carry:
  - (a) `porymap.project.cfg` (Porymap-generated, gitignored) in the subject and in pokefirered: 3 tests.
  - (b) The subject's uncommitted 2026-08-30 resize of `LAYOUT_NAVEL_ROCK_ZYGARDE_CHAMBER` (+561 blocks): 2 tests.
  - (c) The subject's local `.pokemap/world.json`: its manual placements (1 test). On Windows, `dungeonAutoLayout:false` also accounts for the 2 `world.test.ts` failures above.

## External baselines (re-measured 2026-10-13, after the Plan 8 live smoke; a change is a finding)

- GBA subject `C:\Programming Projects\Pokemon Game\game`: HEAD `718b89f73`, 8 porcelain lines (the user's own; never restore), `.pokemap/world.json` SHA-1 `9c8ab2a…`, `dungeons.json` `f73f9b7…`, `data/layouts/LittlerootTown/map.bin` `bdc3ddce2…`.
- PerfPlus `C:\Programming Projects\pokecrystal-PerfPlus`: HEAD `81ededbe3`, clean, no `.pokemap`; `maps/NewBarkTown.blk` `0b7d45d…`, `.asm` `56f87ef…`.
- pret `C:\Programming Projects\Pokemon Game\refs\pokecrystal`: `3bc8daa41`, clean.

## Unified UI direction (user, 2026-10-13)

**Goal:** GBA and GBC get the same UI/UX: the same buttons, layout, colouring and features. A feature added once shows up in both, even when each engine does the work differently underneath. The approach: one shell (`FamilyApp` over an engine adapter, with capability flags for things only one engine can do), then a shared canvas core (one render/interaction layer; the adapter supplies tile drawing, geometry and family overlays).

User rulings on the differences that exist today:
- **Switching maps with unsaved changes:** both families warn and offer a choice to **save or discard** (today GBA only confirms-to-discard; GBC discards on the server, then switches).
- **Sign composer** (GBA "Add Sign": a wild-encounter sign event + `scripts.inc` text, staged in the edit session): **GBC gets it** (needs a GBC engine side writing the `.asm` event and Crystal text).
- **Manual placements, the defects banner, the dungeon filter cache** (GBC-only today): **shared features**.
- **Toolbars:** decided 2026-10-14 from a side-by-side comparison: the GBC rail layout and icon + label tool buttons for both families.

The 2026-10-14 issue review and interview produced the roadmap `plans/2026-10-14-pokemap-roadmap-unified-ui.md`: decisions D1-D16, the issue map, the toolbar comparison, and Plans 9-18 (shell, parity features, canvas leaf extractions, canvas core, then #5/#6, GBC editing gaps, #9, #8, #10, #7).

## Where each line of work stands

| Line of work | State | Needs |
|---|---|---|
| Plan 6: GBC foundation, read-only | **Done and merged 2026-09-25.** See the plan's STATUS banner for the real file map | — |
| Unified UI: one shell + shared canvas core (Plans 9+) | **Outlined 2026-10-14** in `plans/2026-10-14-pokemap-roadmap-unified-ui.md` (Plans 9-18, decisions D1-D16). **Plan 9 spec approved 2026-10-14:** `specs/2026-10-14-pokemap-plan-9-family-shell-design.md` (`c5d010e`, branch `plan-9-family-shell`, unpushed). User rulings in it: R1 keyboard shortcuts (tools + Undo/Redo) and R2 GBA palette hover-link are IN Plan 9; R3 adapter = one runtime hook per family. Switch semantics stay per family in Plan 9; D1 save-or-discard is Plan 10. **Plan 9 implementation plan approved 2026-10-14 (execution: subagent-driven):** `plans/2026-10-14-pokemap-plan-9-family-shell.md` (12 tasks: characterisation tests, adapter types, GBA/GBC runtimes, FamilyApp with App/GbcApp as one-task wrappers, test move, rail, toolbar, shortcuts, GBA hover-link, DESIGN.md, live acceptance incl. #4; expected gate 2,756 / 0, 175 files). Its "Decisions taken in this plan" section lists the readings of the spec for the user to confirm. User ruling R4 (2026-10-14, added to spec and plan Task 10): a shared "Follow hover" switch on both palettes controls auto-scroll to the hovered metatile, default on, remembered per browser. **Execution 2026-10-14:** Tasks 1-7 done on `plan-9-family-shell` (FamilyApp + both runtimes, App/GbcApp deleted, shell tests moved, shared `.edit-rail`); reports in `task-reports/pokemap-plan-9-family-shell/_archive/`. User ruling R5 (2026-10-14, after Task 7): F fits Map/World/Dungeon view in both families via each canvas's own Fit action; added to spec and plan as Task 9b (Task 9 now puts the shared ignore rules in `shared/shortcutGuard.ts`). New final target 2,770 / 0, 176 files. | Continue Plan 9 at Task 8, then 9, 9b, 10-12; final Opus whole-branch review |
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
