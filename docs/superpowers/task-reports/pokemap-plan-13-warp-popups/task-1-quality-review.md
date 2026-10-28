Quality: Approved with fixes

No Critical or Important findings.

- **Minor — Stale comments.** `packages/server/src/gbcRoutes.ts:499` says “Query params are ignored here on purpose,” but line 504 now reads `scope`. The comment at line 228 also says disabled auto-layout removes singletons without mentioning the dungeon-scope exception at line 230. Update both to describe the new behavior and clarify that `?dungeons=` remains ignored for GBC.

- **Minor — Cleanup can mask the original failure.** `packages/server/test/gbcRoutes.test.ts:1361` unconditionally calls `unlinkSync(sidecarPath)` when no file existed initially. If the toggle fails before creating the file, `finally` throws `ENOENT`, obscuring the assertion failure at line 1347. Use an existence check or force-enabled removal.

Production changes are narrow; sidecar writes in the new HTTP tests target temporary fixtures. CRLF and added-code line lengths pass inspection. No tests rerun and nothing written to disk.