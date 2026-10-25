import subprocess, re, sys
p='packages/ui/src/shared/placementLedger.ts'
orig=open(p,'rb').read()
muts=[
 ("M1 no-op settles at once", "      if (inFlight !== null) {", "      if (false) {"),
 ("M2 serverShows ignores the snapshot (current state)", "    return ms.latestVersion === snapRecord.version && snapRecord.resolved;", "    return ms.versions.get(ms.latestVersion)!.state !== \"pending\";"),
 ("M3 ignore version identity (resolved-at-issue only, like a same-position check)", "    return ms.latestVersion === snapRecord.version && snapRecord.resolved;", "    return snapRecord.resolved;"),
 ("M4 dropAbsent ignores state", "      return state.state === \"failed\" || state.state === \"settled\";", "      return true;"),
 ("M5 older resolve overwrites newer waiting no-op link (no-op waits on oldest in-flight)", "        if (candidate === null || v > candidate) {", "        if (candidate === null || v < candidate) {"),
]
try:
  for name,a,b in muts:
    s=orig.decode()
    assert s.count(a)==1,(name,s.count(a))
    open(p,'wb').write(s.replace(a,b).encode())
    out=subprocess.run(['node','node_modules/vitest/vitest.mjs','run','packages/ui/test/shared/placementLedger.test.ts'],capture_output=True,text=True,encoding='utf-8',errors='replace').stdout
    out=re.sub(r'\x1b\[[0-9;]*m','',out)
    m=re.search(r'Tests\s+(.*)',out)
    print(name,'->',m.group(1) if m else 'NO RESULT')
finally:
  open(p,'wb').write(orig)
print('restored', open(p,'rb').read()==orig)
