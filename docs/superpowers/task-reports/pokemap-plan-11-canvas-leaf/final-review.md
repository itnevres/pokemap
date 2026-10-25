# Plan 11 final whole-branch review (Opus tier)

Scope: `git diff fb78949 8f8dcdd -- packages/` (39 files), task reports 1-9, spec `2026-10-23-pokemap-plan-11-canvas-leaf-extractions-design.md`. Tests run: `packages/ui/test/world/placementResync.test.tsx` (56/56 pass), `packages/server/test/projectSymbols.test.ts` (3/3 pass). Full gate not run (per brief); Task 9 records 3,528 / 0 fail / 218 files, typecheck and UI build pass.

**Verdict: Ready to merge.** 0 Critical, 0 Important, 5 Minor (2 fix-now cheap, 3 OK to defer).

## Checked and sound

- **Ledger model (F1-F4).** `shared/placementLedger.ts` matches the spec: one version per gesture (GBA map drag `begin` on first mousemove, group drag one per member, rail drop one per drop), no-ops wait on the newest in-flight moved version, `serverShows` compares the latest version at landing with the snapshot at issue. Both canvases compute `keep` before the state updater, so no updater reads a ref (F4).
- **Snapshot timing.** GBA snapshots in the `/api/world` effect body, which is where the GET is issued; a superseded GET is cancelled by the effect cleanup, so only the newest GET can land. GBC snapshots through `useGbcWorld`'s `onIssue` per generation and pairs the response with `loadedGen`; `setData` and `setLoadedGen` land in one batch; the `EMPTY_PLACEMENT_SNAPSHOT` fallback keeps local (the safe side).
- **Toggle generations (F12) against placement reloads (Task 5/6/7).** A toggle success records `toggleReloadGeneration = reloadWorld()`. A later placement reload (higher generation) cancels it in GBA / supersedes it in GBC and still clears pending, which is correct because it was issued after the success. A newer click nulls `toggleReloadGeneration`, so an older reload never clears the newer pending value. A failed reload leaves pending and shows F11's alert. No path found where a placement commit or the Task 7 `onPlacementsSaved` callback clears pending early or late: the callback runs in the same microtask as `reloadWorld()` and touches only shell state.
- **F7 callback timing.** GBA calls `reloadWorld()` then `onPlacementsSaved(names)` once per commit after `Promise.all`; `markManualPlacement` is a functional updater (`shell/FamilyApp.tsx:175`), so `names.forEach` in one tick keeps every name. GBC adapter's `reloadWorld` is the shell's own `useGbcWorld(mode === "world")` instance, separate from the canvas's, so the adapter reload cannot disturb the canvas's generation/snapshot pairing.
- **F9 / F10.** GBA `renderDungeon` passes `onPlacementsSaved` (marks only, no refresh; shell fetch is off in Dungeon). GBC `renderDungeon` lost `onLayoutChanged`; its canvas still reloads its own world after a toggle.
- **F11.** GBA: `loadError` placeholder only when `!world`; toast when `world && loadError`; cleared on success and Dismiss. GBC: same split on `error`; `dismissError` added to the hook. Task 9 fix (`8f8dcdd`): `role="alert"` moved to the group `div`, text span truncates alone, button is a flex sibling. It differs from GBC's save-error markup (role on the span, no button), a deliberate, reasoned deviation recorded in `task-9-live.md`; F11 tests find the button inside the alert and pass.
- **F13 (Task 8).** `file: "."` and the root stripped from the reason. The exact-reason assertion fails if the strip is removed (Task 8's second red run shows it). One gap, see M1.
- **Pure moves (Tasks 1-2).** Spot-checked `useCanvasView.ts` against the removed `MapCanvas` code (view state, `updateView`, fit, auto-fit once per map, passive-false wheel listener, same deps), `WorldToolbarSwitch` against the old Warps / Connection lines markup in both families (identical class, role, aria, text), and `WorldContextOverlayMount`. No behaviour change found. P11-4 `aria-label` is `undefined` for every tool but Collision, so React omits it.
- **Acceptance 3 mutations.** All five named mutations recorded and failing a test: F2 (T4 M1, T5 M1), F3 coordinates (T4 M3c), F5 ownership skip (T5 M3/M4) and no reload (T5 M2), F12 any response clears pending (T6 M1/M2), F12 failed latest keeps pending (T6 M3/M4, after an added test). F7 per-name refresh mutation recorded in Task 7.
- **Acceptance 4.** `task-9-live.md` covers every listed live item in both families; manifests unchanged, PerfPlus `.pokemap` removed, GBA `world.json` restored from backup.

## Findings

### M1 (Minor, fix-now: one line) F13 leaks the absolute root when the root string is not in normalized form

`packages/server/src/projectSymbols.ts:30` strips with `.split(root)`, but the error comes from `readdirSync(join(root, prefix))` (`core/src/defects/symbols.ts:9`), and `join` normalizes. The hub passes the request's `path` unchanged (`server/src/hub.ts:231` to `:251`; startup `opts.open` at `:304`). Verified on this machine: root `C:/tmp/nope` gives `ENOENT: no such file or directory, scandir 'C:\tmp\nope'`, which `split("C:/tmp/nope")` leaves intact, so the absolute path reaches the banner. A trailing separator (`C:\proj\`) misses the same way. The test builds its root with `join`, so it cannot see this. Fix: strip `normalize(root)` with trailing separators trimmed, as well as `root`. Add one case with a forward-slash root on win32, or a trailing separator on any OS.

### M2 (Minor, OK to defer to Plan 12, already ruled in Task 6) GBA toasts stack in one spot, hiding a save failure under the reload alert

`components/WorldCanvas.tsx:1986-2010` renders the save toast and the reload toast as siblings with `.world-canvas__toast` (`styles.css:1046`: `position: absolute; left/bottom: var(--space-3)`, same z-index), so the later one covers the earlier. A concrete case is the server going down: the placement POST fails and the rollback reload fails. The canvas keeps the unsaved local position, and the only visible text is "Could not reload the world". "Could not save" only appears after a Dismiss, so a user can read the move as saved. Both alerts are still announced. Task 6 ruled this out of scope (anti-goal on DOM changes, and the conflict toast already overlapped). That ruling stands, but record the misleading case in the Plan 12 backlog. The fix is a stacking container for the toasts.

### M3 (Minor, OK to defer) No canvas-level test for "a failed rail drop leaves the world"

The model's absent-map clause is wired at `WorldCanvas.tsx:537-538` and `GbcWorldCanvas.tsx:506-507`: keep when `!(name in placements) && !dropAbsent`. Only the ledger unit test covers it (T4 M4). No placementResync, WorldCanvas or GbcWorldCanvas test drops a rail map whose POST fails and then checks that it is gone after the reload. Replacing `!ledger.current.dropAbsent(name, snap)` with `true` in either canvas would most likely survive the suite (inferred from the test inventory; not run, since this review is read-only). F6's explicit list does not name this case, so it is not an F6 miss. Add it with the next placement change.

### M4 (Minor, fix-now: doc line) DESIGN.md's Plan 11 table omits `shared/placementLedger.ts`

The spec Constraints say "Shared modules follow `packages/ui/DESIGN.md` 'Shared modules'; add the new ones there". The Plan 11 table (`packages/ui/DESIGN.md:509-528`) lists every other new shared module but not the ledger, which both world canvases consume. Add a row: "per-map placement versions and GET-snapshot reconciliation | `WorldCanvas` | `GbcWorldCanvas`".

### M5 (Minor, pre-existing, OK to defer) GBC: any placement success clears another map's save error

`gbc/GbcWorldCanvas.tsx:976` `setSaveError(null)` runs on every successful POST. With POSTs for maps X and Y in flight, Y fails and X then succeeds, which wipes Y's error before the user reads it. The rollback reload still reverts Y, so no data is wrong; the message is lost. GBA does not clear on success. This is unchanged from `fb78949`, so it is not a Plan 11 regression. Note it for the Plan 12 shared world shell.

## Items considered and rejected

- A drag ending without commit, which would leave a version pending forever: both families commit on mouseup and on mouseleave (`WorldCanvas.tsx:1744-1747, 1776-1779`; `GbcWorldCanvas.tsx:1062-1068`), and the version only begins on a real mousemove.
- An older toggle's failure after a newer success: dropped by the generation check before any state change, in both families.
- GBA `onPlacementsSaved` after unmount (mode switch mid-POST): it still marks the acknowledged names, which is the desired outcome; canvas setState after unmount is a no-op.
- GBA group commit delaying reload and marking until the slowest member settles: this was the spec'd ruling ("one reload after the whole commit settles"). Not a defect.

## Outcome (orchestrator)

Reviewer: a Claude Opus subagent, the Anthropic floor, because Codex `gpt-6-astra` was at its usage limit until 17:44. Each finding was checked against the code.
- M1, fixed. The strip now removes the normalized root with its trailing separators trimmed, then the root as given. New test: a forward-slash root with a trailing slash, and a root with a trailing `sep`. Red on the Task 8 code: the reason leaked `C:\…\project\`. Green after.
- M4, fixed: `shared/placementLedger.ts` row added to `packages/ui/DESIGN.md` (Plan 11 table).
- M2, M3 and M5: first deferred, then fixed at the user's request (2026-10-24):
  - M2: GBA wraps its conflict, save and reload toasts in one `.world-canvas__toasts` column group, so they stack. A CSS test was added. Live: forced POST and GET failures showed both toasts, at 774-813 and 821-860 px with no overlap (`task-9-shots/gba-w7-toast-stack.png`); the subject was unchanged.
  - M3: a canvas test per family for a failed rail drop that leaves the world once its reload lands. Mutation `!dropAbsent(...)` → `true` fails it in each family. A first draft probed hover inside `waitFor`, which hung under the mutation (the known trap); it now uses a bounded `act` loop.
  - M5: the GBC save error is keyed by map, and a success clears only its own map's error. New test; red before the fix.
- Gate after these fixes: 3,533 pass / 0 fail / 218 files; typecheck and UI build pass.
