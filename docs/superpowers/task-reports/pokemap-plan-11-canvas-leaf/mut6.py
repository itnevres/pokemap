import subprocess, re
GBA = 'packages/ui/src/components/WorldCanvas.tsx'
GBC = 'packages/ui/src/gbc/GbcWorldCanvas.tsx'
T = ['packages/ui/test/world/placementResync.test.tsx']
muts = [
    ("M1 GBA any world response clears pending", GBA,
     "if (toggleReloadGeneration.current !== null && refetchGen >= toggleReloadGeneration.current) {", "if (true) {"),
    ("M2 GBC any world response clears pending", GBC,
     "if (world && toggleReloadGeneration.current !== null && loadedGen >= toggleReloadGeneration.current) {", "if (world) {"),
    ("M3 GBA failed latest POST keeps pending", GBA,
     "        if (generation !== toggleGeneration.current) return;\r\n        setDungeonsPending(null);", "        if (generation !== toggleGeneration.current) return;"),
    ("M4 GBC failed latest POST keeps pending", GBC,
     "        if (generation !== toggleGeneration.current) return;\r\n        setDungeonsPending(null);", "        if (generation !== toggleGeneration.current) return;"),
    ("M7 GBA a click does not forget the older toggle's reload", GBA,
     "    const generation = ++toggleGeneration.current;\r\n    toggleReloadGeneration.current = null;", "    const generation = ++toggleGeneration.current;"),
    ("M8 GBC same", GBC,
     "    const generation = ++toggleGeneration.current;\r\n    toggleReloadGeneration.current = null;", "    const generation = ++toggleGeneration.current;"),
    ("M9 GBA latest failure without reload", GBA,
     "        // already null, so this reload clears nothing).\r\n        reloadWorld();", "        // already null, so this reload clears nothing)."),
    ("M10 GBC latest failure without reload", GBC,
     "        // An ignored older success may have changed the server: reload so the switch shows its value.\r\n        reloadWorld();", "        // An ignored older success may have changed the server: reload so the switch shows its value."),
    ("M5 GBA reload error replaces the canvas", GBA,
     "{!world && loadError ? (", "{loadError ? ("),
    ("M6 GBC reload error replaces the canvas", GBC,
     "{!world && error ? (", "{error ? ("),
]
for name, p, a, b in muts:
    orig = open(p, 'rb').read()
    try:
        s = orig.decode()
        assert s.count(a) == 1, (name, s.count(a))
        open(p, 'wb').write(s.replace(a, b).encode())
        try:
            out = subprocess.run(['node', 'node_modules/vitest/vitest.mjs', 'run', *T], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=400).stdout
        except subprocess.TimeoutExpired:
            out = 'Tests TIMEOUT'
        out = re.sub(r'\x1b\[[0-9;]*m', '', out)
        m = re.search(r'Tests\s+(.*)', out)
        print(name, '->', m.group(1) if m else 'NO RESULT')
        for f in sorted(set(re.findall(r'^\s+× (.*?) \d+ms$', out, re.M))):
            print('   x', f)
    finally:
        open(p, 'wb').write(orig)
    print('  restored', open(p, 'rb').read() == orig)
