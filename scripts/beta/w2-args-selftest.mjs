// Beta R4 W2 repair (review 6924352924): focused regression for the W2 runner's boundary, LOCAL only, no Docker.
//   1. Every unsupported option (the old fault options, a reduced workload, an unknown option, a non-https or invalid
//      origin) is refused with exit 2 and ZERO network activity: no connection reaches the --origin listener or a second
//      listener, no evidence is written, and the code file (which does not exist) is never read.
//   2. Redirects are never followed: a fake target admits the code, then answers authenticated HTTP requests (and, in a
//      second run, socket handshakes) with 307 to a second origin; the run must fail with ZERO connections there.
//   A control shows the second listener does see a redirect that IS followed.
// The fixture owns everything it creates (review 6927653761): every listener, accepted socket and child process is
// tracked and torn down, and every accepted socket, the upgraded ones included, has its own 'error' handler. An expected
// peer reset (ECONNRESET/EPIPE, e.g. the runner dropping a handshake the fixture already answered with 307) is counted;
// any other socket error is kept and fails the run. There is no process-wide error suppression. A final check confirms
// that nothing (listener, socket, child process) is left open.
//   node scripts/beta/w2-args-selftest.mjs     (node:test; needs openssl for the fake target's certificate)
// Named *-selftest.mjs, not *.test.mjs, so the repository's vitest suite doesn't collect it.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PINNED_REVISION } from "./w2-verdict.mjs";

const LOAD = join(dirname(fileURLToPath(import.meta.url)), "w2-load.mjs");
// Fixture values, deliberately not shaped like a real cookie or code (the repository's secret scans must stay clean).
const FAKE_COOKIE = "fake.cookie.for.this.test", FAKE_CODE = "fake.code.for.this.test";
const dir = mkdtempSync(join(tmpdir(), "w2-args-"));
// ---- what the fixture owns ----
const servers = new Set(), accepted = new Set(), children = new Set(), fixtures = [];
const owned = new WeakSet();
const EXPECTED_RESET = new Set(["ECONNRESET", "EPIPE"]);
// Take ownership of one accepted socket: track it until it closes; count an expected peer reset; keep anything else.
function own(sock, fx) {
  if (owned.has(sock)) return;
  owned.add(sock); accepted.add(sock);
  sock.on("close", () => accepted.delete(sock));
  sock.on("error", (e) => { if (EXPECTED_RESET.has(e.code)) fx.resets++; else fx.unexpected.push(`${e.code ?? "error"}: ${e.message}`); });
}
const fixture = (extra) => { const fx = { resets: 0, unexpected: [], ...extra }; fixtures.push(fx); return fx; };
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => { servers.add(srv); r(srv.address().port); }));
// A listener that only counts connections: any TCP (or TLS) attempt to it is network activity.
async function counter() {
  const c = fixture({ n: 0 });
  c.port = await listen(net.createServer((s) => { c.n++; own(s, c); s.destroy(); }));
  return c;
}
function track(p) { children.add(p); return p; }
async function teardown() {
  for (const s of accepted) s.destroy();
  await Promise.all([...servers].map((s) => new Promise((r) => s.close(() => r()))));
  servers.clear();
  for (const p of children) if (p.exitCode === null && p.signalCode === null) p.kill("SIGKILL");
}
function run(args, env = {}) {
  return new Promise((resolve) => {
    const p = track(spawn(process.execPath, [LOAD, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }));
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => setTimeout(() => resolve({ code, out, err }), 300)); // let any pending connection be counted
  });
}
let cert, key;
before(() => {
  const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
  assert.equal(r.status, 0, "openssl could not make the fake target's certificate");
  cert = readFileSync(join(dir, "cert.pem")); key = readFileSync(join(dir, "key.pem"));
  writeFileSync(join(dir, "code"), `${FAKE_CODE}\n`, { mode: 0o600 });
});
after(async () => { await teardown(); rmSync(dir, { recursive: true, force: true }); });

// ---- 1. refused before anything happens ----
const refused = [
  ["the old fault option --plant-leak", ["--plant-leak"], /unknown option/],
  ["the old fault option --self-test-probe-origin", ["--self-test-probe-origin", "https://localhost:SECOND"], /unknown option/],
  ["a proxy fault option given to the runner", ["--fault-cross-room", "503"], /unknown option/],
  ["--rooms 1", ["--rooms", "1"], /--rooms is not accepted/],
  ["--rooms=1", ["--rooms=1"], /unexpected argument/],
  ["--players 4", ["--players", "4"], /--players is not accepted/],
  ["--notes 1", ["--notes", "1"], /--notes is not accepted/],
  ["--expect-revision", ["--expect-revision", "0000000"], /unknown option/],
  ["a zero --max-minutes", ["--max-minutes", "0"], /must be a positive number/],
];
for (const [name, extra, why] of refused) {
  test(`refused with zero network activity: ${name}`, async () => {
    const origin = await counter(), second = await counter();
    const ev = join(dir, `ev-${Math.random().toString(16).slice(2)}`);
    const args = ["--origin", `https://localhost:${origin.port}`, "--code-file", join(dir, "no-such-code-file"), "--evidence", ev, ...extra.map((a) => a.replace("SECOND", String(second.port)))];
    const r = await run(args);
    assert.equal(r.code, 2, `exit ${r.code}: ${r.err}${r.out}`);
    assert.match(r.err, why);
    assert.doesNotMatch(r.err, /ENOENT/, "the code file was read");
    assert.equal(r.out, "", "the runner printed progress");
    assert.equal(origin.n, 0, "a connection reached the --origin listener");
    assert.equal(second.n, 0, "a connection reached the second listener");
    assert.equal(existsSync(ev), false, "evidence was written");
  });
}
for (const [name, origin] of [["an http:// origin", "http://localhost:PORT"], ["an origin that is not a URL", "not a url"]]) {
  test(`refused with zero network activity: ${name}`, async () => {
    const c = await counter();
    const r = await run(["--origin", origin.replace("PORT", String(c.port)), "--code-file", join(dir, "no-such-code-file")]);
    assert.equal(r.code, 2, `exit ${r.code}: ${r.err}`);
    assert.doesNotMatch(r.err, /ENOENT/);
    assert.equal(c.n, 0);
  });
}

// ---- 2. redirects are never followed ----
// A fake target: /health and the gate are real-looking; everything after admission redirects to `second` (mode "http"),
// or HTTP answers plausibly and every socket handshake redirects (mode "ws").
// It owns every connection it accepts (raw and TLS) and every upgraded socket, so a peer reset after its 307 is handled
// here, by the fixture, and counted.
async function fakeTarget(mode, secondPort) {
  let rooms = 0, seats = 0;
  const fx = fixture({ upgrades: 0 });
  const to = (u) => `https://localhost:${secondPort}${u}`;
  const srv = https.createServer({ key, cert }, (req, res) => {
    const json = (st, b, h = {}) => { res.writeHead(st, { "content-type": "application/json", ...h }); res.end(JSON.stringify(b)); };
    req.resume();
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/health") return json(200, { ok: true, revision: PINNED_REVISION });
      if (req.method === "POST" && req.url === "/beta/enter") { res.writeHead(303, { location: "/", "set-cookie": `cgn_beta=${FAKE_COOKIE}; Path=/; HttpOnly` }); return res.end(); }
      if (mode === "http") { res.writeHead(307, { location: to(req.url) }); return res.end(); }
      if (req.method === "POST" && req.url === "/rooms") { rooms++; return json(201, { roomId: `room-fake${rooms}`, joinCode: `JOINFAKE${rooms}`, hostClaimToken: `claim-fake-${rooms}-000000` }); }
      if (req.method === "POST" && /^\/rooms\/room-fake\d+\/join$/.test(req.url)) { seats++; return json(200, { sessionToken: `tok-fake-${seats}-000000`, playerId: "player-1" }); }
      if (req.method === "POST" && req.url === "/rooms/join-by-code") { seats++; return json(200, { sessionToken: `tok-fake-${seats}-000000`, playerId: `player-${seats}` }); }
      if (req.method === "POST" && req.url === "/rooms/spectate-by-code") return json(200, { spectatorToken: `spec-fake-${rooms}-000000` });
      json(404, { error: "Not found" });
    });
  });
  srv.on("connection", (s) => own(s, fx));
  srv.on("secureConnection", (s) => own(s, fx));
  srv.on("upgrade", (req, sock) => {
    own(sock, fx); // the upgraded socket is the fixture's from here on: its own error handler, tracked until it closes
    fx.upgrades++;
    sock.end(`HTTP/1.1 307 Temporary Redirect\r\nlocation: ${to(req.url).replace("https:", "wss:")}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n`);
  });
  fx.port = await listen(srv);
  return fx;
}
test("control: the second listener does see a redirect that IS followed", async () => {
  const second = await counter();
  const { port } = await fakeTarget("http", second.port);
  // A client that follows redirects (fetch's default), in its own process trusting the fake target's certificate.
  await new Promise((resolve) => {
    const p = track(spawn(process.execPath, ["-e", `fetch("https://localhost:${port}/rooms", { method: "POST" }).catch(() => {}).finally(() => process.exit(0))`], { env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, "cert.pem") }, stdio: "ignore" }));
    p.on("close", () => setTimeout(resolve, 300));
  });
  assert.ok(second.n >= 1, "the control redirect did not reach the second listener");
});
test("an authenticated HTTP redirect to another origin is not followed (the run fails, zero connections there)", async () => {
  const second = await counter();
  const fx = await fakeTarget("http", second.port);
  const r = await run(["--origin", `https://localhost:${fx.port}`, "--code-file", join(dir, "code"), "--evidence", join(dir, "ev-http")], { NODE_EXTRA_CA_CERTS: join(dir, "cert.pem") });
  assert.equal(r.code, 1, `exit ${r.code}: ${r.err}${r.out}`);
  assert.match(r.out, /preflight: \/health 200/);
  assert.match(r.out, /run aborted: POST \/rooms answered 307/);
  assert.equal(second.n, 0, "the runner followed the redirect to the second origin");
  const evidence = readFileSync(join(dir, "ev-http", readdirSync(join(dir, "ev-http"))[0]), "utf8");
  assert.ok(!evidence.includes(FAKE_COOKIE) && !evidence.includes(FAKE_CODE), "the evidence holds the fixture cookie or code");
  assert.deepEqual(fx.unexpected, [], "an unexpected error on a fixture socket");
});
test("a socket handshake redirect to another origin is not followed (the run fails, zero connections there)", async (t) => {
  const second = await counter();
  const fx = await fakeTarget("ws", second.port);
  const r = await run(["--origin", `https://localhost:${fx.port}`, "--code-file", join(dir, "code"), "--evidence", join(dir, "ev-ws")], { NODE_EXTRA_CA_CERTS: join(dir, "cert.pem") });
  assert.equal(r.code, 1, `exit ${r.code}: ${r.err}${r.out}`);
  assert.match(r.out, /run aborted: setup: only 0 of 22 sockets opened/);
  assert.equal(second.n, 0, "a socket followed the redirect to the second origin");
  assert.ok(fx.upgrades >= 22, `only ${fx.upgrades} handshakes reached the fixture`);
  assert.deepEqual(fx.unexpected, [], "an unexpected error on a fixture socket");
  t.diagnostic(`handshakes answered with 307: ${fx.upgrades}; expected peer resets handled by the fixture: ${fx.resets}`);
});

// ---- 3. the fixture's own socket handling (review 6927653761) ----
test("the fixture handles a peer reset on its upgraded socket (counted; no uncaught error; zero connections elsewhere)", async (t) => {
  const second = await counter();
  const fx = await fakeTarget("ws", second.port);
  const raw = net.connect(fx.port, "127.0.0.1");
  raw.on("error", () => {}); // the test's own client side: its errors are not what is under test
  const answer = await new Promise((resolve) => {
    const c = tls.connect({ socket: raw, servername: "localhost", ca: cert }, () => c.write("GET /?roomId=room-fake1&audience=player HTTP/1.1\r\nhost: localhost\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==\r\nsec-websocket-version: 13\r\n\r\n"));
    c.on("error", () => {});
    c.once("data", (d) => { raw.resetAndDestroy(); resolve(String(d)); }); // a TCP reset right after the 307, as a client dropping the handshake
  });
  await new Promise((r) => setTimeout(r, 500));
  assert.match(answer, /^HTTP\/1\.1 307 /);
  assert.equal(fx.upgrades, 1);
  assert.ok(fx.resets >= 1, "the peer reset never reached the fixture's error handling, so the path wasn't exercised");
  assert.deepEqual(fx.unexpected, [], "the reset was not handled as an expected peer reset");
  assert.equal(second.n, 0);
  t.diagnostic(`expected peer resets handled by the fixture: ${fx.resets} (Node ${process.version})`);
});
test("an unexpected error on a fixture socket is kept and reported, not swallowed", () => {
  const fx = { resets: 0, unexpected: [] }; // not registered: this check's errors are deliberate
  const s = new net.Socket();
  own(s, fx);
  s.emit("error", Object.assign(new Error("simulated protocol failure"), { code: "EPROTO" }));
  s.emit("error", Object.assign(new Error("simulated peer reset"), { code: "ECONNRESET" }));
  s.destroy();
  assert.deepEqual(fx.unexpected, ["EPROTO: simulated protocol failure"]);
  assert.equal(fx.resets, 1);
});
test("teardown: no listener, socket or child process of this test is left open, and no fixture saw an unexpected error", async () => {
  const running = [...children].filter((p) => p.exitCode === null && p.signalCode === null).length;
  await teardown();
  await new Promise((r) => setTimeout(r, 300));
  const left = process.getActiveResourcesInfo().filter((x) => /TCPServerWrap|TCPSocketWrap|TLSWrap|ProcessWrap/.test(x));
  assert.equal(running, 0, `${running} child process(es) still running before teardown`);
  assert.equal(accepted.size, 0, `${accepted.size} accepted socket(s) still open`);
  assert.deepEqual(left, [], `still open: ${left.join(", ")}`);
  assert.deepEqual(fixtures.flatMap((f) => f.unexpected), [], "an unexpected error on a fixture socket");
});
