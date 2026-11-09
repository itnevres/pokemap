- **ADDRESSED — Initial focus escape.** Focus now starts on the first enabled control; panel-level Tab handling also contains focus. Tests cover loading and loaded warp/coord/BG boundaries.
- **ADDRESSED — Hidden sprite selection.** Filtering out the selected sprite clears its model value and blocks submission until a visible option is selected.
- **ADDRESSED — Incomplete edit-request lock.** Both families track move/delete/duplicate and undo/redo requests. Deferred tests verify Add remains disabled with the in-flight reason until settlement.
- **ADDRESSED — Synchronous submit latch witness.** Two form submissions now execute within one batching boundary against a deferred create; the assertion requires exactly one call.

**New findings:** No Critical, Important, or Minor findings in `5c94a4e..c6a7bb1`.

Read-only review; no files changed. Tests, typecheck, build and mutation results are conductor-supplied, not independently rerun.