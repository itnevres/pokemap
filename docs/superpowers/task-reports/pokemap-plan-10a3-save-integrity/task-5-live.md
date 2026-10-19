# Plan 10a3 Task 5: live acceptance, both families (2026-10-19)

Branch `plan-10a3-save-integrity` at `0fa2629`. Hub = real `serve.ts` via the 5174→5184 preload, scratch `POKEMAP_HOME`;
Vite 5183; headless Chromium shell 1248 via the cached `playwright-core`. Driver: `shots/live.mjs`; hash script:
`../pokemap-plan-10a2-pokemon-indicator/task-6-shots/manifest.sh`.

Flow (each family): tab A picks a palette metatile, paints one block in the UI, opens Save (plan shows 1 block changed).
Tab B (a second page on the same hub session) stages another paint through the API. Tab A clicks Save Changes, then
Save Changes again.

| Check | GBA Route101 | GBC Route33 |
|---|---|---|
| Preview | `data/layouts/Route101/map.bin -- 1 block changed`, fingerprint `a21281be…` | `maps/Route33.blk -- 1 block changed`, fingerprint `a168fdb6…` |
| Tab B paint | begin/apply/end 200 | 200 |
| First Save | 409; notice "Changes were made since you opened Save" / "Review the updated changes and save again" above `… 2 blocks changed`; Save enabled | same, `maps/Route33.blk -- 2 blocks changed` |
| Disk after 409 | `map.bin` sha1 `a8fe5c979fea` = before | `Route33.blk` sha1 `f96d73e75f6d` = before |
| Second Save | posts new fingerprint `92cbcc6a…`; 200; dialog closed; not dirty | posts `cb7f28c2…`; 200; closed; not dirty |
| Files changed (manifest diff) | exactly `map.bin` (bytes 1-2 = tab B's block 0, byte 381 = tab A's block); no temp files | exactly `Route33.blk` (bytes 1, 46) |
| Restore | byte copy; manifest `a0349693144d` before and after | `13a31cb654ff` before and after |

The same fingerprints repeated on a second GBA run from the same disk and edits (planning is deterministic).
Screenshots: `shots/{gba,gbc}-{1-preview,2-plan-changed,3-saved}.png`; GBC raw output `live-gbc.json`.

No findings.
