#!/usr/bin/env node
// Beta R1-R preview route (handoff 6903638660): what the port forwarder in front of a private Codespaces port does to a
// browser's Origin, for the same origin and for another one, over HTTP and WebSocket. A header-echo probe only:
// no app, no game data, no access code, and it never records a cookie, token or request body.
//
// It listens on 127.0.0.1 on two ports: the TARGET (stands where the app would) and the OTHER (a different origin on
// the same forwarding domain, the shape another *.app.github.dev page has).
//   1. Open the OTHER port's forwarded URL in the browser: its page sends a POST, a form post and a WebSocket to the
//      TARGET from that other origin.
//   2. Open the TARGET port's forwarded URL: its page sends the same three from its own origin, then shows the report.
//   3. The report (also at TARGET/report and in --out) lists what arrived and gives a verdict:
//      REWRITTEN_SAME_ORIGIN_ONLY  the forwarder rewrites only the target's own Origin, always to one value, and a
//                                  foreign Origin either never arrives or arrives as itself. The app's exact-origin
//                                  check can then be configured with that one value (docs/beta/beta-r1-preview-route.md).
//      PRESERVED                   same-origin requests arrive with the forwarded URL's own origin.
//      UNSAFE                      a foreign page's request arrived with the same Origin as the target's own, or with
//                                  none: the origin check could not tell them apart. Don't use route A.
//      INCONSISTENT                the target's own requests arrived with different Origins (e.g. the WebSocket not
//                                  rewritten like the POST): no single configured origin fits. Don't use route A.
//      INCOMPLETE                  a step is missing (which one is named).
//
// Usage (in the Codespace; both ports stay Private, the default):
//   node scripts/preview/probe-forwarded-origin.mjs [--target-port 3155] [--other-port 3156] [--out probe-report.json]
// The forwarded URLs are derived from CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN; elsewhere pass
// --target-url and --other-url. Stop it with Ctrl-C.
import http from "node:http";
import { writeFileSync } from "node:fs";
import { WebSocketServer } from "ws";

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const TARGET_PORT = Number(arg("target-port", "3155"));
const OTHER_PORT = Number(arg("other-port", "3156"));
const OUT = arg("out", "probe-report.json");
const cs = process.env.CODESPACE_NAME, domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const forwarded = (port) => (cs && domain ? `https://${cs}-${port}.${domain}` : undefined);
const TARGET_URL = arg("target-url", forwarded(TARGET_PORT));
const OTHER_URL = arg("other-url", forwarded(OTHER_PORT));
if (!TARGET_URL || !OTHER_URL) { console.error("Pass --target-url and --other-url (or run in a Codespace)."); process.exit(2); }
const TARGET_ORIGIN = new URL(TARGET_URL).origin;

const entries = [];
const SAME = ["fetch-post", "form-post", "ws"];
const FOREIGN = ["xorigin-fetch-post", "xorigin-form-post", "xorigin-ws"];
function record(where, req) {
  const u = new URL(req.url ?? "/", "http://probe");
  const h = req.headers;
  const ref = (() => { try { return h.referer ? new URL(String(h.referer)).origin : null; } catch { return "unparseable"; } })();
  entries.push({
    at: new Date().toISOString(), where, kind: u.searchParams.get("kind") ?? u.pathname, method: req.method,
    origin: h.origin ?? null, // null: no Origin header at all (a header with the value "null" stays the string "null")
    host: h.host ?? null, xForwardedHost: h["x-forwarded-host"] ?? null, xForwardedProto: h["x-forwarded-proto"] ?? null,
    secFetchSite: h["sec-fetch-site"] ?? null, secFetchMode: h["sec-fetch-mode"] ?? null, refererOrigin: ref,
    cookiePresent: Boolean(h.cookie), // never the value
  });
}

function verdict() {
  const at = (k) => entries.filter((e) => e.where === "target" && e.kind === k);
  const missing = SAME.filter((k) => !at(k).length);
  const otherOpened = entries.some((e) => e.where === "other" && e.kind === "done");
  const foreign = FOREIGN.flatMap(at);
  if (missing.length) return { verdict: "INCOMPLETE", why: `the target page's own ${missing.join(", ")} didn't arrive: open the target page (after the other page) and wait for it to finish` };
  const origins = [...new Set(SAME.flatMap((k) => at(k).map((e) => e.origin)))];
  if (origins.length !== 1) return { verdict: "INCONSISTENT", why: `the target's own requests arrived with different Origins: ${JSON.stringify(origins)}` };
  const own = origins[0];
  if (!otherOpened) return { verdict: "INCOMPLETE", why: "the other origin's page wasn't opened (or didn't finish): open it first, then the target page again", ownOrigin: own };
  const clash = foreign.filter((e) => e.origin === null || e.origin === own);
  if (clash.length) return { verdict: "UNSAFE", why: `a request from the other origin arrived with Origin ${JSON.stringify(clash[0].origin)}, the same as (or no better than) the target's own ${JSON.stringify(own)}`, ownOrigin: own };
  if (own === TARGET_ORIGIN) return { verdict: "PRESERVED", why: "same-origin requests keep the forwarded URL's origin", ownOrigin: own };
  return {
    verdict: "REWRITTEN_SAME_ORIGIN_ONLY", ownOrigin: own,
    why: `the target's own form post, fetch and WebSocket all arrived as ${own}; from the other origin ${foreign.length ? `${foreign.length} arrived, each with its own Origin (${[...new Set(foreign.map((e) => e.origin))].join(", ")})` : "nothing reached the server (stopped before it)"}`,
  };
}
function report() {
  const r = { probe: "forwarded-origin", targetUrl: TARGET_URL, otherUrl: OTHER_URL, targetPort: TARGET_PORT, otherPort: OTHER_PORT, ...verdict(), entries };
  writeFileSync(OUT, JSON.stringify(r, null, 2));
  return r;
}

const page = (title, script) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<body style="font:16px system-ui;margin:16px"><h1 style="font-size:20px">${title}</h1><pre id="out">running…</pre>
<iframe name="sink" style="display:none"></iframe><script>
const out = document.getElementById("out"); const log = (s) => { out.textContent += "\\n" + s; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function post(form) { return new Promise((res) => { const f = document.createElement("form"); f.method = "POST"; f.action = form; f.target = "sink";
  const i = document.querySelector("iframe"); const t = setTimeout(res, 5000); i.onload = () => { clearTimeout(t); res(); }; document.body.appendChild(f); f.submit(); }); }
function ws(url) { return new Promise((res) => { let s; try { s = new WebSocket(url); } catch (e) { log("ws: " + e); return res(); }
  const t = setTimeout(() => { log("ws: no answer in 5 s"); try { s.close(); } catch {} res(); }, 5000);
  s.onmessage = () => { log("ws: answered"); clearTimeout(t); s.close(); res(); }; s.onerror = () => { log("ws: error"); clearTimeout(t); res(); }; }); }
(async () => { ${script} })();
</script>`;

const targetPage = page("Forwarded-origin probe: target (same origin)", `
  try { const r = await fetch("/probe?kind=fetch-post", { method: "POST", body: "x" }); log("fetch POST: " + r.status); } catch (e) { log("fetch POST: " + e); }
  await post("/probe?kind=form-post"); log("form post: sent");
  await ws((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/probe-ws?kind=ws");
  const rep = await (await fetch("/report")).json();
  const shown = (o) => (o === null ? "(no Origin header)" : JSON.stringify(o));
  out.textContent = "VERDICT: " + rep.verdict + "\\n" + rep.why + "\\n\\n" + rep.entries.map((e) => [e.where, e.kind, "Origin " + shown(e.origin), "Sec-Fetch-Site " + (e.secFetchSite ?? "(none)")].join("  ")).join("\\n");`);
const otherPage = page("Forwarded-origin probe: other origin", `
  const T = ${JSON.stringify(TARGET_URL)};
  try { await fetch(T + "/probe?kind=xorigin-fetch-post", { method: "POST", mode: "no-cors", credentials: "include", body: "x" }); log("cross-origin fetch POST: sent"); } catch (e) { log("cross-origin fetch POST: " + e); }
  await post(T + "/probe?kind=xorigin-form-post"); log("cross-origin form post: sent");
  await ws(T.replace(/^http/, "ws") + "/probe-ws?kind=xorigin-ws");
  await fetch("/probe?kind=done", { method: "POST", body: "x" });
  log("done: now open the target page " + T);`);

function serve(where, port, html) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://probe");
    // The target's page posts its form under Referrer-Policy: same-origin, as the app's gate page does (B-13). The other
    // page keeps the browser's default policy, so its cross-origin form post carries its real origin, as most sites' would.
    const send = (status, type, body) => { res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...(where === "target" ? { "referrer-policy": "same-origin" } : {}) }); res.end(body); };
    if (req.method === "GET" && u.pathname === "/") return send(200, "text/html; charset=utf-8", html);
    if (where === "target" && req.method === "GET" && u.pathname === "/report") return send(200, "application/json", JSON.stringify(report(), null, 2));
    if (req.method === "POST" && u.pathname === "/probe") {
      record(where, req);
      req.resume(); // the body is never read
      req.on("end", () => send(200, "text/html; charset=utf-8", "<p>ok</p>"));
      return;
    }
    send(404, "text/plain", "not found");
  });
  if (where === "target") {
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      if (!(req.url ?? "").startsWith("/probe-ws")) { socket.destroy(); return; }
      record(where, req);
      wss.handleUpgrade(req, socket, head, (w) => { w.send("ok"); w.close(); });
    });
  }
  server.listen(port, "127.0.0.1", () => console.log(`${where}: listening on 127.0.0.1:${port}, open ${where === "target" ? TARGET_URL : OTHER_URL}`));
  return server;
}

const servers = [serve("target", TARGET_PORT, targetPage), serve("other", OTHER_PORT, otherPage)];
console.log("Keep both ports Private. Open the OTHER page first, then the TARGET page. Ctrl-C to stop.");
const stop = () => { const r = report(); console.log(`VERDICT: ${r.verdict}: ${r.why}\nreport written to ${OUT}`); for (const s of servers) s.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
