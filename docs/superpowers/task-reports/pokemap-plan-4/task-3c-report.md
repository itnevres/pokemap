# Plan 4 row 3c: MCP write tools behind `--allow-writes`

Tier: High (writes to subject source repos).

## Spec

Ruling for open question 1 (the master session's call overnight on the user's "make your best call"; the user may change it): the write tools never go around a running app. Before any write, the tool does an HTTP GET to `http://127.0.0.1:5174/api/hub` with a 500 ms timeout. Any HTTP answer means a hub is running, and the tool refuses with a message telling the user to close PokeMap first. No answer (refused, timed out) means no hub, and the write proceeds.

Registration: the write tools are not registered at all unless the server starts with `--allow-writes` (`index.ts`, `ServerOptions.allowWrites`). Without the flag they are absent from `tools/list`.

Every write tool spawns the real CLI write command with `--yes` (same `runCli` as the read tools: timeout, verbatim CLI text, non-zero exit is an error). The CLI runs the same core functions and the normal save funnel (all-or-nothing). No new write path, no git (D33). Every string argument goes through `dashRefusal` before anything runs. Each tool takes `dry_run` (default false): true omits `--yes`, returns the plan, writes nothing, and skips the hub check (nothing is written).

| Tool | CLI command | Family | Arguments |
|---|---|---|---|
| `pokemap_paint` | `paint <map> --tool .. --x .. --y .. [--x1 --y1] --metatile .. --yes` | both | map, tool (pencil/rect/bucket), x, y, x1?, y1?, metatile, dry_run? |
| `pokemap_indicator_add` | `indicator add <map> --species --text --x --y [--elevation] --yes` | GBA | map, species, text, x, y, elevation?, dry_run? |
| `pokemap_event_move` | `event move <map> --kind --index --x --y --yes` | GBC | map, kind, index, x, y, dry_run? |
| `pokemap_event_add` | `event add <map> --kind --args [--const] --yes` | GBC | map, kind, args (comma list), const?, dry_run? |
| `pokemap_event_delete` | `event delete <map> --kind --index --yes` | GBC | map, kind, index, dry_run? |

Refusals: hub running; dash-leading string argument; the CLI's own refusals (wrong family, guard codes) verbatim. The result carries the CLI's plan/diff text.

Tests: `packages/mcp/test/writes.test.ts`, on scratch copies only.

## Results

Write tests: `packages/mcp/test/writes.test.ts`, 17 tests (registration, dash refusal x7, five tools refused with a fake hub on 5174 and files byte-identical, dry run with hub up, GBA paint/indicator_add, GBC paint/event_move/add+delete round trip, CLI refusal verbatim, GBC tools on a GBA root). Scratch copies only (fresh cpSync of the test-roots subject; copyGbcSubjectToTemp). If something already answers on 5174 the write-success cases skip with a message.

Mutation checks (writes.test.ts):
- hub check removed (`false && ...`): 5 hub-refusal tests red.
- `--allow-writes` gate removed (`if (true)`): "lists the write tools only with allowWrites" red.
- paint x/y mapping swapped: first run stayed green (test coordinates were symmetric: x=y); tests changed to x=3,y=1 (GBA) and x=2,y=0 (GBC); rerun: GBA and GBC paint tests red. Restored afterwards.
