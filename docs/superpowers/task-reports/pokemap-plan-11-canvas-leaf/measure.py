import sys,re,difflib
def code(p):
    out=[]
    for i,l in enumerate(open(p,encoding='utf-8'),1):
        s=re.sub(r'\s+',' ',l.strip())
        if not s or s.startswith('//') or s.startswith('*') or s.startswith('/*') or s in '{}();[],': continue
        out.append((i,s))
    return out
a,b=code(sys.argv[1]),code(sys.argv[2])
sm=difflib.SequenceMatcher(None,[x[1] for x in a],[x[1] for x in b],autojunk=False)
runs=[m for m in sm.get_matching_blocks() if m.size>=3]
print(sys.argv[1],len(a),len(b),'aligned',sum(m.size for m in runs),'runs',len(runs))
for m in sorted(runs,key=lambda m:-m.size)[:12]:
    print(f"  {m.size:3} GBA:{a[m.a][0]}-{a[m.a+m.size-1][0]} GBC:{b[m.b][0]}-{b[m.b+m.size-1][0]}  {a[m.a][1][:70]}")
