# D2 scoped executed-spec review — final 3

**Verdict: pass.** Reviewed commit `4dcd2f3` only against the approved `ba7a863` contract. The added signed-zero assertion and null-arrival fixtures are coherent and distinguish observable results. No implementation/spec edits, corpus writes, test suites, or census reruns were performed. A small read-only Node calculation checked JavaScript signed-zero behavior.

## Signed-zero witness

The approved fixture has anchor origin `(0,0)`, dimensions `12×4`, arrival `(1,0)`, target `3×2`, and gap 1. North wins; x before rounding is `1−3/2=−0.5`, and y is `0−1−2=−3`. JavaScript returns `-0` from `Math.round(-0.5)`. The required output normalizes that to `+0`, yielding `(0,-3)`.

The new checks distinguish the values correctly: `x === 0` is true for either sign, while `Object.is(x, -0)` is true only for negative zero. The Node calculation independently produced raw `=== 0: true`, raw `Object.is(-0): true`, normalized `=== 0: true`, and normalized `Object.is(-0): false`. Thus the added `Object.is` assertion makes the representation requirement visible in the core result, where JSON serialization cannot erase the distinction.

The mutation remains subject to the spec's existing requirement to demonstrate an actual output change before pinning its ID. In particular, arithmetic after rounding can normalize incidentally: the same probe confirms `Object.is(Math.round(-0.5) + 0, -0) === false`. Removing a redundant explicit normalizer in such an implementation would be equivalent and must be rejected, not counted as a failed test obligation. A real signed-zero mutant must let `-0` reach the returned placement. This is an implementation-specific mutation-anchor check; the test's observable contract is sound.

## Null-arrival traversal versus anchoring

Both new cases follow the approved distinction between a directed map edge and a usable geometry endpoint:

1. A shown unresolved singleton T can follow `T → hidden G` with null arrival, then `G → placed shown A` with a resolved arrival. No geometry uses G's missing endpoint. The second edge supplies A's local point, which is converted and added to A's world origin. With the approved anchor/target geometry, final arrival `(1,0)` produces `(0,-3)` even when T's fallback is `(100,100)`. Dropping the null-arrival intermediate edge instead leaves T at `(100,100)`, so this fixture can distinguish traversal loss.
2. In a separate graph with only `T → placed shown A` and null arrival, no usable path ends on a resolved anchor endpoint. T must retain exact fallback `(100,100)`. Treating the missing arrival as `(0,0)`, a source coordinate, or another invented endpoint moves it near A or throws; either outcome fails the required full fallback assertion. Give this case no alternative resolved path and make its fallback distinct from every chosen fabricated-endpoint result before pinning the mutant.

These examples need A to be a genuine initially placed multi-map anchor under the helper's input representation, T to be an automatic singleton, and G to be hidden. They should assert complete coordinates and not merely placement presence, because fallback already contains T. The spec now requires both separate behaviors; no contradiction with shown-singleton stopping or iterative floor chaining is introduced.

The added CeruleanCave1F adapter pin complements these synthetic cases: it checks that a resolved destination map with an invalid positional destination index still yields a map edge with `arrival: null`. The pure helper fixtures then prove how such an edge is consumed. An array lookup returning `undefined` may be guarded normally; no missing event may be dereferenced or converted into a fabricated point. The literal out-of-range corpus fact was approved previously and was not recounted in this scoped review.

## Test-impact changes

Moving the new GBA placement check to `resolveWorldPlacements` with an explicit in-memory enabled sidecar solves the existing real-subject false-flag problem without corpus writes. Existing GBA count/flag expectations stay unchanged. The new GBC adapter and core tests are explicitly named by purpose; the previously approved GBC cache/placement test impacts are unchanged. The revisions add observable coverage without altering the approved geometry, tie ordering, chaining, fallback, or manual-last contract.

No open spec findings in this scope. The implementer and subsequent mutation review must still prove the actual signed-zero and null-arrival mutant anchors affect returned output; the mathematical witness alone does not certify an arbitrary textual deletion as non-equivalent.
