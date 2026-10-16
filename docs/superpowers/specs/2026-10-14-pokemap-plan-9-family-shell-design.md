# Plan 9 design: one shell (FamilyApp + EngineAdapter) and the unified edit layout

Written 2026-10-14 from master `4305376` (PR #18's merge). Roadmap: `plans/2026-10-14-pokemap-roadmap-unified-ui.md`;
decisions D1-D16 there are binding. This spec covers Plan 9 only.

## Goal

GBA and GBC run through one app shell, `FamilyApp`, over an `EngineAdapter` per family, with capability flags for what
only one engine does today. Both families show the D4 edit layout (one right-hand rail) and the D5 toolbar (icon plus
capitalised label, shortcut in the tooltip). Apart from layout, the toolbar and the two additions below, behaviour does
not change.

User rulings made while writing this spec (2026-10-14):
- **R1. Keyboard shortcuts are in Plan 9:** tools and Undo/Redo, both families.
- **R2. GBA palette hover-link is in Plan 9:** the GBA rail palette highlights the metatile under the cursor, as GBC's
  does.
- **R3. Adapter shape:** one runtime hook per family (approach 1 below).
- **R4. Follow-hover toggle, both families** (user, 2026-10-14, after the plan was written): the palette scrolls to the
  hovered metatile only while a "Follow hover" switch is on. One shared hook and one shared switch serve both palettes,
  so the behaviour is identical. Default on (today's GBC behaviour); the choice is remembered per browser.
- **R5. Fit to screen on F, both families** (user, 2026-10-14, after plan Task 7): F zooms the current view to fit
  everything in it into the window: the map in Map view, the whole world in World view, the open dungeon's maps in
  Dungeon view. It calls the canvas's Fit action, so it does nothing a Fit button click would not.
  Follow-up (user, 2026-10-14): World view's "Fit world" (GBA) and "Fit all" (GBC) become one `Fit`, matching the map
  editor. In-context editing, Fit (button and F) zooms to the map being edited, mirroring Map view's Fit (same
  stepped fit), in both families; it is disabled only while the context map loads.

## Behaviour that does NOT change in Plan 9

- **Map switch with unsaved changes.** Goal state (D1): both families warn and offer Save or Discard. Plan 10 builds
  that. Plan 9 keeps today's behaviour per family, behind `runtime.leave`:
  - GBA: `window.confirm`, then switch.
  - GBC: `window.confirm`, then `session.discard()` on the server, then switch. A failed discard keeps the user on the
    map and shows `switchError`.
- Sign composer stays GBA only (D2 is Plan 10). Duplicate stays GBC only (D6 is Plan 10). Manual placements, the defects
  banner and the dungeon filter cache stay GBC only (D3 is Plan 10). The Dungeon auto-layout toggle and Unplaced rail stay
  GBA only (D8 is Plan 10).
- Canvas rendering and hit-testing are untouched (Plans 11/12). The only canvas change is R2's hover callback.
- Edit-state lifetimes: GBA `useMapEditing` lives at shell level and survives mode switches; GBC's per-visit editing state
  lives in `GbcMapEditing` and resets with its mount. Both stay where they are.

## Architecture

### Files

| File | Change |
|---|---|
| `packages/ui/src/shell/adapter.ts` | new: `EngineAdapter`, `Capabilities`, `FamilyRuntime`, `RuntimeArgs` types |
| `packages/ui/src/shell/FamilyApp.tsx` | new: shared shell (replaces `App.tsx` and `gbc/GbcApp.tsx`) |
| `packages/ui/src/gba/adapter.tsx` | new: `gbaAdapter`, `useGbaRuntime` (the GBA-only body of today's `App`) |
| `packages/ui/src/gbc/adapter.tsx` | new: `gbcAdapter`, `useGbcRuntime` (the GBC-only body of today's `GbcApp`) |
| `packages/ui/src/App.tsx`, `packages/ui/src/gbc/GbcApp.tsx` | deleted |
| `packages/ui/src/Root.tsx` | mounts `<FamilyApp key={family:root:gen} adapter={…} switcher={…} />` |
| `packages/ui/src/shared/EditingWorkspace.tsx` | `side` becomes the shared rail (`edit-rail`) |
| `packages/ui/src/components/MapEditingWorkspace.tsx` | strips removed; palette, collision palette and inspector go to the rail |
| `packages/ui/src/gbc/GbcMapEditing.tsx` | its own rail wrapper replaced by the shared rail |
| `packages/ui/src/components/Toolbar.tsx` | icons, labels, tooltips, shortcuts |
| `packages/ui/src/components/toolIcons.tsx` | new: inline SVG icon per tool (no new dependency) |
| `packages/ui/src/components/MapCanvas.tsx` | `onHoverMetatile` callback (R2) |
| `packages/ui/src/components/MetatilePalette.tsx` | `highlightId` prop (R2) |
| `packages/ui/src/styles.css` | `edit-rail` rules; strip rules removed; rail rules for both palettes and `CollisionPalette` |
| `packages/ui/DESIGN.md` | layout shape, rail, toolbar, shortcuts, shell/adapter row in "Shared modules" |

### EngineAdapter

```ts
export type Family = "gba" | "gbc";
export type Mode = "map" | "world" | "dungeon";

export interface Capabilities {
  collisionTool: boolean;       // GBA true. Read by the toolbar tool list and the rail.
  elevationOverlay: boolean;    // GBA true. Descriptive in Plan 9 (MapCanvas owns the toggle); read from Plan 11.
  addEvent: boolean;            // GBA true. Descriptive in Plan 9 (the inspector is per family); read from Plan 10.
  addSign: boolean;             // GBA true. Read by the toolbar.
  timeOfDay: boolean;           // GBC true. Read by the header.
  defectsBanner: boolean;       // GBC true. Descriptive in Plan 9 (GBC renderMap owns it); read from Plan 10 (D3).
  manualPlacements: boolean;    // GBC true. Read by tree visibility.
  dungeonFilterCache: boolean;  // GBC true. Read by the shell's mapFilter memo.
  worldBar: { dungeonAutoLayout: boolean; unplacedRail: boolean }; // GBA true/true. Descriptive in Plan 9 (inside the world canvas); read from Plan 10.
}

export interface EngineAdapter {
  family: Family;
  /** Shown after the title ("Crystal" for GBC); null renders nothing (GBA). */
  label: string | null;
  capabilities: Capabilities;
  /** Called once per render of FamilyApp. The adapter never changes within a mount (Root keys the shell on family),
   *  so the hook order inside it is fixed. */
  useRuntime(args: RuntimeArgs): FamilyRuntime;
}
```

`RuntimeArgs` is what the shell owns and the family needs: `selected`, `mode`, `openDungeonId`, plus the shared
callbacks the family's world canvas calls (`selectMap`, `selectMapFromWorld`, `openMapFromWorld`, `enterContext`), the
jump pair (`jumpTarget`, `jumpToken`) and the context-editing result (`contextMap`, `tileVersions`, `requestExitContext`).
Context editing needs the family's session, so `FamilyApp` calls `useContextEditing` after `useRuntime`. The context result
reaches the runtime's render slots as arguments, never as hook inputs.

`FamilyRuntime` (the normalised result):
- `groups: { data, error }` (both families already share the `groupOrder`/`groups` shape);
- `session` with `isDirty` (for `useBeforeUnloadGuard` and context editing);
- `leave(go, { sameMap })`: the family's switch policy (above and under "disagree" below);
- `onSelected(name)`: family side effects of a selection change (GBC clears `switchError` and the hovered metatile; GBA
  clears the hovered metatile, R2);
- `onEnterContext(name)`: family side effects before entering in-context editing;
- `visibility: { placed, error }` for `MapTree`, and `hiddenMapTypes` (GBC passes `GBC_HIDDEN_MAP_TYPES`);
- `dungeons` (the family's dungeons hook, same shape both sides);
- `map: { name, error, loading }` for the Map-view placeholders;
- `renderMap()`, `renderWorld()`, `renderDungeon(mapFilter)`: the family's workspace and canvases;
- `headerExtras`: GBC's Time-of-day group; null for GBA;
- `banners`: GBC `switchError` and the reload-after-save error, at `<main>` level in every mode; null for GBA;
- `modals`: GBA's `SignComposer`; null for GBC;
- `saveDialog: { open, setOpen, onCommitted }`: the family's save hooks (GBC re-reads the map after a commit).

`FamilyApp` owns: `mode`, `selected`, `selectVersion`, `jumpTarget`, `openDungeonId`, the stroke-chain registry,
`useContextEditing`, `useBeforeUnloadGuard`, `enterWorld`, `switchMode`, `selectMap`, `selectMapFromWorld`,
`openMapFromWorld`, `deleteDungeon`, `allMapNames`, the `mapFilter` memo (cached when `dungeonFilterCache`), the header
(title, label, View group, `headerExtras`, status, switcher), the sidebar (load errors, `DungeonSidebar` or `MapTree`) and
`SaveDialog`.

Where the two shells disagree today inside logic that becomes shared, the difference goes behind the runtime, never
silently to one family's form. Known cases:
- **Tree re-click of the already-selected map while dirty.** GBA (`App.tsx:96-102`): `changeSelection` calls `leave`,
  which prompts; Cancel does nothing, OK leaves context and bumps the jump token. GBC (`GbcApp.tsx:150-160`): `go()`
  with no prompt. Shared form: `runtime.leave(go, { sameMap: name === selected })`. GBA ignores `sameMap` (prompts when
  dirty); GBC skips the prompt and the discard when `sameMap`. A world click and "Open in Map view" on the selected map
  already behave the same in both (no prompt), so they pass `sameMap` and both policies skip.
- **`enterContext` on the selected map.** GBC clears `switchError` and the hovered metatile first
  (`GbcApp.tsx:194-197`); GBA does not. Shared form: `runtime.onEnterContext(name)`, then `ctx.enter(name)`.
- **`select` side effects.** GBC's `select` clears `switchError` and the hovered metatile (`GbcApp.tsx:127`); GBA's
  only sets the selection. Shared form: `runtime.onSelected(name)` after `setSelected` (GBA now clears its hover id, R2).
- **`mapFilter`.** GBA re-mints the filter on every dungeon array change, so a rename refits (`App.tsx:136-149`,
  documented as intended); GBC caches by id and sorted members (`GbcApp.tsx:133-143`). Shared form: the
  `dungeonFilterCache` flag picks the memo.
- **Save commit.** GBC re-reads the map and reports a failed reload in `switchError` (`GbcApp.tsx:345-349`); GBA does
  not. Shared form: `runtime.saveDialog.onCommitted()` after `ctx.onCommitted()`.
- **World-mode host.** GBC wraps the world host in `.app__map-editing` with the defects banner and a loading/error line
  for the context map (`GbcApp.tsx:297-315`); GBA picks the active or inactive `MapEditingWorkspace` by `contextLayout`
  (`App.tsx:293-307`). Both stay inside each family's `renderWorld()`.

The implementation plan's first task writes characterisation tests for every such difference before any code moves.

### Capability flags read in Plan 9

| Flag | Reader in Plan 9 |
|---|---|
| `collisionTool` | toolbar tool list (`collision` button); rail collision palette |
| `addSign` | toolbar "Add Sign" button |
| `timeOfDay` | header (the runtime renders the group; the flag gates the slot) |
| `manualPlacements` | tree visibility merge |
| `dungeonFilterCache` | the shell's `mapFilter` memo |
| `elevationOverlay`, `addEvent`, `defectsBanner`, `worldBar` | none yet (inside per-family canvases, inspectors and `renderMap`); a test pins their values per adapter |

## Unified edit layout (D4)

```
┌ toolbar: tools (icon + label) │ Undo Redo │ [Add Sign] │ Save │ Discard ┐
├ banners (event-op error, sign added, GBC edit error)                    ┤
├──────────────────────────────────────────────┬──────────────────────────┤
│                                              │ edit-rail (260 px)       │
│  canvas (flex: 1, no max width)              │ [collision palette]      │
│                                              │ metatile palette (flex)  │
│                                              │ inspector (≤ 50%)        │
└──────────────────────────────────────────────┴──────────────────────────┘
```

- `EditingWorkspace` renders the rail: `<div className="edit-rail">{collision}{palette}{inspector}</div>`, only while
  active (unchanged: the canvas slot keeps its position, so the in-context world canvas is never remounted).
- The collision palette appears only while the Collision tool is active (`collisionTool` families only). It sits at the
  top of the rail, wrapping instead of the horizontal strip.
- The metatile palette is always shown, takes the spare height and scrolls. GBA's palette is no longer gated on
  pencil/rect/bucket. A click while another tool is active only sets the stamp, as a dropper pick does today.
- The inspector sits below, capped at 50% of the rail height.
- Removed: `.app__metatile-strip`, `.app__collision-strip`, `.gbc-map-editing__rail` (renamed `.edit-rail`).
- GBA in-context editing gets the rail instead of the 240 px strip. This closes the 6c E deferral "the Pencil metatile
  strip leaves a short world area in context mode".
- Flex children carry `min-width: 0` (LESSONS: React / UI Patterns). Check `scrollWidth === clientWidth` at 1280 and
  1024 px.

### GBA hover-link (R2)

- `MapCanvas` gets `onHoverMetatile?: (id: number | null) => void`, called from `hoverAt` with the hovered block's
  metatile id, and with null on leave.
- `MetatilePalette` gets `highlightId?: number | null` and marks that cell (the GBC palette's highlight class and token).
- The hovered id lives in the GBA runtime and resets on a map switch (`onSelected`), as GBC's does.
- R4: both palettes scroll the hovered cell into view (`block: "nearest"`) only while "Follow hover" is on
  (`shared/useFollowHover.ts` + `shared/FollowHoverSwitch.tsx`, `role="switch"`, in each palette's header).

## Toolbar (D5) and shortcuts (R1)

- Tool buttons: inline SVG icon (`toolIcons.tsx`, `aria-hidden`) plus a capitalised label: Pencil, Rect, Bucket,
  Dropper, Shift, Collision. The accessible name becomes the label (`"Pencil"`).
- Tooltip (`title`): `"Pencil (P)"`. A disabled tool keeps its reason title as today (GBC non-writable `.blk`; default
  "Not yet available").
- Undo and Redo tooltips: `"Undo (Ctrl+Z)"`, `"Redo (Ctrl+Y)"`.
- Shortcuts: P Pencil, R Rect, B Bucket, I Dropper, S Shift, C Collision; Ctrl+Z (Cmd+Z) Undo; Ctrl+Y and Ctrl+Shift+Z
  (Cmd) Redo.
- The listener is one window `keydown` effect in `Toolbar`. `Toolbar` mounts only while editing chrome is active (Map
  view, or in-context), so at most one listener exists.
- A key is ignored when: `defaultPrevented`; the target is an input, textarea, select or contenteditable; an
  `[aria-modal="true"]` element exists (the same check `useWorldContext` uses for Escape); a letter key has any modifier;
  the tool is absent or disabled; Undo/Redo is not available. A handled key calls `preventDefault`.
- **F: fit to screen (R5).** Each canvas whose Fit button is shown and enabled (every one is labelled `Fit`: the map
  canvases' and, renamed from "Fit world"/"Fit all", the world canvases') listens for F through one shared hook
  (`shared/useFitShortcut.ts`) and calls that button's own fit. The chromeless in-context map canvas does not listen.
  Same ignore rules as above (shared in `shared/shortcutGuard.ts`); F with any modifier is ignored, so Ctrl+F stays
  the browser's find. Every Fit button has the tooltip "Fit to screen (F)". In-context, the world canvas's Fit fits
  the edited map exactly as Map view's Fit does (`fitWithBand`, the same zoom steps), replacing GBA's whole-world refit
  and GBC's disabled button there.
- The header and the hub keep no shortcuts.

## Errors

Every banner keeps its owner, text and role:
- GBA `eventOpError` and the sign-added notice stay in `MapEditingWorkspace`, under the toolbar.
- GBC edit errors stay in `GbcMapEditing`.
- GBC `switchError` and the reload-after-save failure: runtime `banners`, at `<main>` level in every mode.
- The defects banner: GBC, Map view and in-context, non-dismissible, as now.
- The map-groups and world-visibility load errors move into `FamilyApp`'s sidebar with the same text.

## Testing

- **Moved, not dropped.** Shell tests (`test/App*.test.tsx`, `test/gbc/GbcApp*.test.tsx`, `test/gbc/Root.test.tsx`)
  switch `render(<App />)` / `<GbcApp root=… />` to `<FamilyApp adapter={gbaAdapter|gbcAdapter} />`. Tool queries rename
  from lowercase kind to the label. Assertions on strip classes retarget to `edit-rail`, each with a named reason in the
  task report. Per file, `git diff master -- <file> | grep -c '^-[^-]'`, and every removed line is accounted for.
- **Counts:** the total never drops below 2,703 plus the tests Plan 9 adds; 0 fail. Typecheck and the UI build pass.
- **Characterisation first** (plan Task 1): the switch-policy difference, re-click of a dirty selection, `enterContext`
  side effects, `switchError` placement, the dungeon filter cache, GBA's tool and stamp surviving a mode switch, GBC's
  resetting.
- **New tests:** F fit (R5): the hook's ignore rules and StrictMode, and one per canvas proving F equals its Fit button;
  capability values per adapter; toolbar icon, label and tooltip; each shortcut and each ignore rule
  (input, modal, modifier, disabled, absent); rail order and the collision palette only with Collision; the GBA palette
  shown outside pencil/rect/bucket; GBA hover-link and its reset on a map switch; GBA in-context editing shows the rail
  without remounting the world canvas (DOM node identity and the `/api/world` call count, the 6c E pattern); StrictMode
  for the shortcut effect (`renderHook(…, { reactStrictMode: true })` per LESSONS: Testing).
- Tests that use real corpora follow LESSONS: Editing Sessions & Save Safety (temp copies for anything a mutation could
  turn into a write).

## Live acceptance (both families)

GBA subject and PerfPlus, with byte snapshots of every writable file before and `cmp` after (LESSONS: Editing Sessions
& Save Safety; Live Browser Verification):
1. The rail at 1280 and 1024 px wide; no horizontal scroll; the collision palette appears with Collision (GBA).
2. Every shortcut, including the ignore rules in the event inspector's inputs and with SaveDialog open; F fits Map,
   World and Dungeon view the same as each view's Fit button; in-context, Fit and F frame the edited map like Map view.
3. A paint and save in Map view and in-context, restored by reverse paint.
4. A dirty switch: GBA confirm; GBC discard, plus a forced discard failure showing `switchError`.
5. Time of day (GBC); the defects banner on CeruleanCave2F (GBC); Add Sign opens and cancels (GBA).
6. GBA hover-link: the palette highlight follows the cursor and clears on a map switch.
7. **Issue #4** in both families: World auto-shows the major areas (GBA hides indoor/none, GBC indoor/gate), and an
   unplaced map greys in the tree and drags onto the world. Screenshots in the acceptance report; then close #4 with the
   evidence, after the user says so.

## Out of scope

D1 save-or-discard prompt and the `strokeSettled().then(discard)` deferral, the GBC sign composer, GBA Duplicate, the D3
and D8 moves (all Plan 10); canvas internals (Plans 11/12); `issues-5-6-warp-popups` (Plan 13); GBA follow-ups A-C;
Plan 3.

## Risks

- Hook order: the runtime hook must not change identity within a mount. `Root` keys on family, and `FamilyApp` reads
  the adapter once (a test switches family through `Root` and checks a fresh mount).
- StrictMode double effects in the shortcut listener and the moved shell effects (LESSONS: React / UI Patterns).
- Context editing and visit identity must survive the merge: the 6c E and Plan 7 Task 5b context tests run unchanged
  apart from the render call.
- `Root.test.tsx` uses absence assertions to tell the shells apart (LESSONS: Mutation Testing & Review Process); they
  are retargeted to family markers (the "Crystal" label, the Time-of-day group), never dropped.
