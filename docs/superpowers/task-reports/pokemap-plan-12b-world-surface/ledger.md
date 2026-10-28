## 1. Concern map

| Concern | GBA | GBC | Difference |
|---|---|---|---|
| Props | `WorldCanvas.tsx:326-365` | `GbcWorldCanvas.tsx:416-437` | Same public shape; GBC requires `time`. |
| World GET/reconciliation/ledger | `WorldCanvas.tsx:530-567,1469-1503` | `GbcWorldCanvas.tsx:475-525,972-1007` | GBA fetches/reconciles inline with `Map`; GBC uses `useGbcWorld` plus override object. |
| Visibility/revealed maps | `WorldCanvas.tsx:483-490,866-923` | `GbcWorldCanvas.tsx:624-636` | GBA has session-local reveal-on-jump; GBC applies its own indoor/gate predicate only. |
| View/zoom/wheel/keys | `WorldCanvas.tsx:441-443,1441-1458,1812-1828` | `GbcWorldCanvas.tsx:174-210,944-957,1132-1159` | Both continuous/pivot wheel; GBC has unified `view`/`fitted` plus `+/-` and Enter. |
| First load / Fit / dungeon / jump | `WorldCanvas.tsx:647-719,745-772,801-857` | `GbcWorldCanvas.tsx:581-617,1169-1177` | GBA skips full-world first fit, Fit excludes singleton clusters, jump fills 100%; GBC first-fits and Fit-all/jump-60%. |
| Image cache/tile versions/time | `WorldCanvas.tsx:959-1005` | `GbcWorldCanvas.tsx:688-724` | Both cache visible tiles and invalidate changed versions; GBC clears its whole render cache when time changes. |
| LOD/culling/draw/layers | `WorldCanvas.tsx:925-934,1340-1407` | `GbcWorldCanvas.tsx:619-636,866-914` | Native units/thresholds differ; GBA additionally draws vertical-link triangles. |
| DOM projection | `WorldCanvas.tsx:1082-1118,1214-1319` | `GbcWorldCanvas.tsx:658-686,772-846` | Both repeatedly project `x*zoom+pan`; GBC centralizes map rects, GBA has several independent projections. |
| Drag dispatcher/capture/leave | `WorldCanvas.tsx:1516-1558,1697-1800` | `GbcWorldCanvas.tsx:1010-1069` | GBA supports pan/map/group/marquee and pointer capture; GBC supports pan/single Shift-map and commits on leave. |
| Click/Ctrl/double/key/context | `WorldCanvas.tsx:1576-1623,1812-1828` | `GbcWorldCanvas.tsx:1074-1119,1132-1161` | GBA has Ctrl selection/marquee; GBC plain single selection and keyboard open/zoom. |
| Placement POST/reload/callback | `WorldCanvas.tsx:1469-1503` | `GbcWorldCanvas.tsx:972-987` | GBA batches group posts then reloads once; GBC posts one map. |
| Dungeon POST | `WorldCanvas.tsx:569-600` | `GbcWorldCanvas.tsx:989-1007` | Both optimistic-toggle, POST, reload and call `onLayoutChanged`; error state differs. |
| Warps/hit/error | `WorldCanvas.tsx:1034-1074,1214-1234` | `GbcWorldCanvas.tsx:638-663,1074-1102` | Radius is 6 vs 8; GBA’s fetch catch does not surface an alert, GBC does. |
| Connection lines | `WorldCanvas.tsx:1238-1319` | `GbcWorldCanvas.tsx:665-686` | Same DOM SVG concept; adapter needs native warp projection. |
| Encounters/border/lens/spotlight | `WorldCanvas.tsx:1007-1198` | `GbcWorldCanvas.tsx:726-864` | Both cache summaries and use shared overlays; GBC encounter data persists across time changes and drives time dimming. |
| Conflicts/acceptance | `WorldCanvas.tsx:1378-1407,1812-1828` | `GbcWorldCanvas.tsx:891-914,1112-1141` | Same shared acceptance/menu model; family conflict payload/tooltip and GBA vertical links differ. |
| In-context/toolbar/rail/F | `WorldCanvas.tsx:1411-1467,1853-1919` | `GbcWorldCanvas.tsx:918-937,1205-1336` | Shared context primitives; both always render `UnplacedRail`, so P12-7 must hide it in context. |
| `!world` placeholder | `WorldCanvas.tsx:1886-1890` | `GbcWorldCanvas.tsx:1262-1268` | Equivalent loading/error DOM, duplicated. |
| Status | `WorldCanvas.tsx:2029-2043` | `GbcWorldCanvas.tsx:1339-1350` | GBA includes hidden/unplaced counts and tile dimensions; GBC reports block dimensions. |
| JSX order | `WorldCanvas.tsx:1850-2047` | `GbcWorldCanvas.tsx:1205-1355` | Broadly alike, but exact order/content must be preserved except named rulings. |

## 2. Differences not already named by a ruling

| Difference | GBA / GBC | Tests pinning it | Assessment |
|---|---|---|---|
| Hidden-map reveal | GBA reveals a hidden placed map on sidebar jump (`WorldCanvas.tsx:761-763,919`); GBC has no reveal path (`GbcWorldCanvas.tsx:624-636,1169-1177`). | GBA `WorldCanvas.test.tsx:1880-2011`; GBC `GbcWorldCanvas.test.tsx:1021-1050`. | Adapter visibility policy; engine/data fact. |
| Keyboard contract | GBA key handler is menu/Escape/selection-oriented (`WorldCanvas.tsx:1812-1828`); GBC adds `Enter`, `+`, `-` (`GbcWorldCanvas.tsx:1132-1159`). | GBA `WorldCanvas.test.tsx:2747-2773`; GBC `GbcWorldCanvas.test.tsx:1403-1439`. | Unifiable behavior, unless DOM/ARIA wording is retained. |
| Marker single-click | GBA normal click can select through marker area (`WorldCanvas.tsx:1576-1585`); GBC suppresses click within marker radius (`GbcWorldCanvas.tsx:1074-1083`). | GBA `WorldCanvas.test.tsx:1664-1788`; no GBC equivalent located. | Unifiable behavior decision needed. |
| Save-error lifecycle | GBA uses one dismissible `saveError` (`WorldCanvas.tsx:410-418,1469-1503`); GBC owns guarded per-map post/error behavior (`GbcWorldCanvas.tsx:972-1007`). | Shared `world/placementResync.test.tsx:216-420`; GBC `GbcWorldCanvas.test.tsx:1096-1146`. | Unifiable surface policy; preserve ledger ordering. |
| Same-map jump fade | GBA state is map string and same-map re-jump does not reset the timer (`WorldCanvas.tsx:774-799`); GBC keys state by token (`GbcWorldCanvas.tsx:1169-1199`). | GBA `WorldCanvas.test.tsx:1458-1530`; GBC `GbcWorldCanvas.test.tsx:1258-1278`. | Unifiable behavior; likely adopt token form. |
| Filter selection/drop guards | GBA’s selection/drop paths differ from GBC’s explicit filter clearing/drop rejection (`WorldCanvas.tsx:1831-1848`; `GbcWorldCanvas.tsx:561-565,1283-1295`). | GBA `WorldCanvas.test.tsx:1817-2129`; GBC `GbcWorldCanvas.test.tsx:1913-1921`. | Unifiable behavior, but audit before moving. |

## 3. Existing shared modules and helper coupling

Shared imports in both canvases: `useWorldContext`, `WorldContextOverlayMount`, `useFitShortcut`, dungeon switches, `UnplacedRail`, lens overlay, tile-version refetch, `worldTiles`, badge helpers, viewport measure, lens controls, spotlight, conflict overlays, placement ledger, and conflict-acceptance menu (`WorldCanvas.tsx:16-33`; `GbcWorldCanvas.tsx:18-36`).

GBC imports GBA exports: `centredFit`, `computeFit`, `drawDiamond`, `singletonSizes`, `themedLevelColorMap` (`GbcWorldCanvas.tsx:5`), exported by `WorldCanvas.tsx:280-307,2070,2123`. No reverse dependency exists (`WorldCanvas.tsx:1-33`).

12a reuse: `canvas/view.ts` provides continuous zoom/projection (`view.ts:20-50`); `useStage.ts` provides viewport, non-passive wheel, pan/capture and fit shortcut (`useStage.ts:32-115`). `useRasterComposite.ts` is map-raster-specific, but its dependency/invalidation pattern is reusable (`useRasterComposite.ts:4-38`).

## 4. Existing tests changed by named rulings

| Ruling | Tests affected |
|---|---|
| P12-3 | GBA selection/group oracle: `WorldCanvas.test.tsx:1230,1258,1299,1327,1361,1386,1401`; add equivalent GBC cases. |
| P12-4a | Existing leave fallback: `WorldCanvas.test.tsx:674`; `GbcWorldCanvas.test.tsx:1081`. Add capture/outside-release/cancel checks. |
| P12-4c | GBA no-handler no-op: `WorldCanvasContext.test.tsx:144`, `WorldCanvas.test.tsx:1728,2617`; GBC desired fallback: `GbcWorldCanvasContext.test.tsx:136`. |
| P12-4d | Preserve GBC malformed-fetch/retry alert: `GbcWorldCanvas.test.tsx:85`; add GBA alert oracle. |
| P12-4e | GBA initial zoom/culling assumptions: `WorldCanvas.test.tsx:357,487,515,2282`; retain GBC first-fit/no-prefit-load guarantees: `GbcWorldCanvas.test.tsx:673,756`. |
| P12-4i | Preserve projection tests: GBA `WorldCanvas.test.tsx:1664,1737`; no explicit radius-boundary test found. |
| P12-4j | Zoom-bound fixtures: `WorldCanvas.test.tsx:466-477`; `GbcWorldCanvas.test.tsx:251-258`. |
| P12-4m | Change GBC all-placement Fit: `GbcWorldCanvas.test.tsx:685,1323`; change GBA 100%-jump expectations: `WorldCanvas.test.tsx:1458,1488`; retain GBC 60%-jump oracle: `GbcWorldCanvas.test.tsx:1211`. |
| P12-5 | Loading placeholders: `WorldCanvas.test.tsx:309`; `GbcWorldCanvas.test.tsx:654`. |
| P12-7 | Add refreshed-image retention and tooltip-left-edge clamp tests; preserve existing context/rail coverage: `WorldCanvasContext.test.tsx:201-218`; `GbcWorldCanvasContext.test.tsx:196-216`. |

## 5. Rough implementation-task cuts

1. World data adapter + placement ledger/reload ownership: GBA `WorldCanvas.tsx:530-600,1469-1503`; GBC `GbcWorldCanvas.tsx:475-525,972-1007`.
2. Shared world stage/view/fit/drag dispatcher: GBA `WorldCanvas.tsx:647-857,1516-1800`; GBC `GbcWorldCanvas.tsx:581-636,944-1177`.
3. Tile/cache/culling/canvas-layer pipeline: GBA `WorldCanvas.tsx:925-1407`; GBC `GbcWorldCanvas.tsx:688-914`.
4. DOM overlays and interaction layer: GBA `WorldCanvas.tsx:1034-1319,1576-1623`; GBC `GbcWorldCanvas.tsx:638-686,1074-1119`.
5. Context/toolbar/placeholder/status assembly: GBA `WorldCanvas.tsx:1850-2047`; GBC `GbcWorldCanvas.tsx:1205-1355`.