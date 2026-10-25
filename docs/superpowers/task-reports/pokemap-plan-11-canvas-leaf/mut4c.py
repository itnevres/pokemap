# Coordinate mutation (Task 4 step 3): the ledger reconciles by position. Mutation-only position data: `moved` takes a
# 3rd arg (the gesture's target tile) and the snapshot records each map's last acknowledged position (the server's).
import subprocess, re, os
p='packages/ui/src/shared/placementLedger.ts'
t='packages/ui/test/shared/placementLedger.test.ts'
tm='packages/ui/test/shared/placementLedgerCoordMut.test.ts'
orig=open(p,'rb').read(); s=orig.decode()
def rep(a,b):
    global s
    assert s.count(a)==1,a; s=s.replace(a,b)
rep('    moved(map: string, v: PlacementVersion): void {','    moved(map: string, v: PlacementVersion, pos?: string): void {\n      if (pos !== undefined) posOf.set(v, pos);')
rep('  const maps = new Map<string, MapState>();','  const maps = new Map<string, MapState>();\n  const posOf = new Map<number, string>();\n  const ackPos = new Map<string, string>();')
rep('      state.state = newState;\n','      state.state = newState;\n      if (ok && posOf.has(v)) ackPos.set(map, posOf.get(v)!);\n')
rep('      return { mapStates };','      return { mapStates, serverPos: new Map(ackPos) } as PlacementSnapshot;')
rep('    return ms.latestVersion === snapRecord.version && snapRecord.resolved;','    const local = posOf.get(ms.latestVersion); const server = (snap as any).serverPos.get(map);\n    return local !== undefined && local === server;')
# scratch test: the new A->B->A test with positions
src=open(t,encoding='utf-8').read()
i=src.index('  it("A -> B -> A after an acknowledged move to A')
j=src.index('  it("a late failure of v1 after v2 began',i)
body=src[i:j].replace('l.moved("A", v0);','l.moved("A", v0, "A");').replace('l.moved("A", v1);','l.moved("A", v1, "B");').replace('l.moved("A", v2);','l.moved("A", v2, "A");')
open(tm,'w',encoding='utf-8').write('import { describe, it, expect } from "vitest";\nimport { createPlacementLedger } from "../../src/shared/placementLedger.js";\ndescribe("coord mutation", () => {\n'+body+'});\n')
def run(f):
    out=subprocess.run(['node','node_modules/vitest/vitest.mjs','run',f],capture_output=True,text=True,encoding='utf-8',errors='replace').stdout
    out=re.sub(r'\x1b\[[0-9;]*m','',out); m=re.search(r'Tests\s+(.*)',out); return m.group(1) if m else 'NO RESULT'
try:
    print('unmutated, scratch test:', run(tm))
    open(p,'wb').write(s.encode())
    print('coordinate mutation, scratch A->B->A test:', run(tm))
finally:
    open(p,'wb').write(orig); os.remove(tm)
print('restored', open(p,'rb').read()==orig, os.path.exists(tm))
