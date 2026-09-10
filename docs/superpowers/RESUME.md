# Resuming PokeMap in a new session

Paste the block below as the first message of a fresh Claude Code session
started in `C:\Programming Projects\PokeMap`.

`.remember/remember.md` holds a longer local-only copy. That directory is
gitignored, and it has been clobbered before — this file is the committed one.

---

## The prompt

> I'm resuming work on PokeMap, a Porymap-parity map editor for
> pokeemerald-family GBA decomp projects.
>
> **State: Plan 1, the World View Usability plan, and the Dungeon Mode and
> Warp Tools plan are all complete.** Plan 1: 29 tasks, merged to `master`.
> World View Usability (2026-09-07, 3 tasks: multi-select move, World-mode
> sidebar jump, species type-ahead): merged to `master`. Dungeon Mode and
> Warp Tools (2026-09-08, 16 tasks, Features A/B/C — world-view default
> population filter + sidebar grey-out, warp toggle + destination popup,
> full Dungeon tab with connection lines): merged to `master`. **423 tests
> passing**, `npm test`/`npm run typecheck` both clean. The subject decomp
> at `C:\Programming Projects\Pokemon Game\game` stayed read-only across all
> three plans — confirmed at the end of every single task (not just the
> plan) via `git status --porcelain`, always the same ~7 pre-existing
> entries (the user's own concurrent Porymap work), never PokeMap's. All
> three of Feature A/B/C were live-verified in a real browser at the end of
> the Dungeon Mode plan (Task 16), not just via unit tests — see "Running
> it" below and the dated entry in "Things that will bite you."
>
> **Next:** nothing queued. Plans 2-5 (task-level only, see table below)
> still need the same TDD-step-by-step re-granularisation Plan 1 got before
> they're executable — this has not been started, and was not touched by
> either of the two newer plans, which were user-requested feature work
> layered on top of Plan 1 rather than a continuation of the Plan 2-5
> roadmap. If picking this back up cold, ask the user whether they want
> Plan 2 re-granularised next, or more feature work in the same vein as the
> last two plans (both arrived as direct user requests brainstormed fresh,
> not from the existing roadmap).
>
> Execute with `superpowers:subagent-driven-development`. **Audit each task's
> text against the subject repo before dispatching it** — the single highest-
> value thing you do. Every defect found across Plan 1 (~90 by the end) was
> in a plan or a review, never in an implementation that followed a correct
> spec — including several found only by independently re-simulating a
> task's own arithmetic before dispatch (e.g. a test asserting `>400` where
> the code's own logic caps the value at 227), and several found only by
> actually driving the UI live (an opaque overlay that erased map art instead
> of tinting it; a tooltip that outlived the element that opened it; a
> spotlight label reporting encounter-table hits as if each were a distinct
> map, over by 5-7x on common species). A clean implementer report, or even
> a clean first review pass, is not evidence a task was right — several
> defects this plan survived one full review round before a second pass or a
> live re-drive caught them.
>
> Read `docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md` §3
> (invariants I1–I8) and §7 (test-design rules) first. §7 is the accumulated
> scar tissue and it is what makes the audits work.

---

## Where everything is

| Thing | Path |
|---|---|
| Plan 0 — roadmap, invariants, test-design rules | `docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md` |
| Plan 1 — 29 tasks, full TDD steps, **done** | `docs/superpowers/plans/2026-08-26-pokemap-plan-1-foundation-world.md` |
| World View Usability — 3 tasks, **done** | `docs/superpowers/plans/2026-09-07-world-view-usability.md` |
| Dungeon Mode and Warp Tools — 16 tasks, **done** | `docs/superpowers/plans/2026-09-08-dungeon-mode-and-warp-tools.md` (spec: `docs/superpowers/specs/2026-09-07-dungeon-mode-and-warp-tools-design.md`) |
| Plans 2–5 | same directory; task-level only, **re-granularise before executing**, **untouched by the two plans above** |
| Design system, binding on all UI tasks | `packages/ui/DESIGN.md` |
| Subject decomp | `C:\Programming Projects\Pokemon Game\game` |
| Reference engines | `C:\Programming Projects\Pokemon Game\refs\` |

`git log --oneline` is the real story. Plan corrections and review-fix
follow-ups are separate commits (`docs:`/`fix:`) and their messages record
what was wrong and why — there are a lot of them for Plan 1's last few tasks
(23-29) specifically; each UI task typically took 2-4 review rounds before
landing clean.

## Running it

```bash
npx tsx packages/server/src/serve.ts        # API on 127.0.0.1:5174
npm run dev --workspace=@pokemap/ui         # Vite on 5173, proxies /api
```

`.claude/launch.json` lets the browser tooling start the UI by name.
**Open the app and click things — every time, not just once.** This bit
Plan 1 repeatedly, not just early on:
- Task 21's overlays blanked the canvas entirely; survived 183 green tests,
  a clean typecheck, and a programmatic PNG-fetch check. One click found it.
- Task 25's world canvas shipped a pan/drag ambiguity where a mistaken pan
  silently wrote a permanent placement with no undo — found by a *review*
  actually driving the app, not by the implementer's own (also-live)
  verification pass.
- Task 28's encounter gutter tooltip looked fixed after its first live
  check, then turned out to survive its own anchor unmounting — needed a
  second live-driven round to close.
- Task 29's coverage lenses shipped fully opaque (erasing map art) and with
  a level gradient compressed unreadable by a few outlier maps — both only
  visible on screen, not in any test.
- Dungeon Mode Task 16's own live pass: any two dev-server processes left
  running from a prior session on 5173/5174 are almost certainly **stale**
  (serving pre-session code with no route-level hot reload) — hitting a
  brand-new route like `/api/dungeons` against them 404s even though the
  code is correct and every automated test passes. Kill and restart both
  before trusting a manual click-through; a curl against a route added
  *this* session is a 10-second way to tell stale from fresh before
  spending browser-tool time on it.

## Things that will bite you

**The decomp baseline moves.** The user works in that repo concurrently — it
was 27 `git status --porcelain` entries two sessions ago, 14 the session
after, 7 for the entirety of the Task 23-29 session (unchanged throughout,
confirmed repeatedly). **Measure it fresh at session start and give
implementers that number**, rather than inheriting one from a handoff. If a
task's live-verification step needs to write through the real app (a drag,
a toggle), confirm afterward the count and file list are back to exactly
what they were.

**A task's own reference code and reference tests can be internally
inconsistent in ways that only arithmetic catches.** Beyond the ~15 defect
patterns Plan 0 §7 already catalogues: Task 27's `coverage()` test asserted
`toBeGreaterThan(400)` on a value the function's own logic (one entry per
distinct map, not per table) caps at 227 — impossible regardless of what the
real data says. Caught by simulating the function against the real corpus
*before* dispatch, not by running the given code. When a task states a
numeric bound, re-derive the bound's own ceiling/floor from the
implementation's structure, not just spot-check the number against data.

**A plan's file list omitting a file doesn't mean the file doesn't need
touching.** Happened three times in a row: Task 25 needed `App.tsx` (a
Map/World mode switch had to live somewhere), Task 28 needed
`WorldCanvas.tsx` (the encounter gutter had to mount somewhere), Task 29
needed it again (spotlight dim/lens tint overlays). Every time, correctly
judged justified by review rather than scope creep — the requirements
implied it even though the file list didn't say so. Expect this pattern to
continue into Plan 2.

**Porymap strips `layout_version` from `layouts.json` on save.** Did this to
all 1,020 layouts mid-session once already. Symptoms: `layouts.test.ts`
fails its 389/349/282 version counts, every layout silently resolves to the
emerald 512 boundary. Fix by splicing the keys back from `git show HEAD:...`
keyed on layout id — **not** `git checkout`, which would also throw away
real edits. Verify afterward the file differs from HEAD by *only* the
intended edits.

**`include/fieldmap.h` has a commented-out alternative constant block.** The
live values must be `NUM_*_IN_PRIMARY` 640/640/7 and `NUM_*_IN_PRIMARY_EMERALD`
512/512/6. That hand-swapping is the workaround invariant I8 exists to
eliminate. (It's one of the 7 currently-dirty decomp files — the user's own
concurrent Porymap work, not PokeMap's; verified by diff content, not just
assumed, before treating it as background noise.)

**Heredocs are unreliable in this environment**, and `python`/`python3` are
not on PATH. Use Write/Edit and `git commit -F <file>`. Backticks in a
commit message passed through Bash can trigger shell substitution and
silently drop text — read the commit back after writing it, or build it via
`git commit -F <file>` from the start.

**Agent transcripts can become unresumable, separately from rate limits.**
Several Task 25/28/29 subagents ran for 300k-700k+ tokens in one turn; at
least twice a `SendMessage` resume failed with "No transcript found" even
though the agent's own committed work was intact and correct. When that
happens, don't try to force a resume — dispatch a fresh subagent with fully
self-contained context (the current commit, what's already done, what's
left) rather than assuming the work is lost.

**Agents get killed mid-edit, including by rate limits mid-review, not just
mid-implementation.** Read the tree and the log before deciding what to do
next, every time — a clean `git status` at the point of interruption means
resume-in-place is safe; anything else needs it read first. Plan 0 §7 has
the original two-incidents writeup. Confirmed again repeatedly across the
Dungeon Mode plan's 16 tasks (several implementer AND reviewer dispatches
cut off by rate limits mid-turn) — every time, `git status --porcelain` +
`git log --oneline -3` before redispatching was enough to tell "safe to
redispatch fresh" (clean tree) from "an uncommitted partial edit to
discard first" (`git checkout -- <files>` before redispatching, never try
to salvage or resume a cut-off agent's half-written diff).

**An implementer under review pressure will sometimes "fix" a bad test by
weakening the *production* code instead of the test.** Dungeon Mode Task
13: a test fixture made the plan's own strict spec requirement ("omit a
connection line if the exact destination warp tile can't be resolved")
impossible to satisfy, and the first fix made the *code* silently fall back
to drawing the line at the destination's corner instead — a real spec
violation (a misleading line implying a door where none exists) that
happened to make the broken fixture pass. Caught by a reviewer asking "was
the right fix here to weaken the code, or to fix the fixture?" and checking
real-corpus impact (0 of 3,470 resolvable warps needed the fallback — it
existed only to paper over the test). When a fix touches both a test and
the code it's testing, and the test was the thing demonstrably wrong,
that's a specific reason to scrutinize the production diff harder, not
less.

**Mutation testing (deliberately breaking a guard and confirming the right
test goes red) found real gaps *after* a implementer/spec-reviewer had
already both said "done" and "compliant" multiple times this plan** — a
`.sort()` with no order-sensitive assertion, a PATCH route's partial-update
semantics with no test that could tell "overwrites only the given keys"
from "overwrites everything," a hit-test radius with no test that could
tell "correctly bounded" from "unconditionally true." A clean pass on the
given tests is not evidence the *tests* have teeth — ask reviewers to
mutate the implementation and confirm the failure, not just read the tests
approvingly.

## Open items carried forward

- **19 connection conflicts** are reported by `buildWorld` and pinned as
  `CONFLICT_BASELINE`, still 19 as of the end of Plan 1. Real inconsistencies
  in the decomp — Safari Zone quadrants, Ruins of Alph/Route 36,
  Ecruteak/Route 42, a Saffron City cluster disagreeing by 84 tiles. A defect
  class Porymap cannot surface; now visible as literal geometry (conflict
  badges) in the world view. Full list in commit `361a662`.
- **`sizeOf`'s I7 refusal in `connections.ts`, and its sibling reimplementation
  in `warpGraph.ts` (now delegating to `Project.layoutForMap` instead), are
  effectively-untested branches** — 0 of 1,209 maps hit them. Low priority;
  `warpGraph.test.ts` has a synthetic stub test for its own copy.
- **14 real maps (26 map/method entries) have more `mons` slots than declared
  weights** in `wild_encounters.json` — e.g. `MAP_LAKE_OF_RAGE`'s Gyarados
  sits in unweighted slots and reports ~1% instead of its real share.
  Documented in `encounters.ts`'s own comments; not fixed, since the correct
  interpretation needs the game's actual encounter-selection C source, out of
  scope for a data-loading task. Flagged as background task `task_b2fa2dff`.
- **~1 of 300 species seen in encounter data doesn't cleanly round-trip**
  through `allSpecies()`'s directory-name-to-`SPECIES_X` mapping (299 map
  cleanly). Not identified further; noted by Task 27's implementer as a
  quirk worth knowing if a future task builds more species-name matching.
- **2,534 tile entries across 14 tilesets name a palette index their tileset
  has no `.pal` for**, and render as transparent holes. Reported by
  `pokemap validate`; the parity decision needs a Porymap build to compare
  against.
- **`pokeemerald-expansion` names its second constant set `_FRLG`**, which
  three places assume is spelled `_EMERALD`. Harmless on the subject tree,
  wrong the moment Plan 0 §6's corpus gate opens that engine. Written up
  under Task 5.
- **`packages/server` depends on `@pokemap/cli`** for `encodePng` and
  `parseBorder`. Backwards layering; move both into core when Plan 4's MCP
  server becomes the third consumer.
- **Minor, deferred polish from Plan 1's last review rounds**, none blocking,
  roughly in priority order if anyone picks up a slow afternoon: `WorldCanvas.tsx`
  is now **~2,057 lines** (grew from ~1,242 across the two newer plans — every
  new World/Dungeon-mode feature landed there) with one clean extraction seam
  (the lens/spotlight overlays, per their own comments, were meant to follow
  `EncounterGutter`'s presentational-child pattern but ended up inline, and
  the warp-marker/connection-line overlays repeated the same choice); rect-
  math for placement screen coordinates is duplicated ~5x across that file
  now; a handful of `connections.ts`/`species.ts`-style hand-rolled decomp
  path constructions bypass `paths.ts`; a few WCAG-contrast/keyboard-nav
  nice-to-haves on the newer overlay controls. If a future task ever touches
  this file for a reason unrelated to adding a new overlay, splitting the
  overlay layer out (mirroring `EncounterGutter`'s own split) is the single
  highest-value structural cleanup available — not urgent, but the file is
  past the point where "just add one more overlay inline" is still cheap.
- **Feature A/B/C's own known, deliberately-shipped limitations** (all
  documented in-code at the time, not silent): the status strip's `placed`/
  `hidden`/`unplaced`/`conflicts` counts and the Unplaced rail stay world-wide
  even inside a scoped Dungeon view (a `mapFilter` scopes the canvas, not
  these numbers); `focusEmptyMaps` (the empty-maps lens's "List them" button)
  is similarly unscoped and will pan the camera clean out of an open dungeon
  if clicked there; the draw effect's conflict/dive-emerge badges read
  `world.conflicts`/`world.verticalLinks` directly, bypassing both the
  Feature A visibility filter and `mapFilter` (unreachable today only because
  indoor/none-type maps connect via warps, not planar `connections`, in the
  real corpus); an open dungeon with zero maps renders a blank canvas with no
  message. None were in scope for the tasks that found them; each has an
  in-code comment pointing at itself for whoever touches that area next.
