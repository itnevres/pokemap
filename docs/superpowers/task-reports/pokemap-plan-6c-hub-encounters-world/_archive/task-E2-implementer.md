# E2 implementer report

**Status:** DONE (base `2f0f9d7`). Zero existing-test edits.

## Commits
| sha | what |
|---|---|
| (refactor) | `refactor(ui): extract map-editing state to useMapEditing and chrome to MapEditingWorkspace (E2)`: App.tsx, hooks/useMapEditing.ts, components/MapEditingWorkspace.tsx |
| (tests) | `test(ui): pin MapEditingWorkspace renderCanvas seam and useMapEditing.resetForMapChange (E2)`: 2 new test files |
| (report) | this file |

Shas: refactor `cf5a1ed`, tests `a4cd1b7`, report `959a67b`.

## Files
| file | lines |
|---|---|
| `packages/ui/src/App.tsx` | 677 -> 317 |
| `packages/ui/src/hooks/useMapEditing.ts` | new, 332 |
| `packages/ui/src/components/MapEditingWorkspace.tsx` | new, 137 |
| `packages/ui/test/MapEditingWorkspace.test.tsx` | new, 106 (2 tests) |
| `packages/ui/test/useMapEditing.test.tsx` | new, 39 (1 test) |

## Hook API: `useMapEditing({ editSession: UseEditSessionResult, layoutData: MapLayoutData | null | undefined })`
Returns: `selectedEvent, eventOpError, setEventOpError, currentMap, onSelectEvent, onCanvasMoveEvent, onMoveEventFromInspector, onDeleteEvent, onAddEvent, activeToolKind, setActiveToolKind, collisionValue, setCollisionValue, currentStamp, setCurrentStamp, saveDialogOpen, setSaveDialogOpen, signComposerOpen, setSignComposerOpen, signAddedMessage, setSignAddedMessage, activeTool, handleDiscard, resetForMapChange`.
- `resetForMapChange()` = `setSelectedEvent(null); setCurrentStamp(null)` (the two original blocks, with their comments).
- `resolveEventRef`/`eventOpErrorMessage` moved into the hook file (module-level, doc comments intact), non-exported.
- `layoutData` accepts `null` because `useMapLayout().data` is `MapLayoutData | null` (spec said `layoutData`; the null widening is the only type deviation).

## Workspace
`MapEditingWorkspace({ mapName, data, editSession, editing, renderCanvas? })`. Exports `MapEditingCanvasProps = Pick<MapCanvasProps, mapName|data|editSession|activeTool|onSelectEvent|selectedEventRef|onMoveEvent|onDropperPick>` (no `view`/`onViewChange`; E4 adds them in its `renderCanvas`). Default: `<MapCanvas {...canvasProps} />`. JSX subtree and comments verbatim (dedented 8 spaces); two comment references updated ("above" -> "in useMapEditing.ts"; "see selectMap below" -> "see resetForMapChange below"); `layout.data.` -> `data.`. In App the dialogs, `beforeunload` effect, `changeSelection` (now calls `editing.resetForMapChange()`), `useEditSession` stay. App's two reset comments were replaced by a pointer comment (originals moved with the setters).

## Red proofs (in-memory mutate -> run -> restore bytes -> byte-compare; all "restored identical: true")
| mutation | result |
|---|---|
| E2-M1: `resetForMapChange` also `setActiveToolKind(null)` | RED: hook test, `expected null to be 'pencil'` (assertion existed from the start) |
| hook: drop `setCurrentStamp(null)` | RED: `expected {stamp} to be null` |
| E2-M2: workspace ignores `renderCanvas` (always `<MapCanvas/>`) | RED: workspace test 1, `spy to be called at least once` |
| workspace: fallback branch -> `null` | RED: workspace test 2, `expected null not to be null` |
| workspace: `selectedEventRef: null` | RED: `expected null to deeply equal {warp,2}` |
| workspace: `onMoveEvent` swapped to inspector handler | RED: handler-identity assertion |
| E2-M3: `App.changeSelection` drops `resetForMapChange()` | RED in existing App.test.tsx, 1 of 28 tests: `App -- metatile palette wiring > clears the chosen stamp when a different map is selected -- pencil goes inert until a fresh pick` (`expected 5 to be 3`). No new coverage needed for the stamp half; no existing App test isolates the `selectedEvent` half alone (my hook test covers selectedEvent clearing at hook level, but not that App calls it for it). |

One first attempt at the fallback mutation was a syntax error (discarded, redone above).

## U1 check
`git diff 2f0f9d7 -- packages/ui/test` (name-status): only `A packages/ui/test/MapEditingWorkspace.test.tsx`, `A packages/ui/test/useMapEditing.test.tsx`. No modified files.

## Verification
- Spec-listed UI files (App, MapEditingWorkspace, useMapEditing, MapCanvas, EventInspector, Toolbar, SaveDialog, SignComposer, useEditSession): 9 files, 139 tests pass. `App.test.tsx` has 28 tests (spec said 29); all pass unchanged.
- `npm run typecheck`: clean. `npm run build -w @pokemap/ui`: OK (dist untracked/ignored; not committed).
- Full suite not run (per spec).

## Concerns
- App.test count is 28, not 29 (spec grounding off by one; no effect).
- The hook test lives in its own file `useMapEditing.test.tsx` (spec left location open).
- `.codex/` untouched.

## Fix round (review `7eb0ea6`)
Status: DONE. Commits: tests `dffde08`, comments `ea472ab`, this section (next commit). Base HEAD `7eb0ea6`; tree clean except `.codex/` and the untracked `task-E3-spec.md` (not mine, left alone).

**Files:** new `packages/ui/test/AppEditingWiring.test.tsx` (4 tests, App-level, own fetch mock; Add Event used to make the session dirty and select an event); `MapEditingWorkspace.test.tsx` +4 tests (my own E2 file, coordinator-permitted; stub `editing`, dirty `editSession` for Save, fixture `mapName="Map1"` vs `layout.name="Foo_Layout"`); `useMapEditing.ts` comment-only.
**U1:** `git diff 2f0f9d7 --name-status -- packages/ui/test` = `A MapEditingWorkspace.test.tsx`, `A useMapEditing.test.tsx`, plus new `AppEditingWiring.test.tsx` (A). No M. App.test.tsx untouched.

**F2:** 7 pointers reworded (L49 banner, L78 JSX, L213/243/247 "mounted below" -> "mounted in MapEditingWorkspace.tsx", L270 and L272 "selectMap" -> "App.tsx changeSelection"/"changeSelection"); `git diff` = 14 changed lines, comments only.

**Red proofs** (in-memory mutate, restore bytes, byte-compare; all "restored identical: true"; target = Workspace + AppEditingWiring tests):
| mutant | mutation | killed by |
|---|---|---|
| X8 | sign banner removed (`{false && signAddedMessage && ...`) | WS "renders signAddedMessage as a status banner..." |
| X9 | Toolbar sign btn -> `setSaveDialogOpen(true)` | WS "Save and Add Sign call their own setters" + App "Add Sign opens SignComposer and not SaveDialog" |
| X9b (extra) | Toolbar save btn -> `setSignComposerOpen(true)` | WS Save/Sign test + App "Save opens SaveDialog" |
| X10 | `layoutName={mapName}` | WS "metatile strip is keyed on data.layout.name" |
| X12 | collision strip hidden | WS "collision strip only while collision tool active" |
| X13 | App SaveDialog gated on `signComposerOpen` | both App dialog tests |
| X3b | `changeSelection` resets before the dirty guard | App "a cancelled map switch keeps the selected event and the chosen stamp" (asserts Delete button present, no "No event selected.", metatile 0x1 still aria-pressed) |
| X15 | delete no longer `setSelectedEvent(null)` | App "deleting the selected event clears the selection" |

**Verify:** App + MapEditingWorkspace + useMapEditing + AppEditingWiring = 4 files, 39 tests pass; `npm run typecheck` clean. Full suite not run.
**Notes:** Save is disabled when clean (Toolbar gates on `isDirty`), so the App-level Save test dirties via Add Event (mock `/event/add` returns `isDirty:true`, like the real server). Dialog mount fetches (`/plan`, `/suggestions`) are unmocked; their load-failure paths don't affect the assertions (dialogs render regardless).
