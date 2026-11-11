// Stage 8.3 (docs/stage8/stage83.md): the install identity, the service
// worker's boundary, the install state, the server's static files and
// /health, and the reachability probe. Pure checks; check-install.mjs
// drives the real browser.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { cacheable, expectedType, isAppPage, isNetworkOnlyPath, isObsoleteCache, liveCacheName, PUBLIC_FILES, SHELL_CACHE_PREFIX, STAGE_CACHE_PREFIX, stageCachePrefix, swRoute, type ResponseLike } from "../apps/web/src/install/swPolicy.js";
import { activateGeneration, installCandidate, matchOwn, type CacheLike, type CacheStorageLike } from "../apps/web/src/install/swLifecycle.js";
import { installPath, isAppleMobile } from "../apps/web/src/install/installState.js";
import { probeServer } from "../apps/web/src/install/reachability.js";
import { buildServiceWorker } from "../apps/web/swBuild.js";

const WEB = join(process.cwd(), "apps", "web");
const pngSize = (file: string) => { const b = readFileSync(file); return { png: b.subarray(1, 4).toString() === "PNG", w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };

describe("Stage 8.3: the manifest and icons (§3.1)", () => {
  const manifest = JSON.parse(readFileSync(join(WEB, "public", "manifest.webmanifest"), "utf8")) as Record<string, unknown>;

  it("has a stable identity and a safe normal entry", () => {
    expect(manifest["id"]).toBe("/");
    expect(manifest["name"]).toBe("Mchezo");
    expect(manifest["short_name"]).toBe("Mchezo");
    expect(manifest["start_url"]).toBe("/");
    expect(manifest["scope"]).toBe("/");
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["background_color"]).toBe("#16111D");
    expect(manifest["theme_color"]).toBe("#16111D");
  });

  it("holds nothing about a room or a person: only the known public fields, no codes, ids or tokens", () => {
    const allowed = ["id", "name", "short_name", "description", "lang", "dir", "start_url", "scope", "display", "background_color", "theme_color", "categories", "icons"];
    expect(Object.keys(manifest).filter((k) => !allowed.includes(k))).toEqual([]);
    // Every address in it is a fixed public path: no query, no room, seat, code or token.
    const icons = manifest["icons"] as { src: string }[];
    const urls = [manifest["id"], manifest["start_url"], manifest["scope"], ...icons.map((i) => i.src)] as string[];
    for (const u of urls) expect(u, u).toMatch(/^\/(icons\/[a-z0-9-]+\.png)?$/);
    expect(JSON.stringify(manifest)).not.toMatch(/token|seat|player|code=|\?|[A-Z0-9]{6}\b(?!")/);
    expect(manifest["description"]).toBe("Party games for one phone or the whole room.");
  });

  it("names regular and maskable icons at 192 and 512 px; each file exists at its stated size", () => {
    const icons = manifest["icons"] as { src: string; sizes: string; type: string; purpose: string }[];
    expect(icons.map((i) => `${i.purpose}:${i.sizes}`).sort()).toEqual(["any:192x192", "any:512x512", "maskable:192x192", "maskable:512x512"]);
    for (const i of icons) {
      expect(i.type).toBe("image/png");
      expect((PUBLIC_FILES as readonly string[]).includes(i.src)).toBe(true);
      const s = pngSize(join(WEB, "public", i.src.slice(1)));
      expect(s.png).toBe(true);
      expect(`${s.w}x${s.h}`).toBe(i.sizes);
      // Maskable icons are full bleed (no transparency); regular ones may have transparent corners.
      if (i.purpose === "maskable") expect(s.colorType).toBe(2);
    }
  });

  it("an opaque 180 px Apple touch icon and an SVG favicon", () => {
    const apple = pngSize(join(WEB, "public", "icons", "apple-touch-icon.png"));
    expect([apple.w, apple.h, apple.colorType]).toEqual([180, 180, 2]);
    expect(readFileSync(join(WEB, "public", "favicon.svg"), "utf8")).toMatch(/^<svg /);
  });

  it("index.html links the manifest, the touch icon and the favicon, names the app for iOS, and carries the build placeholder", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Mchezo" />');
    expect(html).toContain('<meta name="mchezo-build" content="dev" />');
    // The status bar style stays the default: no screen moves under the notch.
    expect(html).not.toContain("apple-mobile-web-app-status-bar-style");
  });

  it("every public file the worker may keep exists", () => {
    for (const f of PUBLIC_FILES) expect(() => readFileSync(join(WEB, "public", f.slice(1)))).not.toThrow();
  });
});

describe("Stage 8.3: what the service worker may touch (§3.3; feedback 6802191261 §2: an exact-build allowlist)", () => {
  const O = "https://mchezo.example";
  // This build's emitted files, as the build plugin lists them.
  const FILES = new Set(["/index.html", "/assets/index-CpHcJJUZ.js", "/assets/index-DxqG2FY2.css", "/assets/figtree-latin-wght-normal-D_ZTVpCC.woff2", ...PUBLIC_FILES]);
  const r = (url: string, method = "GET", mode = "cors") => swRoute({ method, url: url.startsWith("http") ? url : O + url, mode }, O, FILES);

  it("page loads of the app are network-first pages; every client route, deep links and queries included", () => {
    for (const path of ["/", "/index.html", "/join?code=ABC123", "/host", "/watch", "/solo", "/solo/word-connections", "/library", "/library/trivia", "/room", "/room/cup", "/room/tv", "/room/memories"]) {
      expect(r(path, "GET", "navigate"), path).toBe("page");
    }
  });

  it("no API path is ever the worker's, as a fetch or a page load, even if a list ever named one", () => {
    const api = ["/rooms", "/rooms/abc", "/rooms/abc/projection?audience=player", "/rooms/abc/session", "/rooms/abc/intents", "/rooms/abc/memory", "/rooms/abc/memory/export",
      "/rooms/abc/ledger", "/rooms/abc/games", "/rooms/join-by-code", "/rooms/abc/recovery-code", "/games", "/health", "/sw.js"];
    const poisoned = new Set([...FILES, ...api.map((a) => new URL(O + a).pathname)]);
    for (const path of api) {
      expect(r(path), path).toBe("network");
      expect(r(path, "GET", "navigate"), `${path} as a page`).toBe("network");
      expect(swRoute({ method: "GET", url: O + path, mode: "cors" }, O, poisoned), `${path} listed by mistake`).toBe("network");
      expect(isNetworkOnlyPath(new URL(O + path).pathname), path).toBe(true);
    }
  });

  it("a future API route, an unknown path or another build's file is not on the list, so it is the network's", () => {
    for (const path of ["/api/anything", "/v2/rooms", "/assets/index-NEWBUILD.js", "/assets/figtree-latin-wght-normal-OTHER.woff2", "/icons/other.png", "/robots.txt"]) expect(r(path), path).toBe("network");
    expect(r("/unknown", "GET", "navigate")).toBe("network");
    expect(isAppPage("/rooms")).toBe(false);
  });

  it("no non-GET request, whatever its path", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      for (const path of ["/", "/assets/index-CpHcJJUZ.js", "/manifest.webmanifest", "/rooms/abc/intents"]) expect(r(path, m), `${m} ${path}`).toBe("network");
    }
  });

  it("no other origin, no WebSocket and no other scheme", () => {
    expect(r("https://elsewhere.example/assets/index-CpHcJJUZ.js")).toBe("network");
    expect(r("https://elsewhere.example/", "GET", "navigate")).toBe("network");
    expect(r("wss://mchezo.example/ws?roomId=x&token=y")).toBe("network");
    expect(r("not a url")).toBe("network");
  });

  it("exactly this build's files (fonts included), and never with a query", () => {
    for (const f of FILES) expect(r(f), f).toBe("file");
    expect(r("/assets/index-CpHcJJUZ.js?token=abc")).toBe("network");
    expect(r("/assets/figtree-latin-wght-normal-D_ZTVpCC.woff2?v=1")).toBe("network");
    expect(r("/manifest.webmanifest?x=1")).toBe("network");
  });

  it("on activation, deletes only other builds' caches: their live caches, and their candidates unless a worker is installing; never this build's, never anything else", () => {
    expect(liveCacheName("aaa")).toBe(SHELL_CACHE_PREFIX + "aaa");
    expect(stageCachePrefix("aaa")).toBe(STAGE_CACHE_PREFIX + "aaa-");
    for (const installing of [false, true]) {
      expect(isObsoleteCache(liveCacheName("bbb"), "aaa", installing)).toBe(true);
      expect(isObsoleteCache(liveCacheName("aaa"), "aaa", installing)).toBe(false);
      expect(isObsoleteCache(stageCachePrefix("aaa") + "n1", "aaa", installing)).toBe(false);
      expect(isObsoleteCache("someone-elses-cache", "aaa", installing)).toBe(false);
      expect(isObsoleteCache("mchezo-other", "aaa", installing)).toBe(false);
    }
    expect(isObsoleteCache(stageCachePrefix("bbb") + "n1", "aaa", false)).toBe(true);
    expect(isObsoleteCache(stageCachePrefix("bbb") + "n1", "aaa", true)).toBe(false);
  });
});

describe("Stage 8.3: what may be stored (feedback 6802191261 §2: validated responses only)", () => {
  const res = (o: Partial<ResponseLike> & { type?: string; ct?: string; cc?: string; url?: string } = {}): ResponseLike => ({
    ok: o.ok ?? true, status: o.status ?? 200, type: o.type ?? "basic", redirected: o.redirected ?? false, url: o.url,
    headers: { get: (n: string) => (n === "content-type" ? (o.ct ?? null) : n === "cache-control" ? (o.cc ?? null) : null) },
  });
  it("a direct, successful, same-origin reply of the expected type", () => {
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript; charset=utf-8", url: "https://x/assets/index-a.js" }))).toBe(true);
    expect(cacheable("/assets/index-a.css", res({ ct: "text/css; charset=utf-8" }))).toBe(true);
    expect(cacheable("/assets/f.woff2", res({ ct: "font/woff2" }))).toBe(true);
    expect(cacheable("/icons/icon-192.png", res({ ct: "image/png", cc: "no-cache" }))).toBe(true);
    expect(cacheable("/manifest.webmanifest", res({ ct: "application/manifest+json" }))).toBe(true);
    expect(cacheable("/index.html", res({ ct: "text/html; charset=utf-8" }))).toBe(true);
  });
  it("never a redirect (a private preview's sign-in), an opaque or failed reply, a reply from another address, or one that forbids storing", () => {
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", redirected: true }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", type: "opaqueredirect", ok: false, status: 0 }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", type: "opaque", ok: false, status: 0 }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", type: "cors" }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", ok: false, status: 404 }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", status: 206 }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", url: "https://x/login" }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", cc: "no-store" }))).toBe(false);
    expect(cacheable("/assets/index-a.js", res({ ct: "text/javascript", cc: "private, max-age=60" }))).toBe(false);
  });
  it("never an HTML page (a sign-in or error page) standing in for a script, a style, a font or an icon", () => {
    for (const p of ["/assets/index-a.js", "/assets/index-a.css", "/assets/f.woff2", "/icons/icon-192.png", "/manifest.webmanifest"]) expect(cacheable(p, res({ ct: "text/html; charset=utf-8" })), p).toBe(false);
    expect(cacheable("/assets/index-a.js", res({}))).toBe(false); // no type at all
    expect(expectedType("/assets/unknown.bin")).toBeNull();
    expect(cacheable("/assets/unknown.bin", res({ ct: "application/octet-stream" }))).toBe(false);
  });
});

describe("Stage 8.3: the install path (§3.2)", () => {
  it("recognises iPhone, iPod and iPad (including iPadOS as a Mac with touch); not a Mac without touch or Android", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", "iPad", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Linux armv8l", 5)).toBe(false);
  });

  it("the browser's prompt when it offered one, else the iPhone steps, else only the browser's menu", () => {
    expect(installPath({ hasPrompt: true, appleMobile: false })).toBe("prompt");
    expect(installPath({ hasPrompt: true, appleMobile: true })).toBe("prompt");
    expect(installPath({ hasPrompt: false, appleMobile: true })).toBe("ios");
    expect(installPath({ hasPrompt: false, appleMobile: false })).toBe("menu");
  });
});

describe("Stage 8.3: can the device reach the server? (§3.3)", () => {
  const fake = (impl: () => Promise<Response>) => (async () => impl()) as unknown as typeof fetch;
  const json = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });
  it("ok only when the server itself answers {\"ok\":true}: not a gateway error, a sign-in page or any other 200", async () => {
    expect(await probeServer(1000, fake(async () => json('{"ok":true}')))).toBe("ok");
    expect(await probeServer(1000, fake(async () => json('{"ok":true}', 503)))).toBe("unreachable");
    expect(await probeServer(1000, fake(async () => new Response("down", { status: 502 })))).toBe("unreachable");
    expect(await probeServer(1000, fake(async () => new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html" } })))).toBe("unreachable");
    expect(await probeServer(1000, fake(async () => json("{}")))).toBe("unreachable");
    expect(await probeServer(1000, fake(async () => json("not json")))).toBe("unreachable");
    expect(await probeServer(1000, fake(async () => { throw new TypeError("Failed to fetch"); }))).toBe("unreachable");
  });
  it("a server that never answers is unreachable after the timeout", async () => {
    const hang = ((_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => { init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); })) as unknown as typeof fetch;
    expect(await probeServer(50, hang)).toBe("unreachable");
  });
  it("asks /health without any cache", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await probeServer(1000, ((url: string, init?: RequestInit) => { seen.push({ url, init }); return Promise.resolve(new Response("{}")); }) as unknown as typeof fetch);
    expect(seen[0]!.url).toBe("/health");
    expect(seen[0]!.init?.cache).toBe("no-store");
    expect(seen[0]!.init?.redirect).toBe("error"); // a redirect (a sign-in) is not the server answering
  });
});

describe("Stage 8.3: the server's public files and /health (§3.1, §3.3)", () => {
  let server: LocalServer | undefined;
  const dirs: string[] = [];
  afterEach(async () => { await server?.close(); server = undefined; for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  async function start(): Promise<string> {
    const dist = mkdtempSync(join(tmpdir(), "mz83-dist-"));
    const data = mkdtempSync(join(tmpdir(), "mz83-data-"));
    dirs.push(dist, data);
    mkdirSync(join(dist, "assets"));
    mkdirSync(join(dist, "icons"));
    writeFileSync(join(dist, "index.html"), '<!doctype html><meta name="mchezo-build" content="test">');
    writeFileSync(join(dist, "assets", "index-abc.js"), "console.log(1)");
    writeFileSync(join(dist, "assets", "font-x.woff2"), "w");
    writeFileSync(join(dist, "manifest.webmanifest"), "{}");
    writeFileSync(join(dist, "sw.js"), "/* sw */");
    writeFileSync(join(dist, "favicon.svg"), "<svg/>");
    writeFileSync(join(dist, "icons", "icon-192.png"), "png");
    server = new LocalServer({ dataDir: data, webDistDir: dist, heartbeatMs: null, lifecycleSweepMs: null });
    const port = await server.listen(0);
    return `http://localhost:${port}`;
  }

  it("serves the install files with their real types; the page, manifest, icons and worker are always checked; hashed assets are immutable", async () => {
    const base = await start();
    const cases: [string, string, string][] = [
      ["/", "text/html", "no-cache"],
      ["/join?code=ABC", "text/html", "no-cache"],
      ["/manifest.webmanifest", "application/manifest+json", "no-cache"],
      ["/sw.js", "text/javascript", "no-cache"],
      ["/favicon.svg", "image/svg+xml", "no-cache"],
      ["/icons/icon-192.png", "image/png", "no-cache"],
      ["/assets/index-abc.js", "text/javascript", "immutable"],
      ["/assets/font-x.woff2", "font/woff2", "immutable"],
    ];
    for (const [path, type, cache] of cases) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toContain(type);
      expect(res.headers.get("cache-control"), path).toContain(cache);
    }
  });

  it("a file the build doesn't have is a 404, never a stand-in page a cache could keep", async () => {
    const base = await start();
    for (const path of ["/assets/missing-123.js", "/icons/missing.png"]) {
      const res = await fetch(base + path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
    }
    expect((await fetch(base + "/icons/../../etc/passwd")).status).not.toBe(200);
  });

  it("/health answers with no data, never cached", async () => {
    const base = await start();
    const res = await fetch(base + "/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    expect((await fetch(base + "/health", { method: "POST" })).status).not.toBe(200);
  });

  it("knows exactly which root files are public", () => {
    for (const p of ["/manifest.webmanifest", "/favicon.svg", "/sw.js", "/icons/icon-192.png", "/icons/mark.svg"]) expect(LocalServer.isPublicFile(p), p).toBe(true);
    for (const p of ["/icons/../x.png", "/icons/a/b.png", "/robots.txt", "/rooms", "/manifest.json", "/icons/x.js"]) expect(LocalServer.isPublicFile(p), p).toBe(false);
  });
});

describe("Stage 8.3: the build version covers everything the build ships, the worker's own code included (apps/web/swBuild.ts)", () => {
  const SRC = join(WEB, "src", "install");
  const bundle = (main = "console.log('app')") => ({
    "index.html": { type: "asset" as const, source: '<!doctype html><meta name="mchezo-build" content="dev" /><script src="/assets/index-abc.js"></script>' },
    "assets/index-abc.js": { type: "chunk" as const, code: main },
    "assets/index-def.css": { type: "asset" as const, source: "body{}" },
    "assets/font-123.woff2": { type: "asset" as const, source: new Uint8Array([1, 2, 3]) },
  });
  const pub = [{ path: "/manifest.webmanifest", bytes: new TextEncoder().encode("{}") }, { path: "/icons/mark.svg", bytes: new TextEncoder().encode("<svg/>") }];
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  /** A copy of the worker's source (using the real modules it imports), changed by `edit`: a worker-only change, the app bundle stays the same. */
  const workerCopy = (edit: (sw: string) => string = (sw) => sw) => {
    const d = mkdtempSync(join(tmpdir(), "mz-swbuild-"));
    dirs.push(d);
    const sw = readFileSync(join(SRC, "sw.ts"), "utf8");
    expect(sw).toContain('from "./swPolicy.js"');
    const absolute = sw.replace(/from "\.\/([A-Za-z]+)\.js"/g, (_m, mod: string) => `from ${JSON.stringify(join(SRC, `${mod}.ts`))}`);
    writeFileSync(join(d, "sw.ts"), edit(absolute));
    return join(d, "sw.ts");
  };

  it("the same build gives the same version and the same worker, byte for byte (an unchanged build is no update)", async () => {
    const a = await buildServiceWorker({ bundle: bundle(), publicFiles: pub, workerEntry: join(SRC, "sw.ts") });
    const b = await buildServiceWorker({ bundle: bundle(), publicFiles: pub, workerEntry: join(SRC, "sw.ts") });
    expect(a.version).toMatch(/^[0-9a-f]{16}$/);
    expect(b.version).toBe(a.version);
    expect(b.sw).toBe(a.sw);
  });

  it("a worker-only change is a new version, so the new worker never shares the cache of the worker in charge", async () => {
    const a = await buildServiceWorker({ bundle: bundle(), publicFiles: pub, workerEntry: workerCopy() });
    const edit = (sw: string) => { const c = sw.replace("Check your connection, then reload.", "Check your connection, then reload this page."); expect(c).not.toBe(sw); return c; };
    const b = await buildServiceWorker({ bundle: bundle(), publicFiles: pub, workerEntry: workerCopy(edit) });
    expect(b.sw).not.toBe(a.sw);
    expect(b.version).not.toBe(a.version);
    // Its cache is named by its own version (the worker's shell cache is SHELL_CACHE_PREFIX + its version).
    expect(b.sw).toContain(JSON.stringify(b.version));
    expect(b.sw).not.toContain(a.version);
  });

  it("a change to the app bundle or to a public file is a new version too", async () => {
    const a = await buildServiceWorker({ bundle: bundle(), publicFiles: pub, workerEntry: join(SRC, "sw.ts") });
    const b = await buildServiceWorker({ bundle: bundle("console.log('app 2')"), publicFiles: pub, workerEntry: join(SRC, "sw.ts") });
    const c = await buildServiceWorker({ bundle: bundle(), publicFiles: [pub[0]!, { path: "/icons/mark.svg", bytes: new TextEncoder().encode("<svg id='2'/>") }], workerEntry: join(SRC, "sw.ts") });
    expect(new Set([a.version, b.version, c.version]).size).toBe(3);
  });

  it("the worker carries its build (the header and the version its cache and shell check use), with no stand-in left, and lists exactly this build's files", async () => {
    const r = await buildServiceWorker({ bundle: bundle(), publicFiles: pub, workerEntry: join(SRC, "sw.ts") });
    expect(r.sw.startsWith(`/* Mchezo service worker, build ${r.version} */`)).toBe(true);
    expect(r.sw).toContain(JSON.stringify(r.version));
    expect(r.sw).toContain(JSON.stringify(SHELL_CACHE_PREFIX));
    expect(r.sw).not.toMatch(/version_slot/);
    expect(r.files).toEqual(["/index.html", "/assets/font-123.woff2", "/assets/index-abc.js", "/assets/index-def.css", "/icons/mark.svg", "/manifest.webmanifest"]);
    expect(r.precache).toEqual(["/index.html", "/assets/index-abc.js", "/assets/index-def.css", "/icons/mark.svg", "/manifest.webmanifest"]);
  });

});

/** A Cache Storage in memory that records every operation by cache name, and can fail a write on demand. */
class FakeCaches implements CacheStorageLike {
  readonly stores = new Map<string, Map<string, Response>>();
  readonly log: string[] = [];
  failPut: (name: string, key: string) => boolean = () => false;
  constructor(init: Record<string, string[]> = {}) {
    for (const [name, paths] of Object.entries(init)) this.stores.set(name, new Map(paths.map((p) => [p, new Response(`${name}:${p}`)])));
  }
  private static key(k: string | { url: string }) { return typeof k === "string" ? k : new URL(k.url).pathname; }
  async open(name: string): Promise<CacheLike> {
    this.log.push(`open ${name}`);
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    const m = this.stores.get(name)!;
    return {
      put: async (k, res) => {
        const key = FakeCaches.key(k);
        this.log.push(`put ${name} ${key}`);
        if (this.failPut(name, key)) throw new Error("QuotaExceededError");
        m.set(key, res);
      },
      match: async (k) => m.get(FakeCaches.key(k)),
      keys: async () => [...m.keys()].map((p) => ({ url: `https://mchezo.test${p}` })),
    };
  }
  async delete(name: string) { this.log.push(`delete ${name}`); return this.stores.delete(name); }
  async has(name: string) { return this.stores.has(name); }
  async keys() { return [...this.stores.keys()]; }
  async match(key: string, { cacheName }: { cacheName: string }) { return this.stores.get(cacheName)?.get(key); }
  /** Every operation on one cache. */
  touched(name: string) { return this.log.filter((l) => l.split(" ")[1] === name); }
  /** A cache's entries, with the identity of each stored response. */
  entries(name: string) { return [...(this.stores.get(name) ?? new Map<string, Response>()).entries()]; }
}

describe("Stage 8.3 repair R83-01: who owns which cache (apps/web/src/install/swLifecycle.ts)", () => {
  const PRE = ["/index.html", "/assets/index-abc.js", "/assets/index-def.css", "/manifest.webmanifest", "/icons/mark.svg"];
  const ok = async (url: string) => new Response(`new:${url}`);
  const nonces = (...n: string[]) => { let i = 0; return () => n[Math.min(i++, n.length - 1)]!; };

  it("a successful install fills a new candidate of its own; the live cache of the worker in charge is never opened, written or deleted", async () => {
    for (const activeVersion of ["old", "v2"]) { // another build in charge, and (defensively) one with the same version
      const cs = new FakeCaches({ [liveCacheName(activeVersion)]: PRE, "not-mchezo": ["/x"] });
      const before = cs.entries(liveCacheName(activeVersion));
      const name = await installCandidate(cs, "v2", PRE, ok, nonces("n1"));
      expect(name).toBe(stageCachePrefix("v2") + "n1");
      expect(cs.entries(name).map(([p]) => p)).toEqual(PRE);
      expect(cs.touched(liveCacheName(activeVersion))).toEqual([]);
      expect(cs.entries(liveCacheName(activeVersion))).toEqual(before);
      expect(cs.touched("not-mchezo")).toEqual([]);
    }
  });

  it("a failed install, at ANY file (missing, a sign-in page, a redirect) or ANY write (storage full), deletes only its own candidate and leaves the live cache in charge exactly as it was", async () => {
    for (const activeVersion of ["old", "v2"]) {
      for (let i = 0; i < PRE.length; i++) {
        for (const how of ["fetch", "write"] as const) {
          const cs = new FakeCaches({ [liveCacheName(activeVersion)]: PRE, "not-mchezo": ["/x"] });
          const before = cs.entries(liveCacheName(activeVersion));
          const fetchOne = async (url: string) => { if (how === "fetch" && url === PRE[i]) throw new Error("not a valid file of this build"); return ok(url); };
          if (how === "write") cs.failPut = (_n, key) => key === PRE[i];
          await expect(installCandidate(cs, "v2", PRE, fetchOne, nonces("n1"))).rejects.toThrow();
          expect(cs.touched(liveCacheName(activeVersion)), `${activeVersion} ${how} ${PRE[i]}`).toEqual([]);
          expect(cs.entries(liveCacheName(activeVersion))).toEqual(before);
          expect((await cs.keys()).sort()).toEqual([liveCacheName(activeVersion), "not-mchezo"].sort());
        }
      }
    }
  });

  it("each install gets a candidate no cache has yet, so two installs never share one", async () => {
    const cs = new FakeCaches();
    const next = nonces("same", "same", "other");
    const a = await installCandidate(cs, "v2", PRE, ok, next);
    const b = await installCandidate(cs, "v2", PRE, ok, next);
    expect(a).not.toBe(b);
    expect([a, b].every((n) => n.startsWith(stageCachePrefix("v2")))).toBe(true);
  });

  it("activation (no page of the old generation open): the old generation's caches go, a complete candidate becomes the live cache, candidates are cleared; nothing else is touched", async () => {
    const cs = new FakeCaches({
      [liveCacheName("old")]: PRE,
      [stageCachePrefix("older") + "x"]: ["/index.html"],
      [stageCachePrefix("v2") + "partial"]: ["/index.html"],
      "not-mchezo": ["/x"],
      "mchezo-other": ["/y"],
    });
    const full = await installCandidate(cs, "v2", PRE, ok, nonces("full"));
    const staged = cs.entries(full);
    await activateGeneration(cs, "v2", PRE, { installing: false });
    expect((await cs.keys()).sort()).toEqual([liveCacheName("v2"), "not-mchezo", "mchezo-other"].sort());
    expect(cs.entries(liveCacheName("v2"))).toEqual(staged);
    expect(cs.touched("not-mchezo")).toEqual([]);
    expect(cs.touched("mchezo-other")).toEqual([]);
  });

  it("while another worker is installing, its candidate (another build's) is left alone", async () => {
    const cs = new FakeCaches({ [stageCachePrefix("v3") + "n"]: ["/index.html"] });
    await installCandidate(cs, "v2", PRE, ok, nonces("full"));
    await activateGeneration(cs, "v2", PRE, { installing: true });
    expect((await cs.keys()).sort()).toEqual([liveCacheName("v2"), stageCachePrefix("v3") + "n"].sort());
  });

  it("with no complete candidate, an existing live cache is left as it was, and the incomplete candidate is never promoted", async () => {
    const cs = new FakeCaches({ [liveCacheName("v2")]: PRE, [stageCachePrefix("v2") + "partial"]: ["/index.html"] });
    const before = cs.entries(liveCacheName("v2"));
    await activateGeneration(cs, "v2", PRE, { installing: false });
    expect(await cs.keys()).toEqual([liveCacheName("v2")]);
    expect(cs.entries(liveCacheName("v2"))).toEqual(before);
  });

  it("if the promotion fails (storage full), the candidate stays and the worker still serves this build's files from it", async () => {
    const cs = new FakeCaches({ [liveCacheName("old")]: PRE });
    const full = await installCandidate(cs, "v2", PRE, ok, nonces("full"));
    cs.failPut = (name) => name === liveCacheName("v2");
    await expect(activateGeneration(cs, "v2", PRE, { installing: false })).rejects.toThrow();
    expect(await cs.has(full)).toBe(true);
    expect(await cs.has(liveCacheName("old"))).toBe(false);
    expect(await (await matchOwn(cs, "v2", "/index.html"))?.text()).toBe("new:/index.html");
  });

  it("serving: this build's live cache first, then its own candidates; never another build's cache, and it creates nothing", async () => {
    const cs = new FakeCaches({ [liveCacheName("old")]: ["/index.html", "/icons/mark.svg"], [liveCacheName("v2")]: ["/index.html"], [stageCachePrefix("v2") + "n"]: ["/index.html", "/manifest.webmanifest"] });
    expect(await (await matchOwn(cs, "v2", "/index.html"))?.text()).toBe(`${liveCacheName("v2")}:/index.html`);
    expect(await (await matchOwn(cs, "v2", "/manifest.webmanifest"))?.text()).toBe(`${stageCachePrefix("v2")}n:/manifest.webmanifest`);
    expect(await matchOwn(cs, "v2", "/icons/mark.svg")).toBeUndefined();
    expect(cs.log.filter((l) => !l.startsWith("match"))).toEqual([]);
  });
});

