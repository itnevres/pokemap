# Task 11a fix-2 tests report

**Blocked on the brief.** The authoritative rulings and test list live in
`C:\Programming Projects\PokeMap\.superpowers\sdd\2026-11-10-pokemap-plan-14-2-block-editor\task-11a-fix2-brief.md`
(B15a-d; "Tests to add" 1-9), and earlier rulings B1-B14 / T1-T5 in `task-11-rulings.md` in the same folder. Every read of that
external folder from this session is refused by the harness (`read`: "Permission denied: external_directory"), and this session has no
shell access at all (`shell`: "Permission denied: shell"), so `npm run typecheck` could not be run either. The brief is not copied
anywhere inside the worktree (checked `docs/superpowers/**`, `**/*.superpowers*/**`, `**/fix2-brief.md` — no matches). I therefore could
not see the exact test list, and the brief's own rule — expected values are literals from the brief — forbids reconstructing or
inventing tests B15b-d and tests 2-9 from the implementation (which is also explicitly off-limits as an expectation source). No test
was written for them rather than shipping a fabricated oracle. To finish: provide the brief (paste it, or make the SDD folder readable,
or copy it into the worktree and tell me the path); the one existing assertion replaced by case 7, and the GBA/GBC placement of cases,
are likewise unknown.

**Assumption-derived case added (the only B15 fragment visible in the task message itself):** the task text quotes the brief's naming
example verbatim: `"B15a: unreadable layer member is skipped, GET stays 200"`. Treating that fragment as the real B15a ruling, I added
one GBA-only `it` in the existing `if (family === "gba")` branch named `B15a: unreadable layer member is skipped, GET stays 200`. It
overwrites `include/global.fieldmap.h` in the temp `root` (snapshot via `restoreBytes` before writing, restored in `finally`; the real
subject repos are never touched) with a self-authored enum
`METATILE_LAYER_TYPE_NORMAL = 0, METATILE_LAYER_TYPE_COVERED, METATILE_LAYER_TYPE_SPLIT = 1 << 3`, then GETs
`/api/edit/<pair.a>/block?block=<id>` and expects HTTP 200 with `options.layerTypes` equal to the literal
`[{ name: "NORMAL", value: 0 }, { name: "COVERED", value: 1 }]` (the unreadable trailing member is skipped; placed last so no unruled
implicit-counter semantics are pinned). All other existing assertions are untouched, including the enum options test and the line the
brief's case 7 replaces (which line is unknown — nothing was removed). Expected red on today's code: the route refuses an enum member
its parser cannot read (`blockEditRoutes.ts` `gbaLayerTypes` throws the field-first `BAD_VALUE` refusal, surfacing as non-200 on the
block GET), so the `status === 200` assertion is expected to fail until the separate implementation hop lands B15a. If the "e.g."
fragment is merely illustrative and B15a is something else, this one test should be discarded at vet; no other case claims a ruling.

One line per case as required:

- `B15a: unreadable layer member is skipped, GET stays 200` — pins that an unreadable layer-type enum member is skipped (not a whole-GET failure) and the block GET answers 200 with the readable options; ruling B15a (assumption, see above); expected red on today's code.

Cases 1-9 not added / not derivable without the brief: tests 1-9 and rulings B15b-d are unreadable; B15a was the only fragment visible.
The GBC case 9 and the case-7 replacement line are among the missing items. No fixture gaps were encountered because no other cases
were attempted; had the brief been readable, any fixture gap would have failed loudly with a "fixture needs ..." error instead of a skip.

Typecheck result: **NOT RUN — blocked this session (harness denies shell; `npm run typecheck` / `npm.cmd run typecheck` unavailable).**
No claim of pass. TypeScript was written to match the suite's existing style and the file was re-read after editing, but it has not been
compiler-checked; the conductor should run `npm.cmd run typecheck` before relying on it. Vitest/`npm test` were not run, per the brief.
No `src` edits, no new dependencies, no other test or fixture edits: the only files written this session are
`packages/server/test/helpers/blockEditRoutesSuite.ts` and this report. `git status`/`git diff` were not run (shell denied), so no
git-level cleanliness claim is made.
