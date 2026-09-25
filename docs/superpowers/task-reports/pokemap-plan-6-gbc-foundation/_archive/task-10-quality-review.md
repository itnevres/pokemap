# Plan 6 Task 10 code-quality review: GBC CLI read commands

Reviewed: `git show 9192a69` on branch `plan-6-gbc-foundation` in
`/home/user/pokemap` (`packages/cli/src/{args,context,index,gbcCommands}.ts`,
`packages/cli/test/{context,gbcCommands}.test.ts`).

## Baseline

- `npx vitest run packages/cli/test/gbcCommands.test.ts packages/cli/test/context.test.ts`:
  **2 files / 17 tests, all green** (confirmed by running it directly).
- `npm run typecheck`: **clean.**
- GBA-suite failures are pre-existing/environmental (no GBA decomp on this
  machine) and out of scope, per the task's own instructions.

## Strengths

- **`resolveRoot`/`resolveProject` split is exactly what it claims to be.**
  `resolveProject` is now `openProject(resolveRoot(explicit))` with the
  refusal messages untouched; the new `resolveRoot` unit tests
  (`context.test.ts`) exercise explicit/config/missing-config independently
  and clean up their own `chdir`/tmpdir state in `afterEach`, matching the
  file's own pre-existing style.
- **`gbcCommands.ts` handlers are genuinely thin and testable.** `runGbcRender`
  and `runGbcQuery` take a root and return `{ stdout, stderr }` rather than
  writing to real streams or calling `process.exit`, so `gbcCommands.test.ts`
  exercises them directly for 8 of its 13 cases with no spawn. `openGbcProject`
  is called exactly once per handler invocation in both functions — no
  redundant re-parsing.
- **`runGbcQuery`'s per-flag loader isolation is correct and tested.**
  `--header` only ever calls `proj.layout(map)`, `--events`/no-flag only ever
  call `loadGbcMapEvents`, so a defect from an unrequested section never
  leaks into stderr. This is verified both positively (`--header` on
  `CeruleanCave2F` surfaces the layout defect) and negatively (`--header`
  includes no `events`/`connections` key at all).
- **Refusal messages are centralized and consistent.** Every GBA-only command
  produces exactly `<command> is not supported for gbc (pokecrystal-family)
  projects yet` through the single `runGbaOnly` throw site — there's no way
  for one command's message to drift from the others' wording.
- **Mutation-check is real and complete.** All 6 listed mutations (drop the
  defect loop, swap the family branch, remove one refusal, `--header`
  leaking events, wrong time default, non-deterministic render output) are
  each tied to a specific failing test, and the report says they were
  reverted and reconfirmed green.
- **Tests pin exact values, not shapes.** `runGbcQuery`'s header/connections/
  event-count assertions and the `CeruleanCave2F` defect message are pinned
  to literal expected text/counts, not loose regexes, so a regression in the
  underlying loaders would be caught here too.
- **The design anticipates Tasks 11/12 reasonably.** `render`/`query`
  already establish the pattern Task 11 needs for `render-world`
  (`if (family === "gbc") { ...; return; } const proj = resolveProject(root); ...`),
  and Task 11's own spec confirms this is exactly the shape it expects
  (drop `render-world` out of the `runGbaOnly` refusal list, add a
  `runGbcRenderWorld` branch). No rework of `resolveRootAndFamily` or the
  `runGbaOnly` throw site is needed for that transition.

## Issues

### Critical

None.

### Important

1. **Wrapped command bodies are not re-indented inside `runGbaOnly`'s
   callback, contradicting the implementer's own report.**
   `packages/cli/src/index.ts:77-110` (`render-world`), `:161-184`
   (`validate`), `:193-209` (`encounters`), `:218-226` (`where`), `:237-244`
   (`coverage`), `:265-268`/`:282-285`/`:293-296` (`sign suggest`/`add`/
   `list`), `:311-314` (`paint`), `:328-331` (`diff`) — in every one of these
   10 call sites, the code inside `runGbaOnly(root, family, "<cmd>", (root) => { ... })`
   sits at the *same* 4-space indent as the line that opens the callback, e.g.:
   ```ts
   runGbaOnly(root, family, "validate", (root) => {
   const proj = resolveProject(root);
   ...
   });
   ```
   `task-10-implementer.md` (bottom, "Concerns / deviations") states the GBA
   bodies are "byte-for-byte the same code that existed before this task,
   just re-indented one level inside `runGbaOnly`'s callback" — that claim
   is false; nothing was re-indented (confirmed by reading the file directly,
   not just the diff). It's harmless today (typecheck and both test files
   are green), but it makes the callback boundary invisible on a skim, and a
   future edit that adds a line after the intended `});` closer could land
   inside or outside the callback without any visual signal either way.
   **Fix, in order of preference:**
   - Best: drop the callback-wrapping shape entirely and replace
     `runGbaOnly(root, family, "validate", (root) => { ...body... })` with a
     guard-clause helper called as a plain statement at the top of the
     action, matching the shape `render`/`query` already use for their own
     family check:
     ```ts
     function refuseIfGbc(family: EngineFamily, command: string): void {
       if (family === "gbc") throw new Error(`${command} is not supported for gbc (pokecrystal-family) projects yet`);
     }
     ...
     .action((opts) => {
       const { root, family } = resolveRootAndFamily(program.opts().project);
       refuseIfGbc(family, "validate");
       const proj = resolveProject(root);
       ...
     });
     ```
     This removes the extra nesting level (and the pointless `root`
     parameter shadowing noted below) altogether, so there's no indentation
     to get wrong.
   - Otherwise: actually re-indent the 10 wrapped bodies by 2 spaces to match
     the callback nesting, as the report claims was already done.
   - Note this is moot for `render-world` (Task 11) and
     `encounters`/`where`/`coverage` (Task 12): those will have their
     `runGbaOnly` wrapper removed and rewritten with a real GBC branch
     regardless, so today's mis-indentation there is temporary either way.
     `validate`, `sign suggest`/`add`/`list`, `paint`, `diff` (6 commands)
     have no planned GBC path in this plan, so their mis-indentation is
     permanent unless fixed here.

2. **`gbcCommands.test.ts` leaks every `mkdtempSync` directory it creates,
   against the repo's own established convention.** `tmpFile` (lines 40-42)
   calls `mkdtempSync(join(tmpdir(), "pokemap-gbc-cli-"))` once per call, and
   several tests call it 2-3 times (e.g. the "omitting `--time`" test at
   lines 85-99 creates 3 directories, each holding a real rendered PNG).
   Nothing in this file ever calls `rmSync` on them, and there is no
   `afterEach`/`afterAll`. Every *other* file in the repo that uses
   `mkdtempSync` cleans up in a `finally`, `afterEach`, or `afterAll`
   (`packages/cli/test/context.test.ts`'s own new `resolveRoot` block
   included, in this same commit — see its `afterEach` at lines 42-45), so
   this is a real regression against a consistent, repo-wide pattern, not a
   nitpick invented for this review. Confirmed live: after running the
   suite once, `/tmp` already had 85 leftover `pokemap-gbc-cli-*`
   directories (~16-20 KB each, some holding full PNGs), and running it
   again added more. In CI this accumulates unboundedly.
   **Fix:** collect created dirs in an array and `rmSync(dir, { recursive:
   true, force: true })` for each in an `afterAll` (the file has no
   per-test isolation need, so `afterAll` is enough; `afterEach` also
   works), mirroring `packages/core/test/gbc/load/tileset.test.ts` or
   `packages/core/test/family.test.ts`.

3. **`runGbaOnly`'s callback parameter needlessly shadows the outer `root`.**
   E.g. `packages/cli/src/index.ts:76-78`:
   ```ts
   const { root, family } = resolveRootAndFamily(program.opts().project);
   runGbaOnly(root, family, "render-world", (root) => {
   const proj = resolveProject(root);
   ```
   `root` is already in scope from the destructure one line above; passing
   it back through the callback's own `root` parameter (which then shadows
   the outer binding) is pure indirection with no behavioural purpose — the
   value is identical either way. It's evidence the wrapper is doing more
   work than it needs to, and folds into the fix suggested in Issue 1
   (dropping the callback shape removes this too).

### Minor

4. **`gbcCommands.ts`'s doc comments overclaim parity with `writeCommands.ts`.**
   `packages/cli/src/gbcCommands.ts:24-28` and `:57-61` both say the handler
   returns a value "rather than writing to stdout/stderr itself... (mirrors
   `writeCommands.ts`'s own shape)". The *principle* (return instead of
   writing, so it's testable without a spawn) does match, but the literal
   shape doesn't: `writeCommands.ts`'s `runSignSuggest`/`runSignAdd`/
   `runSignList`/`runPaint`/`runDiff` (`packages/cli/src/writeCommands.ts:52,64,81,119,127`)
   all return a single `string`, never a `{ stdout, stderr }` pair. Reword to
   something like "mirrors `writeCommands.ts`'s principle of returning
   rather than writing" so a future reader doesn't go looking for an
   identical return type and come away confused.
5. **`RunGbcRenderResult`/`RunGbcQueryResult` are duplicate identical
   interfaces** (`packages/cli/src/gbcCommands.ts:16-19`, `:53-56`, both
   `{ stdout: string; stderr: string }`). Trivial now; worth collapsing into
   one shared `CommandOutput` type before Task 11/12 add a third and fourth
   copy of the same shape to this file.
6. **The 10-spawn refusal test bundles all assertions behind the first
   failure.** `gbcCommands.test.ts:214-235` loops 10 `spawnCli` calls inside
   one `it()`, asserting with plain `expect` inside the loop; if, say,
   `render-world`'s refusal broke, the loop throws on that iteration and
   `validate`/`encounters`/... never run in that pass, so a partial
   regression across several commands would surface one at a time across
   several fix-and-rerun cycles instead of all at once. Given the "3 tests
   only" budget this was written to satisfy (documented and reasonable —
   spawning `sign list` alone would not have caught the "remove one GBA-only
   refusal" mutation for any *other* command), this is a fine trade-off as
   is; if it's ever revisited, `for (...) { try { ...; } catch (e) { failures.push(...) } }`
   collecting all failures before one final `expect(failures).toEqual([])`
   would give full diagnostics without adding `it()` blocks.

## Assessment

**Approved.** The family-branch design (`resolveRootAndFamily` +
`runGbaOnly`) does what the spec asked — one shared root/family resolution,
one shared refusal message, GBA behavior byte-identical and confirmed by a
green baseline — and it extends cleanly to Tasks 11/12 per their own specs.
`gbcCommands.ts`'s handlers are correctly thin, correctly call
`openGbcProject` once, and correctly isolate per-flag loader defects. The
mutation-check is real and the tests pin exact values rather than shapes.

The two Important issues (unindented wrapper bodies contradicting the
report's own description of the diff, and the leaked tmpdirs going against
an otherwise-universal repo convention) are both real and both cheap to
fix, but neither is a correctness or safety problem — nothing here touches
the subject decomp, no defect is silently dropped, and every documented
behavior is test-covered. I'd want them addressed before or shortly after
merge, but they don't block it.
