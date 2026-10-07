# Task 6 code-quality review (cli, 0a6d2b0..8215119)

Verdict: APPROVED. 0 blocker / 2 important / 8 minor. Tests/typecheck not re-run (read-only).

## Important
| # | Where | Finding | Fix |
|---|---|---|---|
| I1 | gbcCommands.test.ts:496 | `gbaRoot` read from cwd-relative `"pokemap.config.json"` at describe-collect time: throws (whole file fails to collect, GBC tests too) if vitest cwd != repo root or the file is absent; no try/catch though test 10 is already `skipIf(!existsSync)`. | Wrap in a helper returning `""` on error (`existsSync("")` false -> skip), or resolve the path from `import.meta.url`. |
| I2 | gbcCommands.ts:297-307 vs writeCommands.ts:41-49 | `dryRunOrCommitGbc` is a near-verbatim copy of `dryRunOrCommit` (same refusal-join format, same structure); only `planSave/commitSave` and a trailing `\n` differ. The refusal-message format now lives in 2 places and can drift (test 4 pins the GBC copy only). | Cheap share: export from writeCommands.ts `finishWrite(plan, commit: () => void, yes, label)` (plan is the shared `formatDiffText` shape); both wrappers become 3 lines. If not worth touching GBA, add a "mirrors writeCommands.ts dryRunOrCommit" comment so drift is noticed. |

## Minor
| # | Where | Finding | Fix |
|---|---|---|---|
| m1 | index.ts (`gbcOnlyRoot`) | Name says "root" but it is a guard that throws; reads like a getter. Also lives mid-file away from `refuseIfGbc` (its mirror). `sub` string is re-typed per call site. | Rename `requireGbcRoot`, move next to `refuseIfGbc`. |
| m2 | index.ts paint/diff actions | `return void emit(...)` is cryptic and uncommented; handler type still says `tool: "pencil" \| "rect"` though GBC accepts `bucket` (help text says so, type lies). | `if (family === "gbc") { emit(...); return; }`; widen `tool` to `string`. |
| m3 | index.ts `emit()` | Fine and well-commented. Note (not a defect): on `--yes` refusal the throw drops dry-run `warning:` stderr; implementer report concern 2 says the message text covers it. Acceptable; maybe one-line comment on `dryRunOrCommitGbc`. | Optional comment. |
| m4 | gbcCommands.ts:360-363 `openEventSession` | Returns `{session, kind}` just to validate kind then open; `runGbcEventMove/Delete` validate `index` before `openGbcProject` but `kind` after it (inconsistent order, kind error costs a project load). | Validate kind first (`const kind = kindOpt(opts.kind)`), call `openGbcEditSession` directly; delete helper. |
| m5 | gbcCommands.ts (`runGbcEventAdd`) | `typeof opts.args !== "string"` is unreachable from CLI (`requiredOption`); only guards direct API misuse. `"".split(",")` -> `[""]` gives a core-level arg-count error, acceptable. Also x/y/const flags not trimmed/validated (core does). | Drop the typeof guard (YAGNI) or keep; non-blocking. |
| m6 | gbcCommands.ts `gbcPaintSession` | `--x1/--y1` silently ignored for pencil/bucket; `rect` with only one of x1/y1 silently collapses the other axis to x/y. Out-of-bounds x/y for bucket relies on core `floodFill` behavior (not checked here). | Throw if x1/y1 given with non-rect tool; require both for rect; confirm/pin OOB behavior with a test (only metatile OOB is tested). |
| m7 | gbcCommands.ts `layoutWarnings` | Re-runs `proj.layout(proj.map(mapName))` after a possible commit (a second layout load; after `--yes` it reads the post-write state, so defects could differ from what was planned). | Compute warnings before `dryRunOrCommitGbc`, or reuse `session.layout` defects if exposed. |
| m8 | test file imports (L15-22) | New imports appended mid-file: `corpus.js`, `gbcCommands.js`, `events.js` each imported twice; `beforeAll` imported separately from vitest. Driven by the "byte-unchanged" rule, now that U1 edit is approved merging is cheap. Test numbering out of order (11 before 10); `as never` cast on test 5 is deliberate and fine. | Merge imports into existing lines; reorder 10/11 (optional). |

## Checked and fine
- `intOpt` / `kindOpt`: NaN and 1.5 handled with clear messages naming the flag; process-level test 11 covers `--metatile abc`. Note `x1/y1` pass through `intOpt` only when defined: good.
- Error messages: consistent `--flag must be ... got X`; GBA refusal message matches the existing `is not supported for ... ` voice.
- Doc comments explain why (dry run default, diff ignores `yes`, pre-delete warps for deleting map, Commander `Number`). `runGbcDiff` `Omit<..,"yes">` + test 5 is good defense.
- Tests: one shared temp copy (`beforeAll`), `afterAll` removes it and asserts the real PerfPlus is `git status`-clean, so no real writes even under a mutant (the old C1 leak path is gone via U1). Runtime: one copy + 60s timeouts; delete test scans all maps (~1s) fine. Assertions derive expected values from core functions (not hand-copied), good; test 3 bucket seed search loops over every cell calling `floodFill` (O(n^2) on NewBarkTown; small, ok).
- Tests share state across `it`s in order (test 2 writes byte 0, test 6/7/9 mutate asm cumulatively; 9 adds a warp then deletes warp 0). Order-dependent but each test re-reads `before`; moderately brittle if run with `.only`/shuffle; acceptable, mention in the describe comment.
- U1 edit: exactly 2 removed lines + 1 explanatory comment line in the GBA-only refusal `cases`; minimal and commented. OK.
- TypeScript hygiene: no `any`; `unknown` inputs narrowed; only cast is the deliberate `as never` in test 5.
