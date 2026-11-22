# Plan H Task E report: server request boundary (E1 + E2), stream C `h-server`

Tier **High** (hub I/O error boundary). Branch `claude/plan-h-server-e1`, PR against `master`.

## What changed
- New `packages/server/src/http.ts`: `readBody(req, max)` with a streaming 16 MiB cap (`BodyTooLarge`), `decodeSegment`, `sendJson` (adds `x-content-type-options: nosniff`), `declaresOversizeBody`, `refuseOversize`, and `isCrossOriginRequest` (moved verbatim from `hub.ts`).
- E1: hub, GBC handler, GBC edit and block-edit routes use it (`decodeMapName` is gone). E2: the GBA handler `index.ts` decodes all 28 path segments through `decodeSegment` (malformed `%` answers 400, never 500), the species route refuses a name outside `^\w+$` (S1), the placement guard refuses null, arrays, `__proto__`, unknown maps and non-finite numbers, and every `readBody` rejection answers 413.
- Declared oversize bodies get a 413 at the top of all three handlers before any route runs. The 413 is a plain keep-alive reply (decision below).

## Hops and reviews
- Implementers: E1 source from the `gpt-6.1-sol` Codex hop (Codex then hit its usage limit); E1 tests and the whole E2 diff from free `ernie-5.5-flash-preview` hops; review-fix round by a Claude Sonnet subagent.
- Reviews (Opus-tier; Codex astra was out, so Claude Opus `high-risk-reviewer`, separate passes): `task-E-review-spec.md` CHANGES (1 important, 4 minor), `task-E-review-quality.md` CHANGES (3 important, 7 minor). Round 1 fixes in `0f0b1b4`, `1b920ea`.
- Conflicting findings: the spec review wanted the 413 to close the connection (plan text); the quality review proved with probes that closing makes a real uploader see `ECONNRESET` and never the 413. Kept the keep-alive reply; memory stays capped by `readBody`.
- Taken: route-level 413 tests for every handler family (chunked body), a real-bytes `fetch` upload, 2 s timeouts on the no-body helpers so a removed guard fails fast, hub 403 test no longer holds a keep-alive socket, wrong `__proto__` comment fixed, stale docs fixed.
- Not taken: `Array.isArray` has no dedicated test (defence in depth). Follow-up for the owner of `gbcRoutes.ts`: GBC `POST /api/world/placement` still lacks the known-map check (`__proto__` answers 200 there).

## Mutation checks (all turn tests red)
Applied together, one run (`mutate-e.py`, notes folder): readBody cap off (http.test: 413 cases), `refuseOversize` removed from index.ts, hub.ts and gbcRoutes.ts (declared-length 413 tests in world, hub, gbc fail at 2 s), nosniff header dropped (http, hub, gbc, world tests), placement `BodyTooLarge` branch dropped (chunked placement test), known-map check dropped (placement 400 test). The species `^\w+$` mutation ran separately (see gate section).

## Gate
Merged result at `ebbb3c1` plus this report (`origin/master` merged in, conflict in `index.ts` resolved by keeping master's `overlayStamp()` and our `decodeSegment`): `npm test -- --no-file-parallelism` 5,332 pass / 1 fail / 279 files (the known `engine.test.ts > parses the subject repo's real porymap.project.cfg` env fail); `npm run typecheck` pass; `npm run build -w packages/ui` pass; both subject repos unchanged (`git status --porcelain` 0 lines). Species `^\w+$` mutation (run separately on `api.test.ts -t species`): the species test fails, tree restored.
