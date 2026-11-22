# Q4+Q5 review (Claude Opus spec and quality passes, read-only), diff 90fb6c2..06d3428

Verdict: PASS, no blockers.
- IMPORTANT (fixed): `gbcTileUsage` (`usage.ts:259`) still counted raw-0 cells as block 0 when block 0 holds the tile (same over-count Q5 removes); now skips raw-0 cells, `ids.has(map.border)` already covers them.
- IMPORTANT (left, per the plan ruling): for block 0 on a map whose border is 0, the raw-0 cells are counted as neither interior nor `block0AsBorder` (`usage.ts:172,185`); the map is still listed (border=1) and confirm still fires, only the displayed cell count under-reports. No test.
- NIT: `gbcOps.ts:250-251` `blockId !== 0` guard has no direct test (known gap); `save.ts:62-69` builds a third copy of the layout lookup; `gbaMapsByLayout` doc says it skips dangling ids but keys them under the dangling id (harmless); inner BlockEditRefusal wraps drop `cause`; hex label inline x4 in `gbcOps.ts`; `danglingLayout.test.ts` test 1 does not assert `want.edits.length > 0` or `usage`.
- Mutation sensitivity (by reading): danglingLayout 1-3, usage block-0 test and the gbcOps needle go red when their fix is reverted; the `gbcOps.ts:251` guard and the hex changes at `:154,:183,:194` do not.
