# P3c finding: no whole folder is GBA-only (2026-11-25, h-p3c conductor)

Plan row P3c / task text P3 name no folder list ('move the GBA-only core and UI folders under gba/ to mirror gbc/'). Import analysis on master 2068770 (scripts: scratchpad deps.py, deps2.py):

## core/src: importers outside the folder, by family of importer (gbc = path has gbc/ or Gbc; gba likewise; other = server, cli, shared)
    == core
    (root)         {'other-src': 76, 'gba-src': 9, 'gbc-src': 10, 'other-test': 55, 'gba-test': 4}
    addEvent       {'gba-test': 10, 'gbc-test': 16, 'other-test': 13, 'other-src': 26, 'gba-src': 1, 'gbc-src': 5}
    analyse        {'other-src': 5, 'gba-src': 2, 'other-test': 1}
    blockEdit      {'other-src': 17, 'gba-src': 3, 'gbc-src': 9, 'other-test': 28, 'gbc-test': 9, 'gba-test': 4}
    config         {'other-src': 20, 'other-test': 35, 'gba-test': 2, 'gbc-test': 1, 'gba-src': 3, 'gbc-src': 11}
    defects        {'other-test': 8, 'other-src': 10, 'gba-src': 1, 'gbc-src': 6, 'gbc-test': 3, 'gba-test': 3}
    edit           {'other-src': 14, 'gba-src': 7, 'gbc-src': 2, 'gba-test': 1, 'other-test': 4}
    gbc            {'other-test': 43, 'gbc-test': 159, 'other-src': 45, 'gbc-src': 85, 'gba-src': 2}
    hub            {'other-src': 4}
    indicator      {'other-src': 4, 'gbc-src': 5, 'gba-src': 1, 'gbc-test': 4, 'other-test': 3}
    load           {'other-test': 36, 'other-src': 39, 'gba-src': 10, 'gba-test': 4, 'gbc-src': 2, 'gbc-test': 1}
    model          {'other-test': 13, 'other-src': 22, 'gbc-test': 2, 'gba-src': 1, 'gbc-src': 4}
    render         {'gba-src': 5, 'gbc-src': 5, 'other-src': 7, 'other-test': 13, 'gbc-test': 1}
    signs          {'other-src': 14, 'gba-src': 7, 'gbc-src': 7, 'gbc-test': 5, 'other-test': 11, 'gba-test': 4}
    validate       {'other-test': 2, 'other-src': 1}
    world          {'other-test': 23, 'gbc-test': 8, 'other-src': 15, 'gba-src': 7, 'gbc-src': 7}
    write          {'other-src': 16, 'gba-src': 5, 'gbc-src': 7, 'other-test': 24, 'gba-test': 1, 'gbc-test': 2}
    == ui
    (root)         {'gbc-test': 1, 'other-src': 9, 'gbc-src': 1}
    canvas         {'other-test': 19, 'gbc-test': 4, 'other-src': 7, 'gba-src': 4, 'gbc-src': 8}
    components     {'other-test': 41, 'gba-test': 3, 'gbc-test': 5, 'other-src': 23, 'gba-src': 5, 'gbc-src': 9}
    encounters     {'other-test': 11, 'gbc-test': 2, 'other-src': 12, 'gba-src': 4, 'gbc-src': 3}
    gba            {'other-src': 6, 'other-test': 21, 'gba-test': 3}
    gbc            {'other-src': 5, 'other-test': 25, 'gbc-test': 42}
    hooks          {'other-src': 18, 'other-test': 34, 'gba-test': 14, 'gba-src': 10, 'gbc-src': 6}
    hub            {'other-src': 3, 'other-test': 4}
    shared         {'other-test': 72, 'gba-test': 4, 'gbc-test': 8, 'other-src': 70, 'gba-src': 9, 'gbc-src': 30}
    shell          {'other-src': 5, 'other-test': 27, 'gba-test': 2, 'gbc-test': 7, 'gba-src': 2, 'gbc-src': 3}
    world          {'other-test': 3, 'gbc-test': 1, 'other-src': 8, 'gba-src': 3, 'gbc-src': 2}

## core/src per file in the 7 folders that mirror gbc/ (analyse edit load model render world write)
    analyse/coverage.ts                gbc:  0 gba:  2 other:  6
    edit/commands.ts                gbc:  1 gba:  0 other:  3
    edit/events.ts                  gbc:  0 gba:  6 other:  8
    edit/paint.ts                   gbc:  1 gba:  2 other:  7
    load/blocks.ts                  gbc:  0 gba:  2 other: 18
    load/encounters.ts              gbc:  0 gba:  2 other:  8
    load/layouts.ts                 gbc:  0 gba:  0 other:  4
    load/maps.ts                    gbc:  0 gba:  6 other: 25
    load/pal.ts                     gbc:  0 gba:  0 other:  3
    load/png.ts                     gbc:  3 gba:  0 other:  6
    load/tilesetData.ts             gbc:  0 gba:  4 other:  6
    load/tilesets.ts                gbc:  0 gba:  0 other:  8
    model/types.ts                   gbc:  6 gba:  1 other: 35
    render/layout.ts                  gbc:  0 gba:  2 other: 13
    render/metatile.ts                gbc:  0 gba:  1 other:  3
    render/overlays.ts                gbc:  0 gba:  1 other:  1
    render/raster.ts                  gbc:  6 gba:  0 other:  8
    render/species.ts                 gbc:  0 gba:  1 other:  1
    render/tile.ts                    gbc:  0 gba:  0 other:  2
    world/conflictAcceptance.ts      gbc:  5 gba:  2 other: 10
    world/connections.ts             gbc:  1 gba:  2 other: 15
    world/dungeons.ts                gbc:  0 gba:  0 other:  2
    world/nearWarp.ts                gbc:  3 gba:  0 other:  3
    world/nearWarpAdapters.ts        gbc:  3 gba:  0 other:  2
    world/resolve.ts                 gbc:  0 gba:  2 other:  4
    world/sidecar.ts                 gbc:  3 gba:  1 other:  9
    world/warpGraph.ts               gbc:  0 gba:  0 other:  3
    write/atomic.ts                  gbc:  4 gba:  1 other:  7
    write/binary.ts                  gbc:  0 gba:  0 other:  3
    write/diff.ts                    gbc:  2 gba:  1 other:  3
    write/guards.ts                  gbc:  2 gba:  0 other:  5
    write/jsonEdit.ts                gbc:  0 gba:  0 other:  6
    write/save.ts                    gbc:  1 gba:  4 other: 21
