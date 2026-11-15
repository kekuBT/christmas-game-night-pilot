/**
 * Beta R1 (docs/beta/beta-r1.md): readiness fixes found by the launch blocker matrix (docs/beta/beta-r1-blockers.md).
 * Each test here was written to fail before its fix.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { Harness } from "./helpers/harness.js";
import { AccessGuard } from "../src/server/access.js";
import { DataDirLock } from "../src/server/datalock.js";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const harnesses: Harness[] = [];
afterEach(async () => { for (const h of harnesses.splice(0)) await h.dispose(); });
async function started(): Promise<Harness> {
  const h = new Harness();
  harnesses.push(h);
  await h.start();
  await h.createRoom("Beta");
  return h;
}
/** A TV socket: public, no session token (anyone with the room's id can open one). */
function tvSocket(h: Harness): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=tv`);
    ws.once("message", () => resolve(ws));
    ws.once("error", reject);
  });
}
const closeOf = (ws: WebSocket, ms: number) => new Promise<number | "open">((resolve) => {
  const t = setTimeout(() => resolve("open"), ms);
  ws.once("close", (code) => { clearTimeout(t); resolve(code); });
});

describe("B-01: WebSocket messages are capped like HTTP bodies (64 KiB)", () => {
  it("a TV socket (no session) sending an oversized message is closed with 1009 before the server parses it", async () => {
    const h = await started();
    const ws = await tvSocket(h);
    const closed = closeOf(ws, 3000);
    ws.send(`{"intent":${JSON.stringify("x".repeat(100 * 1024))}}`);
    expect(await closed).toBe(1009); // "message too big"
    // The server is unharmed: a new socket and HTTP still work.
    const again = await tvSocket(h);
    expect(again.readyState).toBe(WebSocket.OPEN);
    again.close();
    expect((await h.get("/health")).status).toBe(200);
  });

  it("an ordinary message under the cap is still processed (a TV socket gets SESSION_REQUIRED, not a close)", async () => {
    const h = await started();
    const ws = await tvSocket(h);
    const reply = new Promise<Record<string, unknown>>((resolve) => ws.on("message", (d) => { const m = JSON.parse(d.toString()) as Record<string, unknown>; if (m["kind"] === "error") resolve(m); }));
    ws.send(JSON.stringify({ intent: { kind: "intent", padding: "y".repeat(32 * 1024) } }));
    expect((await reply)["code"]).toBe("SESSION_REQUIRED");
    ws.close();
  });
});

describe("B-06: a malformed WebSocket frame closes that socket, never the server", () => {
  it("a TV socket (no session) sending invalid UTF-8 is closed with 1007; the server keeps serving", async () => {
    const h = await started();
    const ws = await tvSocket(h);
    const closed = closeOf(ws, 3000);
    ws.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false });
    expect(await closed).toBe(1007); // "invalid frame payload data"
    const again = await tvSocket(h);
    expect(again.readyState).toBe(WebSocket.OPEN);
    again.close();
    expect((await h.get("/health")).status).toBe(200);
  });
});

const CODE = "correct-horse-battery";
const ORIGIN = "https://games.example.test";
async function startedWith(access: import("../src/server/access.js").AccessOptions): Promise<Harness> {
  const h = new Harness(undefined, { access });
  harnesses.push(h);
  await h.start();
  return h;
}
const raw = (h: Harness, path: string, init: RequestInit = {}) => fetch(h.base + path, { redirect: "manual", ...init });
/** A WebSocket handshake's outcome: "open", or the HTTP status it was refused with. */
function handshake(h: Harness, roomId: string, headers: Record<string, string>): Promise<"open" | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${h.port}/?roomId=${roomId}&audience=tv`, { headers });
    ws.once("open", () => { ws.close(); resolve("open"); });
    ws.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    ws.once("error", () => { /* reported by unexpected-response */ });
  });
}

describe("B-02: security headers on every response", () => {
  it("the health check, the API and the app itself are never sniffed, framed or sent with a referrer", async () => {
    const h = await started();
    for (const path of ["/health", "/games", "/"]) {
      const r = await raw(h, path);
      expect([path, r.headers.get("x-content-type-options"), r.headers.get("referrer-policy"), r.headers.get("x-frame-options"), r.headers.get("content-security-policy")])
        .toEqual([path, "nosniff", "no-referrer", "DENY", "frame-ancestors 'none'"]);
    }
  });
});

describe("B-03: another site's requests are refused when the public origin is set", () => {
  it("HTTP: a foreign Origin gets 403; our own origin and no Origin (a plain navigation) are served", async () => {
    const h = await startedWith({ publicOrigin: ORIGIN });
    const create = (origin?: string) => raw(h, "/rooms", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify({ name: "O" }) });
    const foreign = await create("https://evil.example");
    expect([foreign.status, ((await foreign.json()) as Record<string, unknown>)["code"]]).toEqual([403, "FOREIGN_ORIGIN"]);
    expect((await create(ORIGIN)).status).toBe(201);
    expect((await create()).status).toBe(201);
  });

  it("WebSocket: a handshake from a foreign origin is refused before any socket opens", async () => {
    const h = await startedWith({ publicOrigin: ORIGIN });
    await h.createRoom("O");
    expect(await handshake(h, h.roomId, { origin: "https://evil.example" })).toBe(403);
    expect(await handshake(h, h.roomId, { origin: ORIGIN })).toBe("open");
  });

  it("a malformed public origin is refused at start", () => {
    expect(() => new AccessGuard({ publicOrigin: "https://x.test/path" })).toThrowError(/scheme, host and port only/);
  });
});

describe("B-04: the beta gate covers pages, the API and WebSockets", () => {
  it("without the cookie: the health check answers; the API refuses; a page load gets the gate", async () => {
    const h = await startedWith({ betaAccessCode: CODE });
    expect((await raw(h, "/health")).status).toBe(200);
    const api = await raw(h, "/games");
    expect([api.status, ((await api.json()) as Record<string, unknown>)["code"]]).toEqual([401, "BETA_ACCESS_REQUIRED"]);
    const page = await raw(h, "/join?code=ABC", { headers: { accept: "text/html" } });
    const body = await page.text();
    expect([page.status, /private beta/.test(body), /name="next" value="\/join\?code=ABC"/.test(body), body.includes(CODE)]).toEqual([401, true, true, false]);
  });

  it("the right code sets an HttpOnly cookie (an HMAC, never the code) and returns to the page; then HTTP and WebSockets work", async () => {
    const h = await startedWith({ betaAccessCode: CODE, publicOrigin: ORIGIN });
    const enter = await raw(h, "/beta/enter", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: CODE, next: "/join?code=ABC" }).toString() });
    expect([enter.status, enter.headers.get("location")]).toEqual([303, "/join?code=ABC"]);
    const cookie = enter.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^cgn_beta=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
    expect(cookie.includes(CODE)).toBe(false);
    const jar = { cookie: cookie.split(";")[0]! };
    expect((await raw(h, "/games", { headers: jar })).status).toBe(200);
    const created = await raw(h, "/rooms", { method: "POST", headers: { ...jar, "content-type": "application/json" }, body: JSON.stringify({ name: "Gate" }) });
    const roomId = ((await created.json()) as Record<string, unknown>)["roomId"] as string;
    expect(await handshake(h, roomId, {})).toBe(401);
    expect(await handshake(h, roomId, { cookie: "cgn_beta=forged-value" })).toBe(401);
    expect(await handshake(h, roomId, jar)).toBe("open");
  });

  it("a wrong code is refused, and after ten the address waits; the return path never leaves the site", async () => {
    const h = await startedWith({ betaAccessCode: CODE });
    const attempt = (code: string, next = "/") => raw(h, "/beta/enter", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, next }).toString() });
    for (let i = 0; i < 10; i++) expect((await attempt("wrong-code-attempt")).status).toBe(401);
    expect((await attempt(CODE)).status).toBe(429); // even the right code waits once the limit is reached
    const h2 = await startedWith({ betaAccessCode: CODE });
    for (const next of ["//evil.example/", "https://evil.example/", "/\\evil.example"]) {
      const r = await raw(h2, "/beta/enter", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: CODE, next }).toString() });
      expect([next, r.headers.get("location")]).toEqual([next, "/"]);
    }
  });

  it("a short code is refused at start", () => {
    expect(() => new AccessGuard({ betaAccessCode: "short" })).toThrowError(/at least 12/);
  });
});

describe("B-05: per-device limits behind a reverse proxy", () => {
  const viaProxy = (h: Harness, client: string, spoof?: string) => raw(h, "/beta/enter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": spoof ? `${spoof}, ${client}` : client },
    body: new URLSearchParams({ code: "wrong-code-attempt" }).toString(),
  });
  it("without trusted proxies (as before), every client behind the proxy shares one budget: one family member locks out another", async () => {
    const h = await startedWith({ betaAccessCode: CODE });
    for (let i = 0; i < 10; i++) await viaProxy(h, "203.0.113.1");
    expect((await viaProxy(h, "203.0.113.2")).status).toBe(429);
  });
  it("with one trusted proxy, each client has its own budget, and an address a client claims for itself is ignored", async () => {
    const h = await startedWith({ betaAccessCode: CODE, trustProxyHops: 1 });
    for (let i = 0; i < 10; i++) await viaProxy(h, "203.0.113.1", `198.51.100.${i}`); // a different spoofed entry each time
    expect((await viaProxy(h, "203.0.113.1")).status).toBe(429);
    expect((await viaProxy(h, "203.0.113.2")).status).toBe(401);
  });
});

describe("one writer per data directory (DataDirLock)", () => {
  // Beta R1-R (review 6900450343 R1): the exclusion is a Linux abstract socket held for the process's life; server.lock
  // is only a record. Process-level races (many starts at once, crash, SIGTERM, the tools) are in beta-r1r-lock.test.ts.
  const dirs: string[] = [];
  const held: DataDirLock[] = [];
  afterEach(async () => { for (const l of held.splice(0)) await l.release(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const dir = () => { const d = mkdtempSync(join(tmpdir(), "mz-beta-lock-")); dirs.push(d); return d; };
  const take = async (d: string, role?: "server" | "backup") => { const l = new DataDirLock(d, role); held.push(l); return [l, await l.acquire()] as const; };
  it("takes a free directory with a record of who holds it, and releases both", async () => {
    const d = dir();
    const [lock, note] = await take(d);
    expect(note).toBeUndefined();
    expect(JSON.parse(readFileSync(lock.path, "utf8"))).toMatchObject({ pid: process.pid, role: "server" });
    await lock.release();
    expect(existsSync(lock.path)).toBe(false);
    const [again] = await take(d); // free again
    expect(again.held).toBe(true);
  });
  it("refuses a directory someone holds, naming them, and leaves their record alone", async () => {
    const d = dir();
    const [first] = await take(d, "backup");
    const record = readFileSync(first.path, "utf8");
    await expect(new DataDirLock(d).acquire()).rejects.toThrowError(new RegExp(`^A backup \\(datatool backup\\) \\(pid ${process.pid}\\) is using this data directory .* Wait for it to finish`));
    expect(readFileSync(first.path, "utf8")).toBe(record);
  });
  it("the review's interleaving: a holder whose record is still empty (or garbage) is still the holder", async () => {
    // On 92a3722 the record WAS the lock: an empty file (created, pid not yet written) read as stale and was taken.
    const d = dir();
    const [first] = await take(d);
    for (const partial of ["", "{\"pid\":"]) {
      writeFileSync(first.path, partial);
      await expect(new DataDirLock(d).acquire()).rejects.toThrowError(/^Another process is using this data directory/);
    }
  });
  it("the same directory reached by another path (a symbolic link) is the same directory", async () => {
    const d = dir();
    const link = join(dir(), "link");
    symlinkSync(d, link);
    await take(d);
    await expect(new DataDirLock(link).acquire()).rejects.toThrowError(/^Another server/);
    const [other] = await take(dir()); // a different directory is independent
    expect(other.held).toBe(true);
  });
  it("B-08: a first start on a data directory that doesn't exist yet creates it (private) and takes the lock", async () => {
    // Found by the release drill: the lock opened server.lock before anything created the directory, so a fresh
    // host's first start crashed with ENOENT. Before the lock, the room store created the directory itself.
    const parent = dir();
    const d = join(parent, "var", "lib", "cgn");
    const [lock, note] = await take(d);
    expect(note).toBeUndefined();
    expect(statSync(d).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(lock.path, "utf8")).pid).toBe(process.pid);
  });
  it("a record left behind by a crash (a dead process, a live but unrelated pid, or an unreadable file) is replaced", async () => {
    for (const stale of [JSON.stringify({ pid: 2147483646 }), JSON.stringify({ pid: process.ppid }), "not json"]) {
      const d = dir();
      writeFileSync(join(d, "server.lock"), stale);
      const [lock, note] = await take(d);
      expect(note).toMatch(/took over a stale lock left by a process that is no longer running/);
      expect(JSON.parse(readFileSync(lock.path, "utf8")).pid).toBe(process.pid);
    }
  });
  it("release removes only its own record", async () => {
    const d = dir();
    const [lock] = await take(d);
    writeFileSync(lock.path, JSON.stringify({ pid: 1, token: "someone-else" }));
    await lock.release();
    expect(JSON.parse(readFileSync(lock.path, "utf8")).token).toBe("someone-else");
  });
  it("off Linux (a developer's computer) only the record is checked: a live holder is refused, a dead one replaced", async () => {
    const d = dir();
    writeFileSync(join(d, "server.lock"), JSON.stringify({ pid: process.ppid, role: "server" }));
    await expect(new DataDirLock(d, "server", { platform: "darwin" }).acquire()).rejects.toThrowError(new RegExp(`Another server \\(pid ${process.ppid}\\)`));
    writeFileSync(join(d, "server.lock"), JSON.stringify({ pid: 2147483646 }));
    const l = new DataDirLock(d, "server", { platform: "darwin" }); held.push(l);
    expect(await l.acquire()).toMatch(/not enforced: start only one server per data directory/);
  });
});

