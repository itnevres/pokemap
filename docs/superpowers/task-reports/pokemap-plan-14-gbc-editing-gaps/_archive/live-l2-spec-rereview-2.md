FAIL

- **ADDRESSED — previous spec Important:** `packages/core/src/addEvent/entryPoints.ts:112` substitutes staged GBC references before consuming the disk result, preserving uncached error ordering and attribution. `packages/core/test/addEvent/entryPointIndex.test.ts:134` covers malformed own/other files with existing and fresh indexes.

- **ADDRESSED — previous spec Minor:** `packages/core/test/addEvent/entryPointIndex.test.ts:21` selects a disk-referenced GBA label, overrides its staged body with executable/non-executable content, and asserts eligibility changes plus cached/uncached equality.

- **ADDRESSED — previous quality Minor:** `packages/core/test/addEvent/entryPointIndex.test.ts:169` verifies that a later refresh failure preserves all three published maps, then checks successful recovery. Publication occurs after result evaluation at `packages/core/src/addEvent/entryPoints.ts:151`.

- **New Important — transient I/O errors become permanently cached:** `packages/core/src/addEvent/entryPoints.ts:87` and `:92` cache **read failures**, alongside deterministic parse failures, after recording the file signature. If `read()` fails temporarily during `buildEntryPointIndex()`, subsequent lookups reuse that `Error` whenever size/mtime remain unchanged—even after reading succeeds again. The uncached path succeeds while the indexed path continues throwing. The same poisoning can occur when a failed own-map disk read is ignored by staged replacement and then published. Cache deterministic parse failures separately; retry read failures. Add a regression where `read()` throws once during construction, then succeeds without a metadata change, and assert indexed/uncached equality.

Unchanged parse-error reuse itself is correct; changed signatures trigger reparsing. The current regressions meaningfully cover staged replacement and atomic publication, but do not cover transient read-error recovery.

Vitest was not run. The 615/615 results, passing typecheck, and mutation failures (7/2/1) are conductor-reported.