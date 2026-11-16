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
// - Fault injection that review 6924352924 moved OUT of the W2 runner into this disposable local harness (the runner has
//   no fault options and only ever talks to its one origin), also off by default:
//   --fault-cross-room 503|reset  the proxy learns which room each session token (x-session-token, or the socket's
//                           cgn-session-<token> subprotocol) belongs to from that token's first successful request for a
//                           room. Any later request or handshake carrying the token for ANOTHER room (a cross-room probe)
//                           gets 503, or has its connection reset (a transport error), and is NOT forwarded.
//   --plant-leak            the proxy itself saves ONE extra Memory Book note, in the second room it sees a W2 note for,
//                           carrying the first room's canary (as that room's host, with the token and cookie of the note
//                           it just forwarded), so the run's passive isolation scan must find a cross-room canary.
import { randomUUID } from "node:crypto";
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
const crossRoom = opt("fault-cross-room"), plantLeak = argv.includes("--plant-leak");
if (crossRoom !== undefined && !["503", "reset"].includes(crossRoom)) { console.error("--fault-cross-room must be 503 or reset"); process.exit(2); }
const owner = new Map(); // session token -> the room of its first successful request
const canaryOf = new Map(); // room -> the W2 canary seen in its notes
let crossFaults = 0; let planted = null;
const pathRoom = (u) => (/^\/rooms\/(room-[^/?]+)/.exec(u) ?? [])[1];
const queryRoom = (u) => { try { return new URL(u, "http://local").searchParams.get("roomId") ?? undefined; } catch { return undefined; } };
const wsToken = (req) => String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((x) => x.trim()).find((x) => x.startsWith("cgn-session-"))?.slice("cgn-session-".length);
const isCross = (token, room) => !!(crossRoom && token && room && owner.has(token) && owner.get(token) !== room);
const forward = (req, res, body) => {
  const headers = { ...req.headers, "x-forwarded-for": xff(req), "x-forwarded-proto": "https", ...(body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {}) };
  const up = http.request({ host: bHost, port: Number(bPort), method: req.method, path: req.url, headers }, (ur) => {
    const token = req.headers["x-session-token"], room = pathRoom(req.url);
    if (crossRoom && typeof token === "string" && room && ur.statusCode < 300 && !owner.has(token)) owner.set(token, room);
    res.writeHead(ur.statusCode, ur.statusMessage, ur.rawHeaders);
    ur.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  if (body !== undefined) up.end(body); else req.pipe(up);
};

function plantNote(req, room, body) {
  let parsed; try { parsed = JSON.parse(body.toString()); } catch { return; }
  const canary = /W2CANARY-[A-Za-z0-9-]+/.exec(String(parsed.text ?? ""))?.[0];
  if (canary && !canaryOf.has(room)) canaryOf.set(room, canary);
  const other = [...canaryOf].find(([r]) => r !== room)?.[1];
  if (planted || !other) return;
  planted = { room, status: "pending" };
  const text = JSON.stringify({ text: `planted by the local harness ${other}`, day: 1, requestId: randomUUID(), fromGame: parsed.fromGame });
  const headers = { host: req.headers.host, cookie: req.headers.cookie, "x-session-token": req.headers["x-session-token"], "content-type": "application/json", "content-length": String(Buffer.byteLength(text)), "x-forwarded-for": xff(req), "x-forwarded-proto": "https" };
  const up = http.request({ host: bHost, port: Number(bPort), method: "POST", path: req.url, headers }, (r) => { planted.status = r.statusCode; r.resume(); });
  up.on("error", () => { planted.status = "error"; });
  up.end(text);
}

const edge = https.createServer({ key, cert }, (req, res) => {
  if (maintenance) return busy(res);
  if (isCross(req.headers["x-session-token"], pathRoom(req.url))) {
    crossFaults++;
    if (crossRoom === "reset") { req.socket.destroy(); return; }
    res.writeHead(503, { "content-type": "text/html" }); res.end("<h1>injected: cross-room request</h1>"); return;
  }
  if (plantLeak && req.method === "POST" && /^\/rooms\/[^/]+\/memory$/.test(req.url)) {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => { const body = Buffer.concat(chunks); forward(req, res, body); plantNote(req, pathRoom(req.url), body); });
    return;
  }
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
  if (isCross(wsToken(req), queryRoom(req.url))) {
    crossFaults++;
    if (crossRoom === "reset") { sock.destroy(); return; }
    sock.end("HTTP/1.1 503 Service Unavailable\r\nconnection: close\r\ncontent-length: 0\r\n\r\n"); return;
  }
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
console.log(`render-like-proxy LISTENING https=${httpsPort} http=${httpPort} backend=${bHost}:${bPort} hops=${hops}${maintenance ? " MAINTENANCE" : ""}${faultAction ? ` FAULT ${failEvery ? `fail-every=${failEvery}` : fakeEvery ? `fake-ack-every=${fakeEvery}` : emptyEvery ? `empty-ack-every=${emptyEvery}` : `mutate-every=${mutateEvery}`} action=${faultAction}` : ""}${crossRoom ? ` FAULT cross-room=${crossRoom}` : ""}${plantLeak ? " FAULT plant-leak" : ""}`);
const stop = () => {
  if (faultAction) console.log(`render-like-proxy: ${faulted.size} intent(s) faulted, ${faultsApplied} request(s) answered by the fault`);
  if (crossRoom) console.log(`render-like-proxy: ${owner.size} session token(s) learned; ${crossFaults} cross-room request(s) or handshake(s) answered by the fault (${crossRoom})`);
  if (plantLeak) console.log(`render-like-proxy: planted note: ${planted ? `in one room, HTTP ${planted.status}` : "none"}`);
  edge.close(); plain.close(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
