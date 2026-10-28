# Task 11 final whole-branch review

Diff `935d981..ead73bf -- packages` (11,728 lines). Chain per the user's free-models-first directive: free model, then Codex, Claude Opus last.

## 1. Nemotron 3 Ultra (`ask.py nemotron-ultra`, brief + plan + spec rulings + diff)

Verdict "Approved with fixes", 12 findings (`task-11-review-nemotron.md`). Every finding checked against the code; none holds:

| Claim | Check | Result |
|---|---|---|
| `commit` `Promise.all` rejects on first failure, skips reload (Critical) | `WorldSurface.tsx:412`: each move's async body has `try/catch` and returns `null` on failure; the comment above says so | false |
| `useWorldTiles` spurious version bump on key switch | `onload` checks `mapRef.current.get(p.map) === entry && entry.url === url` | false |
| stale `warpInputs` between layout and passive effect | layout effects of a commit run before its passive effects | false |
| encounter cache not cleared on `cacheKey` | deliberate (comment at `WorldSurface.tsx:306`); time handled by `time`-driven dimming | false |
| GBC jump test still 60% | `GbcWorldCanvas.test.tsx:1209` asserts "full limiting-dimension fill"; gate green | false |
| hidden revealed map not drawn under a dungeon filter | `WorldSurface.tsx:238`: `mapFilter !== null` already draws every in-scope map | false |
| GBA `fetchWarps` lacks `mapName` check | kept "as before" (`gba/worldSurface.tsx:152`); spec names the check for GBC only | not a defect |
| failed warp fetch doesn't bump `warpVersion` | nothing new to draw; retry on the next view change (P12-4s), seen live | false |
| GBC `jumpFit` wrapper default 0.6 | default is `JUMP_FILL_FRACTION` = 1 | false |
| orphan 0x0 jump highlight | `outline()` returns null unless `hasSize` | false |
| 5 "weak test" items | opinions; the rulings they name each have a mutation-red test (Task 6/8 matrices) | no change |

All false, so coverage confidence was low for a High-tier review: escalated to Codex (plan Step 2's named reviewer).

## 2. Codex `gpt-6-astra` (read-only)

Verdict "Approved with fixes": 0 Critical / 0 Important / 2 Minor (`task-11-review-codex.md`). Both confirmed real and fixed:

- **M1 tooltip re-clamp.** Moving between sprites whose tooltips have the same text reuses the node and changes only `left/top`; the observer watched content only, so the old `translate` stayed and the tooltip could clip. Fix (`WorldSurface.tsx` clamp effect): observe `style` attributes too and re-clamp only when the anchor (`left|top|text`) changes, so the clamp's own `translate` writes return early and cannot loop. Test `WorldSurfaceInteraction.test.tsx` "re-clamps the tooltip when it moves to a sprite with the same text": red before the fix (`expected '50px' to be '0px'`); mutation (attribute observation removed) red; restored sha matches.
- **M2 warm-up default list untested.** Every warm-up test passed explicit names. Added (h) no-argument `warmUp()` per family (renders the default world list; a later GET of a world town renders nothing new) and a hub test (`prewarm` unset logs nothing; `prewarm: true` logs one `warmed N world tiles` line).

## 3. Fix-round re-review and gate

Nemotron Ultra on the fix diff: Approved; its one Minor (`on.current()?.dispose()` then `on.close()` in the hub test) is not a defect: `close` only closes the HTTP server, so the explicit dispose is the one stop for the warm loop (`task-11-fix-rereview-nemotron.md`). Gate 3,821 pass / 0 fail / 234 files (+4 tests); typecheck and UI build pass; subject porcelain unchanged before and after (GBA 9, PerfPlus 0).
