"""TV stage tests at 1920x1080. Usage: python3 run_tv.py <outdir>"""
import json, sys, time, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('MZ_URL', 'http://127.0.0.1:5173/')+'?view=tv'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'tv'
os.makedirs(OUT, exist_ok=True)
CHECKS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'checks.js')).read()
rep = {'errors': [], 'checks': [], 'audits': {}}

def ok(cond, msg):
    rep['checks'].append(('PASS' if cond else 'FAIL') + ' ' + msg); print(('PASS ' if cond else 'FAIL ') + msg, flush=True)

def board_state(p):
    return p.evaluate("""[...document.querySelectorAll('.mz-tv-row')].map(r=>({top: parseFloat(r.style.top), rank: +r.dataset.rank, score: +r.dataset.score,
        shown: r.querySelector('.mz-tv-row__score').textContent, name: r.querySelector('.mz-tv-row__name').textContent})).sort((a,b)=>a.top-b.top)""")

def consistent(rows):
    for i in range(1, len(rows)):
        a, b = rows[i-1], rows[i]
        if b['score'] > a['score']: return False, f"{b['name']} {b['score']} below {a['name']} {a['score']}"
        if b['rank'] < a['rank']: return False, 'rank order'
        if b['score'] == a['score'] and b['rank'] != a['rank']: return False, 'tie rank'
        if b['score'] < a['score'] and b['rank'] != i + 1: return False, f"rank {b['rank']} at position {i+1}"
    for r in rows:
        if int(r['shown'].replace(',', '')) != r['score']: return False, 'shown != data'
    return True, ''

def run(b, theme, rm=False):
    tag = theme + ('-rm' if rm else '')
    ctx = b.new_context(viewport={'width': 1920, 'height': 1080}, reduced_motion='reduce' if rm else 'no-preference')
    p = ctx.new_page()
    p.on('console', lambda m: m.type == 'error' and 'favicon' not in m.text and '404' not in m.text and rep['errors'].append(m.text))
    p.on('pageerror', lambda e: rep['errors'].append(str(e)))
    p.goto(f'{BASE}&theme={theme}&auto=0' + ('&rm=1' if rm else ''))
    p.wait_for_selector('.mz-tv-question')
    time.sleep(4.2)
    p.evaluate(CHECKS); rep['audits'][tag + '-question'] = p.evaluate('window.__mzAudit()')
    p.screenshot(path=f'{OUT}/{tag}-1-question.png')
    t1 = p.locator('.mz-tv-ring__big').inner_text(); time.sleep(1.3); t2 = p.locator('.mz-tv-ring__big').inner_text()
    ok(int(t2) < int(t1), f'{tag}: timer counts down {t1}->{t2}')
    checks = p.locator('.mz-tv-seat .mz-token__badge--check').count(); ok(checks >= 4, f'{tag}: players lighting up as they answer ({checks})')
    # director: Next -> reveal
    p.get_by_role('button', name='Next').click()
    p.wait_for_selector('.mz-tv-bars'); time.sleep(0.3)
    p.screenshot(path=f'{OUT}/{tag}-2-reveal-counting.png')
    time.sleep(2.6)
    ok(p.locator('.mz-tv-slab__stamp').count() == 1, f'{tag}: exactly one CORRECT stamp')
    p.evaluate(CHECKS); rep['audits'][tag + '-reveal'] = p.evaluate('window.__mzAudit()')
    p.screenshot(path=f'{OUT}/{tag}-3-reveal.png')
    # tab jump to leaderboard
    p.get_by_role('tab', name='Leaderboard').click()
    p.wait_for_selector('.mz-tv-row')
    for ph, wait in [('before', 0.3), ('delta', 1.0), ('after', 1.6)]:
        time.sleep(wait)
        got = p.locator('.mz-tv-board').get_attribute('data-phase')
        rows = board_state(p)
        c, why = consistent(rows)
        ok(c, f'{tag}: leaderboard {got} consistent {why}')
    time.sleep(1.2)
    rows = board_state(p); c, why = consistent(rows)
    ok(c, f'{tag}: leaderboard settled consistent {why}')
    ok(rows[0]['name'] in ('Ruth',), f"{tag}: Q1 leader is Ruth with {rows[0]['score']}")
    p.evaluate(CHECKS); rep['audits'][tag + '-board'] = p.evaluate('window.__mzAudit()')
    p.screenshot(path=f'{OUT}/{tag}-4-leaderboard.png')
    # sample mid-transition consistency many times during Q2 leaderboard
    p.get_by_role('button', name='Next').click()  # -> question 2
    p.wait_for_selector('.mz-tv-question'); ok('2 of 2' in p.inner_text('.mz-tv-top'), f'{tag}: advanced to question 2')
    p.get_by_role('tab', name='Leaderboard').click()
    bad = 0
    for _ in range(14):
        rows = board_state(p); c, why = consistent(rows)
        if not c: bad += 1
        time.sleep(0.25)
    ok(bad == 0, f'{tag}: Q2 leaderboard consistent at all 14 samples (bad={bad})')
    p.screenshot(path=f'{OUT}/{tag}-5-leaderboard-q2.png')
    # Prev + auto toggle
    p.get_by_role('button', name='Previous cue').click(); time.sleep(0.3)
    ok(p.locator('.mz-tv-bars').count() == 1, f'{tag}: Previous cue goes back to reveal')
    btn = p.get_by_role('button', name='Auto-director paused'); btn.click()
    ok(p.get_by_role('button', name='Auto-director on').count() == 1, f'{tag}: auto-director toggles on')
    ctx.close()

    # scaled TV (720p cast) keeps proportions
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    p = ctx.new_page(); p.goto(f'{BASE}&theme={theme}&auto=0&stage=leaderboard&phase=after'); p.wait_for_selector('.mz-tv-row'); time.sleep(0.6)
    sc = p.evaluate("document.querySelector('.mz-tv').getBoundingClientRect().width")
    ok(abs(sc - 1280) < 2, f'{tag}: stage scales to 1280 wide ({sc:.0f})')
    p.screenshot(path=f'{OUT}/{tag}-6-720p.png')
    ctx.close()

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--no-sandbox'])
    run(b, 'everyday'); run(b, 'christmas'); run(b, 'everyday', rm=True)
    b.close()
json.dump(rep, open(f'{OUT}/report.json', 'w'), indent=1)
print('ERRORS', rep['errors'][:10])
for k, a in rep['audits'].items():
    issues = {x: a[x] for x in ('offRight', 'clipped', 'contrast') if a[x]}
    if issues: print(k, json.dumps(issues)[:800])
