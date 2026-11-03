Reviewed fix commit `d10662b` against the code, spec, and both subject repositories. No files edited; no Vitest run. The 30/30 pass, clean typecheck, and red mutations are conductor-supplied evidence.

| Finding | Verdict | Evidence |
|---|---|---|
| S1 | ADDRESSED | `packages/core/src/addEvent/gbaOptions.ts:61` returns exactly `["sign","hidden_item","secret_base"]`. |
| S2 | ADDRESSED | `gbaOptions.ts:42` limits items to definitions before `ITEMS_COUNT`; `gbaOptions.ts:47` selects numeric entrance IDs and their aliases. Subject item categories and secret-base groupings are excluded; real IDs remain. |
| S3 | ADDRESSED | `packages/core/src/addEvent/gbcOptions.ts:28` recognizes `add_tm`/`add_hm`, producing the `TM_*`/`HM_*` names used by subject item balls. |
| S4 | ADDRESSED | `packages/core/src/addEvent/entryPoints.ts:26` collects only object/bg/coord references. Route29 scene/callback references no longer qualify by themselves. |
| S5 | ADDRESSED | `gbcOptions.ts:38` returns `vars: []`. |
| Q1 | ADDRESSED | `entryPoints.ts:10` distinguishes local declarations, skips bare labels, and retains same-line opcodes for data exclusion. |
| Q2 | ADDRESSED | `gbcOptions.ts:32` merges generated machine-item names with ordinary items; includes subject-used `TM_ENDURE`, `TM_ROLLOUT`, and `HM_WATERFALL`. |
| Q3 | ADDRESSED | `packages/core/src/gbc/load/constCounter.ts:13` rejects backward transitions with source and one-based line; equality remains allowed. Loader callers supply filenames. |
| Q4 | ADDRESSED | `entryPoints.ts:34` wraps parsing errors; call sites identify scanned files, staged maps, and GBA JSON sources. |

**New Critical/Important breakage introduced by the fix:** None found.

**Deferred (out of scope)**

- `entryPoints.ts:58`: Valid JSON with malformed event-array structure can still throw outside the filename wrapper; this is pre-existing schema-validation behavior.

All findings addressed: YES