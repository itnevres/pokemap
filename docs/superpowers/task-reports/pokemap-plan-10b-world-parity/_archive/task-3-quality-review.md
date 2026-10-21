## Spec compliance: n/a

## Quality: Changes requested

## Findings

- **Important — [gba.ts:11](</C:/Programming Projects/PokeMap/packages/core/src/defects/gba.ts:11>): `MAP_NONE` hides a real C4 build error.** The subject defines `MAP_DYNAMIC` and `MAP_UNDEFINED`, but no `MAP_NONE` definition exists in its include/data/src trees. A warp with `dest_map: "MAP_NONE"` therefore passes this checker despite referencing an undefined map. Remove that exemption and replace its acceptance test with a build-defect regression.

- **Important — [gba.ts:43](</C:/Programming Projects/PokeMap/packages/core/src/defects/gba.ts:43>) and [useMapDefects.ts:18](</C:/Programming Projects/PokeMap/packages/ui/src/hooks/useMapDefects.ts:18>): malformed unrelated maps silently suppress all warnings.** Every request fully parses every map. Invalid JSON or malformed event arrays in an unrelated map throws, discarding even C1/C3 defects already collected for the selected map. The route returns 500, then the hook replaces the result with `[]`; users see the same state as a clean map. Add filename context to parse failures and visibly distinguish “check failed” from “no defects.” Add regressions for malformed selected and unrelated maps, including a selected map with a known defect; do not silently skip unreadable maps.

## Verification and limitations

- Independent read-only scan of all **1,209 subject maps** found no C1/C4/C5/C6/C11 hits. Independently decoded Saffron_Temp’s 18 invalid IDs and confirmed its secondary metatile file contains 230 entries.
- C3’s split predicate agrees with the existing save guard. C2 is explicitly dropped; its tests establish omission, not detection.
- Unknown maps return 404. Malformed JSON reaches the existing 500 handler without escaping it, but that path lacks a regression.
- SaveDialog invokes the callback only after successful commit; FamilyApp forwards it to the new token increment. Hook tests cover refetch and stale-response suppression. Adapter-level save/refetch and live banner behavior remain unverified.
- Accepted coordinator evidence for HEAD `6e0745c`: **3,330 passed / 0 failed / 208 files; typecheck and UI build passed.** Suite not rerun.

Report returned inline because the review rules and filesystem are read-only; no files changed.