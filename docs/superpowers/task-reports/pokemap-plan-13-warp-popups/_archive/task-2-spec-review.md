Spec: FAIL

Critical: None.

Important:
- Required verification remains incomplete. `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-2-report.md:39` leaves the full gate, UI build, and live check pending. The conductor addendum at `:73–74` records focused tests, mutation checks, UI tests, and typecheck, but no full repository gate, build, or live-check result.

Minor:
- `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-2-brief.md:1` — the added brief uses LF throughout (26 bare LF), violating the binding CRLF requirement.
- `docs/superpowers/task-reports/pokemap-plan-13-warp-popups/task-2-report.md:73` and `:74` — added lines are 164 and 193 characters, exceeding 140.

Item 9’s implementation complies: scope selection at `packages/ui/src/canvas/WorldSurface.tsx:95`; scoped requests at `packages/ui/src/gba/worldSurface.tsx:77` and `packages/ui/src/gbc/hooks/useGbcWorld.ts:48`; switch hiding at `packages/ui/src/canvas/WorldSurface.tsx:778`.

Accepted the reported test evidence. No edits or writes performed.