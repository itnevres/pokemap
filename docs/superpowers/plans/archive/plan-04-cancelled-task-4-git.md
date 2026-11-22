# Plan 4: Task 4, optional git integration (cancelled)

Cancelled by the user on 2026-11-16 (D33: PokeMap never relies on git). Text as it stood at `a533694`, before the 2026-11-21 clean-up removed it from the live plan.

## Success criterion 3

3. With git integration on, a save into a dirty tree is refused and names the dirty files.

## Traps

**Task 4 (git)**
11. **`refuseDirtyTree` as written refuses every save for this user.** The GBA subject always has the user's own uncommitted lines (RESUME, External baselines); PerfPlus does not ignore `.pokemap/`, so the first placement makes the tree dirty; and a crash leaves `*.pokemap-tmp-*` files (LESSONS, Testing: "A power loss mid-gate").
12. **The save fingerprint does not cover it.** The fingerprint hashes file entries (`core/src/write/atomic.ts:97`), not refusals, so a tree that turns dirty after the preview passes the commit. The check runs at plan and again at commit.
13. **"Extend `save.ts`" names one file of four.** There are two save modules (`core/src/write/save.ts`, `core/src/gbc/write/save.ts`) and two commit routes (`server/src/index.ts:1036`, `server/src/gbcEditRoutes.ts:424`). The header's "no task changes core" also contradicts this task.
14. **A failed commit after a successful write is not a failed save.** The files are on disk. The result is a notice, as Plan 10a3 does for `PLAN_CHANGED`.
15. **The settings have no route on GBC.** The GBC world payload returns only `{ dungeonAutoLayout }` of the sidecar (`server/src/gbcRoutes.ts:246`), and the sidecar's shape guard is hand-written (`core/src/world/sidecar.ts:33`). Settings get their own route in the shared sidecar module (Plan H Task H).

## Subtask rows

| 4a | Git module: porcelain parse, stage by path, commit; tests on temporary repositories only | new `packages/core/src/write/git.ts` and test | High (parsing, subject repo writes) | `npx vitest run packages/core/test/write` | decision 3 |
| 4b | Settings: storage, route in the shared sidecar module, first-run prompt | `packages/core/src/world/sidecar.ts`, `packages/server/src/sidecarRoutes.ts`, a shared UI prompt | Medium | `npx vitest run packages/server packages/ui/test/shared` | Plan H Task H |
| 4c | Both commit routes: the check at plan and commit, the commit after the write, notices | `packages/server/src/{index,gbcEditRoutes}.ts` or the route modules Plan H Task I leaves; tests | High (save ownership) | `npx vitest run packages/server` | 4a, 4b |

## Decision 3

3. **Git:** recommendation: drop `refuseDirtyTree`; keep `autoCommit`, which stages the plan's files by path, and skip the commit with a notice when one of those files already had uncommitted changes before the save (so the user's own edits never ride along).

## Task 4: Optional git integration

**CANCELLED 2026-11-16 by the user (roadmap D33): PokeMap never relies on git.** Do not build. The text below is kept for the record only.

The feature deferred from the design discussion: strictly additive protection over the existing save funnel, default off.

**Files:** Create `packages/core/src/write/git.ts`, extend `save.ts`, tests

**Settings** (in `.pokemap/world.json`, since it is per-project):

```json
{ "git": { "refuseDirtyTree": false, "autoCommit": false, "commitMessageTemplate": "map: {summary}" } }
```

**Requirements:**
- `refuseDirtyTree`: `planSave` gains a refusal when `git status --porcelain` is non-empty, listing the dirty files. Files this save would itself touch are excluded — otherwise the second save of a session is always refused.
- `autoCommit`: after a successful `commitSave`, stage **exactly the files in the plan by path** and commit. **Never `git add -A`** — `docs/resolved.md` records `git add -A` without re-checking `git status` as the mechanism by which the Porymap 6 damage reached a commit. A test asserts the staging command names explicit paths.
- Both default to **off**. A first-run prompt offers to enable them and explains what each does.
- A repo with no git, or git not on PATH, degrades to off with a one-line notice — never an error, never a blocked save.
- Git calls are out of the render path entirely; a slow `git status` may delay a save dialog but must never affect panning.

