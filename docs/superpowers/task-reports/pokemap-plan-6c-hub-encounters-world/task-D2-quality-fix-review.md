# D2 quality fix review — changes requested

Scope: read-only review of revised `task-D2-spec.md` at `991267d`, checked
against current source and the previous quality report. No implementation or
spec was edited.

## Prior findings resolved

1. **GBC unit conversion:** resolved. The spec now identifies GBC event
   coordinates as 16-px half-block steps, divides by two before adding the
   32-px block-space origin, preserves fractions, and pins AzaleaTown #7.

2. **GBC event adapter:** resolved. It names `loadGbcMapEvents`, const-name
   resolution, source ordinals, positive 1-based `destWarp` resolution, and
   omits `-1` links with no stable endpoint.

3. **Family fallback and toggle behavior:** resolved. GBA keeps its existing
   toggle and shelf fallback; GBC uses immutable `buildGbcWorld` singleton
   positions as fallback, always applies near-warp, and retains ignored
   `?dungeons=0` behavior.

4. **Spiral order:** resolved. The candidate sequence is now a defined
   Manhattan-ring enumeration, including cardinal-first and deterministic
   remaining offsets. The blocked fixture pins `(9,9)`.

5. **Manual-placement collision scope:** resolved. Automatic positive-size
   shown placements are obstacles; manual placements apply afterward and may
   overlap. Corpus no-overlap checks are correspondingly scoped.

6. **GBC route/cache test impact:** resolved. The revised spec names the
   deep-equality test, preserves the query-string test, and requires the
   second-request test to prove the base cache is unchanged.

7. **Input-order mutation:** resolved. The revised synthetic requirements now
   cover competing equal-length paths, source ordinal, canonical candidate,
   input reversal, and a collision winner.

## Remaining blockers

1. **Traversal ordering still uses contradictory direction language.**
   The behavior correctly defines a forward path from singleton to anchor:
   `singleton -> hidden -> shown anchor`. It then says candidates are placed
   by shortest-path length “from initially placed shown multi-map anchors”.
   That is the reverse direction and is not defined for a directed graph. Say
   “shortest forward path length **to** an initially placed shown multi-map
   anchor”, then define how subsequent singleton anchors participate. This
   matters for one-way fixtures and for deterministic floor chaining.

2. **Existing GBA test impact needs an executable reason.**
   At `991267d`, `packages/server/test/world.test.ts` → `returns placements,
   components, conflicts and vertical links` asserts only count, vertical-link
   count, and conflict array shape. `respects the dungeonAutoLayout flag`
   asserts only relative placement count. Near-warp coordinates do not require
   either expectation to change. Either leave these tests unchanged and add
   D2 coordinate coverage in a named new/core test, or specify the exact new
   coordinate assertion added to each and state that it is added coverage.
   The current claim that their existing expectations change because positions
   move is not true of their current assertions.

## Result

The revision resolves the six original design blockers. Resolve the two items
above before dispatch: the first controls the algorithm’s directed behavior;
the second satisfies U1’s requirement that every changed existing GBA test is
named with a factual reason.
