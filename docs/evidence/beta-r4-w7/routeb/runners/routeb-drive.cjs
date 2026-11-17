// Local test only (handoff 6957990858): plays Route B's browsers against `w7-owner-preview.sh bstart`.
// - The browser: headless Chromium (W7OP_CHROMIUM, default /opt/pw-browsers/chromium). There is no Firefox in this
//   container.
// - Each role's HOME holds an NSS database COPIED from that role's Firefox profile as the tool wrote it, so the CA trust
//   under test is exactly the profiles'.
// - Each role keeps one persistent browser profile across phases (profile reuse).
// Modes:
//   control <origin> <state>                 a browser whose NSS database is empty must refuse the certificate
//   phase   <origin> <state> <code> <rev>    host, guest, tv: /health revision; sign in (gate) or stay signed in;
//                                            cookie attributes; the host's room (made in the first phase); a live WS each
//   foreign <origin> <state> <code> <ca.pem> protocol level, CA-verified: foreign and null Origins refused on API,
//                                            form and WS; the right Origin admitted; a client without the CA refused
// Exits non-zero on any failure. The access code is never printed.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), https = require('https'), tls = require('tls');
const WebSocket = require('ws');
const [mode, origin, state, a3, a4] = process.argv.slice(2);
const executablePath = process.env.W7OP_CHROMIUM || '/opt/pw-browsers/chromium';
const host = new URL(origin).hostname, port = Number(new URL(origin).port);
let bad = 0; const check = (ok, name, got) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${got !== undefined ? ` -> ${got}` : ''}`); };
const homeFor = (role) => path.join(state, `home-${role}`);

async function control() {
  const home = homeFor('untrusted'), db = path.join(home, '.pki', 'nssdb'); fs.mkdirSync(db, { recursive: true });
  require('child_process').execFileSync('certutil', ['-d', `sql:${db}`, '-N', '--empty-password']);
  const ctx = await chromium.launchPersistentContext(path.join(state, 'udd-untrusted'), { executablePath, env: { ...process.env, HOME: home } });
  const p = ctx.pages()[0] || await ctx.newPage();
  const err = await p.goto(`${origin}/health`).then(() => 'loaded').catch((e) => e.message.split('\n')[0]);
  check(/ERR_CERT_AUTHORITY_INVALID/.test(err), 'a browser without the session CA refuses the certificate', err);
  await ctx.close();
}

async function phase(code, rev) {
  const roomFile = path.join(state, 'room.json');
  for (const role of ['host', 'guest', 'tv']) {
    const viewport = role === 'tv' ? { width: 1280, height: 720 } : { width: 390, height: 844 };
    const ctx = await chromium.launchPersistentContext(path.join(state, `udd-${role}`), { executablePath, viewport, env: { ...process.env, HOME: homeFor(role) } });
    const p = ctx.pages()[0] || await ctx.newPage();
    const health = await p.goto(`${origin}/health`).then((r) => r.json()).catch((e) => ({ error: e.message.split('\n')[0] }));
    check(health.revision === rev, `${role}: /health through ${origin} (the session CA from the profile) shows ${rev.slice(0, 7)}`, health.revision ?? health.error);
    await p.goto(`${origin}/`);
    const gated = await p.locator('#code').count() > 0;
    if (gated) {
      await p.fill('#code', code);
      const [resp] = await Promise.all([p.waitForResponse((r) => r.url().endsWith('/beta/enter')), p.click('button[type=submit]')]);
      const sent = (await resp.request().allHeaders()).origin;
      check(resp.status() === 303 && sent === origin, `${role}: the gate's form posts with the page's own origin and signs in (303)`, `${resp.status()}, Origin ${sent}`);
      await p.waitForLoadState('load');
    } else console.log(`INFO ${role}: already signed in (the cookie kept in this profile)`);
    const c = (await ctx.cookies(origin)).find((k) => k.name === 'cgn_beta');
    check(!!c && c.secure && c.httpOnly && c.sameSite === 'Lax' && c.domain === host, `${role}: the beta cookie is Secure, HttpOnly, SameSite=Lax and host-only (${host})`, c ? `secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite} domain=${c.domain}` : 'no cookie');
    let roomId;
    if (role === 'host' && !fs.existsSync(roomFile)) {
      const [req] = await Promise.all([p.waitForRequest((r) => r.url().endsWith('/rooms') && r.method() === 'POST'),
        p.evaluate(() => fetch('/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Route B room', kind: 'casual' }) }).then(async (r) => { window.__room = { status: r.status, body: await r.json() }; }))]);
      const room = await p.evaluate(() => window.__room); const sentOrigin = (await req.allHeaders()).origin; // headers() omits Origin
      check(room.status === 201 && sentOrigin === origin, `host: the app creates a room (201), the request carrying the page's own origin`, `${room.status}, Origin ${sentOrigin}`);
      roomId = room.body.roomId; fs.writeFileSync(roomFile, JSON.stringify({ roomId }));
    } else roomId = JSON.parse(fs.readFileSync(roomFile, 'utf8')).roomId;
    const ws = await p.evaluate((id) => new Promise((res) => { const s = new WebSocket(`${location.origin.replace(/^https/, 'wss')}/?roomId=${id}&audience=tv`); const t = setTimeout(() => res('no message in 5 s'), 5000); s.onmessage = (m) => { clearTimeout(t); const k = JSON.parse(m.data); res(`${k.kind}:${k.view?.room?.name ?? k.room?.name ?? ''}`); s.close(); }; s.onerror = () => { clearTimeout(t); res('error'); }; }), roomId);
    check(ws.startsWith('projection'), `${role}: a live wss:// update for the same room (${roomId})`, ws);
    if (role === 'host') { const shot = path.join(state, `host-390-${rev.slice(0, 7)}.png`); await p.goto(`${origin}/`); await p.screenshot({ path: shot }); console.log(`INFO screenshot ${path.basename(shot)}`); }
    await ctx.close();
  }
}

function call(method, p, headers, body, ca) {
  return new Promise((resolve, reject) => {
    const r = https.request({ host: '127.0.0.1', port, method, path: p, servername: host, ca, headers: { host: `${host}:${port}`, ...headers } }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { let code; try { code = JSON.parse(b).code; } catch {} resolve({ status: res.statusCode, code, setCookie: res.headers['set-cookie']?.[0] }); });
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}
async function foreign(code, caFile) {
  const ca = fs.readFileSync(caFile);
  const untrusted = await call('GET', '/health', {}, null, undefined).then(() => 'connected').catch((e) => e.code || e.message);
  check(/UNABLE_TO_VERIFY|SELF_SIGNED|CERT/.test(untrusted), 'a client without the session CA is refused by TLS verification', untrusted);
  const enter = await call('POST', '/beta/enter', { origin, 'content-type': 'application/x-www-form-urlencoded' }, new URLSearchParams({ code, next: '/' }).toString(), ca);
  const cookie = enter.setCookie?.split(';')[0];
  check(enter.status === 303 && !!cookie, 'the right Origin signs in (303 + cookie)', enter.status);
  const roomFile = path.join(state, 'room.json'); const roomId = JSON.parse(fs.readFileSync(roomFile, 'utf8')).roomId;
  const wsTry = (o) => new Promise((res) => { const w = new WebSocket(`wss://127.0.0.1:${port}/?roomId=${roomId}&audience=tv`, { servername: host, ca, origin: o, headers: { host: `${host}:${port}`, cookie } }); w.once('open', () => { w.close(); res('open'); }); w.once('unexpected-response', (_q, r) => res(r.statusCode)); w.once('error', (e) => res(`error ${e.message}`)); });
  for (const o of [origin, 'https://evil.example', `https://${host}:${port + 1}`, `http://${host}:${port}`, 'http://localhost:3157', 'null']) {
    const api = await call('POST', '/rooms', { cookie, origin: o, 'content-type': 'application/json' }, JSON.stringify({ name: 'Origin check', kind: 'casual' }), ca);
    const form = await call('POST', '/beta/enter', { origin: o, 'content-type': 'application/x-www-form-urlencoded' }, new URLSearchParams({ code, next: '/' }).toString(), ca);
    const ws = await wsTry(o);
    const shown = `API ${api.status}${api.code ? ` ${api.code}` : ''} / form ${form.status}${form.setCookie ? ' (cookie)' : ''} / WS ${ws}`;
    if (o === origin) check(api.status === 201 && form.status === 303 && ws === 'open', `the page's own Origin ${o}: admitted on API, form and WS`, shown);
    else check(api.status === 403 && api.code === 'FOREIGN_ORIGIN' && form.status === 403 && !form.setCookie && ws === 403, `Origin ${o}, with a valid cookie: refused on API (403 FOREIGN_ORIGIN), form (403, no cookie) and WS (403)`, shown);
  }
  const spoof = await call('POST', '/rooms', { cookie, origin: 'https://evil.example', 'x-forwarded-host': `${host}:${port}`, 'x-forwarded-proto': 'https', referer: `${origin}/`, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, '{"name":"x","kind":"casual"}', ca);
  check(spoof.status === 403 && spoof.code === 'FOREIGN_ORIGIN', 'a foreign Origin with spoofed X-Forwarded-*, Referer and Sec-Fetch-Site is still refused', `${spoof.status} ${spoof.code}`);
  const nocookie = await call('POST', '/rooms', { origin, 'content-type': 'application/json' }, '{"name":"x","kind":"casual"}', ca);
  check(nocookie.status === 401 && nocookie.code === 'BETA_ACCESS_REQUIRED', 'the right Origin without the beta cookie: 401 BETA_ACCESS_REQUIRED', `${nocookie.status} ${nocookie.code}`);
}

(async () => {
  if (mode === 'control') await control();
  else if (mode === 'phase') await phase(fs.readFileSync(a3, 'utf8').trim(), a4);
  else if (mode === 'foreign') await foreign(fs.readFileSync(a3, 'utf8').trim(), a4);
  else throw new Error(`unknown mode ${mode}`);
  console.log(bad === 0 ? `DRIVE ${mode}: every check passed` : `DRIVE ${mode}: ${bad} FAILED`); process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(`DRIVE FAILED: ${String(e.message).split('\n')[0]}`); process.exit(1); });
