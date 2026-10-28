Approved with fixes

- **Minor — [WorldSurface.tsx:680](</C:/Programming Projects/PokeMap/packages/ui/src/canvas/WorldSurface.tsx:680>):** Tooltip clamping ignores attribute changes. Moving directly between sprites with identical tooltip text can reuse the tooltip node and change only `left/top`; its previous translation remains, allowing clipping at the new position. Re-clamp on anchor changes. Existing tests cover only initial tooltip creation.

- **Minor — [warmUp.test.ts:60](</C:/Programming Projects/PokeMap/packages/server/test/warmUp.test.ts:60>):** Every warm-up test supplies explicit map names, bypassing production’s default-list construction. Returning an empty default list would leave these tests passing while disabling automatic pre-warming. Add coverage for no-argument warm-up and the hub invocation.

No Critical or Important findings. Static review only; no files edited or tests/builds run.