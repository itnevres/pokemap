# Plan 8 Task 1 — coordinator record (shared stroke chain)

Commits `f05ff8b..e3d66b9`: `7ffae94` shared hook, `e9bbfd9` GBC wiring, `94c2f03` GBA wiring (F6), `cfa6bdd` report, `e3d66b9` fix round 1.

- Implementer: Claude Sonnet (ledger ruling). Reviews: Opus spec (❌ → 2 Important), Sonnet quality (Approved, 5 Minor); fix round 1; Sonnet scoped re-review (all 4 ADDRESSED, 0 new breakage).
- Gate at `e3d66b9`: **2,624 pass / 0 fail, 154 files**; typecheck and UI build pass. Oracle `git diff f05ff8b -- ':(glob)packages/*/test/**' | grep -E '^-[^-]'` = empty.
- Mutations (own worktrees `m` @ `cfa6bdd`, `m2` @ `e3d66b9`; `task-1-mutations*.log/.mjs`): M1 begin not awaited, M2 move not chained, M3 end not awaited, M4 retired visit paints, M5 no lost-mouseup end, M7 retire-before-begin, M8 unguarded report, M9 GBA map guard removed — all killed. M6 (terminal catch) equivalent after the fix (ruled). Restores byte-identical.
- Live check (hub 5184 from `p8`, scratch `POKEMAP_HOME`; Vite 5183 → `p8`; `visibilityState` visible before each write):
  - **GBC PerfPlus NewBarkTown:** rapid click → `begin, apply(5,3), end`; drags → `begin, apply(4,4), apply(5,4), end` and `begin, apply(3,6)…(6,6), end`. Saved (blk changed at 7 bytes, asm unchanged), then reverse-painted the 7 original metatiles through the UI (requests matched the plan exactly) and saved: **blk and asm byte-identical**, porcelain clean, no `.pokemap`. (Undo is cleared by save, so the reverse was by paint, as in Plan 7.)
  - **GBA LittlerootTown:** rapid click → `begin, apply, end`; drag → `begin, apply×10 (9..12,12), end` (no dedupe, unchanged GBA behaviour). Undo ×2 → exactly two undo steps, then clean. `map.bin`, `map.json`, `layouts.json`, `world.json`, `dungeons.json` and the 8-line porcelain byte-identical.
- Observations (not Task 1 code): GBA map at 1× opens anchored bottom-right in an 860-wide stage, so the centre is off-map (known 6c "map taller than viewport" family). GBA Dropper-then-Pencil produced no stamp in this session; a palette thumb worked. The dropper branch is unchanged by Task 1 — check on `master` before treating it as a bug.
