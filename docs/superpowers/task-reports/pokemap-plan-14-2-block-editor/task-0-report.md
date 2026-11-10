# Task 0 implementer report

Status: BLOCKED (implementation prepared; execution checks blocked; one additional git-dependent test needs a scope ruling).

## Scope and baseline

- High risk: this harness owns filesystem containment, copy failure cleanup, worker configuration and real-root mutation detection.
- Starting HEAD: `f651851ab2169147fe75220a14fabe57111dcc21`. Initial `git status --short` was empty. Worked in the supplied scratch worktree. No commits, merges, pushes, subagents or reviews.
- Delegate skill read before implementation/bulk inspection. Inline work follows the explicit implementer brief's no-subagent instruction; no offload provider was used. No pre-existing changes needed recovery.
- Intended detection: the focused Vitest command must collect 11 new tests covering missing environment, containment/case aliases/junctions, independent copies, basename preservation, absent roots, manifests, unsafe cleanup, teardown failure, partial-copy cleanup, worker environment and two real-corpus scratch render checks. Typecheck must exit zero. Neither check executed past the shell restriction.

## Changes

Added `TestConfig`, `testConfig()` with no real-config fallback, explicit-root copy and containment functions, metadata manifests, SHA-256 content manifests, and owned scratch-directory creation/cleanup. Scratch directories use `pokemap-test-roots-` under the real `os.tmpdir()`. Cleanup requires in-process ownership, that unique prefix, a direct real-tmpdir parent, physical containment, and a non-link target before recursive removal.

Global setup reads the real config only to enumerate inputs, adds the existing optional Yellow location, records source manifests, independently copies source bytes via `fs.cpSync({ dereference: true })`, validates copies, writes the scratch config, and publishes `POKEMAP_TEST_CONFIG` and `POKEMAP_HOME`. It precedes the unchanged immutable `subjectSnapshotSetup.ts`. Copy/setup failure cleans the owned partial directory. Teardown checks every real root and aggregates changed/added/removed filenames, removes scratch even after manifest failure, restores prior environment variables, and throws on detected changes. `setupTestRoots(config, scratch)` exposes the same lifecycle to sentinel tests without reading the actual config.

Both corpus helpers keep their exports and skip predicates. All direct corpus config readers now call `testConfig()`. Yellow receives a scratch path even if absent. Each copied root lives at `<scratch>/<n>/<basename>`; normalized forward slashes retain the existing basename matching behavior.

The two authorized git exceptions now compare complete content manifests, including binary/untracked files and additions/deletions. CLI children assert an explicit, nonempty `--project` argument. All current CLI spawn sites supply either a redirected root or a further temp copy. No current server test spawns `serve.ts --gbc`; no new cwd-config fallback calls were introduced. `context.test.ts` still exercises production cwd-config fallback using its existing disposable cwd/temp-config fixtures.

The UI Root mock now uses the GBC scratch root instead of a hardcoded corpus path. The event inspector's corpus-source comment was generalized; its fixture and all assertions are unchanged. No production UI changed.

## Copy allow-lists

GBA folders/files:

- `data/`, `include/`, `src/`
- `graphics/tilesets/`, `graphics/object_events/`, `graphics/pokemon/`
- `charmap.txt`, `porymap.project.cfg`, `.pokemap/`

GBC/Yellow folders/files:

- `data/`, `constants/`, `maps/`, `home/`, `engine/`
- `gfx/tilesets/`, `gfx/tilesets.asm`, `gfx/tileset_palette_maps.asm`
- `gfx/pokemon/`, `gfx/pics.asm`, `gfx/overworld/`, `gfx/sprites/`
- `porymap.project.cfg`, `.pokemap/`

All copies exclude nested `.git` and `build` directories and these generated extensions (case-insensitive): `.o`, `.a`, `.elf`, `.gba`, `.gbc`, `.gb`, `.map`, `.sym`, `.sav`, `.srm`, `.1bpp`, `.2bpp`, `.4bpp`, `.8bpp`, `.lz`, `.gbapal`. Committed PNG/PAL/BIN/BLK and text sources remain available. No hard links or junctions are created by the copier.

Loader evidence: `config/paths.ts`, `load/tilesets.ts`, `load/tilesetData.ts`, GBC load modules for maps/tilesets/palettes/roofs/sprites, `addEvent/gbaOptions.ts` and `test/helpers/gbaTempProject.ts`. GBA free-slot detection scans all `src/` text files, so limiting that folder to `src/data/` would change test behavior. `charmap.txt` is a required add-event input. Species renderers require GBA `normal.pal`/icons and GBC front PNGs. The allow-lists include ignored sidecars and Porymap configuration independently of git tracking.

Real-root metadata manifests cover all files in every allow-listed entry (including generated/ignored files there, even when not copied) plus every top-level regular file. Each entry records relative path, size and mtimeMs. Absent roots still map to nonexistent scratch locations. The manifest format follows the brief; it cannot distinguish an edit that preserves both size and mtimeMs.

## Recent-project history

`packages/server/src/recent.ts` resolves `recentHome(home)` as explicit `home`, then `POKEMAP_HOME`, then `join(homedir(), ".pokemap")`; its file is `recent.json`. Setup sets `POKEMAP_HOME=<scratch>/home`, so default server history is `<scratch>/home/recent.json`, not the user's home. Existing tests with explicit temporary homes remain isolated. Setup restores the previous environment value on teardown/failure.

## Every touched file

1. `packages/core/test/helpers/testRoots.test.ts` (new; written before implementation)
2. `packages/core/test/helpers/testRoots.ts` (new)
3. `packages/core/test/helpers/testRootsSetup.ts` (new)
4. `vitest.config.ts`
5. `packages/core/test/helpers/corpus.ts`
6. `packages/core/test/gbc/helpers/corpus.ts`
7. `packages/core/test/family.test.ts`
8. `packages/core/test/write/corpus.test.ts`
9. `packages/cli/test/gbcCommands.test.ts`
10. `packages/server/test/gbcEditRoutes.test.ts`
11. `packages/ui/test/gbc/Root.test.tsx`
12. `packages/ui/test/gbc/GbcEventInspector.test.tsx`
13. This report: `docs/superpowers/task-reports/pokemap-plan-14-2-block-editor/task-0-report.md`

`packages/server/test/hub.test.ts` needs no change: its Yellow match asserts an error message for a fake temp root. `context.test.ts` and `subjectSnapshotSetup.ts` remain unchanged reviewed readers. Existing test assertions remain unchanged except the two authorized git-status conversions and the specifically requested explicit-project spawn guard.

## Commands and evidence

1. After writing the new test file and before creating its implementation: `npx vitest run packages/core/test/helpers/testRoots.test.ts`.
   - Exit 1 before Vitest started: `npx : File C:\Program Files\nodejs\npx.ps1 cannot be loaded because running scripts is disabled on this system.`
   - `PSSecurityException`, `UnauthorizedAccess`. No collected tests, no observed red assertion/import failure, and no setup/copy activity.
2. After implementation/path changes: `npm run typecheck`.
   - Exit 1 before npm started: `npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.`
   - `PSSecurityException`, `UnauthorizedAccess`. Typecheck did not run.
3. `git diff --check`: exit 0, no output.
4. `file` on all nine edited existing TypeScript/config files: all retain CRLF. UTF-8 files remain UTF-8; no encoding rewrite was used. New files use LF.
5. Root-reader grep: `rg -n 'pokemap.config.json|Pokemon Game|pokecrystal-PerfPlus|pokeyellow' packages -g '**/test/**'`.
   - Config/path readers remaining are only `testRoots*.ts`, unchanged `subjectSnapshotSetup.ts`, and the sanctioned temporary config fixtures in `context.test.ts`.
   - Other matches are `family.test.ts` and `hub.test.ts` test names/error-message assertions containing `pokeyellow`; they name no real path and read no config. Preserved as required rather than weakening assertions to satisfy a textual zero-match grep.
6. Git read commands succeeded with warnings that the user-level git ignore file could not be accessed. No git-writing commands were issued.

Per the sandbox note, no `.cmd` wrapper, execution-policy override, direct compiler runner, alternate shell or other workaround was attempted. No other test file, package suite, full gate, build, mutation runner or live UI test was run.

## Measurements and conductor follow-up

- Actual corpus files copied / bytes: **unavailable**, because the focused Vitest process never started. The harness logs `Test roots setup: <files> files, <bytes> bytes, <milliseconds> ms`.
- Actual setup / teardown time: **unavailable** for the same reason. Teardown logs its elapsed milliseconds, including manifests and removal.
- Full-gate time versus baseline: **not measured; explicitly prohibited for this implementer**. Supplied baseline is 4,416 passing / 1 environment failure / 254 files; no baseline duration was provided. There are 11 new tests in one new file; two render tests explicitly skip if their corpus is absent.
- Worker environment propagation, actual GBA/PerfPlus scratch rendering, source-manifest teardown success, source HEAD/porcelain integrity and sentinel mutations remain to be executed by the conductor. No real root was written, moved or deleted by this session; no harness setup ran. No complete before/after source HEAD/porcelain evidence is claimed.
- Expected runtime tradeoff: repeated `testConfig()` calls validate the copied root trees, including link containment. Windows copy/metadata traversal and multiple consumers can be costly. No measurement supports a performance claim yet.

## Unresolved additional git dependency

`packages/core/test/gbc/write/writeGate.test.ts:76` also invokes `git -C <corpus root> status --porcelain`, with a before/after comparison at lines 249/255. This was not among the two allowed assertion exceptions. A corpus root in the new OS-temp scratch tree has no `.git` and no enclosing repository, so that test's command will fail rather than produce a status string. I asked whether to convert this third check to the same before/after content manifest; no approval was available when preparing this report, so the file is unchanged. The conductor must authorize/perform this narrow conversion before expecting a full gate pass. Do not copy `.git` or point it back at a real repo as a workaround.

The work is uncommitted and cannot be reported as verified. The conductor must run the permitted focused test and typecheck, address any failures, settle the third git check, and then perform the full gate/build/source-integrity evidence and timing required by the parent task.
