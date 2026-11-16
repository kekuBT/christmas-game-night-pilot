// Beta R4 (handoff 6919813048): a LOCAL stand-in for Render's edge, used only to test scripts/beta/w1-check.mjs before
// W1 (scripts/beta/w1-selftest.sh). It is not Render and proves nothing about Render; it lets each W1 check be shown to
// pass on a correct setup and to FAIL on a wrong one.
//   node scripts/beta/render-like-proxy.mjs --https-port P --http-port Q --backend 127.0.0.1:B --cert C --key K
//        [--hops 1|2] [--maintenance]
// - HTTPS on P (the given certificate), passing everything, WebSocket upgrades included, to the backend, with Host and
//   Origin unchanged, X-Forwarded-Proto: https, and X-Forwarded-For with the client's address APPENDED (after anything
//   the client sent). --hops 2 appends a second, fixed address after it (10.9.9.9), as a two-proxy chain would.
// - HTTP on Q: a 308 redirect to the same host and path over https on P.
// - --maintenance: every request and handshake gets 503, as Render's maintenance mode does for public traffic.
// - Fault injection for the W2 self-test (scripts/beta/w2-selftest.sh), off by default, on POST /rooms/<id>/intents whose
//   intent.action is --fault-action:
//   --fail-intent-every N   every Nth such request gets 502 and is NOT forwarded, and so does every retry of the same
//                           clientEventId: the action is never acknowledged (a dropped acknowledgement);
//   --fake-ack-every N      every Nth such request (and its retries) gets 200 {"accepted":true} WITHOUT being forwarded:
//                           acknowledged but never applied, so the read-back must catch it.
//   --empty-ack-every N     (review 6922818863) every Nth such request (and its retries) gets 200 with an EMPTY JSON
//                           object {} and is NOT forwarded: a success status that is not a well-formed acknowledgement.
//   --mutate-every N        (review 6922818863) every Nth such request (and its retries) IS forwarded, but with one
//                           coordinate of its first drawing piece moved by 1: the server accepts it, the piece count is
//                           right, and only a batch-by-batch read-back of the pieces themselves can catch it.
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const httpsPort = Number(opt("https-port")), httpPort = Number(opt("http-port"));
const [bHost, bPort] = String(opt("backend")).split(":");
const hops = Number(opt("hops", "1"));
const maintenance = argv.includes("--maintenance");
const key = readFileSync(opt("key")), cert = readFileSync(opt("cert"));
const xff = (req) => [req.headers["x-forwarded-for"], req.socket.remoteAddress?.replace(/^::ffff:/, ""), ...(hops === 2 ? ["10.9.9.9"] : [])].filter(Boolean).join(", ");
const busy = (res) => { res.writeHead(503, { "content-type": "text/html" }); res.end("<h1>Service under maintenance</h1>"); };
const faultAction = opt("fault-action"), failEvery = Number(opt("fail-intent-every", "0")), fakeEvery = Number(opt("fake-ack-every", "0")), mutateEvery = Number(opt("mutate-every", "0")), emptyEvery = Number(opt("empty-ack-every", "0"));
const faulted = new Set(); let faultCount = 0; let faultsApplied = 0;
const forward = (req, res, body) => {
  const headers = { ...req.headers, "x-forwarded-for": xff(req), "x-forwarded-proto": "https", ...(body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {}) };
  const up = http.request({ host: bHost, port: Number(bPort), method: req.method, path: req.url, headers }, (ur) => {
    res.writeHead(ur.statusCode, ur.statusMessage, ur.rawHeaders);
    ur.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  if (body !== undefined) up.end(body); else req.pipe(up);
};

const edge = https.createServer({ key, cert }, (req, res) => {
  if (maintenance) return busy(res);
  if (!(faultAction && (failEvery || fakeEvery || mutateEvery || emptyEvery) && req.method === "POST" && /^\/rooms\/[^/]+\/intents$/.test(req.url))) return forward(req, res);
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    let parsed = {}; try { parsed = JSON.parse(body.toString()); } catch { /* not JSON: forward as is */ }
    const intent = parsed?.intent ?? {};
    if (intent.action !== faultAction) return forward(req, res, body);
    const id = String(intent.clientEventId);
    if (!faulted.has(id) && ++faultCount % (failEvery || fakeEvery || mutateEvery || emptyEvery) === 0) faulted.add(id);
    if (!faulted.has(id)) return forward(req, res, body);
    faultsApplied++;
    if (mutateEvery) {
      const piece = intent.payload?.pieces?.[0];
      if (piece && Array.isArray(piece.p) && piece.p.length > 1) piece.p[1] = piece.p[1] < 1000 ? piece.p[1] + 1 : piece.p[1] - 1;
      return forward(req, res, JSON.stringify(parsed));
    }
    if (emptyEvery) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
    if (failEvery) { res.writeHead(502, { "content-type": "text/plain" }); res.end("injected: dropped"); return; }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ accepted: true }));
  });
});
edge.on("upgrade", (req, sock, head) => {
  if (maintenance) { sock.end("HTTP/1.1 503 Service Unavailable\r\nconnection: close\r\ncontent-length: 0\r\n\r\n"); return; }
  const up = net.connect(Number(bPort), bHost, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) if (!/^x-forwarded-(for|proto)$/i.test(req.rawHeaders[i])) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    lines.push(`X-Forwarded-For: ${xff(req)}`, "X-Forwarded-Proto: https");
    up.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length) up.write(head);
    sock.pipe(up).pipe(sock);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
const plain = http.createServer((req, res) => {
  if (maintenance) return busy(res);
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
  res.writeHead(308, { location: `https://${host}:${httpsPort}${req.url}` });
  res.end();
});
await new Promise((r) => edge.listen(httpsPort, "127.0.0.1", r));
await new Promise((r) => plain.listen(httpPort, "127.0.0.1", r));
console.log(`render-like-proxy LISTENING https=${httpsPort} http=${httpPort} backend=${bHost}:${bPort} hops=${hops}${maintenance ? " MAINTENANCE" : ""}${faultAction ? ` FAULT ${failEvery ? `fail-every=${failEvery}` : fakeEvery ? `fake-ack-every=${fakeEvery}` : emptyEvery ? `empty-ack-every=${emptyEvery}` : `mutate-every=${mutateEvery}`} action=${faultAction}` : ""}`);
const stop = () => { if (faultAction) console.log(`render-like-proxy: ${faulted.size} intent(s) faulted, ${faultsApplied} request(s) answered by the fault`); edge.close(); plain.close(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
