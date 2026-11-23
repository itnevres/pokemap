# PokeMap agent guide

For AI agents that read, check or edit a decomp project through PokeMap. There are two surfaces: the CLI (`packages/cli`) and the MCP server (`packages/mcp`). The MCP server runs the CLI, so both give the same results and the same refusal text. Both families are covered: GBA (pokeemerald-family) and GBC (pokecrystal-family). The engine family is detected from the project root.

## Rules first

1. **Close PokeMap before you write.** CLI and MCP writes go straight to the project files. They do not go through a running PokeMap hub. An open editor session keeps the old state of the file, so its next save is refused as changed on disk. The hub also keeps caches. Close the PokeMap window and stop its hub before any `--yes` write or any MCP write call.
2. **Writes are previewed by default.** The CLI write commands print the plan and write nothing unless you add `--yes`. There is no `--dry-run` flag in the CLI: a dry run is what you get without `--yes`.
3. **The MCP write tools are off by default.** Start the server with `--allow-writes` to enable them.
4. **Refusals come back verbatim.** Each refusal reads `code (subject): message -- fix`. Read the fix text and act on it. Do not paraphrase or work around it.
5. **Look at your work.** Render the map and view the image before and after an edit.
6. **Never write into a project you were not asked to change.** Use a scratch copy for experiments.

## The CLI

Run it from the repo root:

```powershell
npm run pokemap -- <command> [options]
```

or `npx tsx packages/cli/src/index.ts <command> [options]`. Put the global option before the command:

```
--project <path>    (also -p)  the decomp root
```

If `--project` is missing, the CLI reads `projectPath` from `pokemap.config.json` in the current directory. It does not search parent folders. For a GBC project, always pass `--project`: the config's `gbc.projectPath` is not used by the CLI.

Coordinates for paint and render-world are in tiles for GBA and in blocks for GBC. Event commands use event steps (16 px), which is half a GBC block.

### Read commands

| Command | Options | Families | Notes |
|---|---|---|---|
| `render <target>` | `-o, --out <file>` (default `out.png`), `--border <rings>` (0 to 1000, default 0), `--time <morn\|day\|nite>` (GBC only, default `day`) | both | `<target>` is a map or layout name. GBA prints `<file> <W>x<H> outOfRange=<n>`. |
| `render-world` | `--bbox <x,y,w,h>` (required), `-o, --out <file>` (default `world.png`), `--scale <n>`, `--no-dungeons` (GBA only), `--time <morn\|day\|nite>` (GBC only) | both | Region of the stitched world. Default scale is 4 px per tile on GBA and 8 px per block on GBC. |
| `query <map>` | `--header`, `--connections`, `--events` | both | JSON: header, layout, resolved split, connections, events. No option prints all. |
| `validate` | `--metatile-range`, `--palette-range`, `--json` | GBA | No check selected runs both. Exit code 1 when there are findings. GBC refuses. |
| `encounters <map>` | `--json` | both | True percentages per method. |
| `where <species>` | `--json` | both | Every map a species can be caught on. `RATTATA` and `SPECIES_RATTATA` both work. |
| `coverage` | `--empty`, `--unused`, `--json` | both | Encounter design gaps. |
| `indicator suggest <map>` | none | GBA | Ranks catchable species and suggests a spot. Read only. |
| `indicator list <map>` | none | GBA | Lists the Pokémon Indicators on a map. Read only. |
| `diff <map>` | `--tool <pencil\|rect\|bucket>`, `--x <n>`, `--y <n>`, `--x1 <n>`, `--y1 <n>`, `--metatile <id>` | both | Always a dry run. `--tool`, `--x`, `--y` and `--metatile` are required. `bucket` is GBC only. |

`diff` shows the plan for a paint given on the command line. It does not see pending changes in an open editor session. Those exist only inside the running hub.

### Write commands

Each prints the plan and writes nothing unless you add `--yes`. With `--yes`, any refusal stops the write and is printed.

| Command | Options | Families |
|---|---|---|
| `paint <map>` | `--tool <pencil\|rect\|bucket>`, `--x <n>`, `--y <n>`, `--x1 <n>`, `--y1 <n>`, `--metatile <id>`, `--yes` | both (`bucket` GBC only) |
| `indicator add <map>` | `--species <name>`, `--text <text>`, `--x <n>`, `--y <n>`, `--elevation <n>` (default 0), `--yes` | GBA |
| `event move <map>` | `--kind <warp\|coord\|bg\|object>`, `--index <n>`, `--x <n>`, `--y <n>`, `--yes` | GBC |
| `event add <map>` | `--kind <warp\|coord\|bg\|object>`, `--args <list>`, `--const <NAME>` (object only), `--yes` | GBC |
| `event delete <map>` | `--kind <warp\|coord\|bg\|object>`, `--index <n>`, `--yes` | GBC |

Required options: `paint` needs `--tool`, `--x`, `--y`, `--metatile`. `rect` also takes `--x1` and `--y1` for the second corner. `indicator add` needs `--species`, `--text`, `--x`, `--y`. `event move` needs `--kind`, `--index`, `--x`, `--y`. `event add` needs `--kind` and `--args`. `event delete` needs `--kind` and `--index`. `--index` is the 0-based position within that kind of event. `--args` is the macro's full argument list in source order, comma separated: 4 values for warp, coord and bg, 13 for object.

A command used on the wrong family refuses with a message such as `validate is not supported for gbc (pokecrystal-family) projects yet` or `event move is not supported for gba projects (GBC-only today)`.

Example, a dry run and then the write:

```powershell
npm run pokemap -- --project "C:/path/to/decomp" paint Route101 --tool rect --x 3 --y 4 --x1 6 --y1 5 --metatile 12
npm run pokemap -- --project "C:/path/to/decomp" paint Route101 --tool rect --x 3 --y 4 --x1 6 --y1 5 --metatile 12 --yes
```

## The MCP server

Start it from the repo root:

```powershell
node --import tsx packages/mcp/src/index.ts [--project <decomp root>] [--allow-writes]
```

It speaks MCP over stdio, so register that command as a stdio server in your MCP client.

| Flag | Meaning |
|---|---|
| `--project <path>` or `--project=<path>` | The decomp root every tool uses. Omitted: the CLI falls back to `pokemap.config.json`. An empty value is a startup error. |
| `--allow-writes` | Turns the write tools on. Off by default. |

An unknown option or a missing value exits with code 2. On start it prints one line to stderr: `pokemap-mcp: project <path>, writes ENABLED|disabled`.

Every tool runs the CLI, so a tool result is the CLI's stdout, with stderr added. A non-zero exit becomes an error result carrying the CLI's own text. A free-form argument (map, target, species, and so on) that starts with `-` is refused.

### Read tools

Read tools always work.

| Tool | CLI command | Families | Input |
|---|---|---|---|
| `pokemap_render` | `render` | both | `target`, optional `border`, optional `time` (GBC) |
| `pokemap_render_world` | `render-world` | both | `x`, `y`, `w`, `h`, optional `scale`, `dungeons` (GBA; `false` drops dungeon maps), `time` (GBC) |
| `pokemap_map_info` | `query` | both | `map`, optional `section` (`header`, `connections` or `events`) |
| `pokemap_validate` | `validate` | GBA | optional `check` (`metatile-range` or `palette-range`) |
| `pokemap_encounters` | `encounters --json` | both | `map` |
| `pokemap_where` | `where --json` | both | `species` |
| `pokemap_coverage` | `coverage --json` | both | none |
| `pokemap_indicator_suggest` | `indicator suggest` | GBA | `map` |
| `pokemap_indicator_list` | `indicator list` | GBA | `map` |
| `pokemap_diff` | `diff` | both | `map`, `tool`, `x`, `y`, `metatile`, optional `x1`, `y1` |

`pokemap_render` and `pokemap_render_world` return the PNG as image content, then the file path and size as text. The file is written into a fresh temp folder named `pokemap-mcp-*`. `pokemap_validate` returns findings as JSON; findings are a result, not an error. `pokemap_diff` never writes and does not see an open editor session's pending changes.

### Write tools

The write tools are always listed. Without `--allow-writes`, each one refuses, and the message names the flag:

```
pokemap_paint: write tools are disabled; restart the MCP server with --allow-writes to enable them
```

| Tool | CLI command | Families | Input (besides `map`) |
|---|---|---|---|
| `pokemap_paint` | `paint --yes` | both | `tool`, `x`, `y`, `metatile`, optional `x1`, `y1` |
| `pokemap_indicator_add` | `indicator add --yes` | GBA | `species`, `text`, `x`, `y`, optional `elevation` |
| `pokemap_event_move` | `event move --yes` | GBC | `kind`, `index`, `x`, `y` |
| `pokemap_event_add` | `event add --yes` | GBC | `kind`, `args`, optional `const` |
| `pokemap_event_delete` | `event delete --yes` | GBC | `kind`, `index` |

Each takes an optional `dry_run: true`. A dry run returns the plan, writes nothing, and skips the running-app check below. Without `dry_run`, the result is the save plan, so you see what was written. Calls run one at a time.

**Close PokeMap first.** Before a real write, the tool opens a TCP connection to `127.0.0.1:5174`, the default hub address. Only a refused connection counts as "not running". An accepted connection, a timeout (3 seconds) or any other error counts as "running", and the tool refuses:

```
pokemap_paint: PokeMap is running (a hub is listening on 127.0.0.1:5174). Close PokeMap first, then call this tool again; writing around a running app would make its next save fail as changed on disk.
```

The check looks only at port 5174. If you started the hub on another port, it will not see it, so close PokeMap yourself. The CLI does no such check at all.

## The render-and-look workflow

Use this loop to check your own work without an emulator or a ROM build.

1. **Look first.** `pokemap_render` (or `pokemap render <map> -o <file>`) and view the image. Use `pokemap_map_info` for the layout, split and events.
2. **Preview the edit.** `pokemap_diff`, or a write tool with `dry_run: true`, or a CLI write command without `--yes`. Read the plan and any refusals.
3. **Write.** Close PokeMap, make sure the MCP server has `--allow-writes`, and call the write tool (or add `--yes`).
4. **Look again.** Render the same map and view the image. If it is wrong, adjust and repeat from step 2.
5. **Check.** On GBA, run `pokemap_validate`. Use `pokemap_encounters`, `pokemap_where` and `pokemap_coverage` for encounter work.

For a wider view, `pokemap_render_world` draws a region of the stitched world.

Render for a map or a layout name gives the same pixels as the editor, because both call the same function.

## Refusals you will meet

Refusals come from the save guards and are returned unchanged. Examples:

| Code | Family | Meaning and fix text |
|---|---|---|
| `missing-layout-version` | GBA | The layout has no `layout_version`. Fix: run `python tools/donors/classify_layout_versions.py --write`, then reopen. |
| `metatile-out-of-range` | both | The metatile id is out of range for this layout's split. Pick an id below the boundary the split resolves. |
| `border-size-mismatch` | GBA | The border is not `borderWidth` x `borderHeight`. Do not change border size from a block edit. |
| `warp-tile-moved` | GBA | The block under a warp changed but the warp did not move. Move the warp or paint elsewhere. |
| `blocks-length-changed` | GBC | The block count would change. A block edit repaints existing blocks; it must never add or drop one. |
| `object-const-desync` | GBC | The object_event count and the `object_const_def` count changed by different amounts. Add or remove the matching `const` line with every object_event. |
| `file-changed-on-disk` | GBC | The file on disk is no longer what the session opened. Reopen the map, then redo the edit. |

The list is not complete. Always read the `fix` text in the result.

## Both families at a glance

| | GBA | GBC |
|---|---|---|
| Detected by | `include/fieldmap.h` | `data/maps/attributes.asm` and `constants/map_constants.asm` |
| Unit for paint and render-world | tile | block |
| `validate`, `indicator` commands | yes | refused |
| `event move/add/delete` | refused | yes |
| `--time` | ignored | `morn`, `day`, `nite` |
| `--no-dungeons` | yes | ignored |
| `--project` | optional, falls back to `pokemap.config.json` | always pass it |
