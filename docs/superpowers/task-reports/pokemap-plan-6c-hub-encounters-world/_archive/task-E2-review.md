# E2 review (spec + quality, combined)

**Verdict: PASS.** Range `2f0f9d7..abffdc3` (code `cf5a1ed`, `a4cd1b7`). No blocking findings. 2 non-blocking: F1 (coverage gap, Low-Med), F2 (stale comment pointers, Low).

Run: `vitest run App + MapEditingWorkspace + useMapEditing` = 3 files, 31 pass (App 28, WS 2, hook 1; spec said 29 for App, off-by-one in spec, impl report right). `npm run typecheck` clean.

## Checklist
| # | item | result | evidence |
|---|---|---|---|
| 1 | verbatim move | OK | Compared old `App.tsx@2f0f9d7` blocks (L21-61 helpers, L112-309 state/handlers, L329-343 discard, JSX L544-632) vs new files, leading-ws stripped, blank lines dropped, via `diff`. Non-ws diffs, all judged OK: (a) Toolbar comment "`activeTool`'s own doc comment above)" -> "...in useMapEditing.ts)" (stated rename); (b) `layout.data.layout.name/split/primaryCount/secondaryCount` -> `data.*` (WS, stated); (c) `layout.data?.map` -> `layoutData?.map` (hook L84); (d) `!layout.data` -> `!layoutData`, `layout.data.layout.width/height` -> `layoutData.*` (onAddEvent, hook L183-185), same value, hook-arg rename; (e) "see selectMap below" -> "see resetForMapChange below" (stated); (f) `<MapCanvas mapName=.. />` literal props -> `renderCanvas ? renderCanvas(canvasProps) : <MapCanvas {...canvasProps}/>` (seam, stated); (g) pure additions: imports, `UseMapEditingArgs`, hook signature+doc, `resetForMapChange` (two original comment+setter pairs verbatim), return object. No logic line changed. `handleDiscard` identical. |
| 2 | identical DOM | OK | JSX diff above = only (a)(b)(f). Same elements/classes/attrs/order in `.app__map-editing`: Toolbar, collision strip, metatile strip, event-op alert, sign-added status, `.app__map-editing-body` {canvas, EventInspector}. `<MapCanvas {...canvasProps}/>` yields same props; no wrapper added. SaveDialog/SignComposer still siblings inside `<main className="app__canvas">` after the ternary (App.tsx L284-312). |
| 3 | session/guards in App | OK | `useEditSession` App L62 w/ its long comment; `beforeunload` L77-85; `changeSelection` L89-98 calls `editing.resetForMapChange()` synchronously after `setSelected(name)`, after the dirty guard; dialogs App L284-312. `resetForMapChange` touches only selectedEvent+currentStamp; X2 and E2-M1 prove activeToolKind/collisionValue persist (hook test asserts both). |
| 4 | hook lifetime/order | OK | `useMapEditing` called once, unconditionally, App L67, directly after `useEditSession`, before the `beforeunload` effect and the `mapFilter`/`allMapNames` memos = same relative slot as old inline `useState`s/`useMemo`. Inside hook order is the old order (selectedEvent, eventOpError, activeToolKind, collisionValue, currentStamp, saveDialogOpen, signComposerOpen, signAddedMessage, activeTool memo). No mode-conditional hook. Workspace has no hooks. |
| 5 | paint race-safety | OK | `git diff --name-status`: MapCanvas.tsx not in range (only App M, 2 new src, 2 new tests, 1 report). `pendingPaintRef/endActiveStroke/paintAt/beginStroke` live in MapCanvas, untouched. Props to MapCanvas: same sources as before: `mapName`=selected, `data`=layout.data, `editSession`, `activeTool` (same memo), `onSelectEvent/onMoveEvent/onDropperPick` = same per-render handlers/setter (handler closures were already fresh each render in old App; `setCurrentStamp` stable), `selectedEventRef` = fresh object each render as before. No new wrapper closure, no new memo. |
| 6 | U1 | OK | `git diff 2f0f9d7 abffdc3 --name-status -- packages/ui/test`: `A MapEditingWorkspace.test.tsx`, `A useMapEditing.test.tsx`; nothing else. |
| 7 | new tests | OK, see F1 | WS test 1: asserts exact key set of canvas props, `mapName/data/editSession/activeTool` identity, `selectedEventRef` value, handler identities (`onSelectEvent`, `onMoveEvent`=onCanvasMoveEvent, `onDropperPick`=setCurrentStamp), custom canvas is `body.firstElementChild` with a following sibling, no stage canvas. WS test 2: fallback renders `.app__map-editing-body canvas.map-canvas__stage`. Hook test: selects event, stamp, tool, collision; after reset asserts event+stamp null, tool+collision kept. All three spec'd behaviours pinned. |

## Quality
| area | verdict |
|---|---|
| dead imports in App | None. All 4 retained React imports (`useEffect/useMemo/useState/ReactNode`) used; `tsc` clean; unused component/type imports (MapCanvas, Toolbar, palettes, EventInspector, core types) removed. |
| `MapEditingCanvasProps` Pick | Good: 8 keys, derived from `MapCanvasProps`, so it tracks MapCanvas. Excludes `view/onViewChange` (E1 added them, MapCanvas L125-127), correct for E4's `renderCanvas` to spread `{...p, view, onViewChange}`. |
| `layoutData` null widening | Needed for `useMapLayout().data: MapLayoutData\|null`. `\| undefined` is superfluous (nit, no action); only deviation from spec name/type, justified. |
| return-object identity churn | New literal each render, as the old inline state effectively was. Consumers: App reads `editing.*` only in render/handlers/`changeSelection`; workspace is not memoized; no effect/memo/dep in App, workspace or MapCanvas takes `editing` or any handler from it. Only memo is `activeTool` (deps `[activeToolKind, collisionValue, currentStamp]`, unchanged). No churn hazard. If E4 memoizes on `editing`, it will need to destructure the fields it uses. |
| useCallback/useMemo | None added/removed; `activeTool` memo moved verbatim. |
| naming | Fine. Optional: export `UseMapEditingResult = ReturnType<typeof useMapEditing>` to replace the `ReturnType<typeof ...>` + `import type { useMapEditing }` idiom in workspace + test (nit). |
| renderCanvas seam | Minimal and sufficient for E4: one optional fn, receives the exact MapCanvas props, output placed in same slot; E4 passes `renderCanvas={(p) => <MapCanvas {...p} view={v} onViewChange={set} />}`. E4 can reuse App's `editSession`+`editing` (state lives in App so it survives mode switches). Caveat for E4 (not E2): Save/Sign dialogs and `beforeunload` live in App, so E4's host must be rendered under App's `<main>`-level dialogs or hoist them. |

## Findings
| id | sev | where | issue | fix |
|---|---|---|---|---|
| F1 | Low-Med (non-blocking, pre-existing gap now straddling 3 files) | `MapEditingWorkspace.tsx:65,67,77,99,113`; `App.tsx:284,302` | No test opens the SaveDialog/SignComposer from the Toolbar at all (App.test never does), nor renders the collision strip, sign-added banner, or metatile `layoutName`. The refactor moved this wiring across hook/workspace/App, so a wrong flag/setter between files is silent. Survivors X8-X10, X12, X13 below. | New file (U1: no existing edits), e.g. extend `MapEditingWorkspace.test.tsx`: stub `editing` with `activeToolKind:"collision"` -> assert `.app__collision-strip`; `signAddedMessage:"x"` -> `[role=status]` + dismiss click calls `setSignAddedMessage(null)`; click Toolbar Save/Sign buttons -> `setSaveDialogOpen(true)`/`setSignComposerOpen(true)` spies. Plus one App-level test: click Save -> `SaveDialog` visible; Sign -> composer visible. |
| F2 | Low | `useMapEditing.ts:49,77-78,209,213,243,247,270` | Comments moved with code but their pointers are stale: "banner below"/"(JSX below)" (banner now in MapEditingWorkspace), "mounted below" x3 (palettes now in workspace), "selectMap's own guard just below" (now `App.changeSelection`; not below). Spec said move comments verbatim, so correct to leave, but misleading to a reader. | Reword the 7 pointers to name `MapEditingWorkspace.tsx` / `App.tsx changeSelection`. Comment-only. |
| F3 | Info | `useMapEditing.ts:290-304` | `resetForMapChange` is a fresh closure per render; fine since only called from handlers. No action. | none |
| F4 | Info | `App.test` | X3b (reset before the dirty guard, so a *cancelled* switch wipes selectedEvent/stamp) and X15 (delete no longer clears selectedEvent) survive. Pre-existing gaps, not regressions. | Optional: tests in a new file. |

## Mutations (in-memory, exact-once anchor, `finally` restore, byte-compare; all restored identical = true; `git status` clean besides `.codex/`)
Target = 3 test files above (31 tests).
| id | mutation | result | killed by |
|---|---|---|---|
| E2-M1 | `resetForMapChange` also `setActiveToolKind(null)` | RED 2 | hook test; App "clears the chosen stamp when a different map is selected" |
| E2-M2 | workspace ignores `renderCanvas` | RED 1 | WS test 1 |
| E2-M3 | App `changeSelection` drops `resetForMapChange()` | RED 1 | App "clears the chosen stamp when a different map is selected" (stamp half only; event half only covered at hook level, see F4) |
| X1 | reset drops `setSelectedEvent(null)` | RED 1 | hook test |
| X2 | reset also resets `collisionValue` | RED 1 | hook test |
| X3b | App resets before dirty guard (cancelled switch still resets) | SURVIVES | F4 |
| X4 | renderCanvas output after EventInspector | RED 1 | WS test 1 |
| X5 | `onDropperPick` -> onSelectEvent | RED 2 | WS test 1; App dropper test |
| X6 | `onAddEvent` always early-returns | RED 1 | App discard-flow test (uses Add path) |
| X7 | event-op error banner removed | RED 1 | App discard-flow stale-banner test |
| X8 | sign-added banner removed | SURVIVES | F1 |
| X9 | Toolbar sign button opens save dialog | SURVIVES | F1 |
| X10 | metatile `layoutName={mapName}` | SURVIVES | F1 |
| X11 | `selectedEventRef` always null | RED 1 | WS test 1 |
| X12 | collision strip hidden | SURVIVES | F1 |
| X13 | App SaveDialog gated on `signComposerOpen` | SURVIVES | F1 |
| X14 | `handleDiscard` skips confirm | RED 2 | App discard-flow tests |
| X15 | delete no longer clears selectedEvent | SURVIVES | F4 |

Harness: scratch Node script outside repo (scratchpad `mut.cjs`).
