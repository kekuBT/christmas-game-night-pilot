// Beta R4 (handoff 6919813048): the W1 way-in checks against the Render service, with evidence collection.
// Not a gate driver (it lives under scripts/beta/). Run it from a checkout of this repository after `npm ci` (it uses the
// repository's `ws` package), on Node 22. It makes only the requests described below, to the one origin given.
//
//   node scripts/beta/w1-check.mjs <mode> --origin https://<service>.onrender.com [options]
//
// Modes (docs/beta/render-w1.md has the order, the window rules and what each result means):
//   closed      Maintenance mode is on (outside a window): GET /health, GET / and GET /beta all get 503, and nothing
//               reaches the app (no gate page, no cookie). GET only: it never counts as a wrong code.
//   boundary    Checks 1 and 2: HTTPS and the HTTP and WebSocket boundary.
//               - http:// redirects to https:// (301/302/307/308, same host and path); the TLS certificate verifies;
//                 /health is 200 with the expected revision and nothing else.
//               - With no cookie: a page load gets the gate (401), the API 401 BETA_ACCESS_REQUIRED, the WebSocket
//                 handshake 401.
//               - The right code (from --code-file) at the gate: 303 and a cookie that is Secure, HttpOnly,
//                 SameSite=Lax, Path=/, host-only (no Domain), and isn't the code.
//               - With that cookie, each foreign Origin (another site; http:// on the same host; another port;
//                 "null") gets API 403 FOREIGN_ORIGIN, code form 403 with no cookie, WebSocket handshake 403; the
//                 right Origin (the control) gets API 201, code form 303 with a cookie, and a live projection of the
//                 room it created over wss://.
//               - Security headers on a response: nosniff, X-Frame-Options DENY, frame-ancestors 'none'.
//   forgery     Check 3, first half (proves the proxy count is NOT TOO HIGH). Fourteen wrong codes, each on a new
//               connection with a DIFFERENT forged X-Forwarded-For (203.0.113.x, a documentation range). The gate
//               allows 10 failures per 15 minutes per address, so a 429 must come by the 11th attempt, and every
//               attempt after the first 429 must get 429 too. If the count were too high, each forged value would be
//               its own address and no 429 could come. Earlier failures from this address in the last 15 minutes
//               make the 429 come sooner; they are reported. If the very first attempt gets 429, the address was
//               already limited: INCONCLUSIVE (wait 15 minutes or redeploy).
//               This locks out THIS network's address at the gate for 15 minutes (a redeploy clears it): run it after
//               boundary and reconnect.
//   separation  Check 3, second half (proves the count is NOT TOO LOW). Run right after `forgery`, on a second device
//               on ANOTHER network (a phone on mobile data, a laptop on a hotspot): the right code must get 303 and a
//               cookie, and the API must then answer 200. A 429 means every client shares one address.
//   reconnect   Check 4. Creates a throwaway room with a host, two players and a TV socket, then waits for the
//               operator's manual deploy or dashboard restart (--wait-seconds, default 900). Every socket must close,
//               reconnect (retrying every 2 s), and receive a projection of the same room with the same three players.
//
// Options:
//   --origin URL              the public origin (required); the service's MCHEZO_PUBLIC_ORIGIN
//   --code-file FILE          the throwaway access code (boundary, separation, reconnect); never printed or recorded
//   --evidence DIR            where to write the evidence JSON (default ./w1-evidence)
//   --expect-revision SHA     default 7097ac2bb062925bb296a129f4771f1e68fd522d
//   --trust-proxy N           the MCHEZO_TRUST_PROXY value deployed, recorded with forgery/separation
//   --wait-seconds N          reconnect: how long to wait for the deploy or restart (default 900)
//   For a local run only (the self-test, behind a local proxy; never needed against Render):
//   --connect HOST:PORT       connect here for https/wss instead of the origin's host (SNI and Host stay the origin's)
//   --connect-http HOST:PORT  connect here for the http:// redirect check
//   --ca FILE                 trust this certificate (a local self-signed one)
//   --local-address IP        the source address for this run's connections (the self-test's "other network")
//
// Output: PASS/FAIL lines and a final "W1 <MODE> PASSED" / "FAILED" / "INCONCLUSIVE" (exit 0 / 1 / 3). The evidence
// file records every request's status and timing; cookie values and the code are redacted. This tool can't tell
// whether a request went through Render: run it against the onrender.com origin only.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import { WebSocket } from "ws";

const MODES = ["closed", "boundary", "forgery", "separation", "reconnect"];
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i > 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
if (!MODES.includes(mode) || !opt("origin")) {
  console.error(`usage: node scripts/beta/w1-check.mjs <${MODES.join("|")}> --origin https://<service>.onrender.com [--code-file F] [--evidence DIR] (see the header)`);
  process.exit(2);
}
const ORIGIN = new URL(opt("origin")).origin;
if (!ORIGIN.startsWith("https://")) { console.error("--origin must be https://"); process.exit(2); }
const HOST = new URL(ORIGIN).host; // host[:port], as the Host header
const HOSTNAME = new URL(ORIGIN).hostname;
const PORT = Number(new URL(ORIGIN).port || 443);
const EXPECT_REVISION = opt("expect-revision", "7097ac2bb062925bb296a129f4771f1e68fd522d");
const [connHost, connPort] = (opt("connect", `${HOSTNAME}:${PORT}`)).split(":");
const [httpHost, httpPort] = (opt("connect-http", `${HOSTNAME}:80`)).split(":");
const CA = opt("ca") ? readFileSync(opt("ca")) : undefined;
const LOCAL = opt("local-address");
const CODE = opt("code-file") ? readFileSync(opt("code-file"), "utf8").trim() : undefined;
const started = new Date();
const evidence = { tool: "scripts/beta/w1-check.mjs", mode, origin: ORIGIN, startedAt: started.toISOString(), trustProxy: opt("trust-proxy") ?? null, localAddress: LOCAL ?? null, connect: opt("connect") ?? null, requests: [], checks: [] };
let failures = 0;
let inconclusive = false;
const redact = (s) => (CODE ? String(s).split(CODE).join("<code>") : String(s)).replace(/cgn_beta=[^;,\s]+/g, "cgn_beta=<redacted>");
function check(name, ok, detail = "") {
  const d = redact(detail);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${d ? ` — ${d}` : ""}`);
  evidence.checks.push({ name, ok, detail: d, at: new Date().toISOString() });
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request on a NEW connection (no keep-alive), so every attempt is its own TCP/TLS session. */
function request(method, path, { headers = {}, body, scheme = "https", label = "" } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const lib = scheme === "https" ? https : http;
    const o = scheme === "https"
      ? { host: connHost, port: Number(connPort), servername: HOSTNAME, ca: CA, agent: false }
      : { host: httpHost, port: Number(httpPort), agent: false };
    if (LOCAL) o.localAddress = LOCAL;
    const r = lib.request({ ...o, method, path, headers: { host: scheme === "https" ? HOST : HOSTNAME + (httpPort === "80" ? "" : `:${httpPort}`), connection: "close", ...headers }, timeout: 20000 }, (res) => {
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { if (b.length < 20000) b += d; });
      res.on("end", () => {
        const out = { status: res.statusCode, headers: res.headers, body: b, ms: Date.now() - t0 };
        evidence.requests.push({ label, method, scheme, path, sentHeaders: Object.keys(headers).map((k) => (k === "cookie" ? "cookie: <redacted>" : `${k}: ${redact(headers[k])}`)), status: res.statusCode, setCookie: res.headers["set-cookie"] ? "<present>" : null, location: res.headers.location ?? null, ms: out.ms, at: new Date(t0).toISOString() });
        resolve(out);
      });
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", (e) => {
      evidence.requests.push({ label, method, scheme, path, error: e.message, ms: Date.now() - t0, at: new Date(t0).toISOString() });
      resolve({ status: 0, error: e.message, headers: {}, body: "", ms: Date.now() - t0 });
    });
    if (body) r.write(body);
    r.end();
  });
}
const form = (o) => new URLSearchParams(o).toString();
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const JSONH = { "content-type": "application/json" };
const codeOf = (r) => { try { return JSON.parse(r.body).code; } catch { return undefined; } };

/** Sign in at the gate with the right code; returns the cookie header and the Set-Cookie attributes. */
async function enter(origin = ORIGIN, label = "enter") {
  const r = await request("POST", "/beta/enter", { headers: { ...FORM, origin }, body: form({ code: CODE, next: "/" }), label });
  const sc = [].concat(r.headers["set-cookie"] ?? [])[0] ?? "";
  const m = /^(cgn_beta=([^;]*))/.exec(sc);
  const attrs = sc.split(";").slice(1).map((s) => s.trim());
  return { r, cookie: m ? m[1] : null, value: m ? m[2] : null, attrs };
}

/** Open a WebSocket; resolves with "open:<first message kind>" or the refusal status, and keeps the socket if asked. */
function socket(path, { cookie, origin = ORIGIN, protocols, keep = false } = {}) {
  return new Promise((resolve) => {
    const url = `wss://${connHost}:${connPort}${path}`;
    const ws = new WebSocket(url, protocols ?? [], { servername: HOSTNAME, ca: CA, origin, headers: { host: HOST, ...(cookie ? { cookie } : {}) }, ...(LOCAL ? { localAddress: LOCAL } : {}), handshakeTimeout: 15000 });
    let done = false;
    const finish = (v) => { if (!done) { done = true; if (!keep) ws.terminate(); resolve(keep ? { ...v, ws } : v); } };
    ws.once("message", (data) => { let k = "?"; let state; try { const m = JSON.parse(String(data)); k = m.kind; state = m.state; } catch { /* not JSON */ } finish({ result: `open:${k}`, state }); });
    ws.once("unexpected-response", (_q, res) => finish({ result: res.statusCode }));
    ws.once("error", (e) => finish({ result: `error ${e.message}` }));
    ws.once("close", (c) => finish({ result: `closed ${c}` }));
    setTimeout(() => finish({ result: "timeout" }), 20000);
  });
}

async function createRoom(cookie, name) {
  const r = await request("POST", "/rooms", { headers: { ...JSONH, cookie, origin: ORIGIN }, body: JSON.stringify({ name, kind: "casual" }), label: "create room" });
  let room = {};
  try { room = JSON.parse(r.body); } catch { /* checked by the caller */ }
  return { r, room };
}
async function joinRoom(cookie, room, displayName, asHost) {
  const r = await request("POST", "/rooms/join-by-code", { headers: { ...JSONH, cookie, origin: ORIGIN }, body: JSON.stringify({ joinCode: room.joinCode, displayName, ...(asHost ? { asHost: true, hostClaimToken: room.hostClaimToken } : {}) }), label: `join ${displayName}` });
  let p = {};
  try { p = JSON.parse(r.body); } catch { /* checked by the caller */ }
  return { r, p };
}

async function closed() {
  for (const [path, headers] of [["/health", {}], ["/", { accept: "text/html" }], ["/beta", { accept: "text/html" }]]) {
    const r = await request("GET", path, { headers, label: `closed GET ${path}` });
    check(`closed: GET ${path} gets 503 (maintenance), and nothing from the app (no gate page, no cookie)`, r.status === 503 && !/Access code/.test(r.body) && !r.headers["set-cookie"], `status ${r.status || r.error}`);
  }
}

async function boundary() {
  if (!CODE) throw new Error("boundary needs --code-file");
  // 2. HTTPS
  const redirect = await request("GET", "/health?w1=1", { scheme: "http", label: "http redirect" });
  const loc = redirect.headers.location ?? "";
  check("2 http:// redirects to https:// on the same host and path", [301, 302, 307, 308].includes(redirect.status) && loc === `${ORIGIN}/health?w1=1`, `status ${redirect.status || redirect.error}, location ${loc}`);
  const health = await request("GET", "/health", { label: "health" });
  check("2 the TLS certificate verifies, and /health is 200 with the expected revision and nothing else", health.status === 200 && health.body === JSON.stringify({ ok: true, revision: EXPECT_REVISION }), `status ${health.status || health.error}, ${health.body.slice(0, 120)}`);
  const h = health.headers;
  check("2 security headers: nosniff, X-Frame-Options DENY, frame-ancestors 'none'", h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY" && /frame-ancestors 'none'/.test(h["content-security-policy"] ?? ""), JSON.stringify({ nosniff: h["x-content-type-options"], frame: h["x-frame-options"], csp: h["content-security-policy"] }));
  // 1. No cookie
  const page = await request("GET", "/", { headers: { accept: "text/html" }, label: "page, no cookie" });
  check("1 no cookie: a page load gets the gate page (401)", page.status === 401 && /Access code/.test(page.body), `status ${page.status}`);
  const api = await request("GET", "/games", { label: "api, no cookie" });
  check("1 no cookie: the API answers 401 BETA_ACCESS_REQUIRED", api.status === 401 && codeOf(api) === "BETA_ACCESS_REQUIRED", `status ${api.status}, ${codeOf(api)}`);
  // The right code
  const e = await enter(ORIGIN, "enter, right origin");
  const has = (a) => e.attrs.some((x) => x.toLowerCase() === a.toLowerCase());
  check("1 the right code at the gate: 303 and a cookie", e.r.status === 303 && !!e.cookie, `status ${e.r.status}`);
  check("2 the cookie is Secure, HttpOnly, SameSite=Lax, Path=/, host-only (no Domain), and isn't the code", has("Secure") && has("HttpOnly") && has("SameSite=Lax") && has("Path=/") && !e.attrs.some((x) => /^domain=/i.test(x)) && !!e.value && !e.value.includes(CODE), `attributes: ${e.attrs.map((x) => x.split("=")[0] + (/^(samesite|path)=/i.test(x) ? `=${x.split("=")[1]}` : "")).join(", ")}`);
  if (!e.cookie) throw new Error("no cookie from the gate: the rest of the boundary checks need it");
  const created = await createRoom(e.cookie, `W1 boundary ${started.toISOString()}`);
  check("1 control: with the cookie and the right Origin, the API creates a room (201)", created.r.status === 201 && !!created.room.roomId, `status ${created.r.status}`);
  const wsNoCookie = await socket(`/?roomId=${created.room.roomId}&audience=tv`);
  check("1 no cookie: the WebSocket handshake is refused (401)", wsNoCookie.result === 401, `${wsNoCookie.result}`);
  const live = await socket(`/?roomId=${created.room.roomId}&audience=tv`, { cookie: e.cookie });
  check("1 control: with the cookie and the right Origin, wss:// opens and a live projection of that room arrives", live.result === "open:projection" && live.state?.roomId === created.room.roomId, `${live.result}${live.state ? `, room ${live.state.roomId === created.room.roomId ? "matches" : "differs"}` : ""}`);
  const ctrlEnter = await enter(ORIGIN, "enter again, right origin (control)");
  check("1 control: the code form with the right Origin signs in again (303 + cookie)", ctrlEnter.r.status === 303 && !!ctrlEnter.cookie, `status ${ctrlEnter.r.status}`);
  const foreign = ["https://evil.example", `http://${HOST}`, `https://${HOSTNAME}:${PORT === 443 ? 8443 : PORT + 1}`, "null"];
  for (const origin of foreign) {
    const a = await request("POST", "/rooms", { headers: { ...JSONH, cookie: e.cookie, origin }, body: JSON.stringify({ name: "W1 foreign origin", kind: "casual" }), label: `api, Origin ${origin}` });
    const f = await request("POST", "/beta/enter", { headers: { ...FORM, origin }, body: form({ code: CODE, next: "/" }), label: `code form, Origin ${origin}` });
    const w = await socket(`/?roomId=${created.room.roomId}&audience=tv`, { cookie: e.cookie, origin });
    check(`1 foreign Origin ${origin}, with a valid cookie: API 403 FOREIGN_ORIGIN, code form 403 with no cookie, WebSocket 403`, a.status === 403 && codeOf(a) === "FOREIGN_ORIGIN" && f.status === 403 && !f.headers["set-cookie"] && w.result === 403, `${a.status} ${codeOf(a)} / ${f.status} ${f.headers["set-cookie"] ? "cookie set" : "no cookie"} / ${w.result}`);
  }
}

async function forgery() {
  const results = [];
  for (let i = 1; i <= 14; i++) {
    const forged = `203.0.113.${i * 11}`;
    const r = await request("POST", "/beta/enter", { headers: { ...FORM, origin: ORIGIN, "x-forwarded-for": forged }, body: form({ code: `w1-wrong-${i}-${randomBytes(4).toString("hex")}`, next: "/" }), label: `wrong code ${i}, forged X-Forwarded-For ${forged}` });
    results.push({ i, forged, status: r.status || r.error, retryAfter: r.headers["retry-after"] ?? null });
    if (i === 1 && r.status === 429) { inconclusive = true; break; }
  }
  evidence.forgery = results;
  console.log(`attempts: ${results.map((x) => `${x.i}:${x.status}`).join(" ")}`);
  if (inconclusive) { console.log("INCONCLUSIVE: the first attempt already got 429; this address is still limited from an earlier run. Wait 15 minutes, or redeploy, then run forgery again."); return; }
  const firstLimited = results.findIndex((x) => x.status === 429); // 0-based
  const before = firstLimited < 0 ? results : results.slice(0, firstLimited);
  evidence.forgeryEarlierFailures = firstLimited < 0 ? null : 10 - firstLimited;
  check("3 forgery: every attempt before the first 429 got 401 (a wrong code, refused)", before.every((x) => x.status === 401), before.map((x) => x.status).join(","));
  check("3 forgery: a 429 came by the 11th attempt, and every later one got 429 too, though each forged a different address: the limit counts this client's real address, so the proxy count is NOT TOO HIGH",
    firstLimited >= 0 && firstLimited <= 10 && results.slice(firstLimited).every((x) => x.status === 429),
    firstLimited < 0 ? "no 429 at all" : `first 429 at attempt ${firstLimited + 1}${firstLimited < 10 ? ` (${10 - firstLimited} earlier failure(s) from this address were still counted)` : ""}`);
}

async function separation() {
  if (!CODE) throw new Error("separation needs --code-file");
  const e = await enter(ORIGIN, "enter from the second network");
  evidence.separation = { status: e.r.status, cookie: !!e.cookie };
  check("3 separation: from another network, right after forgery, the right code gets 303 and a cookie (not 429): addresses are told apart, so the proxy count is NOT TOO LOW", e.r.status === 303 && !!e.cookie, `status ${e.r.status || e.r.error}${e.r.status === 429 ? " (every client shares one address: the count is too low, or this device is on the same network)" : ""}`);
  if (e.cookie) {
    const g = await request("GET", "/games", { headers: { cookie: e.cookie }, label: "api with the new cookie" });
    check("3 separation: the API then answers 200 with that cookie", g.status === 200, `status ${g.status}`);
  }
}

async function reconnect() {
  if (!CODE) throw new Error("reconnect needs --code-file");
  const waitS = Number(opt("wait-seconds", "900"));
  const e = await enter(ORIGIN, "enter");
  if (!e.cookie) throw new Error(`the gate gave no cookie (status ${e.r.status})`);
  const created = await createRoom(e.cookie, `W1 reconnect ${started.toISOString()}`);
  if (created.r.status !== 201) throw new Error(`could not create a room (status ${created.r.status})`);
  const people = [];
  for (const [name, asHost] of [["W1 Host", true], ["W1 Player A", false], ["W1 Player B", false]]) {
    const j = await joinRoom(e.cookie, created.room, name, asHost);
    if (j.r.status !== 201) throw new Error(`could not join ${name} (status ${j.r.status})`);
    people.push({ name, token: j.p.sessionToken, path: `/?roomId=${created.room.roomId}&audience=${asHost ? "host" : "player"}` });
  }
  const clients = [...people.map((p) => ({ name: p.name, path: p.path, protocols: [`cgn-session-${p.token}`] })), { name: "TV", path: `/?roomId=${created.room.roomId}&audience=tv`, protocols: [] }];
  const names = people.map((p) => p.name).sort().join(",");
  const states = clients.map((c) => ({ ...c, closedAt: null, reopenedAt: null, tries: 0, roomOk: false }));
  for (const s of states) {
    const o = await socket(s.path, { cookie: e.cookie, protocols: s.protocols, keep: true });
    if (o.result !== "open:projection") throw new Error(`${s.name}: the socket did not open (${o.result})`);
    s.ws = o.ws;
    s.ws.on("close", () => { if (!s.closedAt) s.closedAt = Date.now(); });
  }
  console.log(`room ${created.room.roomId}: ${states.length} sockets open (${states.map((s) => s.name).join(", ")}).`);
  console.log(`NOW trigger the manual deploy (or the dashboard restart). Waiting up to ${waitS} s for the sockets to close and come back.`);
  const deadline = Date.now() + waitS * 1000;
  while (Date.now() < deadline && states.some((s) => !s.reopenedAt)) {
    for (const s of states.filter((x) => x.closedAt && !x.reopenedAt)) {
      s.tries++;
      const o = await socket(s.path, { cookie: e.cookie, protocols: s.protocols });
      if (o.result === "open:projection") {
        s.reopenedAt = Date.now();
        const players = (o.state?.players ?? []).map((p) => p.displayName).sort().join(",");
        s.roomOk = o.state?.roomId === created.room.roomId && players === names;
        console.log(`${s.name}: back after ${((s.reopenedAt - s.closedAt) / 1000).toFixed(1)} s (${s.tries} tries); room ${s.roomOk ? "restored with its 3 players" : `NOT as before (${players})`}`);
      }
    }
    await sleep(2000);
  }
  for (const s of states) s.ws?.terminate();
  evidence.reconnect = { roomId: created.room.roomId, sockets: states.map((s) => ({ name: s.name, closed: !!s.closedAt, downS: s.closedAt && s.reopenedAt ? (s.reopenedAt - s.closedAt) / 1000 : null, tries: s.tries, roomRestored: s.roomOk })) };
  check("4 every socket was closed by the deploy or restart", states.every((s) => s.closedAt), states.map((s) => `${s.name}: ${s.closedAt ? "closed" : "never closed"}`).join("; "));
  check("4 every socket reconnected and got a projection of the same room with the same three players", states.every((s) => s.reopenedAt && s.roomOk), states.map((s) => `${s.name}: ${s.reopenedAt ? `${((s.reopenedAt - s.closedAt) / 1000).toFixed(1)} s` : "not back"}`).join("; "));
}

try {
  await ({ closed, boundary, forgery, separation, reconnect })[mode]();
} catch (e) {
  check(`the ${mode} checks ran to the end`, false, String(e?.message ?? e));
}
evidence.finishedAt = new Date().toISOString();
const verdict = failures ? "FAILED" : inconclusive ? "INCONCLUSIVE" : "PASSED";
evidence.verdict = verdict;
const dir = opt("evidence", "w1-evidence");
mkdirSync(dir, { recursive: true });
const file = join(dir, `w1-${mode}-${started.toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
console.log(`evidence: ${file}`);
console.log(`W1 ${mode.toUpperCase()} ${verdict}`);
process.exit(failures ? 1 : inconclusive ? 3 : 0);
