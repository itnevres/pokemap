# Task 5 spec review (Codex gpt-6-astra, read-only)

**Important — rationale comments were retained as an archive, not alongside their code.** `packages/ui/src/gbc/GbcMapCanvas.tsx:59–180` violates Task 5’s comment-preservation intent. The wrapper contains neither the effects nor handlers these comments explain. “Historical” labeling does not repair that separation.

Fix by relocating unique rationale and consolidating comments already explained at their destination:

| Wrapper lines | Disposition |
|---|---|
| 62–70 | Replace obsolete deliberate-duplication explanation with a brief adapter/delegation description; preserve GBC geometry rationale beside adapter geometry. |
| 71–89, 151–153, 158–160 | `useRasterComposite`: viewport clearing, URL readiness, pristine recomposition and separate blitting. Existing comments cover portions; retain the additional postmortem rationale there. |
| 79–85, 91–103, 138–139, 155–157 | `useStage`: fit-by-map, non-passive wheel and pure combined view updates. Consolidate with existing comments. |
| 105–110, 130–134, 169–177 | `MapSurface` stroke ownership/finish and `useStrokeChain` ordering. Preserve the fast-click/undo-step explanation; update leave wording for P12-4a. |
| 111–116 | Adapter’s `skipFirstBlocksChange: false` and URL builder: preserve the GBC reseed distinction. |
| 117–120, 165–168, 178–180 | `MapSurface` interaction handlers. Most already have equivalent comments; merge unique historical rationale there. |
| 122–126 | Adapter’s `hoverAt`: overlay-independent GBC quadrant/event readout. |
| 135–137, 140–150, 154, 161–164 | Corresponding `MapSurface` encounter, debounce, reset, notification, decoration and entries code. Much is already documented; remove redundant wrapper copies and orphaned ESLint directives. |

Public-prop/type documentation at lines 13–56 belongs in the wrapper; update the `GbcView` header cross-reference after relocation.

**Minor — several adapter comments describe nonexistent adjacent code.** `packages/ui/src/gbc/mapSurface.tsx:179–200` claims conversion happens “through the real `clientToStep`,” describes “flags listed below,” and retains an exhaustive-deps suppression above an object property. Runtime conversion now uses shared cell helpers; there is no adjacent effect or `anyOverlay` dependency list. Fix by documenting the geometry facts here, moving raw/bounded lookup rationale to shared helpers/handlers, and replacing obsolete dependency commentary with the actual layer-dependency contract. The debounce comment also says `skipFirstBlocksChange` is “below” when it is above.

**Minor — an additional behavior change lacks a named ruling.** `packages/ui/src/canvas/MapSurface.tsx:63`, newly adopted by `GbcMapCanvas.tsx:183`, gates encounters with `!chromeless`. HEAD gates only by map identity. Enable encounters, then change `chromeless` to true without remounting: the new implementation disables the border and summary subscription; HEAD only hides toolbar/legend/status. No named ruling authorizes this transition difference. Preserve it or record an explicit ruling and regression test. This does not affect a canvas mounted chromeless from the outset.

The remaining source comparison found the requested GBC facts preserved:

- 32px paint cells, 16px event/sign/hover steps, ring-derived origin and dimensions.
- Encoded render URL with border/time, session-only positive `v`, first same-map blocks-change bump and debounce cancellation.
- Grid → collision → events order; wall/water quadrants, color tokens/fallbacks and captured raster dependencies.
- Full step readout, active-quadrant emphasis, border-substitution note, step events, legend wording and status-strip elements/classes/order.
- Live session blocks/events, dropper stamp, pencil/bucket/rect/shift bodies, event lookup precedence and raw-step release, bounded sign pick and scaled anchor.
- Time reaching encounter presentation without entering summary-fetch or auto-fit keys; `onEditError` and `onStrokeChain` forwarding.

Other differences supplied by the shared implementation are authorized: capture/cancellation and map-switch drag cleanup by **P12-4a**; id-transition hover notifications by **P12-4l**; shared status/legend frames by **P12-4k**; semantic raster invalidation, stale-load/error handling and cached-image readiness by the foundation contract. Shared unconditional mouseup cleanup also replaces HEAD’s tool/session-guarded early returns, following Task 4’s explicit up-flow contract.

Both new tests satisfy Step 3: `GbcMapSurface.test.tsx:70` pans, changes time, loads the new URL and checks both unchanged view and unchanged fit count; `:94` exercises the real wrapper and registry with deferred apply, proving settlement/end remain pending until resolution. The coordinator’s reported mutation failures support both assertions.

Review was read-only; no tests or mutations rerun. The reported 233 existing tests pass unchanged; full gate remains pending.

Spec compliance: FAIL