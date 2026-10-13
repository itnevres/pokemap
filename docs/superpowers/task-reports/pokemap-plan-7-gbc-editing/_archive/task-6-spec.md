# Task 6 executed spec: GBC CLI write commands

Plan 7 Task 6, re-granularised against the real code. Risk class: **medium**. The CLI is a writer front end. Every write goes through Task 1's funnel, and argument parsing sits at the user boundary. One Sonnet implementer; split reviews (Opus spec, Sonnet quality), because this is the second writer front end.

Builds on Tasks 1-3 (core only). Read their **final** code, not their specs: `gbc/write/save.ts`, `gbc/write/guards.ts`, `gbc/edit/paint.ts`, `gbc/edit/events.ts`. Names may have moved in fix rounds.

## Shape (binding)

- **Same binary, same command names; branch on family** (findings §Config: "Same `pokemap` binary; no `pokemap-gbc`"). The plan's "`gbc paint`" wording means the GBC branch of `paint`, not a new command.
  - `paint <map>` and `diff <map>` on a GBC root stop refusing and call new handlers in `packages/cli/src/gbcCommands.ts`. GBA behaviour is byte-unchanged.
  - **New `event` command group** (`event move|add|delete <map>`), built like the existing `sign` group (`program.command("event")` plus subcommands, per the comment above `sign` in `index.ts`). On a GBA root it refuses with `event <sub> is not supported for gba projects (GBC-only today)`. GBA's CLI never had event commands, and adding them is out of scope.
- **Handlers** take `root` (as every GBC handler does) and return `GbcCommandResult { stdout, stderr }`. Add them in a **separate block at the end** of `gbcCommands.ts` (RESUME lesson: keep each task's additions to shared files in separate blocks).
- **Dry run by default; `--yes` commits.** The shared helper mirrors `writeCommands.ts`' `dryRunOrCommit`:
  - print the label plus `formatDiffText(plan)`;
  - without `--yes`, append `(dry run -- not written; pass --yes to commit)`;
  - with `--yes`, throw on refusals (same message format as GBA), else `commitGbcSave` and append `committed`.
  - `diff` is always a dry run.

## Commands

| Command | Options | Behaviour |
|---|---|---|
| `paint <map>` (GBC branch) | `--tool pencil\|rect\|bucket`, `--x`, `--y` (block coords), `--x1`, `--y1` (rect), `--metatile <id>`, `--yes` | `openGbcEditSession` → Task 2 `paintCells` (1×1 stamp; rect expanded like GBA's `targetsFor`, origin at `(x, y)`) or `floodFill` → dry run/commit. **Bucket is supported on GBC**: the pure `floodFill` is already there, unlike GBA's CLI |
| `diff <map>` (GBC branch) | same minus `--yes` | always a dry run |
| `event move <map>` | `--kind warp\|coord\|bg\|object`, `--index <n>` (0-based), `--x`, `--y` (event steps, 16 px), `--yes` | `moveGbcEvent` on `session.eventsText`; assign `eventsText`/`events` → dry run/commit |
| `event add <map>` | `--kind`, `--args "<a>, <b>, …"` (the macro's full argument list in source order, comma-split and trimmed; 4 for warp/coord/bg, 13 for object), `--const <NAME>` (object only), `--yes` | `addGbcEvent(..., { mapConsts: new Set(proj.maps.map((m) => m.constName)), objectConst })` |
| `event delete <map>` | `--kind`, `--index`, `--yes` | `deleteGbcEvent`. For `--kind warp`, also print one `warning: <fromMap> warp[<i>] -> <MAPCONST> <destWarp> will be retargeted` line per `findGbcWarpsRetargetedByDelete` hit to **stderr**, on both dry run and commit. The scan builds `maps` from every map's `loadGbcMapEvents(root, map).events.warps`, with the deleted map's **pre-delete** session warps |

- **Arg validation** (each throws a named error; `index.ts`' `main().catch` turns it into `pokemap: <message>` plus exit 1):
  - numeric options must be integers (commander's `Number` gives `NaN` for junk; refuse `NaN`/non-integers naming the option);
  - `--kind` must be one of the 4;
  - `--tool` must be one of the 3;
  - `--const` given for a non-object kind refuses.
- The help text says which unit each coordinate is in: **blocks** for paint, **event steps** for events.
- Data defects from `proj.layout` (e.g. CeruleanCave2F oversize) are printed as `warning:` lines to stderr through the existing `warningLines`, as `render`/`query` do.

## Tests (`packages/cli/test/gbcCommands.test.ts`, new `describe` block at the end; TDD)

**Writes are hermetic.** Commit tests use a temp copy of PerfPlus. Task 4 adds a shared helper `copyGbcSubjectToTemp()` to `packages/core/test/gbc/helpers/corpus.ts`. If Task 4 has landed, use it; if not, add it there yourself: a `cpSync` recursive copy filtering out `.git`, returning the tmp path, with cleanup through `rmSync(..., { recursive: true, force: true, maxRetries: 3 })`. Dry-run tests may read the real PerfPlus. **Never write the real PerfPlus**; `afterAll` asserts its `git status --porcelain` is empty.

1. `paint NewBarkTown --tool pencil --x 0 --y 0 --metatile <different id>` without `--yes`:
   - stdout contains `maps/NewBarkTown.blk -- 1 block changed` and the dry-run line;
   - the real PerfPlus is byte-unchanged (compare the `.blk` bytes before and after).
2. The same call with `--yes`, on a temp copy:
   - stdout ends `committed`;
   - the copy's `.blk` differs in exactly 1 byte, at index 0.
3. `rect` (2×2) and `bucket` on a temp copy, dry run: the summaries name the right block counts. Assert the counts with the Task 2 functions run in-test on the same input.
4. Refusals:
   - `--metatile 200` with `--yes` throws `metatile-out-of-range` and writes nothing;
   - `paint CeruleanCave2F ... --yes` throws `layout-not-writable` and prints the size defect `warning:` to stderr.
5. `diff` never writes, even when the handler is called with `yes: true`-shaped args. Mirror GBA's "always a dry run" test.
6. `event move NewBarkTown --kind warp --index 0 --x 12 --y 4 --yes` on a temp copy: the copy's asm contains `\twarp_event  12,  4, ELMS_LAB, 1`, and nothing else differs. Compare against `moveGbcEvent` run in-test on the original text.
7. `event add NewBarkTown --kind bg --args "1, 2, BGEVENT_READ, NewBarkTownSign"`, dry run: `maps/NewBarkTown.asm -- event block edited`. With `--yes`, the copy's asm equals `addGbcEvent`'s output.
8. Each of these refuses with a named error and writes nothing:
   - `event add ... --kind object --args "<13 args>" --const lower_case`;
   - `event add --kind warp` with an unknown map const;
   - `event delete NewBarkTown --kind object --index 0` (const referenced);
   - `--index 1.5`;
   - `--kind foo`;
   - `--const` with `--kind bg`.
9. `event delete NewBarkTown --kind warp --index 0` (dry run):
   - stderr has one `warning:` line per retarget hit;
   - the hit set equals an independent in-test scan, and includes ElmsLab's warp to `NEW_BARK_TOWN 1`.
10. On a GBA root (`resolveRoot` of the configured GBA subject; skip if absent), `event move ...` refuses with the GBC-only message. GBA `paint`/`diff` behaviour is unchanged: `packages/cli/test/writeCommands.test.ts` passes untouched.
11. One real process test, using the existing `spawnSync(process.execPath, ["--import", "tsx", CLI_ENTRY, ...])` helper: `--project <tmpCopy> paint NewBarkTown --tool pencil --x 0 --y 0 --metatile <id> --yes` exits 0, and the copy changed. A second one, with `--metatile abc`, exits 1 with `pokemap: ` on stderr.

## Teeth-proof

| ID | Mutation | Must go red |
|---|---|---|
| C1 | dry run commits anyway | 1 |
| C2 | `diff` honours `yes` | 5 |
| C3 | `--yes` with refusals calls commit (skips the throw) | 4 (the funnel still throws, so assert the refusal *message format*, i.e. the CLI's own throw) |
| C4 | event delete uses disk warps for the deleting map (after a prior in-session warp edit), or drops self-map hits | 9 (add a sub-case that deletes warp 1 when warp 0's own dest points at itself, or use a synthetic `maps` input through an exported helper) |
| C5 | NaN numeric option accepted | 8 |
| C6 | `event` on GBA doesn't refuse | 10 |
| C7 | rect origin ignored (`origin 0,0`) | 3 (use a rect not at 0,0 with a 2×1 stamp? No: 1×1 stamp makes origin irrelevant, so this is **equivalent**; record it as such, don't test it) |

## Rules

Same as earlier tasks: TDD, a commit per green step, pathspec commits, never git checkout/restore/stash, run single test files, `npm run typecheck` before each commit, and never write the real PerfPlus or GBA subject. Existing CLI tests stay byte-unchanged; the U1 check is `git diff <base> -- packages/cli/test/ | grep -c '^-[^-]'` = 0.
