# Task B4 coordinator record

**Closed 2026-10-01.** Final code commit `04c89cd` (report `306c2bd`).

## Flow
- Spec `task-B4-spec.md` (`8805d12`). Sonnet implementer: `cb29a03..1d41aa1`; gate 1,918, zero existing
  tests edited (test diff additions only). Declared deviation: `MapCanvas` reads `connections ?? []`
  because two pre-B4 fixtures (`WarpDestinationModal.test.tsx`, a `WorldCanvas.test.tsx` warp popup) omit
  the field. The spec review accepted it (the loader always normalises it; editing those fixtures would
  have been unnamed existing-test edits).
- Opus spec review ✅ (`54e1e2f`): 7/7 spec + 10/10 extra mutants killed; fit numbers re-derived;
  SR-F1 minor. **SR-F1:** a map switch with Encounters on fetched the new map, because the reset was
  a passive effect after the hook's effect. Sonnet quality review: changes requested. **QR-1 Important:**
  the composite effect depended on the whole `toggles` object, so toggling Encounters re-composited
  whenever another overlay was on; the "no recomposite" tests only covered all-off.
- Fix round, same implementer (a rate limit cut it off after item 3; it was resumed with its red-first
  item-5 tests intact): `8ac3bfb` (QR-1 per-flag deps + Grid-on case), `24c3260` (SR-F1/QR-3:
  Encounters held as `encountersFor: string | null`, so it is off in a new map's first render),
  `54ba041` (QR-6 pure `encounters/fit.ts` `fitWithBand`, unit-tested), `e05c03d` (QR-7 legend
  wording + "none on this map"), `b1f01d0` (QR-5 alert text wraps), `d3821ae` (QR-9/10, SR-F2), `04c89cd`
  (QR-8 docs). Gate 1,935 pass / 0 fail, typecheck and build clean; test diff vs `8805d12` additions only.
- Coordinator decisions: option (b) for SR-F1 (per-map state, not a during-render reset in the race-prone
  canvas). **Known limitation, accepted (QR-2):** in the GBA map editor with Encounters on, a paint stroke
  or event drag that crosses onto a sprite fires the canvas `mouseleave`, so the stroke ends early. The
  band lies outside the map image, and a fix belongs in the race-prone paint path; revisit in E1/E4 if
  in-context editing makes it matter. Kept `connections ?? []` (QR-4).
- Process note: the coordinator's untracked live-verify helper `packages/ui/.scratch-vite5183.mjs` was
  deleted during the fix round despite "leave it". Nothing tracked was affected.

## Mutation re-run on `04c89cd` (coordinator)
| ID | Result | Red test |
|---|---|---|
| H1 hook ignores `enabled` | killed | does not fetch while enabled is false |
| H2 cache placeholder removed | killed | a re-toggle while the first fetch is in flight does not fetch again |
| E1/E2 toggle not per-map (GBA/GBC) | killed | a map switch is off in the very first render… (each family) |
| R1 composite depends on `encountersFor` | killed | with Grid already on, toggling Encounters does not recomposite |
| S1 GBA side ignores connections | killed | left + up → strip on the right |
| S2 `gbaDirToCompass` bypassed | killed | same |
| S3 GBC side ignores connections | killed | west + north → right |
| F1 fit ignores band (unit / canvas) | killed / killed | fitWithBand left…; Fit with Encounters on leaves room for the band |
| F2 fit drops the left pan offset | killed | fitWithBand left: pushed right by band*z |
| T1 GBC `time` not passed | killed | a time switch re-dims the sprites without refetching |
Requested 12, reported 12; tree byte-identical afterwards. The old "whole `toggles` in deps" mutant is
now structurally impossible (Encounters left `Toggles`), so R1 is its replacement.
