# Plan H C2: live check (C1 barrier, Q6, Q7), both families

Date 2026-11-22. Branch `claude/plan-h-c1` at `ac7cc1f` (C1 + Q6/Q7 from master `d9c8160`). Headless Playwright (Chromium) against the real app.

## Setup

- Scratch subjects: `git clone` of each subject into the session scratchpad (GBA `590fdf303` plus its `.pokemap/` and `porymap.project.cfg`; GBC PerfPlus `81ededbe3`). Every save and every hub in this run used the clones; the real subjects were never served or written (porcelain of both unchanged: 0 lines before and after).
- Hub from this worktree: `npx tsx packages/server/src/serve.ts <clone>` on 5174 (positional path, not `--gbc`, which reads the real subject path), scratch `POKEMAP_HOME`. Vite from this worktree on 5173; the served `useEditSessionCore.ts` contained `registerSettledSource` (proof the code is this branch's). One family at a time; servers stopped afterwards.
- Technique: `page.route('**/paint/apply')` holds the request on a deferred; the `/api/edit/*` request log shows what the page sent while it was held; `window.confirm` auto-accepts the Discard prompt; hub state from `GET /api/edit/<map>/session` (Q1: never opens a session; `blocks: []` means no session). Drivers in `task-C2-live/drivers/` (`c1-*.js` GBA, `g-c1-*.js` GBC).

## C1 results (map NewBarkTown, Pencil, a first stroke makes the session dirty, then a second stroke with its `/paint/apply` held)

| Case | GBA | GBC |
|---|---|---|
| Toolbar Discard, Map view: `/discard` sent while held / after release | 0 / 1 | 0 / 1 |
| Hub session after (isDirty, blocks) | false, 0 | false, 0 |
| Undo: `/undo` sent while held / after | 0 / 1 | 0 / 1 |
| Save: `GET /plan` sent while held / after | 0 / 1 | 0 / 1 |
| Save dialog commit, then hub | `POST /commit`, hub clean | same |
| World view, in-context (Pencil on the overlay), in-context Discard: held / after | 0 / 1, hub clean | 0 / 1, hub clean |
| World context, click Map mode (overlay unmounts), then Discard: held / after | 0 / 1, hub clean | 0 / 1, hub clean |

In the held runs the log order was: held `/paint/apply`, click Discard, release, remaining `/paint/apply`, `/paint/end`, `/discard`. A late paint never reopened a session. The commit barrier itself (paint held while the dialog's Save is pressed) is covered by the unit and shell tests; live, the dialog opens only after `/plan`, so only the plan wait was exercised.
Side finding: after a page reload with a dirty hub session, Discard and Save were enabled at once (Q1 hydration works live).

## Q6 (images refresh after a hub restart)

Same page, no reload. Staged a tileset edit (Edit block, Save as new) so image URLs carried `tv=`, saved it (`tv` 2), killed and restarted the hub (new `tilesetInstance`, counter back to 0), staged another edit.

- GBA: hub `tilesetVersion 1`, instance `b42b5926` to `be0c7ac0`; tile image URLs `tv=2` to `tv=3` (before the fix the store ignored 1 against a kept maximum 2, so images stayed at `tv=2`).
- GBC: same; instance `d0ea71a3` to `362ecc52`, `tv=2` to `tv=3`.

## Q7 (palette counts)

GBA (palette cells counted; the primary tileset was full at 640, so the new block came from a secondary-tileset house block with a palette change): 785 cells after Save as new (staged), 785 after Save (commit), 785 after a paint then Discard. Before Q7 the last step fell back to 784. GBC (header "N metatiles"): 129 after Save as new, 129 after Save, 129 after a paint and Discard; after the restart-and-second-edit in Q6 the header followed to 130 (GBA 786 there; discarded back to 785).
(b) counts follow `tilesetVersion`: observed only as the count following the new version after the restart; another map's append or undo from a second tab was not driven live (unit-tested in Q7).

## Not covered / notes

- No build-check run on the scratch clones (the saves wrote a metatile and tileset files; the clones are throwaway).
- GBA Save as new on the primary tileset is refused at capacity ("allows 640 metatiles; cannot append metatile 640"), shown in the dialog: expected, not a finding.
- No defects found.
