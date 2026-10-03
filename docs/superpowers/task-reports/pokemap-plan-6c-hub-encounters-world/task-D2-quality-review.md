# D2 quality review — changes requested

Scope: independent read-only review of `task-D2-spec.md` against `git show`
of the current core, server, UI, and existing test paths. No implementation or
spec was edited.

## Blocking specifications

1. **The graph direction contradicts the plan's anchor semantics.**
   The executed spec says to search *outward* from placed anchors over directed
   source warps. Plan D2 instead says each shown singleton BFSes *to* a placed
   shown map, while the anchor point is the source warp tile **on that anchor**.
   Those are not interchangeable. A forward path `Dungeon -> Gate -> Town`
   reaches Town, but its final source tile is on Gate, not Town. To use Town's
   tile the implementation needs reverse adjacency (or an explicitly
   documented bidirectional rule) and must retain the anchor-side source event.
   Specify one graph orientation, its stable edge key, and an asymmetric
   synthetic fixture where choosing the other orientation changes the result.

2. **The GBC coordinate statement is wrong.**
   `GbcMap.width`/world placement coordinates are 32-px blocks, but
   `GbcWarpEvent.x/y` are 16-px half-block steps. `model/types.ts` and
   `load/events.ts` state this explicitly. The current “tile/block coordinate”
   wording leaves a factor-of-two placement error possible. Define the exact
   conversion before the pure helper receives a GBC anchor point, including
   whether odd half-block coordinates are preserved as fractions. Add a real
   GBC assertion whose expected coordinate fails if that conversion is omitted.

3. **The GBC adapter is missing.**
   `GbcProject.maps` exposes headers, sizes, environments, and planar
   connections; it deliberately does not expose warp events. The server gets
   events only by `loadGbcMapEvents(proj.root, map)`. The spec must name the
   adapter/cache boundary that loads all required events, resolves `mapConst`
   to map names, preserves source event ordinal, and keeps `/api/world` cache
   data immutable. Without it, “both families feed warp events” cannot be
   implemented from the declared GBC input.

4. **Fallback and enabled-state behavior are unspecified for GBC.**
   GBA has `autoLayoutUnplaced`/`resolveWorldPlacements`; GBC currently has
   only `buildGbcWorld` followed by `buildGbcWorldPayload`, and its existing
   `?dungeons=0 is ignored` test pins that behavior. “Reuse the GBA shelf
   output” is not possible for a `GbcProject`. Define the GBC fallback as the
   immutable baseline singleton positions from `buildGbcWorld`, or define a
   shared shelf input/output. Also define whether GBC honors
   `sidecar.dungeonAutoLayout`, `?dungeons=`, both, or neither. Name the
   resulting changed GBC route test and its reason.

5. **The spiral order is internally ambiguous.**
   “Square spiral” normally means Chebyshev rings, while “Manhattan distance
   first” means diamond rings. North/east/south/west does not order every
   candidate on either ring. Specify the candidate sequence exactly, including
   preferred-position attempt, ring metric, and tie ordering. The blocked
   fixture must assert the exact first free top-left coordinate, not only that
   it does not overlap.

6. **The collision contract conflicts with manual placement unless scoped.**
   The helper excludes hidden maps from obstacles, while manual hidden maps are
   drawn after D1 and manual placement applies only after automatic placement.
   Consequently a manual override can overlap an automatic result. State that
   zero-overlap assertions cover automatic shown placements before sidecar
   overrides, and test manual override separately, or include existing manual
   placements in the obstacle input. The current “zero overlaps among all
   placements” is too broad.

## Required test-impact additions

- `packages/server/test/gbcRoutes.test.ts` → `GET /api/world` deep-equality
  currently expects exactly `buildGbcWorld(...).placements`. It must change if
  D2 moves GBC singleton coordinates. Name it and explain whether the new
  expected value derives from a resolver without calling the route under test.
- The same file’s `?dungeons=0 is ignored` test must be retained unchanged or
  explicitly changed after the enabled-state decision above. The executed spec
  names only GBA tests, so it presently misses both required GBC impact
  decisions.
- Keep the existing second-request cache test meaningful: call the route twice
  after D2 and prove the cached base `GbcWorld` was not mutated by resolving
  near-warp positions. A pure helper must clone placements before moving them.
- Add a source-order-sensitive synthetic graph. Reversing map-array order is
  insufficient unless it also proves stable ordering for multiple equal-length
  warp paths and source event ordinals.

## What is already adequate

- The hand geometry fixture has a measurable non-equivalent center-edge
  mutant. Its expected `(2,-3)` follows the stated integer convention.
- The real-corpus names, hidden-gate traversal, deterministic repeated runs,
  manual-last rule, no-write requirement, collision-file grep requirement, and
  final coordinator mutation harness are all appropriate.
- D2 correctly keeps GBA scope to replacing shelf placement; it does not
  request unrelated GBA UI changes.

## Acceptance after revision

Before dispatch, revise the executed spec to resolve items 1–6, name every
existing GBA **and GBC** test that changes with its reason, and make each
synthetic mutation observably non-equivalent. Then the separate geometry/spec
review can independently re-derive the conversion and fixture.
