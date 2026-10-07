# Task 5 executed spec: GBC editing UI (paint tools, event inspector, save dialog)

Plan 7 Task 5, re-granularised against the real code. Risk class: **high**:
- async paint race safety (RESUME "the paint-tool race-safety pattern is load-bearing");
- live-render freshness;
- dirty-state guards (I6);
- a real write live-verified on PerfPlus.

Reviews: Opus spec review (it runs the app and mutates) and a Sonnet quality review (read-only). **Every UI task first loads the `frontend-design:frontend-design` skill (or `ui-ux-pro-max`) when available, and follows `packages/ui/DESIGN.md` (binding).**

It builds on Task 4's routes. Read Task 4's **final** `packages/server/src/gbcEditRoutes.ts` for the exact request/response shapes; any mismatch with this spec is resolved in favour of the real server.

## Facts to tell the implementer up front (RESUME lessons)

- **This repo has no `@testing-library/jest-dom`.** Use plain DOM reads (`.getAttribute`, `.disabled`, `document.body.contains`).
- There is no shared `.btn` class; each component has a BEM `__btn--primary`. Real tokens live in the `:root` of `packages/ui/src/styles.css`. Known-wrong names: `--border-default` → `--border`; `--accent-primary` → `--bg-selected` + `--border-strong`; `--warning` → `--warn`.
- **Never call one React state setter inside another's updater** (StrictMode double-invokes). Flex children holding long text need `min-width: 0`.
- A `*/` inside a CSS comment silently drops the next rule. `packages/ui/test/styles.test.ts` parses the sheet strictly.
- Every fetch consumer validates the response shape (type guard), not just `r.ok`. Every `.then` has a `.catch` with a visible error surface.
- Per-map UI state: hold `forMap: string | null`, not a reset-on-change effect (6c B4 lesson).
- If a test asserts absence (`queryBy…).toBeNull()`) on text the new UI adds, it breaks silently (6c D lesson). Grep `packages/ui/test` for absence assertions on any new label ("Save", "Undo", "Pencil", …) in GbcApp/Root tests.

## Design (binding)

1. **`packages/ui/src/gbc/hooks/useGbcEditSession.ts`** (new). It mirrors `hooks/useEditSession.ts`'s API and its discipline, including the doc-comment lessons on `discard` seeding and `markClean`.
   - State: `{ blocks, events, isDirty, canUndo, canRedo }`, seeded from the map payload (`initialBlocks`, `initialEvents`), keyed per map with `forMap`.
   - Methods: `beginStroke`, `applyPaint`, `endStroke`, `undo`, `redo`, `discard`, `moveEvent(kind, index, x, y)`, `addEvent(kind, args, objectConst?)`, `deleteEvent(kind, index)` → `{ warpRenumberWarnings }`, `markClean()`.
   - **It lives at `GbcApp` level, always mounted** (as GBA's `useEditSession` lives in `App`), so switching to World/Dungeon and back never loses the client's view of a still-dirty server session.
2. **`GbcMapCanvas` gains optional editing props.** It stays one component; the read-only behaviour is byte-identical when they are absent:
   - `editSession?`, `activeTool?: { kind: "pencil"|"rect"|"bucket"|"shift"|"dropper"; stamp?: GbcStamp }`, `onDropperPick?`;
   - `selectedEvent?`, `onSelectEvent?`, `onMoveEvent?`;
   - `eventsOverride?` (the session's events win over `data.events` for drawing and hover).
   - **Port GBA `MapCanvas.tsx`'s paint chain by citation, not by improvisation:** `pendingPaintRef` / `beginStroke().then(...)`, `endActiveStroke` awaiting `pendingPaintRef`, `dragStartRef` for rect/shift, `mouseleave` ending the stroke, and `paintVersion` debounce plus `&v=${paintVersion}` on the image URL, only while a session exists. Copy the doc comments' *substance*, citing `MapCanvas.tsx` line ranges, as `GbcMapCanvas`'s header already does for pan/zoom.
   - **Coordinate units:** paint targets are **blocks** (32 px). Event moves are **steps** (16 px), via the existing `clientToStep`.
   - Mouse precedence mirrors GBA:
     - left button with a tool active paints;
     - with no tool, it selects or drags an event (`onSelectEvent`/`onMoveEvent`), else pans;
     - read GBA's `onMouseDown` for the exact precedence and the pan-button convention, and mirror it.
   - Dropper reads `editSession.blocks[by*w+bx].metatileId` → `onDropperPick({ width:1, height:1, cells:[{metatileId}] })`.
   - The `fittedForMapRef` / `imgLoaded` false→true cycle / `viewport`-in-deps rules in the header comment stay intact.
3. **`GbcMetatilePalette` gains `onSelect?(stamp)` and `selected?: number | null`.** Click selects (a 1×1 stamp); no drag-select (YAGNI; GBA's drag-select is a later nicety). Hover highlight is unchanged. The selected and highlighted states are visually distinct (DESIGN.md tokens).
4. **`Toolbar` gets additive, optional props** so GBC can reuse it:
   - `tools?: ToolKind[]`: which tool buttons to render. Default: today's six, so GBA renders byte-identically. GBC passes `["pencil","rect","bucket","dropper","shift"]`: **no collision button** (Plan 7 Goal).
   - `onOpenSignComposer?`: optional; the sign button renders only when given.

   GBA's `App`/`MapEditingWorkspace` call sites are unchanged.
5. **`SaveDialog`:** widen its local `PendingChange.kind` to include `"text"`. It already speaks `/api/edit/:map/plan` and `/commit`, so the GBC server works as-is. Check how it renders `kind` and that a text change displays sensibly.
6. **`gbc/GbcEventInspector.tsx`** (new). It reuses `EventInspector`'s CSS classes and layout conventions (read `components/EventInspector.tsx`), not its GBA-typed props.
   - The selected event shows kind, index and a subtitle (warp: `→ MAP_CONST #destWarp`; object: sprite; bg: type + script; coord: scene + script).
   - X/Y number inputs in **steps**, committed on blur/Enter through `moveEvent`.
   - **Delete:** objects whose const is referenced get the server's refusal message shown in the shared error banner. For warps, show the returned `warpRenumberWarnings` (dismissible, `role="status"`, listing `fromMap warp[i] → destWarp`).
   - **Add = "Duplicate":** it adds a copy of the selected event (its exact args as source text, reconstructed from the event's fields in macro order) at `(x+1, y)`, clamped to the step grid. This guarantees every script label/const in the new line already exists, so the build can't break.
     - It's disabled with no selection: the empty state says "Select an event to duplicate it. To add one from scratch, use `pokemap event add`."
     - Objects use auto-naming (no `objectConst`). The object cap and out-of-step-const refusals surface through the error banner.
   - In-flight `pending` disables buttons (GBA review fix: double-click Add).
7. **`gbc/GbcMapEditing.tsx`** (new): the GBC counterpart of `MapEditingWorkspace`, without GBA types.
   - Toolbar (Undo/Redo/Save/Discard wired to the hook; Discard confirms with GBA's wording);
   - the metatile strip shown for pencil/rect/bucket;
   - the event-op error banner (dismissible, cleared on the next success);
   - the warning banner;
   - canvas + inspector in `.app__map-editing-body`.
   - **Non-writable layout** (`data.layout.writable === false`, e.g. CeruleanCave2F): the paint tools render disabled with a title saying why ("this map's .blk is flagged non-writable: <defect>"); event editing stays enabled.
   - **Shared layout:** when the plan summary says shared, `SaveDialog` already shows it. Also show a one-line, non-dismissible `role="note"` above the canvas when the map's `.blk` is shared: "Painting edits maps/House1.blk, shared by 50 maps." Take `layoutSharedBy` from the session response if Task 4 exposes it; otherwise count maps with the same `blkPath` from `/api/groups`. **Don't add a new server route.** If neither source can give the count without one, drop this item and say so.
8. **`GbcApp` wiring:**
   - `useGbcEditSession(selected, …)` at the top level;
   - mount `GbcMapEditing` in map mode instead of the bare canvas + palette;
   - `SaveDialog` at `<main>` level (stacking, as GBA), and on commit: `markClean`, refetch the map payload and bump the image version;
   - a `beforeunload` handler while dirty;
   - the **dirty-switch guard** on tree selection, a world double-click, and the Map-tab entry from World. Use GBA's exact confirm text: `"You have unsaved changes on this map. Discard them and switch maps?"`. On confirm, call `discard()` before switching;
   - the defect banner stays as-is.
   - The hub's own 409 project-switch guard now works through Task 4's `dirtyMaps()`; nothing UI-side is needed beyond what 6c A2 built. Verify it in the live check.

## Tests (TDD; `packages/ui/test/gbc/...`, following the existing GbcApp/GbcMapCanvas test style)

1. `useGbcEditSession`:
   - every method POSTs the right path and body;
   - it applies the response, and a malformed response surfaces an error with the state unchanged;
   - `forMap` keying means a map switch never shows the previous map's blocks;
   - `discard` restores the seed, not an empty session.
2. Paint race (GBA's reproduction discipline):
   - **a delayed `beginStroke` mock** (setTimeout-resolved promise); a fast click (mousedown → mouseup within the delay) still applies exactly one pencil paint and then `endStroke`, in that order;
   - rect: mousedown at A, mouseup at B, with a delayed begin, sends one rect `{x0,y0,x1,y1}`;
   - mouseleave mid-stroke ends the stroke.
3. Image freshness:
   - with a session, a paint bumps `&v=` (debounced; drive the timer explicitly, **hold the timer, don't sleep**);
   - without a session (read-only), the URL has no `v=` and matches today's exactly.
4. Units: a click at client (40, 40) at zoom 1 with no pan paints block (1,1), and an event drag reports step coordinates. Pin both through the real `clientToStep`.
5. Dropper picks the clicked block's id and calls `onDropperPick` with a 1×1 stamp.
6. Palette: clicking a cell calls `onSelect` with a 1×1 stamp; the selected cell has `aria-current="true"`; highlight and selected are distinct classes.
7. Toolbar: GBC shows 5 tools and no collision or sign button; GBA's default render is unchanged (existing Toolbar tests untouched).
8. SaveDialog shows a `kind: "text"` change.
9. `GbcEventInspector`:
   - move commits on blur/Enter in steps;
   - delete shows the warp warnings; a delete refusal shows the error;
   - Duplicate posts `{kind, args}` reconstructed exactly. Pin the args for a real NewBarkTown object, `["7","8","SPRITE_TEACHER","SPRITEMOVEDATA_SPINRANDOM_SLOW","1","0","-1","-1","0","OBJECTTYPE_SCRIPT","0","NewBarkTownTeacherScript","-1"]`, from x=6, y=8. **Re-measure this line from PerfPlus before pinning it**;
   - the no-selection state disables Duplicate.
10. `GbcApp`:
    - the dirty guard confirms on tree switch; cancel keeps the map, confirm discards then switches;
    - `beforeunload` is registered only while dirty;
    - World↔Map preserves the session state;
    - the non-writable map disables paint tools with a reason;
    - Save → commit → `markClean` → refetch.
11. **No GBA test changes.** Verify with `git diff <base> -- packages/ui/test/ | grep -c '^-[^-]'`; anything outside the Toolbar/SaveDialog default paths must be 0, and any unavoidable change is named with a reason. Grep for absence assertions on new labels (see Facts).

## Teeth-proof

| ID | Mutation | Must go red |
|---|---|---|
| U1 | paint apply fired synchronously, outside `beginStroke().then` | 2 |
| U2 | `endActiveStroke` doesn't await `pendingPaintRef` | 2 |
| U3 | no `&v=` bump after paint | 3 |
| U4 | `&v=` present without a session | 3 |
| U5 | paint uses step coordinates instead of blocks | 4 |
| U6 | hook mounted inside the map branch (state lost on World↔Map) | 10 |
| U7 | dirty guard skipped | 10 |
| U8 | Toolbar `tools` default changed | 7 (GBA) |
| U9 | Duplicate args out of macro order | 9 |
| U10 | paint tools enabled on a non-writable layout | 10 |

## Live verification (the coordinator does this after review; the implementer just runs the app locally to sanity-check)

On scratch servers only: hub on 5184 via `preload.mjs`, Vite on 5183 via `vite.mjs` (in `C:\Users\Serve\AppData\Local\Temp\pokemap-phase-d-coordinator\`), with a scratch `POKEMAP_HOME`. **Never touch 5173/5174.** Use the Playwright MCP's `browser_run_code_unsafe` and check `document.visibilityState` first.

The real PerfPlus write uses the criterion-8 protocol:
- snapshot the porcelain and the bytes of `maps/NewBarkTown.blk` and `maps/NewBarkTown.asm`;
- Dropper the original block, paint a visually distinct id, save; `cmp -l` shows exactly 1 changed byte;
- reverse-paint and save; `cmp` is byte-identical;
- move an event, save, move it back, save; `cmp` is identical;
- PerfPlus ends with a clean porcelain and no `.pokemap`.

The implementer must NOT write the real PerfPlus. Its tests and local runs use mocks or a temp copy.

## Rules

Same as earlier tasks. Run single files with vitest, plus `npm run typecheck` and `npm run build -w @pokemap/ui` before the final commit (CSS must parse). Pathspec commits; never git checkout/restore/stash.
