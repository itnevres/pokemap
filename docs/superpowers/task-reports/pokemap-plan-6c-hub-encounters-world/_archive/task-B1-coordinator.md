# Task B1 coordinator record

**Closed 2026-09-30.** Final code commit `f4e2afe` (report `c5f2042`).

## Flow
- Spec `task-B1-spec.md` (`293495b`). Sonnet implementer: `8f2859c` core sprites, `dbbb0a0` server
  route, `6183d74` UI summary. Gate 1,801 (one load timeout in `gbcRoutes` `/api/where` DUNSPARCE, 5 s,
  passed alone).
- Opus spec review ✅ compliant, 5 minor (`0051e73`); 7/7 spec mutations killed, 3 of 10 extras
  survived (X1, X3, X6). Sonnet quality review approved, 4 Minor + 5 Nit (`3886fa7`).
- One fix round, same implementer: `cf65b12` (SR-F1 method-order test), `f67a771` (QR-4 punctuated
  names, SR-F5 comment), `33dbff6` (QR-1/2/3/5/7, SR-F2/F3: shared `gbc/load/species.ts`
  `loadGbcSpeciesIds`, hardened loader errors, throw-path fixtures), `f4e2afe` (QR-8, SR-F4 X6). Gate
  1,821 pass / 0 fail, typecheck and build clean. No existing test touched beyond B1's named edits.
- Coordinator decisions: QR-4 → official punctuated display names (`Nidoran♀/♂`, `Mr. Mime`,
  `Farfetch'd`, `Ho-Oh`, both GBA and GBC spellings). Not done: SR-F4 X1 (`encodeURIComponent` is a
  no-op for real constants), QR-6 (INCBIN regex forms fail loudly), QR-9 (B3 deletes the gutter's
  duplicate helpers).

## Mutation re-run on `f4e2afe` (coordinator, `node mutate.mjs`, anchors asserted unique, restored from in-memory bytes)
| ID | Result | Red test |
|---|---|---|
| X3 no within-species sort | killed | summary: rows within a species come out in method order… |
| X6 icon route drops `cache-control` | killed | gbcRoutes icon: serves frame 0… byte-equal |
| F1 non-UNOWN null slot borrows Unown | killed | sprites: a non-UNOWN species with a 'dbw -1, -1' slot throws |
| F2 palette guard removed | killed | sprites: a pixel index outside PLTE throws a named error |
| F3 no `const_def` throw | killed | sprites: a constants file with no const_def throws |
| F4 Ho-Oh override dropped | killed | summary: displaySpeciesName Ho-Oh |
| F5 height<width guard removed | killed | sprites: a sheet shorter than wide (2x1) throws |
| F6 route always serves CHIKORITA | killed (via a const-assignment TypeError, not the assertion; the DUNSPARCE-differs test is the semantic pin) | gbcRoutes icon ×5 |
Requested 8, reported 8. Tree byte-identical afterwards.

## Facts for later tasks
- Only `UNOWN` breaks lowercasing in PerfPlus; the plan's other "traps" lowercase correctly.
- Every PerfPlus front sprite is opaque with a white index 0 (B3 must frame GBC sprites as cards).
- New observed load flakes (not code): `gbcRoutes` `/api/where/:species` DUNSPARCE 5 s timeout; and,
  when two full suites run concurrently, `dungeons.test.ts` (shared subject `.pokemap/dungeons.json`)
  and `GbcApp.test.tsx` "palette highlight resets…" (1 s `waitFor`). Don't run two full suites at once.
