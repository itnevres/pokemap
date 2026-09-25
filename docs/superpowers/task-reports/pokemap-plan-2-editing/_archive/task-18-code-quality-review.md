# Task 18 code-quality review: CLI write commands

Base `917e9d5` -> Head `5de00c0`. Read `writeCommands.ts`, `index.ts` diff, `writeCommands.test.ts`,
both prior reports, the plan section (lines 5451-5808), and the core files it must mirror
(`editSessions.ts`, `save.ts`, `signs/write.ts`, `edit/paint.ts`, `edit/events.ts`, `write/guards.ts`,
`write/diff.ts`). Independently re-ran the full suite, live-checked the commander nesting fix, and
re-verified the new test map names against the real subject decomp and every other test file in the
repo (not just trusted the fix commit's own claims).

## Strengths

- **`openCliEditSession`/`dryRunOrCommit` fixes are real and correct.** `writeCommands.ts:28` uses
  `structuredClone(map)`, byte-for-byte matching `editSessions.ts:54`'s real `open()` and the
  aliasing-hazard doc comment on `EditSession.originalMap` (`save.ts:63-68`). The plan's own sample at
  line 5613 aliases (`originalMap: map`) — a genuine, correctly-diagnosed deviation.
- **Commander nesting fix verified live**, not just read: `npx tsx packages/cli/src/index.ts sign
  --help` shows a real `Usage: pokemap sign [options] [command]` with `suggest <map>`, `add [options]
  <map>`, `list <map>` as genuine subcommands; `paint --help`/`diff --help` both print the full,
  correct option lists. `node_modules/commander/lib/command.js`'s first-space-only split confirms the
  plan's literal `program.command("sign suggest <map>")` would not have nested at all.
- **Clean separation of concerns**: every exported function (`runSignSuggest`, `runSignAdd`,
  `runSignList`, `runPaint`, `runDiff`) is a thin, pure-ish, directly-testable unit; `index.ts`'s new
  action handlers (`index.ts:200-259`, ~70 added lines) are exactly as thin as every pre-existing
  command (`resolveProject` -> call -> `process.stdout.write`) — matches the plan's own stated
  `layoutNameFor`/`resolvePlacementRect` precedent, doesn't grow `index.ts` with any inline logic.
- **`guardSignWrite` genuinely runs before any session exists** (`writeCommands.ts:66-69`): a label
  collision can't touch `map.json` in memory even with `--yes`, confirmed by reading the call order.
- **`runDiff` is structurally incapable of writing** — its own param type is `Omit<PaintArgs, "yes">`
  and it never references `commitSave` or `dryRunOrCommit`.
- **Test-map verification is real, not rubber-stamped.** Independently confirmed (not trusting the
  fix commit's message): Route35/37/38/40 all exist in the real subject decomp
  (`C:/Programming Projects/Pokemon Game/game/data/maps/...`), each resolves to a **distinct**
  `blockdata_filepath` in `layouts.json` (`Route35/map.bin`, `Route37/map.bin`, `Route38/map.bin`,
  `Route40/map.bin`), and a repo-wide grep found zero other references to any of the four outside
  `writeCommands.test.ts`. The race-condition reasoning in the second fix commit
  (`paintRoutes.test.ts:224`/`:244` racing Route33/34; `signRoutes.test.ts`'s Route31 case) is sound.
- Full suite genuinely passes: `npx vitest run` → 73 files / 647 tests, `npx vitest run packages/cli`
  → 6 files / 40 tests, both re-run fresh during this review, not just re-read from the reports.
- `bucket` refusal, `paintCells`'s own out-of-bounds skip (`edit/paint.ts:42`), and
  `NO_SCRIPTS_INC`/`SIGN_LABEL_EXISTS` are all real, already-guarded paths — no missing guard was
  found.

## Issues

### Critical (Must Fix)

None found.

### Important (Should Fix)

1. **Dry-run refusal path throws instead of rendering, unlike `diff` on the identical edit** —
   `writeCommands.ts:41-50` (`dryRunOrCommit`). When `planSave(...).refusals` is non-empty,
   `dryRunOrCommit` throws immediately (`writeCommands.ts:43-45`) *before* ever calling
   `formatDiffText(plan)` — even on the no-`--yes` dry-run path, where nothing would be written
   either way. `formatDiffText` (`write/diff.ts:4-10`) was built specifically to render changes *and*
   refusals together (`REFUSED [code] subject: message -- fix`), and `runDiff` uses it exactly that
   way with no throw. So the same guard failure (e.g. `warp-tile-moved` from `guardMapSave`, or
   `metatile-out-of-range` from `guardLayoutSave`) renders completely differently depending on which
   command hit it: `pokemap diff --tool rect --metatile <bad-id>` prints a clean multi-line preview
   including the refusal; `pokemap paint` with the *identical* args (no `--yes`) crashes to stderr via
   `main().catch` (`index.ts:278-281`) with only the refusal line, no visibility into what else the
   plan would have changed. This is inherited verbatim from the plan's own sample `dryRunOrCommit`
   (lines 5621-5630 of the plan doc have the identical eager-throw-before-diffText shape) — a 4th
   plan-text defect the implementer didn't independently catch (they found and fixed 3 others in this
   same function/file). Not data-unsafe (the refusal message itself is fully informative, and nothing
   ever writes), but a real UX/consistency gap between two commands that both claim to "preview" the
   same underlying operation. Fix: compute `diffText` unconditionally and fold the refusal-as-error
   decision to only the `--yes` branch (i.e. only throw when the caller actually asked to commit), or
   have `dryRunOrCommit`'s dry-run branch print `diffText` (which already includes `REFUSED` lines)
   the same way `runDiff` does.

### Minor (Nice to Have)

1. **Vacuous test assertion, inherited from the plan.** `writeCommands.test.ts:83`:
   `expect(readFileSync(proj.paths.mapJson("Route40"), "utf8")).toEqual(readFileSync(proj.paths.mapJson("Route40"), "utf8"))`
   compares a fresh read to itself — always true regardless of correctness, as the trailing comment
   itself admits ("trivially true; real assertion is the throw itself..."). Identical in the plan's
   own literal sample (line 5524, originally against Route31). Not a bug introduced by this
   implementation, but worth deleting or replacing with a real before/after comparison the next time
   this file is touched — it currently asserts nothing.
2. **Refusal-formatting is a third, slightly different rendering of the same `Refusal` shape.**
   `write/diff.ts:7` renders `REFUSED [${r.code}] ${r.subject}: ${r.message} -- ${r.fix}`;
   `save.ts:223`'s `commitSave` renders `${r.code} (${r.subject})` (no message/fix); `writeCommands.ts:44,68`
   render `${r.code} (${r.subject}): ${r.message} -- ${r.fix}`. All three carry the same information
   but with different punctuation/ordering. Harmless (this is error text, not parsed anywhere), but a
   shared `formatRefusal(r: Refusal): string` in `guards.ts` would remove the last bit of duplicated
   formatting logic across three files. Not blocking.
3. **`openCliEditSession` duplicates `editSessions.ts`'s `open()` body almost line-for-line**
   (`writeCommands.ts:20-31` vs `editSessions.ts:34-56`) — parseBlocks/border/mapJson +
   `structuredClone`. This is the plan's own explicit intent ("mirrors ... exactly," no server process
   to share a store with), and this codebase already has a documented precedent for preferring
   duplication-with-cross-referencing-comments over a shared abstraction when the two call sites live
   in different architectural layers (see `write/guards.ts:7-13`'s `idOutOfRange` comment). Given that
   precedent, this is a defensible call, not a defect — flagging only because the task explicitly
   asked to weigh duplication vs. architecture here. If `packages/core` ever wants a single source of
   truth for "build a fresh `EditSession` from disk," extracting `buildEditSession(proj, mapName)`
   into `core` (called by both `editSessions.ts`'s `open()` and `openCliEditSession`) would remove the
   duplication with no behavior change — worth doing opportunistically, not urgently.
4. **No CLI-level test exercises an out-of-bounds paint target or a genuinely no-op edit** (e.g.
   `paint --tool pencil --x -1 --y -1`). `paintCells` already silently skips out-of-range targets
   (`edit/paint.ts:42`), so the behavior is safe (falls through to `planSave`'s "nothing to save"), but
   no test in `writeCommands.test.ts` pins that this stays true from the CLI's own entry point. Nice
   to have, not blocking — the underlying guard is already core-tested.

## Recommendations

- Fix the dry-run/refusal asymmetry between `paint`/`sign add` (throw) and `diff` (render) — it's the
  one place this task's own two-command design (`paint` for doing, `diff` for previewing) doesn't
  actually behave the same way on the same failing input.
- Opportunistic, non-blocking: dedupe the three refusal-string formats into one helper; consider
  extracting `buildEditSession` into `core` if a third caller ever needs it.

## Assessment

**Ready to merge?** Yes

**Reasoning:** Zero Critical issues. One Important issue is a genuine UX/consistency gap, but it's
inherited unchanged from the plan's own sample code (a 4th plan-text defect on top of the 3 the
implementer already found and fixed), it's not a data-safety or correctness problem (nothing writes
that shouldn't, the refusal is still surfaced, just via a thrown error instead of a rendered diff),
and it doesn't block any of this task's own stated acceptance criteria (dry-run-by-default,
`--yes`-to-commit, one shared `planSave`/`commitSave` path, no third code path). Architecture is
sound: `EditSession` construction genuinely mirrors the server's, `guardSignWrite` runs before any
session touches memory, `runDiff` is structurally write-incapable, and the commander-nesting fix is
verified working live. Test-map choices in the second commit are independently confirmed non-colliding
against the real corpus and the rest of the test suite. Everything the spec-review already passed
re-checks out; the only material addition from this pass is the dry-run/diff asymmetry above, which
is worth a follow-up fix but not a blocker.
