"""Phone flow + matrix tests for the Mchezo demo. Usage: python3 run_phone.py <outdir>"""
import json, sys, time, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('MZ_URL', 'http://127.0.0.1:5173/')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'shots'
os.makedirs(OUT, exist_ok=True)
CHECKS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'checks.js')).read()
report = {'errors': [], 'audits': {}, 'steps': []}

def audit(page, name):
    page.evaluate(CHECKS)
    a = page.evaluate('window.__mzAudit()')
    report['audits'][name] = a
    return a

def shot(page, name):
    page.screenshot(path=f'{OUT}/{name}.png')

def log(msg):
    report['steps'].append(msg); print(msg, flush=True)

def new_page(b, w, h, rm=False):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True, is_mobile=True, reduced_motion='reduce' if rm else 'no-preference')
    p = ctx.new_page()
    p.on('console', lambda m: m.type == 'error' and report['errors'].append(f'[{w}x{h}] {m.text}'))
    p.on('pageerror', lambda e: report['errors'].append(f'[{w}x{h}] pageerror {e}'))
    return ctx, p

def flow(b, w, h, theme='everyday', tv='1', rm=False, tag=None):
    tag = tag or f'{theme}-{w}x{h}' + ('-rm' if rm else '') + ('' if tv == '1' else '-notv')
    ctx, p = new_page(b, w, h, rm)
    p.goto(f'{BASE}?theme={theme}&tv={tv}&players=8' + ('&rm=1' if rm else ''))
    p.wait_for_selector('text=Join the game')
    join = p.get_by_role('button', name='Join the game')
    assert join.is_disabled(), 'join should start disabled'
    p.get_by_label('Room code').fill('wren')
    p.get_by_label('Your name').fill('Priya')
    time.sleep(0.3)
    tiles = p.locator('.mz-code__tile').all_inner_texts()
    assert tiles == ['W', 'R', 'E', 'N'], tiles
    assert join.is_enabled()
    audit(p, f'{tag}-landing'); shot(p, f'{tag}-1-landing')
    join.click()
    p.wait_for_selector('text=You’re in, Priya.')
    log(f'{tag}: joined lobby')
    # arrivals
    n0 = p.locator('.mz-seat:not(.mz-seat--empty)').count()
    time.sleep(3.6)
    n1 = p.locator('.mz-seat:not(.mz-seat--empty)').count()
    assert n1 > n0, (n0, n1)
    log(f'{tag}: arrivals {n0} -> {n1}')
    # nudge
    p.get_by_role('button', name='Nudge Ruth').click()
    p.wait_for_selector('.mz-bubble:has-text("Nudged!")', timeout=2000)
    p.wait_for_selector('.mz-bubble:has-text("Nudged you")', timeout=3000)
    log(f'{tag}: nudge + nudge-back visible')
    # reactions
    p.get_by_role('button', name='Send Love').click()
    p.wait_for_selector('.mz-burst', timeout=1500)
    log(f'{tag}: reaction burst rendered')
    # tv toggle
    sw = p.get_by_role('switch')
    before = sw.get_attribute('aria-checked')
    sw.click(); after = sw.get_attribute('aria-checked'); assert before != after
    sw.click()
    time.sleep(4)  # let everyone arrive
    audit(p, f'{tag}-lobby'); shot(p, f'{tag}-2-lobby')
    p.get_by_role('button', name='Start Know-It-All').click()
    p.wait_for_selector('.mz-intro'); shot(p, f'{tag}-3-intro')
    p.wait_for_selector('.mz-question', timeout=6000)
    time.sleep(0.6)
    audit(p, f'{tag}-question'); shot(p, f'{tag}-4-question')
    first = p.locator('.mz-slab').first
    first.click()
    time.sleep(0.15); shot(p, f'{tag}-5-lockanim')
    time.sleep(0.6)
    assert p.locator('.mz-slab[aria-pressed="true"]').count() == 1
    shot(p, f'{tag}-5-locked')
    p.wait_for_selector('.mz-wait', timeout=4000)
    time.sleep(1.2)
    audit(p, f'{tag}-waiting'); shot(p, f'{tag}-6-waiting')
    p.wait_for_selector('.mz-result', timeout=12000)
    time.sleep(1.4)
    audit(p, f'{tag}-reveal'); shot(p, f'{tag}-7-reveal')
    has_dist = p.locator('.mz-dist').count() > 0
    assert has_dist == (tv == '0'), ('distribution shown iff no TV', has_dist, tv)
    log(f'{tag}: reveal ok, distribution={has_dist}')
    p.get_by_role('button', name='Next question').click()
    p.wait_for_selector('.mz-question', timeout=6000)
    # let the timer run out on Q2 is slow (20s) -> answer instead
    p.locator('.mz-slab').nth(2).click()
    p.wait_for_selector('.mz-result', timeout=14000)
    time.sleep(1.2)
    shot(p, f'{tag}-8-reveal2')
    p.get_by_role('button', name='Back to the circle').click()
    p.wait_for_selector('text=You’re in, Priya.')
    log(f'{tag}: full loop complete')
    ctx.close()

def matrix(b):
    for n, long, off in [(4, 0, 0), (8, 0, 1), (10, 1, 2), (10, 0, 0)]:
        for w, h in [(390, 844), (320, 640)]:
            tag = f'lobby-{n}p' + ('-long' if long else '') + (f'-off{off}' if off else '') + f'-{w}'
            ctx, p = new_page(b, w, h)
            p.goto(f'{BASE}?start=lobby&still=1&players={n}&long={long}&offline={off}')
            p.wait_for_selector('.mz-circle'); time.sleep(0.5)
            seats = p.locator('.mz-seat:not(.mz-seat--empty)').count()
            empty = p.locator('.mz-seat--empty').count()
            # token overlap check
            boxes = p.evaluate("[...document.querySelectorAll('.mz-seat:not(.mz-seat--empty) .mz-token')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})")
            overl = 0
            for i in range(len(boxes)):
                for j in range(i+1, len(boxes)):
                    a, c = boxes[i], boxes[j]
                    if a[0] < c[0]+c[2]-2 and c[0] < a[0]+a[2]-2 and a[1] < c[1]+c[3]-2 and c[1] < a[1]+a[3]-2: overl += 1
            names = p.evaluate("[...document.querySelectorAll('.mz-seat__name')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height,e.textContent]})")
            nover = 0
            for i in range(len(names)):
                for j in range(i+1, len(names)):
                    a, c = names[i], names[j]
                    if a[0] < c[0]+c[2] and c[0] < a[0]+a[2] and a[1] < c[1]+c[3] and c[1] < a[1]+a[3]: nover += 1
            a = audit(p, tag)
            log(f'{tag}: seats={seats} open={empty} tokenOverlaps={overl} nameOverlaps={nover} docH={a["docH"]}/{a["vh"]} docW={a["docW"]}')
            report['audits'][tag]['overlaps'] = [overl, nover]
            shot(p, tag)
            ctx.close()

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--no-sandbox'])
    which = sys.argv[2] if len(sys.argv) > 2 else 'all'
    if which in ('all', 'flow'):
        flow(b, 390, 844)
        flow(b, 360, 740, theme='christmas', tv='0')
        flow(b, 320, 640)
        flow(b, 390, 844, rm=True)
    if which in ('all', 'matrix'):
        matrix(b)
    b.close()

json.dump(report, open(f'{OUT}/report.json', 'w'), indent=1)
print('ERRORS', len(report['errors']))
for e in report['errors'][:20]: print(' ', e)
for k, a in report['audits'].items():
    issues = {x: a[x] for x in ('offRight', 'clipped', 'contrast', 'small') if a[x]}
    fit = 'scroll' if a['docH'] > a['vh'] + 1 else 'fits'
    if issues or fit == 'scroll' or a['docW'] > a['vw']:
        print(k, fit, a['docH'], a['vh'], 'docW', a['docW'], json.dumps(issues)[:900])
