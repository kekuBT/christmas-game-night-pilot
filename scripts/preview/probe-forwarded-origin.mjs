#!/usr/bin/env node
// Beta R1-R preview route (handoff 6903638660; repaired for review 6903845075): what the port forwarder in front of a
// private Codespaces port does to a browser's Origin, for the same origin and for another one, over HTTP and WebSocket.
// A header-echo probe only: no app, no game data, no access code, and it never records a cookie, token or request body.
//
// It listens on 127.0.0.1 on two ports: the TARGET (stands where the app would) and the OTHER (a different origin on
// the same forwarding domain, the shape another *.app.github.dev page has).
//   1. Open the OTHER port's forwarded URL in the browser: its page sends a fetch POST, a form POST and a WebSocket to
//      the TARGET from that other origin (the "comparison" requests).
//   2. Open the TARGET port's forwarded URL: its page sends the same three from its own origin, then shows the verdict.
//   3. The verdict (also at TARGET/report and in --out) comes from classify() below, which only counts what actually
//      ARRIVED at the target. A request that never arrived is missing evidence, never proof that something stopped it,
//      and the other page's "done" marker only tells the operator its script ended (it ends on timeouts and errors too).
//
//   Passes (each needs ALL of: the target's own fetch POST, form POST and WebSocket observed, each with a valid https
//   Origin, all the same value; AND, for each of the three transports, at least one comparison request observed at the
//   target carrying the comparison page's own origin):
//      REWRITTEN_SAME_ORIGIN_ONLY  the own value is not the forwarded URL's origin (the forwarder rewrote it) and no
//                                  comparison request carried it. Evidence for review of route A, not proof beyond the
//                                  traffic observed (docs/beta/beta-r1-preview-route.md).
//      PRESERVED                   the own value is the forwarded URL's own origin, under the same evidence rules.
//   Refusals (known conflicting evidence; route A must not be used):
//      UNSAFE                      a comparison request arrived with no Origin, or with the target's own value.
//      INCONSISTENT                the target's own requests arrived with different Origins.
//      UNSUITABLE                  a target observation has no Origin, or one that isn't a valid https origin (e.g.
//                                  http://localhost:3153 would drop the cookie's Secure flag), or the own value equals
//                                  the comparison origin.
//   Otherwise:
//      INCOMPLETE                  something required wasn't observed (named). Observations of an unknown kind, or
//                                  comparison requests carrying any other Origin (e.g. "null"), are unattributed: they
//                                  neither pass nor refuse.
//
// Usage (in the Codespace; both ports stay Private, the default):
//   node probe-forwarded-origin.mjs [--target-port 3155] [--other-port 3156] [--out probe-report.json]
// The forwarded URLs are derived from CODESPACE_NAME and GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN; elsewhere pass
// --target-url and --other-url. Stop it with Ctrl-C. Importing this file (for tests) starts nothing.
import http from "node:http";
import { realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";

/** The target page's own requests, by the `kind` each carries. */
export const OWN = { "fetch-post": "fetch POST", "form-post": "form POST", ws: "WebSocket" };
/** The other page's requests to the target, by `kind`, for the same three transports. */
export const COMPARISON = { "xorigin-fetch-post": "fetch POST", "xorigin-form-post": "form POST", "xorigin-ws": "WebSocket" };

const shown = (o) => (o === null || o === undefined ? "(no Origin header)" : JSON.stringify(o));
/** The value itself when it is exactly an https origin (scheme, host, optional port; nothing else), else null. */
function httpsOrigin(v) {
  if (typeof v !== "string") return null;
  try { const u = new URL(v); return u.protocol === "https:" && u.origin === v ? v : null; } catch { return null; }
}

/**
 * The verdict from recorded observations alone: pure, no I/O. `entries` are what the probe recorded
 * ({ where: "target" | "other", kind, origin, ... }); `targetUrl` and `otherUrl` are the two forwarded URLs.
 */
export function classify(entries, { targetUrl, otherUrl }) {
  const targetOrigin = new URL(targetUrl).origin;
  const comparisonOrigin = new URL(otherUrl).origin;
  const at = (kind) => entries.filter((e) => e && e.where === "target" && e.kind === kind);
  const ownObs = Object.keys(OWN).flatMap(at);
  const cmpObs = Object.keys(COMPARISON).flatMap(at);
  const hint = entries.some((e) => e && e.where === "other" && e.kind === "done")
    ? "The other page reported finishing its script; that is only a hint, not evidence."
    : "The other page hasn't reported finishing its script (open it first).";
  const evidence = {
    own: Object.fromEntries(Object.keys(OWN).map((k) => [k, at(k).map((e) => e.origin ?? null)])),
    comparison: Object.fromEntries(Object.keys(COMPARISON).map((k) => [k, at(k).map((e) => e.origin ?? null)])),
    expectedComparisonOrigin: comparisonOrigin,
    forwardedTargetOrigin: targetOrigin,
  };
  const out = (verdict, why, extra = {}) => ({ verdict, why, ...extra, evidence, hint });

  // Known conflicts first: they refuse whatever else is missing.
  const noOrigin = cmpObs.find((e) => e.origin === null || e.origin === undefined);
  if (noOrigin) return out("UNSAFE", `a comparison ${COMPARISON[noOrigin.kind]} arrived with no Origin header: the app lets a request without one through, so its check couldn't refuse it`);
  const badOwn = ownObs.find((e) => !httpsOrigin(e.origin));
  if (badOwn) return out("UNSUITABLE", `the target's own ${OWN[badOwn.kind]} arrived with Origin ${shown(badOwn.origin)}, not a valid https origin`);
  const values = [...new Set(ownObs.map((e) => e.origin))];
  if (values.length > 1) return out("INCONSISTENT", `the target's own requests arrived with different Origins: ${values.map(shown).join(", ")}`);

  const missingOwn = Object.keys(OWN).filter((k) => !at(k).length);
  if (missingOwn.length) return out("INCOMPLETE", `the target's own ${missingOwn.map((k) => OWN[k]).join(", ")} wasn't observed: open the target page and let it finish`);
  const own = values[0];
  if (own === comparisonOrigin) return out("UNSUITABLE", `the target's own requests arrived with the comparison page's origin ${shown(own)}`);
  const clash = cmpObs.find((e) => e.origin === own);
  if (clash) return out("UNSAFE", `a comparison ${COMPARISON[clash.kind]} arrived with the target's own value ${shown(own)}: the check couldn't tell them apart`);

  // Positive evidence for every transport: absence proves nothing.
  const unproven = Object.keys(COMPARISON).filter((k) => !at(k).some((e) => e.origin === comparisonOrigin));
  if (unproven.length) {
    const seen = unproven.map((k) => `${COMPARISON[k]}: ${at(k).length ? `only ${at(k).map((e) => shown(e.origin)).join(", ")} (unattributed)` : "nothing observed"}`);
    return out("INCOMPLETE", `no comparison request carrying ${shown(comparisonOrigin)} was observed for ${seen.join("; ")}. A request that didn't arrive is not evidence that the forwarder stopped it.`);
  }
  if (own === targetOrigin) return out("PRESERVED", `the target's own fetch POST, form POST and WebSocket all arrived as the forwarded origin ${shown(own)}, and each comparison transport arrived as ${shown(comparisonOrigin)}`, { ownOrigin: own });
  return out("REWRITTEN_SAME_ORIGIN_ONLY", `the target's own fetch POST, form POST and WebSocket all arrived as ${shown(own)}; each comparison transport arrived as ${shown(comparisonOrigin)} and none with ${shown(own)}. This covers only the traffic observed in this run.`, { ownOrigin: own });
}

function main() {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const TARGET_PORT = Number(arg("target-port", "3155"));
  const OTHER_PORT = Number(arg("other-port", "3156"));
  const OUT = arg("out", "probe-report.json");
  const cs = process.env.CODESPACE_NAME, domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const forwarded = (port) => (cs && domain ? `https://${cs}-${port}.${domain}` : undefined);
  const TARGET_URL = arg("target-url", forwarded(TARGET_PORT));
  const OTHER_URL = arg("other-url", forwarded(OTHER_PORT));
  if (!TARGET_URL || !OTHER_URL) { console.error("Pass --target-url and --other-url (or run in a Codespace)."); process.exit(2); }

  const entries = [];
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
  function report() {
    const r = { probe: "forwarded-origin", targetUrl: TARGET_URL, otherUrl: OTHER_URL, targetPort: TARGET_PORT, otherPort: OTHER_PORT, ...classify(entries, { targetUrl: TARGET_URL, otherUrl: OTHER_URL }), entries };
    writeFileSync(OUT, JSON.stringify(r, null, 2));
    return r;
  }

  const page = (title, script) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<body style="font:16px system-ui;margin:16px"><h1 style="font-size:20px">${title}</h1><pre id="out">running…</pre>
<iframe name="sink" style="display:none"></iframe><script>
const out = document.getElementById("out"); const log = (s) => { out.textContent += "\\n" + s; };
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
  out.textContent = "VERDICT: " + rep.verdict + "\\n" + rep.why + "\\n" + rep.hint + "\\n\\n" + rep.entries.map((e) => [e.where, e.kind, "Origin " + shown(e.origin), "Sec-Fetch-Site " + (e.secFetchSite ?? "(none)")].join("  ")).join("\\n");`);
  const otherPage = page("Forwarded-origin probe: other origin", `
  const T = ${JSON.stringify(TARGET_URL)};
  try { await fetch(T + "/probe?kind=xorigin-fetch-post", { method: "POST", mode: "no-cors", credentials: "include", body: "x" }); log("cross-origin fetch POST: sent"); } catch (e) { log("cross-origin fetch POST: " + e); }
  await post(T + "/probe?kind=xorigin-form-post"); log("cross-origin form post: sent");
  await ws(T.replace(/^http/, "ws") + "/probe-ws?kind=xorigin-ws");
  await fetch("/probe?kind=done", { method: "POST", body: "x" });
  log("script finished (this is not evidence of what arrived): now open the target page " + T);`);

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
  const stop = () => { const r = report(); console.log(`VERDICT: ${r.verdict}: ${r.why}\n${r.hint}\nreport written to ${OUT}`); for (const s of servers) s.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const invoked = (() => { try { return process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : ""; } catch { return ""; } })();
if (import.meta.url === invoked) main();
