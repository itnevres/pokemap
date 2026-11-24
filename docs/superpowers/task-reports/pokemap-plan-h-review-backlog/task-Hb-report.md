# Plan H task H-b report: one `sidecarRoutes.ts` for both families

Branch `claude/plan-h-server-8-h-b` (from master `57f9271`). Tier Medium (behaviour-preserving move plus one named change).

## What changed
- New `packages/server/src/sidecarRoutes.ts` (234 lines): the seven routes (conflict accept, placement, auto-layout switch `POST /api/world/dungeons`, dungeons list/create/patch/delete). Deps `{ root, getWorld, knownMap, expandSeed, autoLayoutReply }`; no family import (pinned by `test/sidecarRoutes.test.ts`, which mounts it on a bare temp root).
- `index.ts` -214 / `gbcRoutes.ts` -191 lines each side (net of the one mount + deps block); both mount it once as `sidecarRoute`.
- `http.ts`: `jsonBody`'s handler now also receives the raw text (backward compatible).
- Allowed behaviour changes: GBC placement now rejects unknown maps and `__proto__` (same `unknown map <name>` 400 as GBA); both families use the stricter GBC body guards (`null` was a 500 on GBA); bad dungeon-id escape text is `malformed dungeon id <raw>` for both. `POST /api/world/dungeons` keeps each family's pinned reply shape (`autoLayoutReply`).

## Review
Implementer: free OpenRouter hop (ernie-5.5-flash) via `chain.py --tier sonnet`; Sonnet fix round. Combined Sonnet-tier review: PASS, 1 Important (dropped rationale comment, restored) and Minors (rename `sidecar`→`sidecarRoute`, test gaps T1-T9; all applied). Duplicate body reader dropped by extending `jsonBody` (inline, ~6 lines).

## Mutation checks (16)
All 16 killed on the final code: no known-map check (module, GBC mount, GBA mount), no `isFinite`, seed unsorted, seed unknown, `autoLayoutReply` ignored, conflict 404 removed, DELETE 404 removed, PATCH name/write dropped, array/null guards, malformed id, `jsonBody` text dropped, "returns true for unowned". M9 (PATCH not written) and M16 first survived (weak test / a `-t` filter that skipped the test); both fixed and re-run.

## Gate
Gate at the merged result: 5,500 pass / 2 fail / 286 files; typecheck pass, UI build pass; subjects unchanged (0 porcelain lines before and after). Fails: the known `engine.test` env fail, and `gbcAddEventRoutes` "commit rebuilds symbols..." (12.5 s load timeout; 39/39 pass alone).

## Follow-ups
None new. `cli/src/writeCommands.ts:83` raw insert index and the B4 follow-ups stay listed in decisions.
