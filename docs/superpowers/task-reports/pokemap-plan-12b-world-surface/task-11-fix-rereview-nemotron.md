Approved with fixes

1) M1 re-clamps on anchor change, no loop: packages/ui/src/canvas/WorldSurface.tsx:672-675 anchor includes left/top/textContent; line 686 adds attributes/style filter; clamp writes translate/maxWidth/boxSizing but not left/top, so anchor unchanged → early return at 674 prevents self-loop.

2) Tooltip test fails without fix, passes with it: packages/ui/test/canvas/WorldSurfaceInteraction.test.tsx:1020-1060 moves between two same-text sprites at x=0 and x=150; without style observation the observer misses left/top change and translate stays 50px (clipped), test expects 0px.

3) (h) tests and hub prewarm fail if default empty or prewarm ignored/forced, no leaks: packages/server/test/warmUp.test.ts:213-237 and 428-451 call no-arg warmUp(), expect rendered>10 (fails if empty), then fetch cached map asserting render calls unchanged; packages/server/test/hub.test.ts:507-535 asserts no log when prewarm unset, log with count>0 when prewarm:true, both hubs closed in finally, log mock restored.

4) Minor: packages/server/test/hub.test.ts:527 calls `on.current()?.dispose()` then `on.close()` — verify this isn't double-dispose or leak; otherwise correct.
