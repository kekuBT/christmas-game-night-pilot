// Beta R1 (docs/beta/beta-r1.md §2-§3): the release package, proved from a clean runtime install. No browser.
//   P  pack the checked-out revision (scripts/release/pack.mjs) into a temporary folder; it holds only what runs
//   I  npm ci --omit=dev: only the runtime packages (ws, zod) are installed; no build or test tooling
//   S  start it as production (plain node, NODE_ENV=production, data outside the release, beta gate on, one proxy):
//      /health names the revision and nothing else; the app is behind the gate (pages, API, WebSocket); the right
//      code opens it; a room is created and played into
//   L  one writer: a second server on the same data is refused; SIGTERM stops cleanly and frees the lock; after a
//      kill -9 the next start takes the stale lock over; the room survives both restarts
//   R  refusals: the content test mode, a missing/relative/inside-the-release data dir, no public origin, no or a
//      short access code; each exits 2 with a reason, and none writes anything
// Usage: node scripts/check-release-package.mjs   (starts its own servers; MCHEZO_RELEASE_ALLOW_DIRTY=1 for a local try)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const ROOT = new URL("..", import.meta.url).pathname;
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
const CODE = "release-check-code-1234";
const ORIGIN = "https://beta.example.test";
const owned = { procs: [], dirs: [] };
const tmp = (label) => { const d = mkdtempSync(join(tmpdir(), `mz-release-${label}-`)); owned.dirs.push(d); return d; };

/** Start the packed server; resolves with its port, or with its exit code if it exits first. */
function start(rel, env, label) {
  const child = spawn(process.execPath, ["dist/server/serve.js"], { cwd: rel, env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "0", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const p = { label, child, out: "" };
  owned.procs.push(p);
  child.stdout.on("data", (d) => { p.out += d; }); child.stderr.on("data", (d) => { p.out += d; });
  return new Promise((resolve) => {
    const t = setInterval(() => {
      const m = /on http:\/\/localhost:(\d+)/.exec(p.out);
      if (m) { clearInterval(t); resolve({ port: Number(m[1]), p }); }
    }, 100);
    child.once("exit", (code) => { clearInterval(t); resolve({ exit: code, p }); });
    setTimeout(() => { clearInterval(t); resolve({ timeout: true, p }); }, 20000);
  });
}
const exited = (child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((r) => child.once("exit", r));
async function stop(p, signal = "SIGTERM") { if (p.child.exitCode === null && p.child.signalCode === null) { p.child.kill(signal); await exited(p.child); } return p.child.exitCode; }

try {
  // ---- P ----
  const rel = tmp("pkg");
  rmSync(rel, { recursive: true, force: true });
  const packArgs = ["scripts/release/pack.mjs", "--out", rel, ...(process.env.MCHEZO_RELEASE_ALLOW_DIRTY === "1" ? ["--allow-dirty"] : [])];
  execFileSync(process.execPath, packArgs, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  const release = JSON.parse(readFileSync(join(rel, "release.json"), "utf8"));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  check("P release.json names the checked-out revision", release.revision === head || release.revision === `${head}-dirty`, release.revision);
  const top = readdirSync(rel).sort();
  check("P the package holds only what runs", JSON.stringify(top) === JSON.stringify(["apps", "content", "dist", "package-lock.json", "package.json", "release.json"]), JSON.stringify(top));
  const walk = (d) => readdirSync(d).flatMap((f) => { const x = join(d, f); return statSync(x).isDirectory() ? walk(x) : [x.slice(rel.length + 1)]; });
  const files = walk(rel);
  check("P no tests, scripts, docs, data, env files or source maps of tests in it", !files.some((f) => /(^|\/)(tests?|scripts|docs|data|node_modules)\/|\.test\.js$|(^|\/)\.env/.test(f)), files.filter((f) => /(^|\/)(tests?|scripts|docs|data)\//.test(f)).slice(0, 5).join(", "));
  check("P the server entry, the built app and the content are there", existsSync(join(rel, "dist/server/serve.js")) && existsSync(join(rel, "apps/web/dist/index.html")) && existsSync(join(rel, "content/packs")));

  // ---- I ----
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: rel, stdio: ["ignore", "inherit", "inherit"] });
  // Packages are folders with a package.json (npm also leaves empty @scope folders behind; they hold nothing).
  const nm = join(rel, "node_modules");
  const installed = readdirSync(nm).filter((f) => !f.startsWith(".")).flatMap((f) => f.startsWith("@") ? readdirSync(join(nm, f)).map((g) => `${f}/${g}`) : [f]).filter((f) => existsSync(join(nm, f, "package.json"))).sort();
  check("I the runtime install is ws and zod only", JSON.stringify(installed) === JSON.stringify(["ws", "zod"]), JSON.stringify(installed));

  // ---- S ----
  const data = tmp("data");
  const env = { NODE_ENV: "production", MCHEZO_DATA_DIR: data, MCHEZO_PUBLIC_ORIGIN: ORIGIN, MCHEZO_BETA_ACCESS_CODE: CODE, MCHEZO_TRUST_PROXY: "1" };
  let s1 = await start(rel, env, "S1");
  check("S the package starts on plain node in production", !!s1.port, s1.port ? `port ${s1.port}` : s1.p.out.slice(-300));
  check("S its output never shows the access code", !s1.p.out.includes(CODE));
  const base = `http://localhost:${s1.port}`;
  const health = await (await fetch(`${base}/health`)).json();
  check("S /health names the revision and nothing else", JSON.stringify(health) === JSON.stringify({ ok: true, revision: release.revision }), JSON.stringify(health));
  const gate = await fetch(`${base}/`, { headers: { accept: "text/html" }, redirect: "manual" });
  check("S the app is behind the gate", gate.status === 401 && /private beta/.test(await gate.text()));
  const enter = await fetch(`${base}/beta/enter`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: CODE, next: "/" }).toString() });
  const cookie = (enter.headers.get("set-cookie") ?? "").split(";")[0];
  check("S the right code opens it (a Secure, HttpOnly cookie, since the public origin is https)", enter.status === 303 && /; HttpOnly;/.test(enter.headers.get("set-cookie") ?? "") && /; Secure$/.test(enter.headers.get("set-cookie") ?? ""));
  const app = await fetch(`${base}/`, { headers: { accept: "text/html", cookie } });
  const html = await app.text();
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  check("S with the cookie: the built app and its files are served", app.status === 200 && !!asset && (await fetch(`${base}${asset}`, { headers: { cookie } })).status === 200, asset ?? "no script tag");
  const api = (path, body) => fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const room = await api("/rooms", { name: "Release check", kind: "casual" });
  const joined = await api("/rooms/join-by-code", { joinCode: room.body.joinCode, displayName: "Keku", asHost: true, hostClaimToken: room.body.hostClaimToken });
  check("S a room is created and joined through the gate", room.status === 201 && joined.status === 201, `${room.status}/${joined.status}`);
  const ws = (headers) => new Promise((resolve) => {
    const w = new WebSocket(`ws://localhost:${s1.port}/?roomId=${room.body.roomId}&audience=tv`, { headers });
    w.once("open", () => { w.close(); resolve("open"); });
    w.once("unexpected-response", (_q, r) => resolve(r.statusCode));
    w.once("error", () => {});
  });
  check("S live updates are gated too: a WebSocket without the cookie is refused, with it it opens", (await ws({})) === 401 && (await ws({ cookie })) === "open");

  // ---- L ----
  const s2 = await start(rel, env, "S2");
  check("L a second server on the same data is refused, with the reason", s2.exit === 2 && /Another server \(pid \d+\) is using this data directory/.test(s2.p.out), s2.p.out.trim().split("\n").pop());
  const code1 = await stop(s1.p);
  check("L SIGTERM stops it cleanly and frees the lock", code1 === 0 && !existsSync(join(data, "server.lock")), `exit ${code1}`);
  s1 = await start(rel, env, "S3");
  const back = await fetch(`http://localhost:${s1.port}/rooms/${room.body.roomId}/projection?audience=tv`, { headers: { cookie } });
  check("L after a restart the room is back, and the beta cookie still works", back.status === 200 && (await back.json()).roomId === room.body.roomId, String(back.status));
  await stop(s1.p, "SIGKILL");
  check("L a kill -9 leaves a stale lock behind", existsSync(join(data, "server.lock")));
  s1 = await start(rel, env, "S4");
  const back2 = await fetch(`http://localhost:${s1.port}/rooms/${room.body.roomId}/projection?audience=tv`, { headers: { cookie } });
  check("L the next start takes the stale lock over, and the room survives the crash", !!s1.port && /took over a stale lock/.test(s1.p.out) && back2.status === 200, s1.p.out.trim().split("\n")[0]);
  await stop(s1.p);

  // ---- R ----
  const refusals = [
    ["the content test mode", { ...env, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" }, /for tests only/],
    ["no data dir", { ...env, MCHEZO_DATA_DIR: "" }, /absolute path outside the release/],
    ["a relative data dir", { ...env, MCHEZO_DATA_DIR: "data" }, /absolute path outside the release/],
    ["a data dir inside the release", { ...env, MCHEZO_DATA_DIR: join(rel, "data") }, /inside the release/],
    ["no public origin", { ...env, MCHEZO_PUBLIC_ORIGIN: "" }, /MCHEZO_PUBLIC_ORIGIN must be set/],
    ["no access code", { ...env, MCHEZO_BETA_ACCESS_CODE: "" }, /MCHEZO_BETA_ACCESS_CODE must be set/],
    ["a short access code", { ...env, MCHEZO_BETA_ACCESS_CODE: "short" }, /at least 12 characters/],
  ];
  for (const [why, e, re] of refusals) {
    const r = await start(rel, e, `R-${why}`);
    check(`R refused: ${why} (exit 2, with the reason)`, r.exit === 2 && re.test(r.p.out), (r.p.out.trim().split("\n").pop() ?? "").slice(0, 160));
  }
  check("R no refused start wrote into the release", !existsSync(join(rel, "data")));
} catch (e) {
  check("the check ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (failures) for (const p of owned.procs) console.log(`--- ${p.label} output ---\n${p.out.slice(-1500)}`);
  for (const p of owned.procs) await stop(p, "SIGKILL").catch(() => {});
  for (const d of owned.dirs) rmSync(d, { recursive: true, force: true });
  const left = owned.dirs.filter((d) => existsSync(d));
  const running = owned.procs.filter((p) => p.child.exitCode === null && p.child.signalCode === null).length;
  console.log(`cleanup: ${owned.procs.length} process(es) stopped, ${owned.dirs.length} temporary dir(s) removed; still running: ${running || "none"}; left on disk: ${left.length ? left.join(", ") : "none"}`);
  if (running || left.length) failures++;
}
console.log(failures === 0 ? "RELEASE PACKAGE PASSED" : `RELEASE PACKAGE FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
