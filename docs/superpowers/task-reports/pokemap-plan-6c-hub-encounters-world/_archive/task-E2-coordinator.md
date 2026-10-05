# E2 coordinator record

E2 ran under the Claude Code coordinator, 2026-10-05. The executed spec is `task-E2-spec.md` (`6468896`), whose coordinator ruling is that `useEditSession` stays in `App`.

## Rounds

- **Implementer (Sonnet):**
  - `cf5a1ed`: the refactor. `App.tsx` went from 677 to 317 lines, the new `hooks/useMapEditing.ts` is 332 lines, and the new `components/MapEditingWorkspace.tsx` is 137 lines, with a `renderCanvas` seam.
  - `a4cd1b7`: the tests.
- **Review.** It was low-risk and a pure move, so per your cost rules it got one combined spec+quality reviewer (Sonnet). Verdict: **PASS**.
  - F1: the wiring between hook, workspace and App had no tests. Surviving mutants X8, X9, X10, X12 and X13.
  - F2: 7 stale comment pointers.
  - F4: X3b and X15 survived.
- **Fix round, same implementer:** `dffde08` added the tests (a new `AppEditingWiring.test.tsx` plus `MapEditingWorkspace.test.tsx` cases), and `ea472ab` fixed the comments (comment-only).
- **U1:** `git diff 2f0f9d7 HEAD --name-status -- packages/ui/test` shows only `A` entries (3 new files). `App.test.tsx` and every other existing test are unchanged.

## Coordinator mutation rerun on `8d0b2db`

Harness: `C:/Users/Serve/AppData/Local/Temp/pokemap-phase-d-coordinator/e2-mutations.mjs`. Same method:
- an unmutated green baseline for every witness;
- each anchor asserted exactly once;
- in-memory restore, then a byte compare;
- the requested IDs cross-checked against the reported IDs.

| ID | Mutation | Witness | Result |
|---|---|---|---|
| E2-M1 | `resetForMapChange` also resets `activeToolKind` | useMapEditing `resetForMapChange clears…` | RED |
| E2-M2 | the workspace ignores `renderCanvas` | workspace `renderCanvas receives exactly…` | RED |
| E2-M3 | `changeSelection` drops `resetForMapChange()` | existing App `clears the chosen stamp when a different map is selected…` | RED |
| E2-X8 | sign-added banner removed | workspace `renders signAddedMessage…` | RED |
| E2-X9 | Add Sign opens the save dialog | workspace `Toolbar Save and Add Sign…` | RED |
| E2-X10 | `layoutName={mapName}` | workspace `the metatile strip is keyed on data.layout.name` | RED |
| E2-X12 | collision strip hidden | workspace `renders the collision strip only while…` | RED |
| E2-X13 | `SaveDialog` gated on `signComposerOpen` | AppEditingWiring `Toolbar Save opens SaveDialog…` | RED |
| E2-X3b | the reset runs before the dirty guard | AppEditingWiring `a cancelled map switch…` | RED |
| E2-X15 | delete no longer clears `selectedEvent` | AppEditingWiring `deleting the selected event…` | RED |

10 requested, 10 reported, none missing. The tree was clean afterwards.

## Live smoke

Vite dev at 5183 → hub at 5184 (GBA mirror). On Route101:
- Map mode renders;
- the Pencil tool shows `.app__metatile-strip`;
- Collision shows `.app__collision-strip`;
- EventInspector shows "No event selected.";
- there were no page errors.

One `ERR_NO_BUFFER_SPACE` on a single `/api/metatile/.../50.png` came from the pre-existing palette, which loads about 512 PNGs individually under headless Windows. It is not E2-related.
