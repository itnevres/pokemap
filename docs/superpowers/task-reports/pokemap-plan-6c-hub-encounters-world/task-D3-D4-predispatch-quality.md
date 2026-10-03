# D3/D4 predispatch quality audit — approved

Scope: read-only `git show` review of executed specs `9bca4c0` (D3) and
`c884031` (D4), current shared seams, and the governing D3/D4 plan/design
text. No implementation or tests ran.

## D3

- **U1 scope:** approved. GBC gets an isolated guarded dungeon hook, GBC
  routes lose only `/api/warps/*` and `/api/dungeons` 501 exclusions, and
  GBA routes/hooks/tests stay unchanged. `/api/world/dungeons`, sign, and
  edit remain excluded.
- **Coordinate contract:** approved. The measured BurnedTower fixture applies
  exactly one half-block conversion; its `(123,203)`/`(283,363)` line ends
  independently detect direct `destWarp` use and omitted conversion.
- **Scoped canvas:** approved. Scope explicitly overrides ordinary visibility,
  and filters draw, fetch, hit test, selection, drag/drop, and refit. Marker
  LOD and independent dungeon lines are not conflated.
- **Persistence/error boundary:** approved. The spec requires validated bodies,
  guarded wire fetches, visible failures, serial PerfPlus restoration guarded
  by bytes and parent existence, and the complete test-tree collision scan.
- **Mutants:** D3-M1 through M6 have named observable witnesses. No equivalent
  mutant is pinned: endpoint indexing, scaling, scope leakage, outside lines,
  reload persistence, and malformed response handling each change asserted
  output.

## D4

- **U1/U3 scope:** approved. It adds only acknowledgement state, badge/status
  display, and a badge-only right-click seam. It does not alter map placement,
  layout, core conflict generation, or any unrelated GBA behavior.
- **Key/sidecar contract:** approved. The actual conflict shape has no `dx` or
  `dy`; the JSON tuple key includes both paths and both coordinate pairs, is
  delimiter-safe, and preserves existing viaA/viaB ordering. Optional
  `acceptedConflicts` defaults safely and rejects malformed arrays.
- **Route/UI contract:** approved. Both handlers validate the exact body and
  current conflict key, persist only `world.json`, return fresh accepted flags,
  and leave placements byte-identical. The right-click no-op on map bodies,
  Escape, guarded failure, reload, and unaccept behavior are all specified.
- **Mutants:** D4-M1 through M7 each have a measurable witness: key collision,
  reload, placement bytes, draw token, 404, sidecar guard, and visible UI
  failure. Acceptance itself cannot be an equivalent placement mutation.
- **Corpus safety:** approved. GBC writes are serial in its established test
  file and restore byte/existence/parent state. GBA uses a scratch sidecar
  root, preserving the subject sidecar and documenting the preflight hash
  discrepancy.

No self-contradictions or predispatch quality blockers found. Implementation
reviews should independently verify all measured corpus facts and exact test
titles before edits.
