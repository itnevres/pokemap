# Plan 4 row 3a: MCP package, read tools

Tier: Medium (ordinary feature over connected components; every wrong answer fails a test; no write path, no parsing of its own).

## Files
- `packages/mcp/package.json` (deps: `@modelcontextprotocol/sdk` ^1.32.2, `zod` ^3.25.0), `package-lock.json`
- `packages/mcp/src/runCli.ts`: spawns the real CLI (`node --import tsx packages/cli/src/index.ts --project <root> ...`) and returns status/stdout/stderr.
- `packages/mcp/src/server.ts`: `createPokemapServer({ project, outDir })`, the ten read tools.
- `packages/mcp/src/index.ts`: stdio entry, `--project <root>`.
- `packages/mcp/test/server.test.ts`: in-memory MCP client harness against the scratch subject copies, both families.

## Tools
`pokemap_render`, `pokemap_render_world` (return the PNG path and size as text; image content is row 3b), `pokemap_map_info`, `pokemap_validate` (GBA), `pokemap_encounters`, `pokemap_where`, `pokemap_coverage`, `pokemap_indicator_suggest` (GBA), `pokemap_indicator_list` (GBA), `pokemap_diff` (dry run). No write tool is registered.

## Decisions
- Wrap the CLI by spawning it, not by importing its action handlers: the handlers are inline in `index.ts`, and changing the CLI would exceed this row. Family dispatch and refusal text stay the CLI's own; a non-zero exit becomes `isError` carrying the CLI text verbatim.
- `pokemap_validate` treats exit 1 with a JSON array on stdout as a result (findings), not an error.
- Render PNGs go to a private temp dir, never into a project.

## Verify
- `npx vitest run --no-file-parallelism packages/mcp`: 1 file, 13 tests passed, 0 failed (GBA: 9, GBC: 3, tool list: 1). The subjects are scratch copies from the global setup; tests only call read tools.
- `npm run typecheck`: passed.
- Not run: full suite, UI build (row-level verify only), live Claude Code check (needs 3b image content).
- npm quirk: `npm install -w @pokemap/mcp <pkg>` did not add the deps in this worktree; deps were declared in `packages/mcp/package.json` and a plain `npm install` produced the lockfile.

## Review and gate (master, 2026-11-22)

- Combined spec-and-quality review (Medium; Claude Sonnet, Codex at its usage limit): APPROVE, no blocking findings. Findings 1 (dash-leading arguments parsed as CLI options) and 2 (no timeout or child kill) fixed in `849c83e`: `dashRefusal` guards every free-form string argument; `runCli` kills the child after `CLI_TIMEOUT_MS` (300 s). Left: GBC `where`/`diff` not covered by tests (finding 4), `comment` key in package.json (matches packages/cli).
- `npx vitest run --no-file-parallelism packages/mcp && npm run typecheck` at `849c83e`: 14 pass; typecheck pass.
- Gate at `849c83e` (own `node_modules` via `npm ci`, under the machine-wide test lock): 5,243 pass / 2 fail / 277 files; typecheck pass, UI build pass; subjects unchanged. Fails: `core/test/config/engine.test.ts` (known env fail) and `server/test/api.test.ts` "GET /api/defects ..." (known 5 s timeout, passes alone), both listed in RESUME.
- After merge the shared `node_modules` needs `npm install` (new `@modelcontextprotocol/sdk` and `zod` dependencies; the root typecheck and suite include `packages/mcp`).
