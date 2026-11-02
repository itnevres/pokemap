# Plan 13 Task 3 spec-compliance review (3e3d504..a538b15)

Reviewer: Claude Opus fallback (Codex usage limit). Read-only on source. Read the diff, the plan's Task 3, Review Focus 5,
Global Constraints, spec items 6 and 10, the implementer report, and the changed source files
(`canvas/WorldSurface.tsx`, `gbc/worldSurface.tsx`, `gba/adapter.tsx`, `gbc/adapter.tsx`), plus
`shared/useContextEditing.ts` (the producer of `tileVersions`) and `server/src/gbcRoutes.ts:270-280`.
Re-ran `npx vitest run packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`: 51/51 pass.

**Verdict: FAIL** (1 Critical, 0 Important, 2 Minor).

## Critical

### C1. The first save of any map never refreshes its warps (Review Focus 5 / spec item 6 missed in the real flow)

- `packages/ui/src/shared/useContextEditing.ts:23` starts `tileVersions` as `{}`. Line 67 bumps the saved map to
  `(t[map] ?? 0) + 1`, so on a map's first save the key appears for the first time, with value 1.
- `packages/ui/src/canvas/WorldSurface.tsx:497-512` evicts only when `seen.has(name) && seen.get(name) !== version`.
  `seenWarpTileVersions` starts empty (`:489`), and a key the surface has never seen counts as "first sight", so it
  is recorded without eviction.
- Failure scenario: the user is in World (context) mode with Warps on, and A's markers are cached. They save A for the
  first time this session. The surface sees `tileVersions` go from `{}` to `{A: 1}`. Nothing is evicted, there is no
  `warpEpoch` bump and no refetch, so A's markers and dungeon lines stay at their pre-save positions. Only A's second
  and later saves refresh. Tiles do refresh, because `useWorldTiles` keys the URL by `tileVersions?.[map]`
  (`useWorldTiles.ts:50`). So the canvas shows new tiles with stale warp markers. Once Task 5 lands, the same thing
  happens for the first save inside the popup, which is the exact case Review Focus 5 names.
- Why the tests miss it: every bump test mounts with pre-seeded `{A: 0, B: 0}` (`WorldSurfaceInteraction.test.tsx`
  "a tileVersions bump...", "a stale failure...", "a pre-bump in-flight...", and both incoming-line tests). That state
  never happens in the app. The added test "first sight of a map's tile version does not evict its warps"
  (`WorldSurfaceInteraction.test.tsx`, mount without `tileVersions`, then rerender `{A: 1}`, expect 1 request) is
  exactly the production first-save sequence, and it asserts the buggy outcome. It passes in the re-run above, which
  confirms the behaviour.
- The plan says "Track seen versions in a ref keyed by map (as `useWorldTiles` does)". `useWorldTiles` has no
  seen-ref. It compares by URL, where `undefined` and `1` differ, so it is not a precedent for skipping first sight.
- One-line fix: seed the ref from the mount-time `tileVersions` and treat a later missing entry as 0 (or compare
  `seen.get(name) !== version` without `has`). Then invert the "first sight" test into a `{}` → `{A: 1}` refetch test.

## Minor

### M1. "Dismiss" trigger in spec item 10 has no control (ledger ruling): ruling accepted

- At base `3e3d504` the warp alert was already a plain `toolbarError` with no dismiss button. It is still one at
  `WorldSurface.tsx:734-738` and `:822-825`. Spec item 10 itself says "(today's triggers ...)", and today there is
  no dismiss, so the word is a spec inaccuracy, not a missing feature. The other triggers are present and tested:
  Warps on (`:815`), Lines on (`:819`), and resolved double-click / popup open (`:627`, the "unresolved marker" test).
  Adding a dismiss control would be new UI that the plan does not ask for.
- Fix: strike "Dismiss" from spec item 10 (and from the Task 3 Interfaces text), and record the ruling in the spec.

### M2. `latestError` can name a map that has already recovered

- `WorldSurface.tsx:552` sets `latestWarpError` on every failure. A success (`:540-545`) removes the map from
  `failedWarps` but leaves the message. Scenario: A fails "A offline", then B fails "B offline", then B succeeds. The
  alert reads "for 1 map: B offline" while only A is failing. This matches the letter of "most recently recorded
  message", but the alert then describes a healthy map. No test covers the order where the latest failing map
  recovers first.
- Fix: derive the message from `failedWarps` (the most recently set entry still present) instead of separate state.

## Checklist

Interfaces:
- `failedWarps: ReadonlyMap<string,string>`: present (`:482`). A failure sets it under the token guard (`:546-553`).
  A success deletes it under the token guard (`:537-545`). A stale token touches neither. OK.
- Alert copy is exact: `` `Warp data unavailable for ${n} map${n === 1 ? "" : "s"}: ${latest}` `` (`:822-824`), with n =
  `failedWarps.size`. OK.
- `unresolvedWarp` has its own state (`:484`), its own alert with the text unchanged (`:825`), and is set only at
  `:629`. It never enters `failedWarps`. It is cleared by `clearWarpErrors` on Warps on, Lines on, and resolved
  double-click. OK.
- Per-map eviction of `warpCache` and `warpRequests` only (`:500-503`). It bumps `warpVersion` and `warpEpoch`
  (`:507-510`), and `warpEpoch` is in the fetch deps (`:556`). Failures never touch `warpEpoch`. OK, apart from C1's
  first-sight gap.
- Both `renderDungeon`s pass `tileVersions` (`gba/adapter.tsx:138-141`, `gbc/adapter.tsx:145-147`). OK.
- GBC `resolveDestination` (`gbc/worldSurface.tsx:302-306`): returns null without `destMapName`, otherwise
  `cache.get(dest)?.[destWarp - 1]` and the `{map, point}` shape. `popupMap` is unchanged. This matches the 1-based
  server lookup (`gbcRoutes.ts:274-276`). The GBA side is unchanged (`gba/worldSurface.tsx:197-202`). OK.
- Side effect noted by the implementer: an epoch bump also retries maps that failed earlier and are still in scope,
  because failed entries have left the cache. It runs once per version change, not as a loop, so P12-4s holds.
  Accepted.

Step 1 tests (all present):
- "counts failing maps and clears...": 2 maps, then 1 map, then no alert. OK.
- "a success on one map keeps...". OK.
- "a stale failure ... never adds" (newer request resolves or rejects; the old request rejects after it). OK.
- "Warps toggle / Lines toggle clear the count". OK (no dismiss, see M1).
- "tileVersions bump re-fetches ... stationary view": exactly one new fetch, for A. A's marker is gone synchronously
  after the rerender, before the replacement lands. The replacement moves the marker. A failed replacement shows no
  stale marker and the alert counts A. The pre-bump in-flight response is covered by the separate "pre-bump
  in-flight" test. OK.
- "incoming line follows the destination's refreshed warp", GBA and GBC, source pending false and true. I re-derived
  the GBC fixture by hand. Half-block warps give A+(1,2) = (10,70) and B+(2,3) = (120,80). After the refresh,
  B+(4,5) = (140,100). destWarp 2 selects index 1, not the decoy. A is not refetched. OK.
- "unresolved marker still shows its own alert" and the count stays. OK.
- Missing: a test of the production first-save path (C1).

Mutations a-e (report: all killed, with counts). I checked each against the tests:
- (a) Without the delete on success, the "for 1 map" step fails.
- (b) Clearing the whole cache makes the requests `["A","B","A","B"]`, so the bump test fails.
- (c) Without the token check on failure, "stale failure" appears in the alert.
- (d) If GBC embeds the destination point, the line is not null after the bump and the old endpoint (120,80) remains,
  so the GBC test fails.
- (e) Without `warpEpoch` there is no third request, so the bump tests fail.
- I did not re-run the mutation script. The 51/51 green run plus this reading support the report's claims.

Existing tests changed (only expected text or fixtures, reasons consistent with the server):
- Alert-copy updates (`for 1 map`, `for 4 maps`). The malformed-identity case rejects all four visible maps. OK.
- `GbcWorldCanvas` "scopes hidden members": `destWarp: 2` into one-warp Hidden. The server omits `destEvent` only
  when the index names no warp (`gbcRoutes.ts:274-276`), so the old `destWarp: 1` with no `destEvent` was an
  impossible fixture. OK.
- "raw-half marker": B1F gains warp 1 at (10,9) to match 1F's `destEvent`. The old fixture was server-inconsistent.
  OK.
- "malformed payload ... retry": the mock stays malformed until healed. The reason (a P12-4x success clears the alert
  early) holds. The retry assertion is kept as `before + 1`, and an assertion that the alert clears is added. OK.

## Re-review: fix round 1 (a538b15..4ef4800 src and tests, c497162 docs)

**Verdict: PASS** (0 Critical, 0 Important, 0 Minor open). Re-ran `npx vitest run
packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`: 54/54 pass. No line in the diff is over 140 characters.

- C1 resolved. `WorldSurface.tsx` seeds `seenWarpTileVersions` from the mount-time `tileVersions` and evicts on
  `seen.get(name) !== version`, with no `has` guard. The production first save (`{}` -> `{A: 1}`, from
  `useContextEditing.ts:23,67`) now evicts A, bumps `warpVersion` and `warpEpoch`, and refetches.
  - The new test "a map's first save (tile version absent -> 1) re-fetches its warps" checks three things: the marker
    is gone synchronously after the rerender, the requests are `["A","A"]`, and the replacement renders.
  - Restoring the `has` guard leaves one request, so the test fails (matches the report's mutation f).
  - The old "first sight" test, which asserted the bug, has been replaced and not just deleted. Its non-eviction case
    is kept as "a mount with saved tile versions does not evict or refetch".
- M1 resolved. Spec item 10 and the plan Task 3 Interfaces no longer list "Dismiss", and the ruling is recorded in
  spec item 10 (c497162).
- M2 resolved. `latestWarpError` is removed. A failure deletes its map and re-inserts it, so insertion order puts the
  newest failure last, and the alert uses `[...failedWarps.values()].at(-1)`.
  - Fixed scenario: A fails, B fails, B recovers. The alert now reads "for 1 map: A offline" (new test "the alert
    names the newest failure that is still failing").
  - The alert copy still matches the Global Constraints string exactly.
- New I1 test (quality review): "a bump while the map is out of scope drops its in-flight response...". The bump
  deletes the token, so the old success is ignored; when the map is back in scope it refetches once. This is
  consistent with spec item 6 ("its in-flight request token").
- No regressions found. `clearWarpErrors` still clears both alerts, the token guards are unchanged, and the GBC
  resolver and adapters are untouched in this round.
- Note (not a finding): no test kills removing only the mount-time seed. Without the seed, a mount with saved versions
  evicts an empty cache and bumps `warpEpoch` once, before any fetch, which is harmless. The seed's comment
  overstates what it buys, but behaviour is correct either way.
