# Task 5 implementer report: GBC editing UI

**Status: DONE_WITH_CONCERNS** (concerns at bottom). Base c4ecff2 (+ coordinator docs commits). Branch plan-7-gbc-editing.

frontend-design skill: loaded (`frontend-design:frontend-design`) first; DESIGN.md tokens used only (`--accent`, `--warn`, `--focus-ring`, `--bg-selected`, `--border-strong`, `--overlay-selection`); no new colours/fonts, instrument-panel look kept.

## Commits (oldest first)
| sha | msg |
|---|---|
| e327aee | feat(ui): useGbcEditSession hook for GBC edit routes |
| 5080537 | feat(ui): GBC metatile palette click-to-pick |
| 15074ce | feat(ui): Toolbar tools/unavailableTitle props, SaveDialog text kind |
| 65a5208 | feat(ui): GbcMapCanvas paint tools, event drag, fresh image URL |
| 795548d | feat(ui): GbcEventInspector (move in steps, delete, duplicate) |
| 9f86e1e | feat(ui): mount GBC editing in GbcApp (session, dirty guard, save) |
| e695158 | test(ui): GbcApp editing (dirty guard, beforeunload, World round trip, non-writable, save) |
| report commit | docs(plan-7): Task 5 implementer report |

## Files
New: `src/gbc/hooks/useGbcEditSession.ts`, `src/gbc/GbcMapEditing.tsx`, `src/gbc/GbcEventInspector.tsx`; tests `test/gbc/{useGbcEditSession,GbcMetatilePaletteSelect,ToolbarGbc,GbcMapCanvasEdit,GbcEventInspector,GbcAppEditing}.test.tsx`.
Edited: `GbcMapCanvas.tsx`, `GbcMetatilePalette.tsx`, `GbcApp.tsx`, `hooks/useGbcMap.ts` (additive `reload`), `components/Toolbar.tsx` (optional `tools`, `unavailableTitle`, `onOpenSignComposer?`), `components/SaveDialog.tsx` (kind union + `"text"`), `styles.css` (additive: `--picked` cell, focus/cursor, `event-inspector__warnings*`, `__actions--gbc`).
GBA test diff: `git diff c4ecff2 -- packages/ui/test/ | grep -c '^-[^-]'` = **0**. No existing test edited. Absence-assertion grep (queryBy*/toBeNull on Save/Undo/Redo/pencil/Duplicate/Delete/Discard/rect/bucket/dropper/shift in GbcApp/Root/Palette tests) = no hits. Existing `GbcApp.test` `queryByRole("alert")` null check still passes (no alert unless error). Full gbc dir + Toolbar/SaveDialog/styles tests: 20 files, 387 pass. typecheck + `npm run build -w @pokemap/ui` clean.

## Server-shape differences vs spec
- Session body = `{blocks, events, isDirty, canUndo, canRedo}` (+`warpRenumberWarnings` on delete only). No `border`/`map`. Undo/redo/discard on closed session return `events: null` + `blocks: []` -> hook treats undo/redo as a no-op (never blanks canvas); discard ignores body, restores seed.
- Errors: 400 `{error}`; hook throws that message (refusals shown verbatim). Commit refusal is 400 `{changes,refusals}` (SaveDialog already handles).
- `addEvent` body `{kind,args:string[],objectConst?}` (not GBA's `{value}`); stamp wire = `{width,height,cells:[{metatileId}]}`; bucket = `replacement:{metatileId}`.
- Warnings: `{fromMap, warpIndex, destWarp}` (rendered `fromMap warp[i] → destWarp`).
- `layoutSharedBy` NOT exposed by the session response, `/api/groups` has no blkPath -> counting needs a new route -> **shared-layout note DROPPED** per spec; SaveDialog summary already says "(shared by N maps)".
- Spec test 4 arithmetic: client (40,40) is block (0,0) not (1,1) (border ring = 32px origin). Pinned client (72,72) -> block (1,1) / step (2,2) instead. Same intent.
- `eventsOverride?` prop dropped: `editSession.events` already carries them (YAGNI); canvas merges session blocks+events over `data` in one memo.

## Design decisions
- Mouse precedence mirrors GBA `MapCanvas.tsx:712-761` exactly: left button only (right/middle do nothing; no extra pan button). Order: no tool + onSelectEvent -> hit-test steps, select+drag, miss -> deselect then fall through to pan; dropper -> read only, no stroke; any tool (+ stamp for pencil/rect/bucket) -> stroke; else pan. pencil/rect/bucket without a picked stamp resolve to `activeTool=null` (inert -> event-select mode), as GBA.
- Units: paint = blocks (32px, own `rawBlockAt`); events = steps via real `clientToStep`. Dropper -> `{width:1,height:1,cells:[{metatileId}]}`.
- paintVersion: ported with ONE deliberate change. GBA's `skipNextBumpRef` swallows the first blocks change (its hook re-seeds a tick later). GBC hook derives its seed at render, so the flag would swallow the first real paint. Replaced by "previous mapName differs -> no bump". `&v=` omitted while 0 (keeps legacy `GbcApp.test` URLs, which pin no `v=`, byte-identical; they run with a session always present). Cost: unpainted-map URL has no `v`; relies on no-cache like GBA.
- Paint failures: all apply/begin/end rejections `.catch(fail)` -> `onEditError` -> shared banner (GBA swallowed silently).
- Hook: `forMap` + seed-identity keying, no reset effect; stale in-flight response dropped on map/seed change; refetched payload (new seed) replaces session view. Lives in `GbcApp`, not gated on mode.
- Save: `onCommitted` -> `markClean`, close dialog, `map.reload()` (in-place, data never nulled, so canvas/zoom/tool survive; reload failure shown in banner).
- Dirty guard funnel `leave(go)` in GbcApp for tree click, jump, world single-click, world double-click; same-map click skips it. Confirm text = GBA's exact string. Confirm -> `discard()` then switch; failed discard keeps map, banner shows why. **Map-tab entry from World needs no own guard**: it changes no selection; the world click that did is already guarded (spec listed it; flagged here).
- Palette: legacy hover class `--selected` kept (existing tests pin it incl. aria-current); new pick class `--picked` (accent border). Picked + hovered both get `aria-current`. Cells focusable/Enter/Space only when `onSelect` given (read-only unchanged).
- Non-writable: Toolbar tools disabled, title = "this map's .blk is flagged non-writable: <defect msg>", palette `onSelect` off, activeTool null; events/undo/save enabled.
- Inspector: X/Y in steps, commit on blur/Enter only if changed; non-integer reverts; Delete/Duplicate disabled while pending; warnings `role="status"` dismissible; empty state text per spec. Duplicate selects the new index (append). Object cap/const refusals surface via banner.
- Shared-layout note: dropped (see above).

## Tests (spec 1-11)
| # | where | result |
|---|---|---|
| 1 hook | useGbcEditSession.test (13) | all methods path+body, malformed->throw unchanged, server error text, forMap, stale response, discard seed, markClean, new seed, null map |
| 2 race | GbcMapCanvasEdit | delayed begin: begin,apply,end in order; rect one apply; shift; mouseleave ends; off-map no stroke |
| 3 freshness | GbcMapCanvasEdit | fake-timer 199/200ms bump, coalesce, map switch no bump, no-session no `v=` |
| 4 units | GbcMapCanvasEdit | blocks (1,1) not step; event drag steps (2,2)->(4,2); 1 move only |
| 5 dropper | GbcMapCanvasEdit | 1x1 stamp id 4, no begin/end |
| 6 palette | GbcMetatilePaletteSelect | click/Enter -> 1x1 stamp, aria-current, distinct classes, inert w/o onSelect |
| 7 toolbar | ToolbarGbc (+existing Toolbar.test untouched) | 5 tools, no collision/sign, title, GBA default |
| 8 SaveDialog | ToolbarGbc | `kind:"text"` summary shown |
| 9 inspector | GbcEventInspector (12) | steps blur/Enter, delete, warnings, Duplicate pinned 13 args (re-measured PerfPlus NewBarkTown.asm:302, read-only), disabled w/o selection, per-kind subtitle, clamp |
| 10 app | GbcAppEditing (7) | guard cancel/confirm(order: discard before map GET)/failed discard/clean; beforeunload only dirty; World<->Map keeps dirty; non-writable; Save->commit->markClean->re-read, canvas mounted |
| 11 GBA diff | grep | 0 removed lines |

TDD note: red-first honoured for palette, canvas (7 red before impl), inspector (1 red), but the hook, Toolbar/SaveDialog and GbcApp wiring tests were written after (or alongside) the code and went green immediately; mutations below are their teeth proof.

## Mutations (each: bytes backed up to scratchpad, edit, narrowest tests, `cp` restore, `git diff --quiet` verified)
| ID | mutation | red observed |
|---|---|---|
| U1 | pencil/bucket paintAt called before `beginStroke().then` | 2 (fast-click order, mouseleave) |
| U2 | `endActiveStroke` uses `Promise.resolve()` not `pendingPaintRef` | 3 (fast-click order, rect, mouseleave) |
| U3 | debounce timer no-ops (no bump) | 2 (bump, coalesce) |
| U4 | `&v=${paintVersion}` unconditional | 4 (3 new + existing GbcMapCanvas URL test) |
| U5 | block math uses /16 | 7 canvas tests |
| U6 | hook state reset when mapName null + GbcApp passes null outside map mode (emulates mount-in-branch; literal move not done) | 1 (World<->Map) |
| U7 | dirty guard `if (true)` | 2 (guard, failed-discard) |
| U8 | Toolbar default `TOOLS.slice(0,5)` | 4: 3 GBA `Toolbar.test` + 1 new |
| U9 | duplicate radiusX/radiusY swapped | 2 (duplicateArgs pin, Duplicate post) |
| U10 | `availableTools` ignores writable | 1 (non-writable test) |
Counts differ from spec's targets for U2 (3 vs 2), U3 (2 vs 3), U6 (1 vs 10 tests; only 1 test covers it). Working tree clean after each.

## U1 grep result
Grep of absence assertions on new labels in GbcApp/Root/Palette tests: none. Stability confirmed by running all existing gbc tests green with 0 edits.

## Concerns
- No live/browser run done (no servers started); coordinator does live verification. jsdom cannot cover real pencil drag trail (`e.buttons`), selection-ring pixels, or layout width (canvas + 260px palette + 260px inspector at 1280).
- U6 emulated, not a literal mount-in-branch move.
- Same-map tree re-click skips the dirty confirm (GBA prompts); intentional.
- A deleted-object refusal path is covered through hook error text + banner wiring only by unit tests, not an end-to-end app test.
- Client unclamped event drags beyond grid rely on server/core refusal -> banner.
