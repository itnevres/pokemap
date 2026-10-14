# Plan 8 Task 5: coordinator record (shared edit-session core)

Code range `d37959e..a86983d`; reviews and mutations are in the ledger and the archived task-5 reports.

**Step 4 live check (2026-10-13, HEAD 7e75872 = code a86983d).** Scratch hub on 5184 (`preload.mjs`, scratch `POKEMAP_HOME`) from `p8`; Vite on 5183 → `p8`; headless `chromium-1208` over CDP at 1280×860. `visibilityState` was `visible` before each write. External baselines re-measured before the check: all match the ledger values.

- **GBC PerfPlus NewBarkTown, Map view.** Byte snapshot of `maps/NewBarkTown.blk` and `.asm` taken first. Metatile 0x7, Pencil, one click → POST `paint/begin, apply, end`; Undo/Save enabled. Undo → POST `/undo`; the canvas pixel hash equals the pre-paint hash; Undo disabled, Redo enabled, Save disabled (clean). Redo → POST `/redo`; hash equals the painted hash; Save enabled. Save Changes → SaveDialog "maps/NewBarkTown.blk -- 1 block changed" → Save → POST `/commit`; dialog closed, Undo and Save disabled. `cmp -l`: byte 46 `1 → 7` (octal), nothing else; porcelain ` M maps/NewBarkTown.blk`. Reverse edit through the UI: metatile 0x1 at the same cell, Save → `/commit`. After: `cmp` identical to the snapshot for `.blk` and `.asm`; SHA-1 `0b7d45d…` / `56f87ef…`; porcelain empty; no `.pokemap`.
- **GBA LittlerootTown, Map view** (hub restarted on the GBA root). Snapshot of `data/layouts/LittlerootTown/map.bin` and porcelain taken first. Same sequence (metatile 0x7, Pencil): `paint/begin, apply, end`; Undo restores the pre-paint hash and goes clean; Redo restores the painted hash; SaveDialog "data/layouts/LittlerootTown/map.bin -- 1 block changed" → `/commit`. `cmp -l`: byte 261 `1 → 7` (low byte only; the collision/elevation byte kept). Reverse edit 0x1 through the UI, Save. After: `cmp` identical; SHA-1 `bdc3ddce2…`; porcelain equals the 8-line snapshot; `world.json` `9c8ab2a…`, `dungeons.json` `f73f9b7…`.

Result: PASS in both families.
