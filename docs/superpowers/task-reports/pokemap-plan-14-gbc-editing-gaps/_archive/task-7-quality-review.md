**APPROVED**

No Critical, Important, or Minor findings in `b6ead42..aec6743`.

- Barriers cover create settlement, including rejection, before dependent actions.
- Visit checks suppress stale create results across A→B→A; unmount cleanup removes owned registry entries.
- Render-time state resets are conditional and converge.
- Cache invalidation covers save, discard, undo, redo, create, and project remount.
- Both families share ordering logic; tests use deferred promises without timers.

The surviving `apply()` mutation is consistent with `createEvent()` checking the same ticket first.

Read-only source review; test, build, typecheck, and mutation results are conductor-supplied, not independently rerun.