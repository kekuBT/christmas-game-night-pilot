import re,sys
# Classify every install attempt (DevTools version) in a trace by who asked for it:
# an update() call (driver or app) made after the previous attempt ended and before this one was created -> that caller;
# none -> the browser started it. Also: the driver step it fell in.
for f in sys.argv[1:]:
    ev=[]
    for l in open(f):
        m=re.match(r'^\+ *(-?\d+)  (.{34}) (.*)$',l.rstrip('\n'))
        if m: ev.append((int(m.group(1)),m.group(2).strip(),m.group(3)))
    ev.sort(key=lambda e:e[0])
    rows=[]; prev_end=-10**9; prev_new=-10**9; step="setup"
    calls=[]
    for t,s,k in ev:
        if s=='driver' and (k.startswith('deploy ') and k!='deploy done'): step=k
        if 'reg.update() called' in k: calls.append((t,'driver' if 'driver' in k else 'app' if 'app' in k else '?', s))
        m=re.search(r'version (\d+): new/stopped',k)
        if m:
            asked=[c for c in calls if c[0]>prev_new and c[0]<=t]
            who=', '.join(sorted(set(f'{c[1]} ({c[2].split()[0]})' for c in asked))) or 'the browser: no page called update() since the previous attempt began'
            rows.append([m.group(1),t,step,who,None]); prev_new=t
        m=re.search(r'version (\d+): (redundant|installed)/',k)
        if m:
            for r in rows:
                if r[0]==m.group(1) and r[4] is None: r[4]=f'{m.group(2)} at +{t}'
            prev_end=t
    print(f'== {f}')
    for r in rows: print(f'  attempt v{r[0]} created +{r[1]} | during: {r[2][:40]:40} | asked by: {r[3]} | {r[4]}')
