import subprocess, re
GBA='packages/ui/src/components/WorldCanvas.tsx'
GBC='packages/ui/src/gbc/GbcWorldCanvas.tsx'
T=['packages/ui/test/world/placementResync.test.tsx','packages/ui/test/gbc/useGbcWorld.test.ts']
muts=[
 ("M1 GBC no-op settles at once", GBC, "    else ledger.current.noop(drag.map, drag.version);",
  "    else { ledger.current.noop(drag.map, drag.version); ledger.current.resolve(drag.map, drag.version, true); }"),
 ("M2 GBA failure without reload (F5)", GBA, "        setRefetchGen((g) => g + 1);\r\n        names.forEach",
  "        if (names.length) setRefetchGen((g) => g + 1);\r\n        names.forEach"),
 ("M3 GBA skips the ownership check when a GET lands", GBA, "          !ledger.current.serverShows(name, snap) || (!(name in d.placements)",
  "          false && (!(name in d.placements)"),
 ("M4 GBC skips the ownership check when a GET lands", GBC, "      !ledger.current.serverShows(name, snap) || (!(name in world.placements)",
  "      false && (!(name in world.placements)"),
 # Review fix round 1: the stale GET reaches reconciliation; the GET-issue snapshot is wired.
 ("M5 GBA serverShows against current state", GBA, "!ledger.current.serverShows(name, snap) ||", "!ledger.current.serverShows(name, ledger.current.snapshot()) ||"),
 ("M6 GBC serverShows against current state", GBC, "!ledger.current.serverShows(name, snap) ||", "!ledger.current.serverShows(name, ledger.current.snapshot()) ||"),
 ("M7 GBC no snapshot at GET issue", 'packages/ui/src/gbc/hooks/useGbcWorld.ts', "    onIssueRef.current?.(gen);
", ""),
]
for name,p,a,b in muts:
  orig=open(p,'rb').read()
  try:
    s=orig.decode()
    assert s.count(a)==1,(name,s.count(a))
    open(p,'wb').write(s.replace(a,b).encode())
    try:
      out=subprocess.run(['node','node_modules/vitest/vitest.mjs','run',*T],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=400).stdout
    except subprocess.TimeoutExpired:
      out='Tests TIMEOUT'
    out=re.sub(r'\x1b\[[0-9;]*m','',out)
    m=re.search(r'Tests\s+(.*)',out)
    fails=sorted(set(re.findall(r'^\s+× (.*?) \d+ms$',out,re.M)))
    print(name,'->',m.group(1) if m else 'NO RESULT')
    for f in fails: print('   x',f)
  finally:
    open(p,'wb').write(orig)
  print('  restored', open(p,'rb').read()==orig)

