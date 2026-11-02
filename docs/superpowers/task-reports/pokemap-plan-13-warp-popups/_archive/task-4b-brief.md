# Plan 13 Task 4b brief: shell warp popup (implementer)

Repo: PokeMap, a React 19 + TypeScript map editor (GBA and GBC families share one shell, `shell/FamilyApp.tsx`). You
work in this git worktree only. Binding docs (read first, whole sections):
- Plan `docs/superpowers/plans/2026-10-28-pokemap-plan-13-warp-popups.md`: "Review Focus" 1-4 and "Task 4"
  (Interfaces and Step 1 test list are the contract).
- Spec `docs/superpowers/specs/2026-10-28-pokemap-plan-13-warp-popups-design.md`: rulings P13-1, P13-2; items 1-7.
- Ledger ruling (`docs/superpowers/task-reports/pokemap-plan-13-warp-popups/ledger.md`, "Preflight scan"): Task 4 tests
  open the popup by capturing `slots` through a test adapter that wraps the real family runtime's
  renderWorld/renderDungeon (the double-click wiring is Task 5, not yours).

Already built in 4a (use them, do not rewrite): `shared/WarpPopup.tsx`, `shared/dialogFocus.ts` (`trapDialogFocus`),
`shared/shortcutGuard.ts` (`shortcutBlocked(e, owner)`; the warp popup panel carries `data-warp-popup`). Read
`task-4a-report.md` in the same folder.

## Build (per plan Task 4 Interfaces)
1. `packages/ui/src/shell/useWarpPopup.ts`: exactly the plan's `useWarpPopup(args)` contract: open/requestClose with
   `strokeSettled()` then a pending-state effect that decides on the next render with fresh state (pattern:
   `shared/useContextEditing.ts` `requestExit` + its `exitPending` effect). Pending open is dropped if `selected` or
   `mode` changed or `blocked()` became true. `dest === selected` -> `onOpen()` (leave in-context editing) and open with
   `source = selected`, no prompt. Else `leave(go)`; `go` records source, `select(dest)`, opens. Close: source null or
   equal to destination -> close; else `leave(() => { select(source); close(); })`. If `selected` leaves the destination
   while open (not via close), close. One close in flight at a time.
2. `packages/ui/src/shell/adapter.ts`: `ShellSlots.openWarpDestination(name: string): void`; `FamilyRuntime.map` gains
   `name: string | null` (the map the loaded payload belongs to). GBA `gba/adapter.tsx:129`: from `layout.data` (check
   its type for the map name field). GBC `gbc/adapter.tsx`: the `ready` payload's map name, else null.
3. `packages/ui/src/shared/useContextEditing.ts`: `ContextEditing.bumpTile(map: string): void` (same update as
   `onCommitted`'s bump, for any map).
4. `packages/ui/src/shell/FamilyApp.tsx`: `const warp = useWarpPopup({ selected, leave, select, strokeSettled,
   blocked: () => switchPending.current || runtime.saveDialog.open, onOpen: ctx.leaveContext, mode })`.
   `slots.openWarpDestination = warp.open`. Render, inside `<main>` BEFORE SaveDialog/SwitchPromptDialog so they paint
   above it: `warp.popup && <WarpPopup mapName={dest} onClose={warp.requestClose}>` containing `runtime.banners`, then
   `runtime.map.error` -> `Could not load {dest}: {error}`; `runtime.map.ready && runtime.map.name === dest` ->
   `runtime.renderMap(slots)`; else `Loading {dest}…` (use the same placeholder class as Map view). SaveDialog's
   `onCommitted`: when `warp.popup` is open, also `ctx.bumpTile(warp.popup.destination)`. The SwitchPromptDialog used
   by close is the existing one (it shows for `selected`, the destination; that is correct).
5. Review Focus 1: in World mode the family's `renderWorld` keeps a host map workspace mounted (`active={false}`) while
   the popup shows the active one. Make sure tool hotkeys, Ctrl+Z / Ctrl+Y, Fit and stroke registration act once, on
   the popup. 4a made shortcuts owner-aware; check the remaining paths (e.g. `onStrokeChain`, any window keydown
   listener that does not call `shortcutBlocked` with an owner) and fix in the smallest way. List what you found.

## Tests (write first, see them fail, then implement)
New file `packages/ui/test/shell/warpPopup.test.tsx`, each case for GBA and GBC (`it.each` over both families),
built on the setup of `packages/ui/test/shell/switchPrompt.test.tsx` (mocked fetch, real FamilyApp). Cover every
bullet of plan Task 4 Step 1 (open clean / dirty+Cancel; dirty close Cancel / Discard / Save with `tileVersions[dest]`
bumped; Escape cases; unsettled-stroke close and open; self-warp incl. in-context; delayed destination fetch shows
`Loading {dest}…`; Tab cycles; one-action-per-key in the popup in World and Dungeon, nothing with a SaveDialog above;
pending open dropped on mode switch / tree click; World hotkey changes tool once and one stroke registers once; focus
on open and after close; GBC post-save reload error visible inside the popup). The repo has NO jest-dom: plain DOM
reads only. If a case cannot be built with the existing mocks, write it as `it.todo` with a one-line reason and list it
in the report; do not fake it.
Existing tests must keep passing unchanged. Do not edit any existing test or fixture unless a strict fetch mock rejects
a new GET your change adds (then only widen the mock, and name each file in the report).

## Verify (allowed commands)
- `npx vitest run packages/ui/test/shell` -> all pass.
- `npx vitest run packages/ui` -> 0 failed (baseline before Task 4: 2,014 passed in 123 files, plus 4a's file). Run
  from the repo root only, one run at a time.
- `npx tsc --noEmit -p packages/ui/tsconfig.json` -> no errors.

## Rules
- CRLF line endings in every file you edit or create; added lines <= 140 characters; prefer small edits to whole-file
  rewrites. Match surrounding style and comment density; never delete existing comments. ASCII only (the `…` already
  in FamilyApp placeholders is the one exception: copy it from there), no BOM.
- Touch only the files named here plus strictly needed support files (list them). No new dependencies.
- Do not fix unrelated failing tests or bugs; report them. Never weaken an assertion. You cannot commit.

## Report
Write `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-4b-report.md` (CRLF, lines <= 140): files,
tests (one line each, with family coverage), Review Focus 1 findings, todos, verify output, anything unresolved.
