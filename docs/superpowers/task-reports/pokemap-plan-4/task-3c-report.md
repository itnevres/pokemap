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

## Review round 1

Spec review (Opus) and quality review (Opus) both returned CHANGES NEEDED. Master rulings applied: tools always listed and refuse without the flag, naming it; hub check fails closed; hub address injectable; `--project=` accepted; open question 1 moved out of "Open:".

Fixed:
- Spec 1 / quality 13 (flag): write tools are always registered. Without `allowWrites` each refuses (dry run too) with a message naming `--allow-writes`. Plan ruling updated, still marked as the master's call. Tests: all five tools, both dry modes; plus a stdio spawn of index.ts with and without the flag.
- Spec 2 / quality 1 (fail open): `hubRunning` is now a TCP connect (3 s timeout). Only ECONNREFUSED means "not running"; an accepted connection, any answer, a timeout or any other error means "running". Tests: refused port; HTTP listener; accept-and-never-answer listener; all five write tools refused against each fake hub with files byte-identical; dry run passes through.
- Quality 3 (real port 5174): `ServerOptions.hubAddress` (tests only). Every test uses a known-closed ephemeral port or an ephemeral fake hub; no test skips or depends on PokeMap being open.
- Quality 2 / spec 5 (`--project`): new `src/args.ts` with strict `parseArgs`: `--project <p>` and `--project=<p>`; a missing value or an unknown option exits 2 at startup; startup logs project and write state to stderr. Tests in `test/args.test.ts`.
- Spec 3: open question 1 moved into the Rulings; the remaining open item renumbered. Spec 4: the `dry_run` skip recorded in the ruling as a 3c implementation note.
- Spec 6, quality 11: tests assert the dry-run text and a diff body (`map.bin`).
- Spec 7, quality 4: indicator_add test uses asymmetric x/y, elevation 3, and checks the added object event and script; a rect test covers x1/y1.
- Spec 8 / quality 5: dash-refusal cases pass `dry_run: true`.
- Quality 8: write calls serialized through a promise chain. Quality 9: `const: ""` no longer dropped. Quality 12: handler variable `text` renamed `msg`; no HTTP body left to cancel.
- Spec 9: one exported `HUB_ADDRESS`. The coupling is recorded here: if the hub moves off 5174 (row 1a port 0, Electron), pass its address to the MCP server.

Left, with reasons:
- Quality 6 (300 s kill of a write mid-commit): needs a change to the shared runCli timeout; follow-up.
- Quality 7 / spec 10 (window between check and commit): inherent in checking before the CLI spawn; moving the probe into the CLI is a larger change.
- Quality 10: the hub suite copies the corpora in beforeAll, so it errors rather than skips without them.
- Spec 7 remainder: `const` (object add) and GBC `bucket` mappings still have no write test.
- Quality 12 remainder: the CLI's own "pass --yes" dry-run wording is the CLI's text, left verbatim.

Verification and mutation results: see the end of this section.

## Verification and review round 2 (master, 2026-11-22)

- At `76683b2` (under the machine-wide test lock): typecheck pass; `packages/mcp` 46/46. Mutations, each caught (tests red): fail-open hub check (6 tests), flag refusal removed (1), `--project=` form broken (1); sources restored, tree clean.
- Opus re-review (`review-3c-rereview-opus.md` in the master's overnight notes): every round-1 Important finding fixed; the items left in round 1 are acceptable to merge. One new Important: an empty `--project` value (`--project=`, `--project ""`) was accepted and the CLI would fall back to `pokemap.config.json` (possibly a real game). Fixed by the master: `parseMcpArgs` throws "--project needs a path" on an empty or blank value; three test cases added. Six minor findings are left open (listed in the PR).
