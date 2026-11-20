# Task 14b spec-compliance review (Opus, read-only)

Range: `824680f..HEAD` in worktree `wt-t14b` (tests `2183216`, implementation `f035574`). I read the full diff and the
surrounding code in `MapSurface.tsx`, `Toolbar.tsx`, `MetatilePalette.tsx`, `GbcMetatilePalette.tsx`, `useMapEditing.ts`,
both workspaces, and `paletteFold.ts`. I did not run vitest, as the brief instructed. The mutation analysis below is
static: I traced each mutant through the code and the test by hand.
Forbidden files: `git diff --stat` shows no change to `BlockEditorDialog.tsx`, `WorldContextMenu.tsx`, `MapContextMenu.tsx`,
`packages/core`, `packages/server` or anything else under `src/shared`. Met.

## Spec items

### A. Edit block tool
| Item | Status | Code | Test |
|---|---|---|---|
| `ToolKind` "editBlock", label "Edit block", key "K", last in `TOOLS` | Met | `src/components/Toolbar.tsx:6,8,10,15` | `Toolbar.test.tsx` "shows Edit block (K) last" |
| Title `Edit block (K)`, usual accessible name | Met (no `TOOL_ACCESSIBLE_NAME` entry, so the name is the label) | `Toolbar.tsx:100-110` | same test (`getByRole name /Edit block/` === last button); `ToolbarGbc.test.tsx` "shows Edit block (K) and no Collision tool" |
| `k` selects it | Met | `Toolbar.tsx:84` (works off `TOOL_KEY`) | `Toolbar.test.tsx` "K selects Edit block" (GBA default tools only, see M3) |
| Icon: one `svg([...])` entry, stroke style, no asset | Met (2x2 grid with one cell replaced by a pencil path) | `src/components/toolIcons.tsx:21-23` | `svg` presence asserted in both toolbar tests |
| `{ kind: "editBlock" }` in `MapCanvasProps.activeTool` | Met | `src/components/MapCanvas.tsx:41` | typecheck |
| `GbcActiveTool` includes "editBlock" | Met | `src/gbc/GbcMapCanvas.tsx:22` | typecheck |
| `useMapEditing` maps "editBlock" to `{ kind: "editBlock" }` | Met in code, **Untested** (finding I1) | `src/hooks/useMapEditing.ts:246` | none |
| GBC workspace maps it as it maps "sign" | Met | `src/gbc/GbcMapEditing.tsx:146` | `GbcMapEditing.test.tsx` "the Edit block tool opens the dialog for the clicked block cell" (real toolbar click, real state) |
| Tool click runs after `button !== 0` and after `placing \|\| sign` (S1) | Met | `src/canvas/MapSurface.tsx:186-202` | `MapSurface.test.tsx` "event placement takes precedence" |
| Uses `paintAt` (GBA 16 px, GBC 32 px block, never the event step) | Met | `MapSurface.tsx:199` | `GbcMapSurface.test.tsx` "GBC tool click in an event quadrant maps to its block" and "...at zoom 4 after a pan..."; `MapSurface.test.tsx` "a tool click on an interior cell..." |
| Nothing outside the interior | Met | `MapSurface.tsx:200` (`cell &&`) | `MapSurface.test.tsx` "outside the interior nothing happens" (weak, see M4) |
| Nothing while `editBlockDisabledReason()` is non-null | Met | `MapSurface.tsx:200` | `MapSurface.test.tsx` "pending mutation: nothing opens" |
| `return` in every case: no stroke, paint, post, event select, event drag or pan | Met | `MapSurface.tsx:201` | "a tool click on an interior cell..." (beginStroke, applyPaint, onSelectEvent untouched); workspace tests assert no POST |
| Move/up do nothing (no paint preview, no stroke chain) | Met. Move only updates the status-strip hover readout (`MapSurface.tsx:247`), which is not a paint preview. Up's `finishStroke` is a no-op with no chain open. | `MapSurface.tsx:229-262` | `MapSurface.test.tsx` "a drag with the tool paints nothing" |
| Workspaces need no new wiring; the tool reuses `onEditBlock` (`from: "map"`) | Met | `MapEditingWorkspace.tsx:157`, `GbcMapEditing.tsx:197` | both workspace tool tests (load GET carries x/y) |

Hand-checked fixtures:
- MapSurface: origin 16, cell 32. (64-16)/32 = 1.5 gives cell 1. (0-16)/32 gives -1, which is outside. Placing uses the 16 px grid: (64-16)/16 = 3, inside the 6x6 event bound.
- GBC: origin 32, cell 32. (88,56) gives block (1,0); the event step would give (3,1). At zoom 4 with pan (-20,-11), p = (300,181) maps to source (80,48), block (1,0).
- GBA workspace: (40-16)/16 = 1.5 gives cell (1,1).

All match the assertions.

### B. Capability
| Item | Status | Code | Test |
|---|---|---|---|
| `Capabilities.blockEditor` with the comment | Met | `src/shell/adapter.ts:19` | `adapter.test.ts` "pins every GBA/GBC flag" |
| GBA and GBC both `true` | Met | `adapter.ts:23,27` | same |
| `ALL_TOOLS` ends with "editBlock" (S2) | Met | `adapter.ts:31` | `adapter.test.ts` "toolsFor keeps toolbar order..." |
| `toolsFor` drops it when `!blockEditor` | Met | `adapter.ts:34` | `adapter.test.ts` "toolsFor drops Edit block without blockEditor" |
| Exact `toolsFor` results for GBA and GBC | Met | n/a | `adapter.test.ts` (GBA === ALL_TOOLS; GBC list pinned) |

### C. Palette right-click
| Item | Status | Code | Test |
|---|---|---|---|
| GBA `onEditBlock?` prop; with it, `preventDefault` + `onEditBlock(id)` | Met | `src/components/MetatilePalette.tsx:47,220` | `MetatilePalette.test.tsx` "right-click opens the editor..." (fireEvent returns false) |
| GBA: absent prop means no handler | Met | `MetatilePalette.tsx:220` | "no onEditBlock, no handler" (returns true) |
| GBA trap: mouseDown is guarded by `button === 0` | Met | `MetatilePalette.tsx:214` | "a right press never changes the selection". Mutant check: without the guard, dragStart=1, and mouseUp on 9 gives `sameColumn(1,9)` true (32 ids, fold 2, rows 0 and 1 both < 2), so `selectRect` calls `onSelect` and the test fails. The test kills it. |
| GBC prop, handler, absent means no handler | Met | `src/gbc/GbcMetatilePalette.tsx:31,63,125` | `GbcMetatilePalette.test.tsx` both cases |
| Dialog state widened (S4) | Met | `MapEditingWorkspace.tsx:72`, `GbcMapEditing.tsx:79` | typecheck |
| Canvas `onEditBlock` sets `from: "map"` | Met | `MapEditingWorkspace.tsx:157`, `GbcMapEditing.tsx:197` | 14a tests plus the 14b tool tests |
| Palette `onEditBlock` passed under the same condition as the canvas (S3) | Met. GBA adds `mapName !== null`, which the canvas branch already implies; GBC's side only renders with a map. | `MapEditingWorkspace.tsx:244`, `GbcMapEditing.tsx:247` | Positive path tested in both workspaces. The absent path at workspace level is **Untested** (M1). |
| Palette right-click NOT gated on a pending mutation (S3) | Met | `MapEditingWorkspace.tsx:228-231`, `GbcMapEditing.tsx:182-185` | **Untested** (M2) |
| Dialog `from={blockEdit.from}` | Met | `MapEditingWorkspace.tsx:263`, `GbcMapEditing.tsx:273` | Both workspace palette tests: `blockCheck` request `from === "palette"`, and the load GET has `block=<id>` with no x. GBC also checks `time=day`. |
| Map switch still closes it; one dialog | Met (mount guard unchanged: `blockEdit.forMap === mapName`) | same lines | 14a tests |

### D. Docs
| Item | Status | Code |
|---|---|---|
| Section placed right after the 14a "Map context menu" section, with the required content | Met | `packages/ui/DESIGN.md:462-477` (between `:450` 14a and `:479` In-context editing) |

### Plan test list for 14b
- "Edit block (K)" in both families: present (Toolbar.test, ToolbarGbc.test).
- K selects it: present, GBA only (M3).
- A tool click on an interior cell opens the dialog with no paint POST: present (both workspaces, MapSurface).
- Palette right-click opens with `from: "palette"` and the id, both families: present.
- GBA palette right-click leaves the selection unchanged: present, and it kills the guard mutant.
- `toolsFor` drops the tool when `blockEditor` is false: present.

Conductor-edited pins in `ToolbarGbc.test.tsx` (label list, count 8) are correct for the new tool.

## Mutation reasoning (static, not executed)
| Mutant | Killed by |
|---|---|
| Drop the editBlock branch | MapSurface "interior cell" (onEditBlock not called, beginStroke called) |
| Move the branch before `placing \|\| sign` | "event placement takes precedence" |
| Use `eventAt` / the event grid instead of `paintAt` | GBC "event quadrant" (gives (3,1)) |
| Drop the `editBlockDisabledReason` check | "pending mutation: nothing opens" |
| Drop the trailing `return` | MapSurface "interior cell" (falls into `chain.start`, so beginStroke is called) |
| `from: "map"` literal in the dialog | both workspace palette tests |
| Remove the GBA mouseDown button guard | "a right press never changes the selection" |
| Drop the `toolsFor` blockEditor clause | adapter "drops Edit block without blockEditor" |
| Drop GBC `"editBlock"` from the `GbcMapEditing.tsx:146` mapping | GbcMapEditing tool test (activeTool null, so no dialog) |
| **Delete `useMapEditing.ts:246`** | **Survives.** No test drives `useMapEditing` with "editBlock". The GBA workspace test injects `activeTool: { kind: "editBlock" }` through the mocked `makeEditing`. (I1) |
| Pass `onPaletteEditBlock` unconditionally in either workspace | Survives (M1) |
| Gate the palette right-click on `hasPendingSessionMutations` | Survives (M2) |

## Findings

### Critical
None.

### Important
**I1. The GBA toolbar-to-canvas mapping for the Edit block tool is unpinned.**
- Where: `packages/ui/src/hooks/useMapEditing.ts:246`.
- Failing scenario: someone deletes or reorders that line, or changes it to return `null` like the stamp tools without a stamp. `activeTool` becomes `null` for "editBlock". In GBA, pressing K and clicking a map cell then runs the no-tool branch: event selection or drag at `MapSurface.tsx:206`, otherwise a pan. The editor never opens. Typecheck passes (no exhaustiveness check) and all 2,587 tests stay green, because `MapEditingWorkspace.test.tsx` "the Edit block tool opens the dialog for the clicked cell" mocks `editing.activeTool` directly. Its `setActiveToolKind` assertion only checks the mock was called.
- Fix: add a `test/useMapEditing.test.tsx` case in the style of the existing pencil case at `:23-30`: `setActiveToolKind("editBlock")`, then `expect(result.current.activeTool).toEqual({ kind: "editBlock" })`. A stamp-free case is enough, which shows it is not gated on `currentStamp`.

### Minor
**M1. The palette prop's absent branch is untested at workspace level.**
- Where: `MapEditingWorkspace.tsx:244`, `GbcMapEditing.tsx:247`.
- Failing scenario: someone passes `onPaletteEditBlock` regardless of `blockEditorSpec` / `"blockCheck" in session`. In a session without block editing, a palette right-click then suppresses the browser menu and sets `blockEdit`, while the dialog's own guard renders nothing. That is a silently eaten right-click, and no test fails.
- Fix: in each workspace test file, render without `blockEditorSpec` and assert that `fireEvent.contextMenu(cell)` returns `true`.

**M2. The S3 "not gated on a pending mutation" rule is unpinned.**
- Where: `MapEditingWorkspace.tsx:228-231`, `GbcMapEditing.tsx:182-185`.
- Failing scenario: a later change copies the canvas's `hasPendingSessionMutations` gate onto the palette. The palette then goes dead during in-flight edits, against the ruling, and no test fails.
- Fix: a workspace case that marks a mutation pending (the 14a tests already have the setup that ends `expect(hasPendingSessionMutations(...)).toBe(false)`). Right-click a palette cell and assert the dialog opens.

**M3. The "K selects it" test covers only the GBA default tool list.**
- Where: `test/Toolbar.test.tsx` "K selects Edit block". There is no GBC counterpart in `test/gbc/ToolbarGbc.test.tsx`.
- Risk: low. The keydown code is shared and `GBC_TOOLS` contains "editBlock" (pinned in adapter.test). The plan list says "in both families", though.
- Fix: one `keyDown(window, { key: "k" })` case with `tools={GBC_TOOLS} availableTools={GBC_TOOLS}`.

**M4. "outside the interior nothing happens" does not isolate the new branch.**
- Where: `test/canvas/MapSurface.test.tsx` (the third Task 14b case).
- Why: with the editBlock branch removed entirely, the click at (0,0) still falls into the paint branch. There `paintAt` is null and it returns, so the test passes anyway. The branch's `cell &&` check matters only because `onEditBlock?.(null)` would be called without it. That mutant is killed, because `onEditBlock` would be called with `null`. So the test is adequate for the `cell &&` guard, just not for the branch's existence; other tests cover that.
- Fix: none required.

**M5. A stale `dragStart` lets a right release change the GBA selection.**
- Where: `MetatilePalette.tsx:215-218`. The `onMouseUp` has no button check.
- Failing scenario: left-press cell A, drag out of the palette and release outside. No cell `mouseup` fires, so `dragStart` stays A. Then right-click cell B in the same newspaper column. B's `mouseup` (button 2) runs `selectRect(A, B)` and changes the selection, which breaks "right-clicking a palette cell never changes the palette selection". The stale `dragStart` is pre-existing; the right-click path is the new way to reach it.
- Fix: `onMouseUp={(event) => { if (event.button !== 0) return; ... }}`, plus a test: mouseDown(A, button 0) with no mouseUp, then mouseUp(B, button 2), then assert `onSelect` was not called.

**M6. The Edit block tool can be selected but do nothing.**
- Where: `MapEditingWorkspace.tsx:188-189`, `GbcMapEditing.tsx:216-217`.
- Scenario: the tool is enabled from the static capability whenever the adapter passed no `blockEditorSpec` or the session lacks `blockCheck`. Choosing it then does nothing (`onEditBlock` is undefined) and also blocks event selection and panning on click. The spec is silent; in production both adapters pass a spec (14a), so this is an observation, not a spec breach.
- Fix (optional): leave "editBlock" out of `availableTools` under the same condition, so the toolbar shows it disabled.

## Verdict
Every spec item and conductor ruling S1-S4 is met in the code, and the plan's 14b test list is covered (GBC K only through shared code). One spec item has no guarding test: the GBA `useMapEditing` mapping (I1). Its mutant survives, which matters for a high-risk task where a regression would not be caught automatically.

Verdict: Needs changes
