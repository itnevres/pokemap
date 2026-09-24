# Plan 6 Task 10: CLI read commands (re-granularised 2026-09-24 against real code)

Binding sources:
- The plan's Task 10.
- Findings §"Config and family decision", Decision 2 (probe-based family, same `pokemap` binary).
- "Consequences → Task 10".
- Real code: `packages/cli/src/{index,context,png,args}.ts`, `packages/core/src/family.ts` (`detectEngineFamily`), and Task 9's `packages/core/src/gbc/project.ts` (`openGbcProject`) and `packages/core/src/gbc/render/map.ts` (`renderGbcMap`, `GbcMapRaster`, `RenderGbcMapOptions`).

## Scope change (coordinator decision, recorded here)

The plan lists `render`/`query`/`where`/`coverage` for Task 10. `where`/`coverage` (and a GBC `encounters`) need per-source chance math (slot % × rate, rod-record deltas, headbutt/rock), which is Task 12's atlas core. Writing it here would put analysis logic in the CLI, or duplicate it later. So:
- **Task 10:** the family branch, GBC `render`, GBC `query`, and named refusals for every other command on a GBC root.
- **Task 11:** adds GBC `render-world`.
- **Task 12:** adds GBC `encounters`/`where`/`coverage` on top of its core.

## Deliverables

1. **`packages/cli/src/context.ts`**
   - Factor the existing root resolution (`--project` > `pokemap.config.json` `projectPath`, with all the current refusal messages unchanged) into `resolveRoot(explicit?: string): string`.
   - Keep `resolveProject(explicit)` as `openProject(resolveRoot(explicit))`, with byte-identical behaviour and messages for GBA.
   - GBC users pass `--project`. That is per the findings; `cfg.gbc.projectPath` is test-only config, not a CLI fallback. Do not add a config fallback for GBC.
2. **Family branching in `packages/cli/src/index.ts`**
   - Every command resolves the root once and branches once on `detectEngineFamily(root)`, via a small shared helper so the branch isn't hand-copied 11 times.
   - GBA paths must be behaviourally unchanged.
   - Caveat: `detectEngineFamily` throws its own "does not look like a gba or gbc decomp project root" message for a bogus root. That replaces `openProject`'s fieldmap.h message on the CLI path, which is acceptable and matches the findings. Grep `packages/cli/test` and `packages/server/test` for tests asserting the old text; none are expected (the coordinator grepped: 0 hits), but re-check.
   - Every GBA-only command refuses on a GBC root with one consistent named message, e.g. `pokemap: <cmd> is not supported for gbc (pokecrystal-family) projects yet`. Those commands are `render-world` (until Task 11), `validate`, `encounters`/`where`/`coverage` (until Task 12), `sign suggest|add|list`, `paint` and `diff`.
   - The refusal happens BEFORE any GBA loader runs, and there is no write path (G7: never touch the subject).
3. **`packages/cli/src/gbcCommands.ts`**: thin handlers that return values, so they're testable without spawning.
   - **`runGbcRender(root, mapName, { out, border, time })`**
     - Uses `openGbcProject` + `renderGbcMap` and writes `encodePng(raster)` to `out`.
     - Returns `{ stdout, stderr }` strings. stdout = `<out> <w>x<h> outOfRange=<n> unmapped=<n>\n`. stderr = one `warning: <defect.message>\n` per `DataDefect` (the plan-wide rule that the CLI prints data-defect warnings).
     - `render <map>` gains `--time <morn|day|nite>` (default day), validated in `args.ts` style with a named refusal.
     - `--border` reuses `parseBorder`. Check `args.ts`'s bound: if it caps at a GBA value, keep that for GBA; for GBC, the renderer already refuses > `paddingWidth()`.
     - Accepts a GBC map name (`NewBarkTown`). Accepting a `.blk` stem is optional; skip it.
   - **`runGbcQuery(root, mapName, { header, connections, events })`**
     - Returns the JSON string. Mirror the GBA `query` flag semantics exactly: no flag = all.
     - `header` = the `GbcMap` fields minus `connections`, plus `layout: { blkPath, width, height, writable }` from `proj.layout(map)`.
     - `connections` = `map.connections`.
     - `events` = `loadGbcMapEvents(root, map).events`.
     - Any defects (layout and events) go to stderr as warnings, same format as render.
   - The `index.ts` action wiring writes stdout/stderr and sets `process.exitCode`.
4. **Tests.**
   - `packages/cli/test/gbcCommands.test.ts`, using `itWithGbcCorpus` from `packages/core/test/gbc/helpers/corpus.ts`. Output files go to `os.tmpdir()`/a mkdtemp dir, never the repo or the subject.
     - `runGbcRender` NewBarkTown: the PNG decodes back to exactly `renderGbcMap(openGbcProject(root), "NewBarkTown")`'s `data`. Use the existing `packages/cli/src/png.ts` decode helper if there is one; otherwise `zlib.inflateSync` + unfilter, the way `png.test.ts` does. Two runs are byte-identical (success criterion 1). The stdout line is exact.
     - `runGbcRender` CeruleanCave2F: stderr carries exactly one `warning:` line naming its `.blk`. NewBarkTown stderr is empty.
     - `--border 3`: the dimensions are exact ((w+6)*32).
     - `runGbcQuery` NewBarkTown: exact header fields (tileset TILESET_JOHTO, environment TOWN, palette PALETTE_AUTO, fishGroup FISHGROUP_OCEAN, border 5, group 24), connections (count and directions as measured), events (measured counts per kind), and `--header` only includes no `events` key.
   - **Spawned end-to-end:** 3 tests only, each spawning via `npx tsx packages/cli/src/index.ts` from the repo root.
     - `--project <gbc> render NewBarkTown -o <tmp>` exits 0 and prints the stdout line.
     - `--project <gbc> sign list NewBarkTown` exits 1 with the named refusal on stderr, and never touches GBA loaders.
     - `--project <gbc> query NoSuchMap` exits 1 with the loader's "unknown map" message.
     - Mark them with a generous timeout.
   - **Unit** (no corpus): `resolveRoot` with explicit/config/missing-config cases. `resolveProject`'s existing tests stay green unmodified.
   - Grep `packages/*/test/**` for any map name you use before adding a test. Everything here is read-only against the subject.
5. **Mutation-check.** At minimum:
   - drop the defect→stderr loop;
   - swap the family branch (gbc→gba handler);
   - remove one GBA-only refusal (e.g. `paint`) so it falls into the GBA path;
   - `--header` including events;
   - default time `nite`;
   - the render writes a non-deterministic field.
   Record which test went red for each.
6. **Live-verify (the coordinator will also do this).** Run `npx tsx packages/cli/src/index.ts --project /home/user/pokecrystal-PerfPlus render NewBarkTown -o <scratch>/nbt.png` and view the PNG. Do the same with `--border 3 --time nite` and for ElmsLab. Describe what you see in the report.

## Out of scope
- Server/UI: no GBC server work in Plan 6, per the findings.
- `render-world`: Task 11.
- `encounters`/`where`/`coverage`: Task 12.
- No write commands for GBC.
