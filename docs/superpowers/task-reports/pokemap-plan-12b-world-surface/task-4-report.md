# Task 4 report: world drag dispatcher (`canvas/useWorldDrag.ts`) — High

BASE `a82682a`. Brief: `task-4-brief.md` (conductor-designed API; Codex wrote hook and tests).

## Delegation

Task 4: Codex gpt-6.1-sol (Opus-tier chain; Codex over Aider because the brief needs tests written from prose plus a 276-line hook lifted from a 2,100-line file) in scratch worktree `wt-t4`, done; its commit failed (sandbox could not create `index.lock`), conductor copied both files into the main checkout. Codex says it ran its own sub-reviews; ignored, the task reviews below are the gate. Worktree and branch `t4-codex` removed.

## What it is

GBA's world drag dispatcher (`WorldCanvas.tsx` `onMouseDown`, `onMouseMove` drag branches, `commitMapDrag`/`commitGroupDrag`/`commitMarquee`, `onMouseUp`, `onMouseLeaveCanvas`, `intersects`/`contains`) lifted into a hook with no family branch. Not wired yet (Tasks 6-8). Rationale comments moved with the code (click-guard CRITICAL postmortem, Shift-to-move rationale, no-op write guard, sub-tile no-op guard, commit-on-leave fallback and capture rationale); `WorldCanvas.tsx` keeps its copies until Task 8 replaces it.

Differences from GBA's inline code (all deliberate):
- Drag state tracks the last optimistic position (`last` / `dx, dy`) instead of re-reading `world.placements` at release; release decides off-start from that. Same outcome, no stale-render read.
- Pan goes through `useStage`'s `startPan`/`movePan`/`endPan` (GBA had its own `setPan`); with capture held, leave keeps the gesture (P12-4a); without capture, leave runs the full release (GBA commit-on-leave, marquee included).
- New `cancel()` (P12-4a, wired to `useStage`'s `onCancel` later): reverts begun maps to their start in one `movePlacements`, then `ledger.noop` each; marquee dropped without selecting; `dragMoved` preserved.
- A mousedown while a gesture is live is ignored (one gesture per pointerdown/mousedown pair).

## Tests (`test/canvas/useWorldDrag.test.tsx`, new, 37 incl. parameterised)

Covers brief items 1-13: modifiers per drag kind (incl. Meta, button 2, Shift on empty); group by anchor delta; marquee right=contain / left=intersect, replace; `dragMoved` lifecycle; `begin` before first `movePlacements`; commit once with version; returned drag → `noop` + `serverShows` true; capture held leave → no commit, later up commits once; no capture leave → commit once (map/group), marquee selects, pan ends; cancel reverts + noop, and waits on an earlier unresolved POST (`placementLedger.ts:93-104`); second mousedown ignored; `onMouseMove` return value. Real `createPlacementLedger()`.

`git diff --stat -- packages/ui/test`: one new file; no existing test changed.

## Mutations (conductor-run, each restored; all red)

| Mutation | Failing test(s) |
|---|---|
| Group drag moves only the anchor | group by anchor delta; returned group settles |
| Marquee ignores direction | marquee direction; one-render commit; uncaptured marquee leave |
| Cancel commits (runs release) | 4 cancel tests |
| Cancel skips `noop` | cancel reverts + noop; cancel waits on earlier POST |
| A returned drag commits | returned drag settles without commit |
| No-capture leave drops a map drag | uncaptured leave map + group; marquee leave |
| `dragMoved` not set on pan | pan marks movement |
| `begin` after the first optimistic move | begins before first move |

Typecheck clean; `rg -i 'gba|gbc|family|key='` on the hook: no match.

## Removed comment lines

None (new files only).

## Gate (before review fixes)

3,716 pass / 0 fail / 229 files; typecheck and UI build pass; both subjects' porcelain unchanged.

## Fix round 1 (Codex astra spec FAIL 2 Important; quality Needs rework 1 Important)

Brief `task-4-fix1-brief.md`. Hop: Aider nemotron-3-ultra (whole-file edit format): the hook change (unmount cleanup, 5 lines) was correct; the test edit corrupted one existing line (`.map((selected)) =>`, transform error) and its added tests were verbose and partly wrong (`h.host.unmount`, version order). The conductor restored the corrupted line (verified against Codex's logged snapshot of the test file: no other existing line changed) and rewrote the added tests concisely (same cases, logged as conductor inline: tests are oracle work).

- Spec I1 (rounding unpinned): 4 new tests, map and group, half-unit upward and negative coordinates (-2.4 → -2 where floor gives -3), optimistic and committed positions.
- Spec I2 (marquee axis unpinned): right-and-up selects contained only; left-and-down selects intersecting too.
- Quality I1 (unmount leaves begun versions pending): `useEffect(() => () => cancelRef.current(), [])` with `cancelRef` updated each render; unmount mid map/group drag reverts and `noop`s each begun version (`serverShows` true); unmount with no gesture does nothing. 3 new tests.

Tests: 43 (was 37).

| Mutation | Failing test(s) |
|---|---|
| F1 `Math.floor` instead of `Math.round` | 4 rounding tests |
| F2 marquee rule chosen by `y1 > y0` | right-and-up; left-and-down |
| F3 no unmount cleanup | unmount mid map drag; mid group drag |

## Gate (after fix round 1)

3,722 pass / 0 fail / 229 files; typecheck and UI build pass; both subjects' porcelain unchanged. Re-review (Codex astra): all 3 findings ADDRESSED, no new breakage.

Delegation log: Task 4: Codex gpt-6.1-sol done (commit blocked by sandbox, files copied); reviews Codex gpt-6-astra (spec, quality, re-review); fix round 1 Aider nemotron-3-ultra partial (hook fix good, test edit corrupted a line) → conductor restored and rewrote the added tests.
