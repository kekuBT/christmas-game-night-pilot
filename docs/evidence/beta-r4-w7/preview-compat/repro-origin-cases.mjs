#!/usr/bin/env node
// Handoff 6957705907: the private-preview Origin cases of review 6957543881, sent to the REAL runtime.
// - The runtime: src/server/serve.ts under NODE_ENV=production, gated, on 127.0.0.1. It's started from this checkout's source.
// - What is sent: each request carries the headers exactly as the server received them in the owner's Codespace.
//   The page's own requests arrived as `http://localhost:3157`; its cross-origin requests kept their https origin.
//   This script stands in for no forwarder: it sends the "as received" values itself.
// - The three configurations:
//   C0  MCHEZO_PUBLIC_ORIGIN = the address-bar origin, with requests sent directly.
//   C1  MCHEZO_PUBLIC_ORIGIN = http://localhost:3157, with requests sent directly. A supported runtime setting, but the
//       cookie loses Secure.
//   C2  MCHEZO_PUBLIC_ORIGIN = the address-bar origin, behind a MODEL of the proposed preview adapter. The model renames
//       exactly one Origin value (internal -> external) and passes every other value unchanged. It refuses two things
//       itself: an Upgrade or non-GET/HEAD request with no Origin, and an Origin that already equals the external one
//       (the forwarder is measured never to deliver it). So C2 admits exactly the requests C1 admits.
//       This model exists for review only. It is in this test, not in the operator tool.
// A synthetic access code is used, and it is never printed. Every check must hold: exit 0 means every check passed.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CODE = `synthetic-${Math.random().toString(36).slice(2, 10)}-code`;
const EXT = "https://cs-example-3157.app.github.dev";   // the external HTTPS identity (the owner's address bar)
const OWN = "http://localhost:3157";                    // the page's own fetch, form and WS, as received (6957543881)
const SIB = "https://cs-example-3158.app.github.dev";   // the cross-origin page: its value was kept (6957543881)
let failures = 0;
const check = (name, ok, got) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${got !== undefined ? ` -> ${got}` : ""}`); };

function startServer(publicOrigin) {
  const data = mkdtempSync(join(tmpdir(), "origin-cases-"));
  const env = { ...process.env, NODE_ENV: "production", PORT: "0", MCHEZO_LISTEN_HOST: "127.0.0.1", MCHEZO_DATA_DIR: data,
    MCHEZO_PUBLIC_ORIGIN: publicOrigin, MCHEZO_BETA_ACCESS_CODE: CODE, MCHEZO_BUILD_REVISION: "origin-cases" };
  for (const k of ["MCHEZO_TRUST_PROXY", "CODESPACE_NAME", "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"]) delete env[k];
  // `node --import tsx`, not the tsx command: its IPC pipe failed with EADDRINUSE under a long temp path (final/run1).
  const p = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  return new Promise((ok, bad) => {
    const t = setTimeout(() => bad(new Error(`server didn't start: ${out.slice(-400)}`)), 30000);
    const on = (d) => { out += d; const m = /server on http:\/\/localhost:(\d+)/.exec(out); if (m) { clearTimeout(t); ok({ p, port: Number(m[1]), data, log: () => out }); } };
    p.stdout.on("data", on); p.stderr.on("data", on);
    p.once("exit", (c) => { clearTimeout(t); rmSync(data, { recursive: true, force: true }); bad(new Error(`server exited ${c}: ${out.slice(-400)}`)); });
  });
}
async function stopServer(s) { const e = new Promise((r) => s.p.once("exit", r)); s.p.kill("SIGTERM"); await e; rmSync(s.data, { recursive: true, force: true }); }

// The adapter MODEL (C2). It listens where the forwarder delivers and forwards to the app on loopback.
// - It renames exactly `internal` to `external`; it adds no Origin and removes none.
// - It refuses an Origin already equal to `external`: the forwarder never delivers that, so a change in the
//   forwarder fails closed instead of being accepted silently.
// - It reads no Referer, Sec-Fetch-*, Host or X-Forwarded-* header.
function adapterModel(upstreamPort, internal, external) {
  const rename = (h) => (h.origin === internal ? { ...h, origin: external } : { ...h });
  const needsOrigin = (req) => !!req.headers.upgrade || !["GET", "HEAD"].includes(req.method);
  const srv = http.createServer((req, res) => {
    if (needsOrigin(req) && req.headers.origin === undefined) { res.writeHead(403, { "content-type": "application/json" }); res.end('{"code":"ORIGIN_REQUIRED"}'); return; }
    if (req.headers.origin === external) { res.writeHead(403, { "content-type": "application/json" }); res.end('{"code":"ORIGIN_NOT_REWRITTEN"}'); return; }
    const up = http.request({ host: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, headers: rename(req.headers) }, (ur) => { res.writeHead(ur.statusCode, ur.headers); ur.pipe(res); });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  srv.on("upgrade", (req, socket, head) => {
    if (req.headers.origin === undefined || req.headers.origin === external) { socket.end("HTTP/1.1 403 Forbidden\r\nconnection: close\r\ncontent-length: 0\r\n\r\n"); return; }
    const up = net.connect(upstreamPort, "127.0.0.1", () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(rename(req.headers))) for (const one of [].concat(v)) raw += `${k}: ${one}\r\n`;
      up.write(`${raw}\r\n`); if (head?.length) up.write(head); up.pipe(socket); socket.pipe(up);
    });
    up.on("error", () => socket.destroy()); socket.on("error", () => up.destroy());
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, port: srv.address().port })));
}

const call = (port, method, path, headers, body) => new Promise((ok, bad) => {
  const r = http.request({ host: "127.0.0.1", port, method, path, headers: { host: "localhost:3157", ...headers } }, (res) => {
    let b = ""; res.on("data", (d) => { b += d; }); res.on("end", () => { let code; try { code = JSON.parse(b).code; } catch {} ok({ status: res.statusCode, code, body: b, setCookie: res.headers["set-cookie"]?.[0] }); });
  });
  r.on("error", bad); if (body) r.write(body); r.end();
});
const omit = (h) => Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined));
const enter = (port, origin, extra = {}) => call(port, "POST", "/beta/enter", omit({ origin, "content-type": "application/x-www-form-urlencoded", ...extra }), new URLSearchParams({ code: CODE, next: "/" }).toString());
const api = (port, origin, cookie, extra = {}) => call(port, "POST", "/rooms", omit({ origin, cookie, "content-type": "application/json", ...extra }), JSON.stringify({ name: "Origin cases", kind: "casual" }));
const wsTry = (port, roomId, origin, cookie, extra = {}) => new Promise((ok) => {
  const w = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${roomId}&audience=tv`, { ...(origin !== undefined ? { origin } : {}), headers: omit({ host: "localhost:3157", cookie, ...extra }) });
  const t = setTimeout(() => { w.terminate(); ok("timeout"); }, 5000);
  w.once("open", () => { clearTimeout(t); w.close(); ok("open"); });
  w.once("unexpected-response", (_q, res) => { clearTimeout(t); ok(res.statusCode); });
  w.once("error", (e) => { clearTimeout(t); ok(`error ${e.message}`); });
});
const flags = (sc) => (sc ? sc.split(";").slice(1).map((s) => s.trim()).filter((s) => !s.startsWith("Max-Age")).join("; ") : "(no cookie)");
const SPOOF = { "x-forwarded-host": "cs-example-3157.app.github.dev", "x-forwarded-proto": "https", referer: `${EXT}/`, "sec-fetch-site": "same-origin" };

// The origins each configuration is asked about, and which one it must admit.
const CASES = [
  ["own, as received", OWN], ["the address-bar origin", EXT], ["the sibling port (as received)", SIB], ["null (sandboxed frame)", "null"],
  ["scheme swapped", "https://localhost:3157"], ["another loopback port", "http://localhost:3158"], ["foreign", "https://evil.example"],
  ["foreign, with spoofed X-Forwarded-*/Referer/Sec-Fetch-Site", "https://evil.example", SPOOF], ["missing", undefined],
];

async function run(label, publicOrigin, admitted, viaAdapter) {
  console.log(`\n== ${label}: MCHEZO_PUBLIC_ORIGIN=${publicOrigin}${viaAdapter ? `, behind the adapter model (${OWN} -> ${EXT})` : ", requests sent directly"}`);
  const s = await startServer(publicOrigin);
  const a = viaAdapter ? await adapterModel(s.port, OWN, EXT) : null;
  const port = a ? a.port : s.port;
  try {
    // A valid cookie and a room, through the one origin this configuration admits (a browser would have done the same).
    const e0 = await enter(port, admitted);
    const cookie = e0.setCookie?.split(";")[0];
    const room = await call(port, "POST", "/rooms", { origin: admitted, cookie, "content-type": "application/json" }, JSON.stringify({ name: "Origin cases", kind: "casual" }));
    check(`${label} setup: the admitted origin ${admitted} signs in (303) and creates a room`, e0.status === 303 && !!cookie && room.status === 201, `${e0.status} / ${room.status}`);
    const roomId = (/"(?:roomId|id)":"([^"]+)"/.exec(room.body) ?? [])[1];
    console.log(`   cookie set by the admitted origin: ${flags(e0.setCookie)}`);
    for (const [name, origin, extra] of CASES) {
      const r1 = await api(port, origin, cookie, extra), r2 = await enter(port, origin, extra), r3 = roomId ? await wsTry(port, roomId, origin, cookie, extra) : "no room id";
      const shown = `API ${r1.status}${r1.code ? ` ${r1.code}` : ""} / form ${r2.status}${r2.setCookie ? ` (${flags(r2.setCookie)})` : " no cookie"} / WS ${r3}`;
      const isAdmitted = origin === admitted;
      if (viaAdapter && origin === EXT) check(`${label} ${name} (${origin}) arriving unrewritten: the adapter refuses it on all three (403 ORIGIN_NOT_REWRITTEN; WS 403)`, r1.status === 403 && r1.code === "ORIGIN_NOT_REWRITTEN" && r2.status === 403 && !r2.setCookie && r3 === 403, shown);
      else if (isAdmitted) check(`${label} ${name} (${origin}): admitted on all three`, r1.status === 201 && r2.status === 303 && r3 === "open", shown);
      else if (origin === undefined) {
        // Production admits a request with no Origin (a plain navigation); browsers always send one on POST and WS. The adapter model refuses it there.
        if (viaAdapter) check(`${label} ${name}: the adapter refuses POST and WS without an Origin (403 ORIGIN_REQUIRED)`, r1.status === 403 && r1.code === "ORIGIN_REQUIRED" && r2.status === 403 && r3 === 403, shown);
        else check(`${label} ${name}: production lets a request without an Origin past the origin check (the beta cookie still decides)`, r1.status === 201 && r2.status === 303 && r3 === "open", shown);
      } else check(`${label} ${name} (${origin}), with a valid cookie: refused by the runtime on all three (API 403 FOREIGN_ORIGIN, form 403 with no cookie, WS 403)`, r1.status === 403 && r1.code === "FOREIGN_ORIGIN" && r2.status === 403 && !r2.setCookie && r3 === 403, shown);
    }
    // The beta gate still applies to the admitted origin: without the cookie, refused.
    const n1 = await api(port, admitted, undefined), n3 = roomId ? await wsTry(port, roomId, admitted, undefined) : "no room id";
    check(`${label} the admitted origin without the beta cookie: API 401 BETA_ACCESS_REQUIRED, WS refused`, n1.status === 401 && n1.code === "BETA_ACCESS_REQUIRED" && n3 !== "open", `API ${n1.status} ${n1.code ?? ""} / WS ${n3}`);
    check(`${label} the server never printed the access code`, !s.log().includes(CODE));
    return flags(e0.setCookie);
  } finally {
    if (a) await new Promise((r) => a.srv.close(r));
    await stopServer(s);
  }
}

try {
  const c0 = await run("C0", EXT, EXT, false);
  const c1 = await run("C1", OWN, OWN, false);
  const c2 = await run("C2", EXT, OWN, true);
  check("C0's cookie (the address-bar origin, https) is Secure", /\bSecure\b/.test(c0), c0);
  check("C1's cookie (http://localhost:3157) is NOT Secure: the cost of the config-only route", !/\bSecure\b/.test(c1), c1);
  check("C2's cookie (behind the adapter model, public origin https) is Secure", /\bSecure\b/.test(c2), c2);
} catch (e) { check("the run completed", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | ")); }
console.log(failures === 0 ? "\nORIGIN CASES: every check passed (exit 0)" : `\nORIGIN CASES: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
