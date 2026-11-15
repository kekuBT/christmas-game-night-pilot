// Beta R1 (docs/beta/beta-r1.md §2-§3): the release package, proved from a clean runtime install. No browser.
//   P  pack the checked-out revision (scripts/release/pack.mjs) into a temporary folder; it holds only what runs
//   I  npm ci --omit=dev: only the runtime packages (ws, zod) are installed; no build or test tooling
//   S  start it as production (plain node, NODE_ENV=production, a data dir outside the release that doesn't exist yet
//      and is created private, beta gate on, one proxy,
//      listening on 127.0.0.1 only): this machine's network address is refused; /health names the revision and
//      nothing else; the app is behind the gate (pages, API, WebSocket); the right code opens it; a room is created
//      and played into
//   L  one writer: a second server on the same data is refused; SIGTERM stops cleanly and frees the lock; after a
//      kill -9 the next start takes the stale lock over; the room survives both restarts
//   D  the data tool from the release: backup refused while the server runs, then backup, verify, restore into a new
//      folder and serve it; retention is a dry run by default
//   R  refusals: the content test mode, a missing/relative/inside-the-release data dir, no public origin, no or a
//      short access code, a trusted proxy with no listen address; each exits 2 with a reason, and none writes anything
// Usage: node scripts/check-release-package.mjs   (starts its own servers; MCHEZO_RELEASE_ALLOW_DIRTY=1 for a local try)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
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
  check("P no approval records and no editorial pilot batches are shipped", !existsSync(join(rel, "content/approvals.json")) && !existsSync(join(rel, "content/pilot")));
  // Secrets: private keys, cloud and GitHub tokens, and assignments of a literal to something named like a secret.
  const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bsk-[A-Za-z0-9_-]{20,}|\bxox[abpr]-[A-Za-z0-9-]{10,}|\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\s]{12,}["']/i;
  const leaks = files.filter((f) => !f.endsWith(".png") && !f.endsWith(".woff2") && SECRET.test(readFileSync(join(rel, f), "utf8")));
  check("P no secret-shaped strings in any shipped file", leaks.length === 0, leaks.slice(0, 5).join(", "));

  // ---- I ----
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: rel, stdio: ["ignore", "inherit", "inherit"] });
  // Packages are folders with a package.json (npm also leaves empty @scope folders behind; they hold nothing).
  const nm = join(rel, "node_modules");
  const installed = readdirSync(nm).filter((f) => !f.startsWith(".")).flatMap((f) => f.startsWith("@") ? readdirSync(join(nm, f)).map((g) => `${f}/${g}`) : [f]).filter((f) => existsSync(join(nm, f, "package.json"))).sort();
  check("I the runtime install is ws and zod only", JSON.stringify(installed) === JSON.stringify(["ws", "zod"]), JSON.stringify(installed));

  // ---- S ----
  // A fresh host: the data directory doesn't exist yet (B-08: the first start used to crash on it).
  const data = join(tmp("data"), "var-lib-cgn");
  const env = { NODE_ENV: "production", MCHEZO_DATA_DIR: data, MCHEZO_PUBLIC_ORIGIN: ORIGIN, MCHEZO_BETA_ACCESS_CODE: CODE, MCHEZO_TRUST_PROXY: "1", MCHEZO_LISTEN_HOST: "127.0.0.1" };
  let s1 = await start(rel, env, "S1");
  check("S the package starts on plain node in production", !!s1.port, s1.port ? `port ${s1.port}` : s1.p.out.slice(-300));
  check("S its output never shows the access code", !s1.p.out.includes(CODE));
  check("S a first start creates the missing data directory, private (0700)", existsSync(data) && (statSync(data).mode & 0o777) === 0o700, existsSync(data) ? (statSync(data).mode & 0o777).toString(8) : "missing");
  const base = `http://127.0.0.1:${s1.port}`;
  // Behind the proxy the server answers on loopback only, so nobody reaches it around the proxy (and forges its
  // X-Forwarded-For). Tried from this machine's own network address, when it has one.
  const outside = Object.values(networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address;
  if (outside) {
    const r = await fetch(`http://${outside}:${s1.port}/health`).then((x) => `answered ${x.status}`, (e) => e?.cause?.code ?? String(e));
    check("S listening on 127.0.0.1 only: this machine's network address is refused", r === "ECONNREFUSED", `${outside}: ${r}`);
  } else console.log("NOT CHECKED S listening on 127.0.0.1 only: this machine has no network address to try from");
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
    const w = new WebSocket(`ws://127.0.0.1:${s1.port}/?roomId=${room.body.roomId}&audience=tv`, { headers });
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
  const back = await fetch(`http://127.0.0.1:${s1.port}/rooms/${room.body.roomId}/projection?audience=tv`, { headers: { cookie } });
  check("L after a restart the room is back, and the beta cookie still works", back.status === 200 && (await back.json()).roomId === room.body.roomId, String(back.status));
  await stop(s1.p, "SIGKILL");
  check("L a kill -9 leaves a stale lock behind", existsSync(join(data, "server.lock")));
  s1 = await start(rel, env, "S4");
  const back2 = await fetch(`http://127.0.0.1:${s1.port}/rooms/${room.body.roomId}/projection?audience=tv`, { headers: { cookie } });
  check("L the next start takes the stale lock over, and the room survives the crash", !!s1.port && /took over a stale lock/.test(s1.p.out) && back2.status === 200, s1.p.out.trim().split("\n")[0]);
  const tool = (...a) => { try { return { code: 0, out: execFileSync(process.execPath, ["dist/server/datatool.js", ...a], { cwd: rel, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; } };
  const bk = tool("backup", "--data", data, "--out", join(tmp("bk"), "b"));
  check("D a backup is refused while the server runs (stop it between sessions)", bk.code === 1 && /Stop it first/.test(bk.out), bk.out.trim());
  await stop(s1.p);

  // ---- D ---- the data tool, from the release on plain node
  const backupDir = join(tmp("bk2"), "backup");
  const b = tool("backup", "--data", data, "--out", backupDir);
  check("D with the server stopped: backup OK, verified", b.code === 0 && /^backup OK: 1 room\(s\)/.test(b.out), b.out.trim());
  const restored = join(tmp("rs"), "data");
  const r = tool("restore", "--backup", backupDir, "--into", restored);
  check("D restore into a new folder: OK", r.code === 0 && /^restore OK/.test(r.out), r.out.trim());
  const s5 = await start(rel, { ...env, MCHEZO_DATA_DIR: restored }, "S5");
  const fromBackup = await fetch(`http://127.0.0.1:${s5.port}/rooms/${room.body.roomId}/projection?audience=tv`, { headers: { cookie } });
  check("D a server on the restored folder serves the same room", fromBackup.status === 200, String(fromBackup.status));
  await stop(s5.p);
  const pr = tool("prune", "--data", data, "--older-than-days", "30");
  check("D retention is a dry run by default and finds nothing recent to archive", pr.code === 0 && /0 room\(s\) older than 30 days; dry run/.test(pr.out), pr.out.trim());

  // ---- R ----
  const refusals = [
    ["the content test mode", { ...env, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" }, /for tests only/],
    ["no data dir", { ...env, MCHEZO_DATA_DIR: "" }, /absolute path outside the release/],
    ["a relative data dir", { ...env, MCHEZO_DATA_DIR: "data" }, /absolute path outside the release/],
    ["a data dir inside the release", { ...env, MCHEZO_DATA_DIR: join(rel, "data") }, /inside the release/],
    ["no public origin", { ...env, MCHEZO_PUBLIC_ORIGIN: "" }, /MCHEZO_PUBLIC_ORIGIN must be set/],
    ["no access code", { ...env, MCHEZO_BETA_ACCESS_CODE: "" }, /MCHEZO_BETA_ACCESS_CODE must be set/],
    ["a short access code", { ...env, MCHEZO_BETA_ACCESS_CODE: "short" }, /at least 12 characters/],
    ["a trusted proxy with no listen address", { ...env, MCHEZO_LISTEN_HOST: "" }, /MCHEZO_LISTEN_HOST must be set/],
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
