# Plan 4 row 3b: pokemap_render returns image content

Tier: Low (isolated change to two tool handlers, fully specified, no concurrency or parsing).

## Change

- `packages/mcp/src/server.ts`: `imageResult()` reads the PNG the CLI wrote (`fs/promises`) and returns `[{ type: "image", data: base64, mimeType: "image/png" }, { type: "text", text }]`. A failed CLI call returns the existing text error unchanged, with no image.
- `pokemap_render` and `pokemap_render_world` both return image content (both write a PNG). Their descriptions were updated.
- Refusals and error text are unchanged.
- `packages/mcp/test/server.test.ts`: the `call` helper now collects image items separately from text. The GBA render and render_world tests and the GBC render test assert the `image/png` mimeType and the PNG signature `89504e470d0a1a0a` in the decoded base64.

## Verify

`python -I C:/Users/Serve/.claude/locks/lockrun.py "npx vitest run --no-file-parallelism packages/mcp && npm run typecheck"`: exit 0.
- vitest: 1 file passed, 14 of 14 tests passed.
- typecheck: no errors (chain exit 0).

## Gate (master)

Gate at `18931e3` (under the machine-wide test lock): 5,244 pass / 1 fail / 277 files; typecheck pass, UI build pass; subjects unchanged. The fail is the known `core/test/config/engine.test.ts` env fail (RESUME). No review: Low tier, fully specified, covered by the PNG-signature assertions.
