# Plan 8 Task 6: coordinator record (one editing workspace with family slots)

Code `8121835..e2fbb6c` (codex gpt-5.6-terra, thread 01a13658…, plus pre-review fix round 1 and the coordinator's World pin `AppContextVisit.test.tsx`). Executed spec `task-6-spec.md`.

- **Red proof** (m6 at BASE 8121835, `task-6-red-coord.log`): the three `AppVisitGuard.test.tsx` witnesses fail at BASE (TestingLibraryElementError "No event selected."; AssertionError alert not null ×2).
- **Gate at e2fbb6c:** 2,697 pass / 0 fail, 169 files; typecheck and UI build pass; oracle empty.
- **Review** (Sonnet, merged): Spec ✅, quality Approved, 0C/0I/3M (`task-6-review.md`).
- **Teeth-proof** (m6b at e2fbb6c, `task-6-mutations.mjs` / `.log`; restore byte-identical):

| Mutant | shared visit | shared shell | GBA guard | GBA active | GBA ctx | GBA ctx pin | GBC editing | GBC ctx |
|---|---|---|---|---|---|---|---|---|
| V0 baseline | 3P | 3P | 3P | 3P | 12P | 1P | 36P | 23P |
| V1 `changed` never reported | **survived** | — | KILL | — | — | — | KILL | KILL |
| V2 `isCurrent` always true | KILL | — | KILL | — | — | — | KILL | — |
| V3 body remounts on `active` toggle | — | KILL | — | KILL | KILL | fail (no assert msg) | — | KILL |

  V1 survives the shared suite (review M1: its first test never observes `changed === true`) → fix round 2. Every mutant kills in both families.
- **Live check, plan Step 5** (scratch hub 5184 from `p8`, Vite 5183 → `p8` at e2fbb6c, headless chromium-1208 over CDP, 1280×860; `visibilityState` visible before writes):
  - **GBC PerfPlus NewBarkTown:** World → ContextMenu → Edit here. Overlay vs world body 0 mismatches. Pencil + metatile 0x7 + one click → `paint/begin, apply, end`; Undo → `/undo`; Done exits with no dialog. 0 `/api/world` requests after load. World canvas node and `.app__map-editing-body` node identical through every step. A→B→A: stamp picked in context (`aria-current` true), tree-click Route29, tree-click NewBarkTown, re-enter: stamp not current, pencil still pressed, same canvas and body nodes. PerfPlus porcelain empty, no `.pokemap`.
  - **GBA LittlerootTown** (hub restarted on the GBA root): same sequence (click from the overlay rect: the Pencil strip shifts the stage, a known trap). `paint/begin, apply, end`, `/undo`, Done clean, 0 `/api/world` after load, same nodes throughout. A→B→A via Route101: stamp `aria-pressed` true → false, pencil kept, same nodes. `map.bin` `bdc3ddce2…`, `world.json` `9c8ab2a…`, `dungeons.json` `f73f9b7…`, porcelain equal to the 8-line snapshot.
  - Note: one GBA read of the overlay right after the Pencil strip opened returned 0 opaque pixels; a re-read after the redraw gave 98,280 / 80,184. A mid-resize read, not a blank overlay.
