## Task 6 review

### Spec Compliance
- ✅ 13 shell test files + Root.test render FamilyApp with gbaAdapter/gbcAdapter; no `<App />`/`<GbcApp root=` remain (greps of removed lines clean).
- ✅ App.tsx and gbc/GbcApp.tsx deleted (ls confirms); no importer in packages/ (grep of ./App, ../App, GbcApp module paths: none; main.tsx clean).
- ✅ No assertion changed outside Root GBA identity test. Only non-import/render removed lines checked per file: none beyond below.
- ✅ Root.test.tsx gba test: retargeted to View group + `queryByText("Crystal")` null + no "Time of day" group. Would fail if Root mounted the GBC shell for a gba project (Crystal label / Time of day group present; the new family-switch test asserts Crystal exists for gbc). Dungeon assertion retained.
- ✅ Tests moved not dropped: 2721/173 per gate (not re-run). Additions only: world-edit-city characterisation test (WorldGuard), family-switch test (Root).
- ⚠️ Root.test `it` titles still say "App and GbcApp"/"GbcApp's own state" (lines ~157, ~175); harmless.

### Removed-line accounting
| file | removed | master grep | extra + reason | verdict |
|---|---|---|---|---|
| App.test.tsx | 23 | 23 | none | ok |
| AppContextEdit | 2 | 2 | none | ok |
| AppContextStroke | 2 | 2 | none | ok |
| AppContextVisit | 2 | 2 | none | ok |
| AppEditingWiring | 2 | 2 | none | ok |
| AppVisitGuard | 4 | 4 | none | ok |
| AppWorldContextMenu | 3 | 3 | none | ok |
| gbc/GbcApp.test | 32 | 32 | none | ok |
| gbc/GbcAppContext | 3 | 3 | none | ok |
| gbc/GbcAppContextSelection | 2 | 2 | none | ok |
| gbc/GbcAppContextStroke | 2 | 2 | none | ok |
| gbc/GbcAppEditing | 8 | 8 | none | ok |
| gbc/GbcAppWorldGuard | 10 | 8 | +2: mock arrow type line and `world-open-port` button line rewritten (mock gains Edit-here button) | ok |
| gbc/Root.test | 8 | 0 (n/a) | 7 comment lines naming deleted components; 1 `it(...)` title/Root identity retarget | ok |

### Issues
Critical: none.
Important: none.
Minor: stale "App/GbcApp" wording in some Root.test `it` titles and in src comments (GbcWorldCanvas, useGbcEditSession, ProjectSwitcher) referencing deleted files.

### Assessment
Spec compliance: ✅. Task quality: Approved.
