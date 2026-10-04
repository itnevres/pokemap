# D2 final executed-spec review — approved

Scope: read-only `git diff 1d31cc2..4dcd2f3` and source-shape review. No
implementation or spec was edited.

## Signed zero

Resolved. The hand fixture produces JavaScript `-0` before normalization.
The acceptance test now asserts both numeric zero and
`Object.is(x, -0) === false`; removing normalization changes that witness.

## Invalid arrival links

Resolved. The GBC adapter retains an edge if its destination map resolves,
but assigns `arrival: null` for `-1` and out-of-range destination ordinals.
The measured `CeruleanCave1F` event-0 witness pins the out-of-range case and
prevents indexing an undefined destination warp.

The synthetic cases are complementary and non-equivalent:

- null arrival through a hidden map may continue to a later valid arrival;
- null arrival directly into a shown anchor must remain at fallback;
- treating either null arrival as final changes the direct-anchor result.

## Integration and scope

The named pure helper and test path remove the remaining implementation
ambiguity. The GBA corpus test uses an in-memory enabled sidecar, so the
subject's persisted false toggle cannot mask D2. It writes no corpus file.
GBC route/cache test changes remain named, and the unchanged GBA expectations
are correctly recorded.

No contradictions or quality blockers remain. The listed mutations have an
observable output or assertion change.
