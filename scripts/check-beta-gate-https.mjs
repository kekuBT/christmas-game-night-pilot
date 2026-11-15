// Beta R1-R (review 6901841738 R4): the private-beta gate through a configured production origin, over HTTPS.
// check-beta-gate.mjs runs the development server over plain HTTP on localhost with no public origin; this runs the
// PACKED release in production behind a local TLS proxy, as the release architecture does (docs/beta/beta-r1-architecture.md),
// all on this machine: private, $0, no host, no real credentials.
//   P  pack the checked-out revision (scripts/release/pack.mjs) and install it with npm ci --omit=dev
//   T  a TLS proxy for https://beta.test:<port> that behaves like the example Caddy: a self-signed certificate made for this
//      run (openssl), Host and Origin passed through unchanged, X-Forwarded-For appended, X-Forwarded-Proto https,
//      WebSocket upgrades passed through. Behind it, the packed server on plain node with NODE_ENV=production,
//      MCHEZO_PUBLIC_ORIGIN=https://beta.test:<port>, MCHEZO_TRUST_PROXY=1, MCHEZO_LISTEN_HOST=127.0.0.1 and an access code.
//      Chromium resolves beta.test to the proxy (--host-resolver-rules) and accepts the run's certificate (the context's
//      ignoreHTTPSErrors: the TLS itself is real; only the trust of this one self-signed certificate is waived).
//   Browser-driven, over HTTPS:
//   H1 at 320 and 390 px: the gate page fits (no sideways scroll, the card inside the viewport), its field is labelled,
//      and the field and button are at least 44 px tall
//   H2 a wrong code: a plain role=alert message, still fits, no cookie set, still gated
//   H3 the right code: back to the page asked for, its query kept (/?join=ABCD); the cookie is Secure, HttpOnly,
//      SameSite=Lax, host-only for beta.test and isn't the code; the app loads
//   H4 after entry: the same-origin API creates a room, a wss:// socket opens and gets a live update, and the app's own
//      socket is wss:// to the public origin
//   H5 a browser without the cookie: the API refuses (401 BETA_ACCESS_REQUIRED) and the wss:// socket is refused
//   Protocol-level, through the proxy, the certificate verified against the run's own CA:
//   H6 with a valid cookie, every foreign Origin is still refused: https://evil.test, the same host over http, the same
//      host on another port, https://localhost:<port> (the Codespaces case) and "null": the API answers 403
//      FOREIGN_ORIGIN, the code form answers 403 and sets no cookie, and the WebSocket handshake is refused (403); the
//      right Origin passes each time (the control)
// Usage: node scripts/check-beta-gate-https.mjs  (MCHEZO_RELEASE_ALLOW_DIRTY=1 for a local try on an uncommitted tree;
// screenshots under docs/beta/screenshots/)
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CODE = "https-gate-code-1234";
const HOST = "beta.test";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
const owned = { dirs: [], server: null, out: "", proxy: null, sockets: new Set() };
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `mz-https-gate-${label}-`)); owned.dirs.push(d); return d; };
let browser;

try {
  // ---- P ----
  const rel = tmp("pkg");
  rmSync(rel, { recursive: true, force: true });
  execFileSync(process.execPath, ["scripts/release/pack.mjs", "--out", rel, ...(process.env.MCHEZO_RELEASE_ALLOW_DIRTY === "1" ? ["--allow-dirty"] : [])], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: rel, stdio: "ignore" });
  const revision = JSON.parse(readFileSync(join(rel, "release.json"), "utf8")).revision;
  check("P the release is packed and installed (runtime packages only)", !!revision, revision);

  // ---- T ---- the run's certificate, the proxy, then the server (its public origin names the proxy's port)
  const tls = tmp("tls");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(tls, "key.pem"), "-out", join(tls, "cert.pem"), "-days", "1", "-subj", `/CN=${HOST}`, "-addext", `subjectAltName=DNS:${HOST}`], { stdio: "ignore" });
  const key = readFileSync(join(tls, "key.pem")), cert = readFileSync(join(tls, "cert.pem"));
  let backend = 0;
  const forwardedFor = (req) => [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", ");
  owned.proxy = https.createServer({ key, cert }, (req, res) => {
    const up = http.request({ host: "127.0.0.1", port: backend, method: req.method, path: req.url, headers: { ...req.headers, "x-forwarded-for": forwardedFor(req), "x-forwarded-proto": "https" } }, (ur) => {
      res.writeHead(ur.statusCode, ur.statusMessage, ur.rawHeaders);
      ur.pipe(res);
    });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  owned.proxy.on("connection", (s) => { owned.sockets.add(s); s.on("close", () => owned.sockets.delete(s)); });
  owned.proxy.on("upgrade", (req, sock, head) => {
    const up = net.connect(backend, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) if (!/^x-forwarded-(for|proto)$/i.test(req.rawHeaders[i])) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      lines.push(`X-Forwarded-For: ${forwardedFor(req)}`, "X-Forwarded-Proto: https");
      up.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) up.write(head);
      sock.pipe(up).pipe(sock);
    });
    owned.sockets.add(up);
    up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
  });
  await new Promise((r) => owned.proxy.listen(0, "127.0.0.1", r));
  const proxyPort = owned.proxy.address().port;
  const ORIGIN = `https://${HOST}:${proxyPort}`;
  const data = join(tmp("data"), "var-lib-cgn");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "0", NODE_ENV: "production", MCHEZO_DATA_DIR: data, MCHEZO_PUBLIC_ORIGIN: ORIGIN, MCHEZO_BETA_ACCESS_CODE: CODE, MCHEZO_TRUST_PROXY: "1", MCHEZO_LISTEN_HOST: "127.0.0.1" };
  owned.server = spawn(process.execPath, ["dist/server/serve.js"], { cwd: rel, env, stdio: ["ignore", "pipe", "pipe"] });
  owned.server.stdout.on("data", (d) => { owned.out += d; }); owned.server.stderr.on("data", (d) => { owned.out += d; });
  for (let i = 0; i < 160 && !backend && owned.server.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(owned.out); if (m) backend = Number(m[1]); else await sleep(125); }
  if (!backend) throw new Error(`the packed server did not start (exit ${owned.server.exitCode}): ${owned.out.slice(-400)}`);
  check("T the packed server runs in production behind the TLS proxy, public origin https://beta.test:<port>", /Listening on 127\.0\.0\.1; public origin https:\/\/beta\.test:\d+\./.test(owned.out), (owned.out.match(/Listening on[^\n]*/) ?? [""])[0]);

  // ---- H1-H5 (browser-driven, HTTPS) ----
  // Everything stays on this machine: beta.test resolves to the proxy, and the browser gets no outbound proxy settings.
  // (An https_proxy in the environment, as in a sandbox or behind a company proxy, is followed by Chromium on Linux for
  // any name but localhost, and --no-proxy-server alone didn't override it; so the browser's environment leaves them out.)
  const noProxyEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_proxy$/i.test(k)));
  browser = await launchChromium({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, "--no-proxy-server"], env: noProxyEnv });
  const ctxOpts = (width) => ({ viewport: { width, height: 844 }, ignoreHTTPSErrors: true });
  const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/beta/screenshots/${name}.png`) });
  const fits = (page) => page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return { scroll: document.documentElement.scrollWidth, width: innerWidth, left: -1, right: Infinity, noGatePage: document.body.innerText.slice(0, 120) };
    const card = main.getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, width: innerWidth, left: Math.round(card.left), right: Math.round(card.right) };
  });
  /** Click Continue and return what the code form's POST answered (status and, for JSON, its code). */
  const submit = async (page) => {
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/beta/enter") && r.request().method() === "POST", { timeout: 10000 }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    await page.waitForLoadState("load");
    let code = "";
    try { code = (await resp.json()).code ?? ""; } catch { /* the gate page or a redirect */ }
    return { status: resp.status(), code, origin: (await resp.request().allHeaders()).origin ?? "(none)" };
  };
  for (const width of [320, 390]) {
    const ctx = await browser.newContext(ctxOpts(width));
    const page = await ctx.newPage();
    const res = await page.goto(`${ORIGIN}/?join=ABCD`);
    check(`H1 ${width}px: over HTTPS, a page load without the cookie gets the gate (401) at ${HOST}`, res.status() === 401 && new URL(page.url()).protocol === "https:" && (await page.getByRole("heading", { name: "Christmas Game Night" }).count()) === 1, page.url());
    let f = await fits(page);
    check(`H1 ${width}px: it fits the screen (no sideways scroll; the card is inside the viewport)`, f.scroll <= f.width && f.left >= 0 && f.right <= f.width, JSON.stringify(f));
    const field = page.getByLabel("Access code");
    const fieldH = (await field.boundingBox())?.height ?? 0, buttonH = (await page.getByRole("button", { name: "Continue" }).boundingBox())?.height ?? 0;
    check(`H1 ${width}px: the code field is labelled, and the field and button are at least 44 px tall`, (await field.count()) === 1 && fieldH >= 44 && buttonH >= 44, `field ${fieldH}, button ${buttonH}`);
    await shot(page, `beta-gate-https-${width}`);
    await field.fill("not-the-code-at-all");
    const posted = await submit(page);
    check(`H2 ${width}px: the code form posts with the page's own origin and is answered by the gate (401), not refused as another site`, posted.status === 401 && posted.origin === ORIGIN, JSON.stringify({ ...posted, origin: posted.origin.replace(String(proxyPort), "<port>") }));
    await page.getByRole("alert").waitFor({ timeout: 5000 }).catch(() => {});
    f = await fits(page);
    const alert = await page.getByRole("alert").innerText().catch(() => "");
    check(`H2 ${width}px: a wrong code is refused with a plain message (role=alert), and the page still fits`, /didn.t work/.test(alert) && f.scroll <= f.width && f.right <= f.width, alert || JSON.stringify(f));
    check(`H2 ${width}px: no cookie is set, and the site is still gated`, (await ctx.cookies()).every((c) => c.name !== "cgn_beta") && (await page.goto(`${ORIGIN}/`)).status() === 401);
    await ctx.close();
  }
  {
    // the wrong-code screenshot at 390, on its own page
    const ctx = await browser.newContext(ctxOpts(390));
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/?join=ABCD`);
    await page.getByLabel("Access code").fill("not-the-code-at-all");
    await submit(page);
    await page.getByRole("alert").waitFor({ timeout: 5000 }).catch(() => {});
    await shot(page, "beta-gate-https-wrong-code-390");
    await ctx.close();
  }
  const ctx = await browser.newContext(ctxOpts(390));
  const page = await ctx.newPage();
  const sockets = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  await page.goto(`${ORIGIN}/?join=ABCD`);
  await page.getByLabel("Access code").fill(CODE);
  const entered = await submit(page);
  await page.waitForURL(/\/\?join=ABCD$/, { timeout: 10000 }).catch(() => {});
  check("H3 the right code is accepted (303) on a post carrying the page's own origin", entered.status === 303 && entered.origin === ORIGIN, JSON.stringify({ ...entered, origin: entered.origin.replace(String(proxyPort), "<port>") }));
  check("H3 the right code returns to the page that was asked for, over HTTPS, query kept", page.url() === `${ORIGIN}/?join=ABCD`, page.url());
  const cookie = (await ctx.cookies()).find((c) => c.name === "cgn_beta");
  check("H3 the cookie is Secure, HttpOnly and SameSite=Lax, host-only for beta.test, and isn't the code", !!cookie && cookie.secure && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.domain === HOST && !cookie.value.includes(CODE), cookie ? JSON.stringify({ secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, domain: cookie.domain, path: cookie.path }) : "no cookie");
  const appUp = await page.getByTestId("home-host").waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("H3 the app loads after the gate", appUp);
  await shot(page, "beta-gate-https-then-app-390");
  const live = await page.evaluate(async () => {
    const r = await fetch("/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "HTTPS gate check", kind: "casual" }) });
    const room = await r.json();
    const url = `${location.origin.replace("https:", "wss:")}/?roomId=${room.roomId}&audience=tv`;
    const ws = await new Promise((resolve) => {
      const w = new WebSocket(url);
      w.onmessage = () => { w.close(); resolve("open, live update received"); };
      w.onerror = () => resolve("refused");
      setTimeout(() => resolve("timeout"), 5000);
    });
    return { status: r.status, roomId: room.roomId, joinCode: room.joinCode, hostClaimToken: room.hostClaimToken, url, ws };
  });
  check("H4 after entry: the same-origin API creates a room and a wss:// socket opens with a live update", live.status === 201 && live.url.startsWith(`wss://${HOST}:`) && live.ws === "open, live update received", JSON.stringify({ status: live.status, url: live.url.replace(/roomId=[^&]+/, "roomId=…"), ws: live.ws }));
  // The app's own socket: join the room as host in this browser and open the lobby.
  const joined = await page.evaluate(async (r) => {
    const j = await fetch(`/rooms/${r.roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "Keku", asHost: true, hostClaimToken: r.hostClaimToken }) });
    const b = await j.json();
    sessionStorage.setItem("cgn_roomId", r.roomId); sessionStorage.setItem("cgn_playerId", b.playerId); sessionStorage.setItem("cgn_token", b.recoveryToken);
    return j.status;
  }, live);
  await page.goto(`${ORIGIN}/room`);
  const lobby = await page.getByTestId("lobby-dock").waitFor({ timeout: 15000 }).then(() => true, () => false);
  await sleep(500);
  check("H4 the app's own live connection is wss:// to the public origin, and the lobby loads", joined === 201 && lobby && sockets.some((u) => u.startsWith(`wss://${HOST}:${proxyPort}/`)), JSON.stringify(sockets.map((u) => u.replace(/\?.*$/, "?…"))));
  const stranger = await (await browser.newContext(ctxOpts(390))).newPage();
  await stranger.goto(`${ORIGIN}/beta`);
  const refused = await stranger.evaluate(async (roomId) => {
    const r = await fetch("/games");
    const body = await r.json().catch(() => ({}));
    const ws = await new Promise((resolve) => {
      const w = new WebSocket(`${location.origin.replace("https:", "wss:")}/?roomId=${roomId}&audience=tv`);
      w.onopen = () => { w.close(); resolve("open"); };
      w.onerror = () => resolve("refused");
      setTimeout(() => resolve("timeout"), 5000);
    });
    return { status: r.status, code: body.code, ws };
  }, live.roomId);
  check("H5 a browser without the cookie: the API refuses (401 BETA_ACCESS_REQUIRED) and the wss:// socket is refused", refused.status === 401 && refused.code === "BETA_ACCESS_REQUIRED" && refused.ws === "refused", JSON.stringify(refused));

  // ---- H6 (protocol-level, through the proxy, the certificate verified against the run's CA) ----
  if (!cookie) throw new Error("H6 needs the beta cookie from H3, and there is none");
  const cookieHeader = `${cookie.name}=${cookie.value}`;
  const tlsOpts = { host: "127.0.0.1", port: proxyPort, servername: HOST, ca: cert };
  const call = (method, path, headers, body) => new Promise((resolve, reject) => {
    const r = https.request({ ...tlsOpts, method, path, headers: { host: `${HOST}:${proxyPort}`, ...headers } }, (res) => {
      let b = ""; res.on("data", (d) => { b += d; }); res.on("end", () => resolve({ status: res.statusCode, setCookie: res.headers["set-cookie"], body: b }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
  // To 127.0.0.1 (beta.test has no DNS outside the browser), as beta.test: the TLS server name and the Host header.
  const wsTry = (origin) => new WebSocket(`wss://127.0.0.1:${proxyPort}/?roomId=${live.roomId}&audience=tv`, { servername: HOST, ca: cert, origin, headers: { host: `${HOST}:${proxyPort}`, cookie: cookieHeader } });
  const wsResult = (origin) => new Promise((resolve) => {
    const w = wsTry(origin);
    w.once("open", () => { w.close(); resolve("open"); });
    w.once("unexpected-response", (_q, res) => resolve(res.statusCode));
    w.once("error", (e) => resolve(`error ${e.message}`));
  });
  const foreign = ["https://evil.test", `http://${HOST}:${proxyPort}`, `https://${HOST}:${proxyPort + 1}`, `https://localhost:${proxyPort}`, "null"];
  for (const origin of [ORIGIN, ...foreign]) {
    const isOk = origin === ORIGIN;
    const api = await call("POST", "/rooms", { cookie: cookieHeader, origin, "content-type": "application/json" }, JSON.stringify({ name: "Origin check", kind: "casual" }));
    const enter = await call("POST", "/beta/enter", { origin, "content-type": "application/x-www-form-urlencoded" }, new URLSearchParams({ code: CODE, next: "/" }).toString());
    const ws = await wsResult(origin);
    const apiCode = (() => { try { return JSON.parse(api.body).code; } catch { return undefined; } })();
    if (isOk) check(`H6 control, Origin ${origin.replace(String(proxyPort), "<port>")}: the API answers 201, the code form signs in (303 + cookie), the wss:// handshake opens`, api.status === 201 && enter.status === 303 && !!enter.setCookie && ws === "open", `${api.status} / ${enter.status} / ${ws}`);
    else check(`H6 foreign Origin ${origin.replace(String(proxyPort), "<port>")}, with a valid cookie: API 403 FOREIGN_ORIGIN, code form 403 with no cookie, wss:// handshake 403`, api.status === 403 && apiCode === "FOREIGN_ORIGIN" && enter.status === 403 && !enter.setCookie && ws === 403, `${api.status} ${apiCode} / ${enter.status} ${enter.setCookie ? "cookie set" : "no cookie"} / ${ws}`);
  }
  check("the server never printed the access code", !owned.out.includes(CODE));
} catch (e) {
  check("the check ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (failures) console.log(`--- server output ---\n${owned.out.slice(-1500)}`);
  await browser?.close().catch(() => {});
  const s = owned.server;
  if (s && s.exitCode === null && s.signalCode === null) { const exited = new Promise((r) => s.once("exit", r)); s.kill("SIGTERM"); const hard = setTimeout(() => s.kill("SIGKILL"), 5000); await exited; clearTimeout(hard); }
  if (owned.proxy) { for (const so of owned.sockets) so.destroy(); await new Promise((r) => owned.proxy.close(r)); }
  for (const d of owned.dirs) rmSync(d, { recursive: true, force: true });
  console.log(`cleanup: server stopped (${s ? s.exitCode ?? s.signalCode : "never started"}), proxy closed, ${owned.dirs.length} temporary dir(s) removed`);
}
console.log(failures === 0 ? "HTTPS BETA GATE PASSED" : `HTTPS BETA GATE FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
