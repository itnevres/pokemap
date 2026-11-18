# Task 10b fix-1 implementation report

High risk: request completion can race project reset. BASE `4d8991b481638d9381ff6cf5633f54e3e71096ae`; initial `git status --short` clean. One writer, no dependencies or test edits, no commit.

## Rulings

- U6a: `packages/ui/src/shared/useEditSessionCore.ts:135` reads the discard response and notes its version, then keeps the existing local reset without applying the empty grid.
- U6b: `packages/ui/src/shared/tilesetVersion.ts:7` maintains the generation, increments it on reset and rejects stale guarded announcements. Request-time tokens are captured and used by `packages/ui/src/shared/useEditSessionCore.ts:83` and `:139`, `packages/ui/src/hooks/useMapLayout.ts:57` and `packages/ui/src/gbc/hooks/useGbcMap.ts:35` and `:50` (reload). GBA notes only after cancellation check.
- U6c: `packages/ui/src/gba/worldSurface.tsx:207` and `packages/ui/src/gbc/worldSurface.tsx:314` use subscribed versions and memoized callbacks for image URLs, preserving the existing URL format. These adapter getters invoke hooks when WorldSurface reads them during render; this design deserves independent review because adapter imageUrl access outside React render would be invalid.
- U6d: sign, indicator and event reply handling was not changed.

## Verification

- `npm.cmd run typecheck`: PASS, exit 0, no diagnostics (after correcting two TypeScript payload casts found on initial run).
- Conductor reran `npm.cmd run typecheck` against the final diff: PASS, exit 0, no diagnostics.
- `npx.cmd vitest run packages/ui`: BLOCKED before test collection, exit 1. Esbuild reports `Cannot read directory "../../../../../../../..": Access is denied` and cannot resolve the worktree's `vitest.config.ts`; this matches the conductor's baseline failure. No test count or passing suite can be claimed.
- `git diff --check`: PASS, exit 0, no output.
- `npm.cmd run build --workspace @pokemap/ui`: BLOCKED before compilation, exit 1. Vite could not write its temporary bundled config through the junction at `packages/ui/node_modules/.vite-temp` (`EPERM`).
- Live UI check and mutation checks were not run; required full UI suite remains blocked by environment access. No unrelated bugs identified.
