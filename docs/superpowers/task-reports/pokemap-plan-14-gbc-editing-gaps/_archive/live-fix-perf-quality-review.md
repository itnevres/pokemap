**CHANGES REQUESTED**

- **Important — `packages/server/src/addEventRoutes.ts:134`: external disk changes leave entry points stale indefinitely.** After priming the cache, remove or rename a referenced GBC `home/*.asm` script or GBA script in another map. Options still offer the old label, and `create()` validates against that same stale index, accepting a now-invalid reference. Previously each request rescanned disk. Save/discard in this handler or project reopening repairs it; external edits or another handler’s save do not. Add freshness detection and regression coverage for removed/changed definitions. The new external-edit tests explicitly expect stale results before discard, so they do not protect the previous behavior.

GBC own-file reference replacement and home-definition precedence look correct. Other sessions’ unsaved references remain excluded as before. Memory is project-sized and released on invalidation; no unbounded accumulation found. Synthetic overlay tests have meaningful explicit expectations.

Read-only review; supplied test/typecheck/mutation evidence was not rerun.