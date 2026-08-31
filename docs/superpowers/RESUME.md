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
> **State:** Tasks 1–22 of 29 in Plan 1 are done, **190 tests passing**, all
> green, `npm run typecheck` clean (it runs two tsconfigs), on branch
> `plan-1-foundation`. The subject decomp at
> `C:\Programming Projects\Pokemon Game\game` is read-only for all of Plan 1.
>
> **Next:** Task 23, dungeon auto-layout from the warp graph.
>
> Execute with `superpowers:subagent-driven-development`. **Audit each task's
> text against the subject repo before dispatching it** — roughly eighty
> defects have been found so far and *every one was in the plan or in a
> review, never in an implementation that followed a correct spec*. The audit
> is the highest-value thing you do; a clean implementer report is not
> evidence the task was right.
>
> Read `docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md` §3
> (invariants I1–I8) and §7 (test-design rules) first. §7 is the accumulated
> scar tissue and it is what makes the audits work.

---

## Where everything is

| Thing | Path |
|---|---|
| Plan 0 — roadmap, invariants, test-design rules | `docs/superpowers/plans/2026-08-26-pokemap-plan-0-roadmap.md` |
| Plan 1 — 29 tasks, full TDD steps ← executing | `docs/superpowers/plans/2026-08-26-pokemap-plan-1-foundation-world.md` |
| Plans 2–5 | same directory; task-level only, **re-granularise before executing** |
| Design system, binding on all UI tasks | `packages/ui/DESIGN.md` |
| Subject decomp | `C:\Programming Projects\Pokemon Game\game` |
| Reference engines | `C:\Programming Projects\Pokemon Game\refs\` |

`git log --oneline` is the real story. Plan corrections are separate `docs:`
commits and their messages record what was wrong and why.

## Running it

```bash
npx tsx packages/server/src/serve.ts        # API on 127.0.0.1:5174
npm run dev --workspace=@pokemap/ui         # Vite on 5173, proxies /api
```

`.claude/launch.json` lets the browser tooling start the UI by name.
**Open the app and click things.** Task 21's overlays blanked the canvas
entirely; it survived 183 green tests, a clean typecheck, and a programmatic
check that fetched real PNGs through the real proxy. One click found it.

## Things that will bite you

**The decomp baseline moves.** The user works in that repo concurrently — it
was 27 `git status --porcelain` entries early in the last session and 14 by the
end, with a completely different file list. **Measure it at session start and
give implementers that number**, rather than inheriting one from a handoff.

**Porymap strips `layout_version` from `layouts.json` on save.** It did this to
all 1,020 layouts mid-session. Symptoms: `layouts.test.ts` fails its
389/349/282 version counts, and every layout silently resolves to the emerald
512 boundary. Fix by splicing the keys back from `git show HEAD:...` keyed on
layout id — **not** `git checkout`, which would also throw away real edits
(there was a `NavelRock_ZygardeChamber` resize from 11×9 to 30×22 living in the
same uncommitted diff). Verify afterwards that the file differs from HEAD by
*only* the intended edits.

**`include/fieldmap.h` has a commented-out alternative constant block.** The
live values must be `NUM_*_IN_PRIMARY` 640/640/7 and `NUM_*_IN_PRIMARY_EMERALD`
512/512/6. That hand-swapping is the workaround invariant I8 exists to
eliminate.

**Heredocs are unreliable in this environment**, and `python`/`python3` are not
on PATH. Use Write/Edit and `git commit -F <file>`. Shell interpolation ate a
backticked word out of a plan comment last session.

**Agents get killed mid-edit.** Twice now. Once it left a live reversed draw
loop in `renderMetatile`; once it left 172 passing tests and a coherent body of
uncommitted work. Opposite correct responses, so: read the tree, run the suite,
*then* decide. Plan 0 §7 has this written up.

## Open items carried forward

- **19 connection conflicts** are reported by `buildWorld` and pinned as
  `CONFLICT_BASELINE`. They are real inconsistencies in the decomp — the Safari
  Zone quadrants, Ruins of Alph/Route 36, Ecruteak/Route 42, and a Saffron City
  cluster that disagrees by 84 tiles. This is a defect class Porymap cannot
  surface. The full list is in commit `361a662`.
- **`sizeOf`'s I7 refusal in `connections.ts` is an untested branch** — no
  fixture in the corpus reaches it, and removing it breaks no test.
- **`connections.ts` has a forward-looking comment** claiming `warpGraph.ts`
  "already does it this way". That file does not exist yet; Task 23 creates it.
  Make it true rather than deleting the comment.
- **2,534 tile entries across 14 tilesets name a palette index their tileset
  has no `.pal` for**, and render as transparent holes. Reported by
  `pokemap validate`; the parity decision needs a Porymap build to compare
  against.
- **`pokeemerald-expansion` names its second constant set `_FRLG`**, which
  three places assume is spelled `_EMERALD`. Harmless on the subject tree,
  wrong the moment Plan 0 §6's corpus gate opens that engine. Written up under
  Task 5.
- **`packages/server` depends on `@pokemap/cli`** for `encodePng` and
  `parseBorder`. Backwards layering; move both into core when Plan 4's MCP
  server becomes the third consumer.
