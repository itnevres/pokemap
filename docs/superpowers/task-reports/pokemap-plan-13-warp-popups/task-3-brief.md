# Plan 13 Task 3 brief (Codex implementer)

Repo: PokeMap (React 19 + TS map editor, two families GBA/GBC sharing `packages/ui/src/canvas/WorldSurface.tsx`).
You work in this worktree only. Plan: `docs/superpowers/plans/2026-10-28-pokemap-plan-13-warp-popups.md`, section
"Task 3" (read it whole; it is binding). Spec: `docs/superpowers/specs/2026-10-28-pokemap-plan-13-warp-popups-design.md`
items 6 and 10.

## Sandbox facts (read first)
- You CANNOT run vitest or git here (EPERM on node_modules junctions; git index.lock). Do not try more than once.
  `npx tsc -p packages/ui --noEmit` (or the repo's typecheck) does work: run it.
- Write tests + code, then stop. The conductor runs red/green/mutations and commits.
- No self-review, no sub-dispatch, no SDD loop. Write only the report named below.

## Goal
1. P12-4x warp alert: replace the fetch half of `warpError` with `failedWarps: ReadonlyMap<string, string>` state
   (map -> latest error). Failure (current request token) -> set(name, message); success (current token) -> delete(name).
   Stale responses (token mismatch) never add or remove. Alert copy, exact:
   `Warp data unavailable for ${n} map${n === 1 ? "" : "s"}: ${latestError}` with n = failedWarps.size and latestError
   the most recently recorded message (keep it as a separate state/ref if needed; when the set empties no alert).
   Clear the whole map on: Warps toggle turning on, Lines toggle turning on (today's triggers), and the resolved-marker
   double-click (today's `setWarpError(null)` there). There is NO dismiss button today; do not add one.
2. Unresolved marker message (`adapter.unresolvedWarpError`) moves to its own `unresolvedWarp: string | null` state with
   its own alert, text unchanged: `Warp data unavailable: ${unresolvedWarp}`. Same clear triggers. Never enters
   failedWarps.
3. Per-map warp eviction on `tileVersions` (prop already exists, `WorldSurface.tsx:86`): keep a ref of seen versions per
   map (pattern: `canvas/useWorldTiles` or wherever it tracks versions). When `tileVersions[B]` changes from its seen
   value: delete only B's `warpCache` and `warpRequests` entries (so an in-flight pre-bump response for B is ignored by
   the token check), bump `warpVersion` (markers/lines drop B's graphics at once) and bump a new `warpEpoch` state that is
   added to the fetch effect's dependency list, so B refetches over a stationary view. Ordinary failures never touch
   warpEpoch (no retry loop; P12-4s: a failure retries only on the next view change, as today). First sight of a map's
   version (no previous) is not a bump.
4. `renderDungeon` in `packages/ui/src/gba/adapter.tsx:138` and `packages/ui/src/gbc/adapter.tsx:145` pass
   `tileVersions={s.tileVersions}` (both WorldCanvas/GbcWorldCanvas already accept and forward the prop; verify).
5. GBC `fetchWarps` (`packages/ui/src/gbc/worldSurface.tsx:295-306`): stop embedding `destination` from `warp.destEvent`.
   Resolve from the cache like GBA (`packages/ui/src/gba/worldSurface.tsx:197-202`):
   `resolveDestination: (cache) => { if (!warp.destMapName) return null; const target =
   cache.get(warp.destMapName)?.[warp.destWarp - 1]; return target ? { map: warp.destMapName, point: target.point } :
   null; }` (GBC destWarp is 1-based; check `GbcWarpsPayload` in `gbc/warps.ts` for field names). `popupMap` stays
   `warp.destEvent ? warp.destMapName : undefined`.

## Tests to write (Plan Task 3 Step 1; names exact)
In `packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx` (reuse its existing harness: `adapter`, `host`, deferred
fetchWarps helpers; read the file's existing warp tests ~lines 583-720 and 895-915 first):
- "warp alert counts failing maps and clears when every retry succeeds": two maps fail -> text contains `for 2 maps`;
  view change, A succeeds -> `for 1 map`; B succeeds -> no alert.
- "a success on one map keeps the alert while another still fails".
- "a stale failure response after a newer request never adds to the count" (resolve the old request after the new;
  the tileVersions bump is a way to make a newer request for the same map).
- "dismiss / Warps toggle / Lines toggle clear the count": there is no dismiss control; cover Warps and Lines toggles
  (and name it accordingly, e.g. "Warps toggle / Lines toggle clear the count"); extend current tests.
- "a tileVersions bump re-fetches that map's warps over a stationary view": markers for A and B loaded, no pan/toggle;
  rerender with tileVersions {A: 1} after first {A: 0} (or absent->1? first sight is not a bump: start with {A:0,B:0})
  -> exactly one new fetch, for A; A's old markers gone before the delayed replacement lands; replacement moves A's
  marker; variant: replacement fails -> no stale marker returns, alert counts A; a pre-bump in-flight response for A is
  ignored.
- "an unresolved marker still shows its own alert" (keep existing assertion at ~line 905) and it does not change the
  count (with one failing map, the count alert stays `for 1 map`).
In `packages/ui/test/WorldCanvasSurface.test.tsx` (GBA) and `packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx` (GBC):
- "an incoming line follows the destination's refreshed warp": dungeon (mapFilter) A->B line drawn with Lines on; bump
  B's tileVersion; B's refetched warps have the target warp moved -> the line's B end moves; A is not refetched; also a
  variant with A's own request still in flight when B is bumped. Read how these files mock fetch (`/api/warps/...`) and
  how they read line endpoints (svg line x1/y1/x2/y2 or similar) before writing.
Existing tests asserting `Warp data unavailable: <fetch error>` (e.g. ~lines 599, 628) must change to the new copy
(`Warp data unavailable for 1 map: ...`). Change only the expected text; list each in the report. Do not change other
existing test bodies or fixtures; if one breaks for another reason, report it rather than editing it.

## Rules
- Files are CRLF: keep CRLF line endings in every file you touch; new lines <= 140 chars.
- Match surrounding style and comment density; keep existing comments (do not strip "why" comments).
- No UTF-8 BOM, no re-encoding of non-ASCII text. Keep this work ASCII.
- Touch only the files named above, plus strictly needed support files (list them in the report).
- No new dependencies. The repo has no jest-dom: use plain DOM reads (`getAttribute`, `textContent`, `querySelector`).
- Report unrelated bugs, do not fix them.

## Verify (conductor will run; you cannot)
`npx vitest run packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx packages/ui/test/WorldCanvasSurface.test.tsx
packages/ui/test/gbc/GbcWorldCanvasSurface.test.tsx` then `npx vitest run packages/ui` -> all pass. You run tsc only.

## Report
Write `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-3-report.md` (CRLF, lines <= 140): files changed,
each test added, each existing test whose expected text changed and why, design notes (where versions are tracked,
epoch), tsc result, anything unresolved.
