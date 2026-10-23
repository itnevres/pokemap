- **F1 — ADDRESSED.** [gba.ts:41](</C:/Programming Projects/PokeMap/packages/core/src/defects/gba.ts:41>) reparses tileset declarations and reads metatile binaries per request; C3 no longer calls cached `Project.tileset()`.

- **F2 — ADDRESSED.** [gba.ts:12](</C:/Programming Projects/PokeMap/packages/core/src/defects/gba.ts:12>) removes `MAP_NONE` from exemptions, allowing C4 detection. The incomplete-index issue below can still suppress it.

- **F3 — NOT ADDRESSED fully (Important).** Selected-map parse errors now include the filename, and request failures reach the visible banner. However, [gba.ts:71](</C:/Programming Projects/PokeMap/packages/core/src/defects/gba.ts:71>) silently marks the index incomplete; lines 78 and 94 then suppress C4/C11. A selected map containing only a missing warp/connection target, alongside an unrelated malformed map, returns `[]`. [useMapDefects.ts:24](</C:/Programming Projects/PokeMap/packages/ui/src/hooks/useMapDefects.ts:24>) treats that as success, leaving no warning. Preserve available defects and expose a visible partial-check failure naming the unreadable file; add regression coverage for this combination.

**New breakage in fix diff**

**Important:** Silent C4/C11 suppression described under F3. No other Critical/Important regression identified.

Coordinator evidence accepted: **3,343 passed / 0 failed / 208 files**, typecheck and UI build passed. Suite not rerun; live Map/World banner behavior remains unverified.