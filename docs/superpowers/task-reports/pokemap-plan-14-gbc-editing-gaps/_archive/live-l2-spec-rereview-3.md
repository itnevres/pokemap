PASS

**ADDRESSED** — `packages/core/src/addEvent/entryPoints.ts:88` and `:93` exclude cached `Error` values from reuse in both reference and definition caches. Subsequent uses retry failed reads despite unchanged signatures. Deterministic parse failures are also retried, matching the accepted tradeoff. Staged GBC replacement and success-only publication remain intact.

The regression at `packages/core/test/addEvent/entryPointIndex.test.ts:201` injects a single construction-time read failure, leaves file metadata unchanged, and verifies indexed/uncached equality plus `OldScript` eligibility after recovery.

No new issues found in `70d6d10..044c87f`.

Vitest was not run. The 616/616 tests, passing typecheck, and regression failure with the fix reverted are conductor-reported.
