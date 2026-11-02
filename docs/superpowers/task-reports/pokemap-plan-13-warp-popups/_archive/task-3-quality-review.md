# Plan 13 Task 3 quality review (adversarial, high tier: async warp-fetch ordering)

Range `3e3d504..a538b15`, branch `plan-13-warp-popups`. Reviewer: Claude Opus (fallback, Codex usage limit).
Read-only on src. Ran `npx vitest run packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx`: 51/51 pass.

Verdict: **Needs rework**. Critical 1, Important 1, Minor 3.

## Critical

### C1. The first save of a map never refreshes its warps; a test locks that in
`packages/ui/src/canvas/WorldSurface.tsx:500` evicts only when `seen.has(name) && seen.get(name) !== version`.
The real producer, `packages/ui/src/shared/useContextEditing.ts:23,67`, starts `tileVersions` as `{}` and the first
commit for map A writes `{ A: 1 }` from an absent key. So in a live session the first save of each map is "first
sight": nothing is evicted, no `warpEpoch` bump, and markers and dungeon lines keep the pre-save warps. Only the
second and later saves of that map refresh. Spec item 6 says "on a changed `tileVersions[map]`", and going from
absent to 1 is a change. Task 4 routes the popup save through this same `onCommitted` bump, so the main #5 scenario
(open the popup, save once, close) shows stale warps behind it.

Failure scenario: World surface mounted, Warps on, A's warps cached. Edit A in context and save, so tileVersions goes
`{}` to `{A:1}`. A's markers stay at the old points, with no refetch. Save again (`{A:2}`) and they refresh.

The test `"first sight of a map's tile version does not evict its warps"`
(`packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx:1184`) mounts with no `tileVersions` and rerenders
`{ A: 1 }`, which is exactly the production first-save path, and it asserts no refetch. It guards the bug. Every other
bump test mounts with explicit `{ A: 0 }` baselines that production never produces, so none of them catches this.

Why the guard exists: the remount case. The Dungeon surface is a keyed mount and can mount with `{A:3}` already
present; that must not evict anything (the cache is empty anyway). Fix: seed the ref from the mount-time props,
`useRef(new Map(Object.entries(tileVersions ?? {})))`, and evict on `seen.get(name) !== version` (no `has` check).
StrictMode's replayed layout effect sees equal values, so it stays a no-op. Then rewrite the first-sight test so that
mounting with `{A:1}` does not refetch, and add a test that `{}` then `{A:1}` refetches A once. Mutation: restoring
the `has` guard must fail the new test.

## Important

### I1. Token deletion on a bump is untested for an out-of-scope map (the plan's line-48 requirement)
`WorldSurface.tsx:502` deletes `warpRequests[name]` on a bump. When the bumped map is in scope, the epoch-driven fetch
effect immediately overwrites the token with a new request (`:527`). So in every new test (A or B in scope at bump
time) the old response is already stale whether or not `:502` runs. I reasoned this through; I did not run it as a
mutation because the brief forbids src edits. The line only matters when the map is out of scope at bump time.

Failure scenario if `:502` regressed: Warps on, A's fetch in flight. Pan A off screen, then bump `tileVersions.A`.
The old response lands, still holds the current token, and repopulates `warpCache.A` with pre-save warps. Pan back,
and `warpCache.has("A")` skips the fetch (`:524`), so stale markers return. Today's code is correct. The gap is the
test: add one test (bump while A is out of scope, resolve the old request, bring A back, expect a new fetch and no old
marker), then record the mutation of deleting `:502`.

## Minor

### M1. `latestWarpError` can name a map that has recovered
`:553` records the last failure message globally. A fails ("A offline"), then B fails ("B offline"), then B succeeds.
The alert reads `for 1 map: B offline` while only A is failing. This matches the plan's literal wording ("most
recently recorded message"), but the message is misleading. A simpler fix also removes state: derive the latest message
from `failedWarps` in insertion order (`next.delete(name); next.set(name, message)` at `:552`, then read the last
value), and drop `latestWarpError` and its setter.

### M2. The count keeps maps that left scope
A `failedWarps` entry is removed only by a current-token success or by `clearWarpErrors`. After a pan moves a failed
map off screen, or after Warps is turned off (only turning it on clears, `:815`), the alert still counts that map.
The old `warpError` behaved the same way, and the spec's "latest fetch failed" wording allows it, so I'm only noting
it. No action is needed unless live acceptance finds it confusing.

### M3. A bump also retries every failed in-scope map
The report notes this. One epoch bump re-runs the fetch effect over all of `warpScope`, and failed maps have no cache
entry (`:550`), so they refetch too. It fires once per `tileVersions` change and failures never touch `warpEpoch`, so
there is no loop (P12-4s holds). The state is stable: `useContextEditing` holds `tileVersions` in `useState`, and an
inline literal with equal values sets `changed = false`. This is acceptable as is.

## Checked, no finding
- Async ordering: the layout effect runs before passive effects. When a bump and a view change land in one commit,
  the first fetch-effect run creates the request and the epoch re-render skips it via `has`. That gives exactly one
  fetch. Old success or failure after a bump: the token mismatch drops it (`:536`, `:548`) and leaves `failedWarps`
  untouched. A pre-fetch microtask whose token was deleted returns `null` without calling the adapter.
- StrictMode: the replayed layout effect sees equal versions and does nothing. The replayed unmount cleanup clears
  tokens and in-flight cache entries, then the replayed fetch effect refetches (unchanged from before this task).
  After a real unmount, a late response has no token, so there is no state write.
- Render cost: a success on a map with no failure returns `previous`, so React bails out. A new Map is allocated only
  on failure. That is negligible.
- GBC resolver (`gbc/worldSurface.tsx:302-306`): `destWarp - 1` is 1-based, and a missing `destWarp` or an
  out-of-range index gives `null`. This matches the GBA cache path. The fixture changes in `GbcWorldCanvas.test.tsx`
  (destWarp 2, B1F warp) are justified by the new resolver. I re-derived both incoming-line fixtures by hand:
  GBA A(0,0), B(30,10) at zoom 5 gives (10,15) to (170,75), then (190,95). GBC half-block, zoom 10, pan(0,50) gives
  (10,70) to (120,80), then (140,100). Both match.
- Tests: assertions after `rerender` are synchronous, so they check that graphics drop before the replacement lands
  (not a waitFor on something already true). The toggle tests check that the alert survives toggle-off and clears on
  toggle-on synchronously. The "file-order" GBC fix now asserts the alert clears after the retry. Mutations (a) to (e)
  in the report cover success-delete, whole-cache clear, failure token, GBC embedding and the epoch dependency.
- Format: all 8 changed files are fully CRLF, there is no added line over 140 characters, and comment density matches
  the surrounding code.

## Re-review: fix round 1 (`a538b15..4ef4800`)

Verdict: **Approved**. Critical 0, Important 0, Minor 1. I read the diff and the code; I did not run vitest, per the
coordinator.

### Resolved
- **C1: resolved.** `WorldSurface.tsx` now seeds `seenWarpTileVersions` from the mount-time `tileVersions` and evicts
  on `seen.get(name) !== version`. The production path (`{}` to `{A:1}`) now evicts and refetches, and a keyed Dungeon
  remount with `{A:3}` evicts nothing, because the seed equals the props. StrictMode is safe on both counts. The
  doubled render computes the same seed from the same props, and the replayed layout effect sees equal versions, so
  `changed` stays false. A later switch from `undefined` to `{A:1}` counts as a change, which is correct. The new test
  "first save (absent -> 1)" asserts that the marker drops synchronously after `rerender` and that a second fetch
  happens. Restoring the `has` guard leaves `requests` at `["A"]`, so the test fails; the report's mutation (f) agrees.
- **I1: resolved.** In the new out-of-scope test, Warps off empties `warpNames`, so the bump's epoch run cannot
  overwrite the token. The old response then lands. If the `warpRequests.delete` on a bump is removed, that response
  holds the current token, fills `warpCache.A`, and Warps on skips the fetch via `has`. The test would then see
  `requests` of length 1 and a stale marker, so it fails. Mutation (g) reports the same. The test waits on the asserted
  things (it settles after each resolve and toggle).
- **M1: resolved, with state removed.** The `latestWarpError` state is gone. On a failure the map is deleted and then
  set again, so it moves to the end, and the alert reads `[...failedWarps.values()].at(-1)`. In the test, A fails,
  then B fails, then a B bump. That bump also refetches A (M3), which stays pending. B then succeeds, so the alert shows
  "for 1 map: A offline", and the old code would have shown "B offline". Mutation (h), which names the oldest failure,
  is killed.

### New Minor
- **M4: no test covers the delete-before-set re-insert.** If a map that is already failing fails again, it must move
  to the end. If `next.delete(name)` is dropped, it keeps its old position, and the M1 test still passes, because the
  survivor (A) is already the only entry. Failure scenario: A fails, B fails, a pan retries both, and A fails again
  while B is still pending. The alert says "B offline", but A's failure is the newest. This is low impact, because the
  text is still a real current failure. An optional fix is to extend the M1 test with that sequence.

### Format
Both files are fully CRLF (934/934, 1273/1273), no added line is over 140 characters, and the new comments match the
surrounding density.
