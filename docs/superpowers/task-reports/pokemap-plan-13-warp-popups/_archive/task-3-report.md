# Plan 13 Task 3 report: warp alert count (P12-4x), per-map warp refresh

Base `3e3d504`, branch `p13-t3`. Implementer: Codex gpt-6.1-sol (stopped by usage limit after writing code and tests, no
report); report, fixture fixes and all verification by the conductor.

## Changes
- `canvas/WorldSurface.tsx`: `warpError` split into `failedWarps: ReadonlyMap<string, string>` + `latestWarpError`
  (fetch failures) and `unresolvedWarp` (adapter's unresolved-marker message, own alert, text unchanged). Success with
  the current token deletes the map; failure with the current token sets it; stale tokens touch neither. Alert copy
  `Warp data unavailable for ${n} map(s): ${latest}`. `clearWarpErrors()` on Warps on, Lines on, resolved double-click.
  A layout effect on `tileVersions` tracks seen versions per map (`seenWarpTileVersions`); a changed version (not first
  sight) deletes only that map's `warpCache`/`warpRequests` entries and bumps `warpVersion` and `warpEpoch`;
  `warpEpoch` is in the fetch effect's deps. Failures never touch `warpEpoch`.
- `gba/adapter.tsx`, `gbc/adapter.tsx`: `renderDungeon` passes `tileVersions={s.tileVersions}`.
- `gbc/worldSurface.tsx`: `fetchWarps` drops the embedded `destination` and resolves from the cache:
  `cache.get(destMapName)?.[destWarp - 1]` (1-based); `popupMap` unchanged.

## Tests added
`test/canvas/WorldSurfaceInteraction.test.tsx`: warp alert counts failing maps and clears when every retry succeeds; a
success on one map keeps the alert while another still fails; a stale failure response after a newer request never adds
to the count (resolve / reject newer); Warps toggle / Lines toggle clear the count (both); a tileVersions bump re-fetches
that map's warps over a stationary view (resolve / reject replacement); a pre-bump in-flight warp success cannot restore
stale markers or clear a current failure; first sight of a map's tile version does not evict its warps; an unresolved
marker still shows its own alert (and the count stays). `test/WorldCanvasSurface.test.tsx` (GBA) and
`test/gbc/GbcWorldCanvasSurface.test.tsx`: an incoming line follows the destination's refreshed warp (source pending
false / true).

## Existing tests changed (expected text or fixture only)
- `WorldSurfaceInteraction` "warp fetch rejection alerts..." and "an adapter rejects malformed warp map identity...",
  `WorldCanvasSurface` "P12-4d: a rejected warp request shows the warp alert": new alert copy (`for 1 map` / `for 4 maps`;
  the malformed-identity case fails all four visible maps).
- `gbc/GbcWorldCanvas.test.tsx` (not in the brief; found by the UI suite):
  - "scopes hidden members...": the unresolved third warp `event(2, 2, "Hidden")` had `destWarp: 1`, a valid index
    into Hidden, so the cache resolver drew a line. The server only omits `destEvent` when the index names no warp, so
    the fixture now uses `destWarp: 2`. Assertions unchanged.
  - "renders the exact raw-half marker...": `BurnedTowerB1F` had no warps while 1F's `destEvent` pointed at (10, 9);
    the fixture now gives B1F its warp 1 at (10, 9). Assertions unchanged.
  - "shows malformed warp payload errors and permits retry...": failed only in file order. A view-change retry got the
    healthy second response and, per P12-4x, cleared the alert before `waitFor` saw it. The mock now stays malformed
    until the test heals it; the retry assertion counts from that point (`before + 1`) and the test now also asserts the
    alert clears after the successful retry.

## Evidence
- Red (src stashed): 17 of the new/changed tests fail; "first sight" passes (guard, by design).
- Green: focused 3 files 83/83; `gbc/GbcWorldCanvas.test.tsx` 123/123 twice; `npx vitest run packages/ui
  --maxWorkers=4 --minWorkers=1` 123 files / 2,011 passed / 0 failed (baseline 1,996 + 15); `npm run typecheck` pass.
- Mutations (`mut3.mjs`, in-memory restore, byte check): (a) skip delete on success KILLED (1); (b) clear whole cache
  on bump KILLED (2); (c) no token check on failure KILLED (3); (d) GBC embeds destEvent points KILLED (2);
  (e) `warpEpoch` dropped from deps KILLED (5).
- CRLF kept in CRLF files; added lines <= 140; no non-ASCII added.

## Notes
- There is no dismiss control on the warp alert; "Dismiss" in spec item 10 has nothing to attach to (ledger ruling).
- An epoch bump also retries any map that failed earlier and is still in scope (failed entries leave the cache). It
  happens once per tile-version change, so it is not a loop (P12-4s holds).

## Fix round 1 (reviews: spec FAIL C1 + 2 Minor; quality Needs rework C1, I1, 3 Minor) -> commit 4ef4800
Conductor inline (Codex quota out; ~15 src lines). Both reviewers' C1 verified: `useContextEditing.ts:23,67` starts at
`{}` and writes `{A: 1}` on a first save, which the old guard treated as first sight (no refresh).
- `seenWarpTileVersions` is seeded from the mount-time `tileVersions`; eviction runs on `seen.get(name) !== version`.
  Test "first sight ... does not evict" replaced by "a mount with saved tile versions does not evict or refetch" and
  "a map's first save (tile version absent -> 1) re-fetches its warps".
- I1: new test "a bump while the map is out of scope drops its in-flight response; the map refetches when back".
- Spec M2 / quality M1: `latestWarpError` removed; a failure re-inserts its map so the alert names the newest failure
  still failing (`[...failedWarps.values()].at(-1)`). Test "the alert names the newest failure that is still failing".
- Spec M1: spec item 10 and plan Task 3 no longer list "Dismiss"; ruling recorded in spec item 10.
- Quality M2 (count keeps maps that left scope) and M3 (a bump retries failed in-scope maps): accepted, no change.
- Evidence: focused 54/54; UI suite 123 files / 2,014 passed; typecheck pass. Mutations re-run on 4ef4800, all KILLED:
  a (1->2 tests), b (2), c (3), d (2), e (7), f has-guard restored (1), g bump keeps token (1), h oldest failure named (2).
