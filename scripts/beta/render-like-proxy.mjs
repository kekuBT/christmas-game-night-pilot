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

const edge = https.createServer({ key, cert }, (req, res) => {
  if (maintenance) return busy(res);
  const up = http.request({ host: bHost, port: Number(bPort), method: req.method, path: req.url, headers: { ...req.headers, "x-forwarded-for": xff(req), "x-forwarded-proto": "https" } }, (ur) => {
    res.writeHead(ur.statusCode, ur.statusMessage, ur.rawHeaders);
    ur.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
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
console.log(`render-like-proxy LISTENING https=${httpsPort} http=${httpPort} backend=${bHost}:${bPort} hops=${hops}${maintenance ? " MAINTENANCE" : ""}`);
const stop = () => { edge.close(); plain.close(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
