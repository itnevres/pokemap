# D2 quality final delta review — changes requested

Scope: read-only comparison of `ecbd4be..1d31cc2` in `task-D2-spec.md`.
No implementation or spec was edited.

## Approved deltas

- The GBA adapter distinguishes symbolic destination ids: they remain graph
  edges but cannot supply a final anchor-frame coordinate.
- The GBC adapter now handles both `destWarp === -1` and a positive,
  out-of-range destination ordinal. It preserves the directed map edge only
  for hidden traversal and rejects it as a final geometric arrival.
- Equal-length IlexForest paths now choose `AzaleaTown` before `Route34`, then
  use the existing full edge-key tie-break. The acceptance pin names both the
  chosen anchor and warp #7.
- The Seafloor path is correctly split into two placement iterations:
  Entrance reaches Underwater_Route128 first; Room1 may then anchor to the
  newly placed Entrance. This matches the rule that traversal cannot pass
  through an unresolved shown singleton.
- Normalizing returned `-0` to `+0` is the correct companion to the revised
  `Math.round(-0.5)` geometry fixture.

## Required assertion additions

1. **Signed zero needs an observable assertion.** The fixture states expected
   `x: 0`, but a loose numeric equality can hide JavaScript `-0`. Require an
   assertion such as `Object.is(result.get("Target")!.x, -0) === false` (and
   assert `x === 0`), or assert a byte-stable serialized placement. Add an
   omit-normalization mutation and prove it changes this assertion.

2. **Invalid GBC arrivals need a direct test.** The spec now defines correct
   `-1`/out-of-range behavior but no acceptance fixture exercises it. Add a
   small normalized-link fixture where an `arrival: null` edge crosses a
   hidden map and a subsequent valid edge anchors successfully; also assert
   that an `arrival: null` edge ending directly at a shown anchor leaves its
   singleton on fallback. Pin the measured Cerulean out-of-range adapter
   result, or an equivalent isolated adapter test, so `destWarp - 1` cannot
   silently index `undefined`.

These are narrow test-spec gaps. The measured adapter facts, Ilex tie-break,
and Seafloor chain are otherwise ready.
