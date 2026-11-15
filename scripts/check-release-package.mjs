// Beta R1 (docs/beta/beta-r1.md §2-§3): the release package, proved from a clean runtime install. No browser.
//   P  pack the checked-out revision (scripts/release/pack.mjs) into a temporary folder; it holds only what runs
//   I  npm ci --omit=dev: only the runtime packages (ws, zod) are installed; no build or test tooling
//   S  start it as production (plain node, NODE_ENV=production, a data dir outside the release that doesn't exist yet
//      and is created private, beta gate on, one proxy,
//      listening on 127.0.0.1 only): this machine's network address is refused; /health names the revision and
//      nothing else; the app is behind the gate (pages, API, WebSocket); the right code opens it; a room is created
//      and played into
//   L  one writer: a second server on the same data is refused; four started at the same moment on a new folder give
//      one server and three refusals (review 6900450343 R1); SIGTERM stops cleanly and frees the lock; after a
//      kill -9 the next start takes the stale lock over; the room survives both restarts
//   D  the data tool from the release: backup, archive and check refused while the server runs, then backup, verify,
//      restore into a new folder and serve it; retention is a dry run by default
//   U  restore under the service user (review 6900450343 R2), with two real local users made for the run and removed
//      after it (needs root or passwordless sudo): a first install's data folder for the service user; the service
//      plays into it (a room, a Memory Book note); root backs up; a restore without --owner is refused by the service
//      (check and start, with the reason); a restore with --owner passes check as the service user; the service
//      starts on it, loads the room and the Memory Book, holds the lock and saves a later change; the backup stays
//      private (root 0700/0600, unreadable by the service and by another user) and verifies; the original data is
//      byte-for-byte unchanged
//   R  refusals: the content test mode, a missing/relative/inside-the-release data dir, no public origin, no or a
//      short access code, a trusted proxy with no listen address; each exits 2 with a reason, and none writes anything
// Usage: node scripts/check-release-package.mjs   (starts its own servers; MCHEZO_RELEASE_ALLOW_DIRTY=1 for a local try)
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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

/** Start the packed server; resolves with its port, or with its exit code if it exits first. `as`: run it as that
 * local user ({ uid, gid }), through setpriv (and sudo when this isn't root), with exactly `env`. */
function start(rel, env, label, as) {
  const fullEnv = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: "0", ...env };
  const child = as
    ? spawn(asRootCmd(), [...asRootArgs(), "setpriv", `--reuid=${as.uid}`, `--regid=${as.gid}`, "--clear-groups", "env", "-i", ...Object.entries(fullEnv).map(([k, v]) => `${k}=${v}`), process.execPath, "dist/server/serve.js"], { cwd: rel, stdio: ["ignore", "pipe", "pipe"] })
    : spawn(process.execPath, ["dist/server/serve.js"], { cwd: rel, env: fullEnv, stdio: ["ignore", "pipe", "pipe"] });
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
const isRoot = process.getuid?.() === 0;
const asRootCmd = () => (isRoot ? "env" : "sudo");
const asRootArgs = () => (isRoot ? [] : ["-n"]);
/** Run a command as root (directly, or with sudo -n); { code, out }. */
function root(cmd, args) {
  const r = spawnSync(asRootCmd(), [...asRootArgs(), cmd, ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
/** Run a command as a local user ({ uid, gid }) with exactly `env`; { code, out }. */
const asUser = (who, env, args, cwd) => {
  const r = spawnSync(asRootCmd(), [...asRootArgs(), "setpriv", `--reuid=${who.uid}`, `--regid=${who.gid}`, "--clear-groups", "env", "-i", `PATH=${process.env.PATH}`, ...Object.entries(env).map(([k, v]) => `${k}=${v}`), ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const treeHashes = (dir) => {
  const out = {};
  const walk = (d, pre) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, `${pre}${n}/`); else out[`${pre}${n}`] = createHash("sha256").update(readFileSync(p)).digest("hex"); } };
  walk(dir, "");
  return out;
};
const users = [];
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
  {
    // Review 6900450343 R1: four starts at the same moment on a new folder (on 92a3722 two or three could hold it).
    const fresh = join(tmp("race"), "data");
    const all = await Promise.all([1, 2, 3, 4].map((i) => start(rel, { ...env, MCHEZO_DATA_DIR: fresh }, `RACE${i}`)));
    const serving = all.filter((x) => x.port);
    const refused = all.filter((x) => x.exit === 2 && /Another server \(pid \d+\) is using this data directory/.test(x.p.out));
    check("L four servers started at the same moment on a new folder: one serves, three are refused with the reason", serving.length === 1 && refused.length === 3, all.map((x) => x.port ? "serving" : `exit ${x.exit}`).join(", "));
    for (const x of serving) await stop(x.p);
  }
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
  check("D a backup is refused while the server runs (stop it between sessions)", bk.code === 1 && /^A server \(pid \d+\) is using .* Stop it first/.test(bk.out), bk.out.trim());
  const ar = tool("prune", "--data", data, "--older-than-days", "7", "--apply");
  check("D archiving is refused while the server runs", ar.code === 1 && /^A server \(pid \d+\) is using .* stop it before archiving/.test(ar.out), ar.out.trim());
  const ck = tool("check", "--data", data);
  check("D check is refused while the server runs", ck.code === 1 && /^A server \(pid \d+\) is using .* check it with the server stopped/.test(ck.out), ck.out.trim());
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

  // ---- U ---- review 6900450343 R2: restore under the service user, from the package, with real local users.
  if (!isRoot && root("true", []).code !== 0) {
    check("U the service-user drill ran (it needs root or passwordless sudo, to make two local users)", false, "not root, and sudo -n is not available");
  } else {
    const tag = String(process.pid % 100000);
    const mkUser = (name) => {
      const r = root("useradd", ["--system", "--no-create-home", "--shell", "/usr/sbin/nologin", "--user-group", name]);
      if (r.code !== 0) throw new Error(`useradd ${name}: ${r.out.trim()}`);
      users.push(name);
      return { name, uid: Number(root("id", ["-u", name]).out.trim()), gid: Number(root("id", ["-g", name]).out.trim()) };
    };
    const svc = mkUser(`mzsvc${tag}`), other = mkUser(`mzother${tag}`);
    console.log(`U local users for this run: ${svc.name} (the service, uid ${svc.uid}) and ${other.name} (someone else, uid ${other.uid}); removed at the end`);
    root("chmod", ["-R", "a+rX", rel]); // the release belongs to root and the service reads it (docs/beta/beta-r1-architecture.md)
    const U = tmp("users");
    chmodSync(U, 0o755);
    // First install (docs/beta/beta-r1-release.md): the data folder made for the service user, private.
    const live = join(U, "var-lib-cgn");
    root("install", ["-d", "-m", "0700", "-o", svc.name, "-g", svc.name, live]);
    check("U first install: the data folder belongs to the service user, 0700", statSync(live).uid === svc.uid && (statSync(live).mode & 0o777) === 0o700);
    const uenv = { ...env, MCHEZO_DATA_DIR: live };
    let us = await start(rel, uenv, "U-svc-1", svc);
    check("U the package runs as the service user on it", !!us.port, us.port ? `port ${us.port}` : us.p.out.slice(-300));
    const ub = `http://127.0.0.1:${us.port}`;
    const uapi = (path, body, token) => fetch(`${ub}${path}`, { method: body ? "POST" : "GET", headers: { cookie, "content-type": "application/json", "x-mchezo-protocol": "5", ...(token ? { "x-session-token": token } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const uroom = await uapi("/rooms", { name: "Service user drill", kind: "casual" });
    const uhost = await uapi("/rooms/join-by-code", { joinCode: uroom.body.joinCode, displayName: "Keku", asHost: true, hostClaimToken: uroom.body.hostClaimToken });
    const uguest = await uapi("/rooms/join-by-code", { joinCode: uroom.body.joinCode, displayName: "Baraka" });
    // A Memory Book note cites a finished game: both play a practice Math Mayhem through (as the book driver does).
    const seats = [uhost.body.recoveryToken, uguest.body.recoveryToken];
    const intent = (token, gid, action, payload) => uapi(`/rooms/${uroom.body.roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: uroom.body.roomId, gameInstanceId: gid, action, payload } }, token);
    const solve = (prompt) => {
      const pct = /^(\d+)% of (\d+)/.exec(prompt);
      if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
      const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
      const x = Number(a), y = Number(b);
      return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
    };
    const seen = await uapi(`/rooms/${uroom.body.roomId}/projection?audience=player`, null, seats[0]);
    const game = await uapi(`/rooms/${uroom.body.roomId}/games`, { gameId: "math-mayhem", official: false, roster: seen.body.readiness?.wouldPlay }, seats[0]);
    const gid = game.body.gameId;
    for (const t of seats) await intent(t, gid, "briefing-ready", { ready: true });
    for (const t of seats) {
      const g = (await uapi(`/rooms/${uroom.body.roomId}/projection?audience=player`, null, t)).body.myGames.find((x) => x.id === gid);
      for (const q of g.questions) {
        const o = await intent(t, gid, "math-open", { questionId: q.id });
        await intent(t, gid, "submit-math-answer", { questionId: q.id, chosenIndex: o.body.result.options.findIndex((x) => Number(x) === solve(o.body.result.prompt)) });
      }
    }
    const ledger = await uapi(`/rooms/${uroom.body.roomId}/ledger?watermark=1`, null, seats[0]);
    const fin = (ledger.body.events ?? []).find((e) => e.type === "game-finished" && e.gameInstanceId === gid)?.eventId;
    const note = await uapi(`/rooms/${uroom.body.roomId}/memory`, { day: 1, text: "Restored under the service user", sourceEventIds: [fin] }, seats[0]);
    check("U the service saves a room, a finished game and a Memory Book note", uroom.status === 201 && uhost.status === 201 && game.status === 201 && !!fin && note.status === 201, `${uroom.status}/${uhost.status}/${game.status}/${fin}/${note.status} ${JSON.stringify(note.body).slice(0, 120)}`);
    check("U its lock record names the server and belongs to the service user", (() => { const r = JSON.parse(readFileSync(join(live, "server.lock"), "utf8")); return r.pid > 0 && r.role === "server" && statSync(join(live, "server.lock")).uid === svc.uid; })());
    check("U the service stops cleanly (SIGTERM) and frees the folder", (await stop(us.p)) === 0 && !existsSync(join(live, "server.lock")));
    const original = treeHashes(live);
    // Back up as root, as the runbook does (between sessions).
    const backups = join(U, "backups");
    root("install", ["-d", "-m", "0700", backups]);
    const ubk = join(backups, "before-restore");
    const bk1 = root(process.execPath, [join(rel, "dist/server/datatool.js"), "backup", "--data", live, "--out", ubk]);
    check("U root backs it up: one room, one Memory Book, verified", bk1.code === 0 && /^backup OK: 1 room\(s\), 1 Memory Book\(s\)/.test(bk1.out), bk1.out.trim());
    // The defect: a restore left as root is unusable by the service. It says so and changes nothing.
    const plain = join(U, "restored-plain");
    const rp = root(process.execPath, [join(rel, "dist/server/datatool.js"), "restore", "--backup", ubk, "--into", plain]);
    check("U a restore without --owner: OK, but the folder belongs to root", rp.code === 0 && statSync(plain).uid === 0, rp.out.trim());
    const ckPlain = asUser(svc, {}, [process.execPath, "dist/server/datatool.js", "check", "--data", plain], rel);
    check("U check as the service user refuses it, saying why and what to do", ckPlain.code === 1 && /can't use the data directory|not ready for this user/.test(ckPlain.out) && /--owner/.test(ckPlain.out), ckPlain.out.trim().slice(0, 220));
    const refused = await start(rel, { ...env, MCHEZO_DATA_DIR: plain }, "U-svc-plain", svc);
    check("U the service won't start on it (exit 2): the reason names the folder and the fix, and nothing was changed", refused.exit === 2 && refused.p.out.includes(`can't use the data directory ${plain}`) && /restore --owner/.test(refused.p.out) && !existsSync(join(plain, "quarantine")), (refused.p.out.trim().split("\n").pop() ?? "").slice(0, 220));
    // The repair: restore with --owner, check as the service user, start.
    const owned2 = join(U, "restored-owned");
    const ro = root(process.execPath, [join(rel, "dist/server/datatool.js"), "restore", "--backup", ubk, "--into", owned2, "--owner", svc.name]);
    const allOwned = [owned2, ...readdirSync(owned2).map((n) => join(owned2, n))].every((p) => statSync(p).uid === svc.uid);
    const privateModes = (statSync(owned2).mode & 0o777) === 0o700 && readdirSync(owned2).every((n) => (statSync(join(owned2, n)).mode & 0o777) === 0o600);
    check("U restore --owner: the folder and every file belong to the service user, 0700 and 0600", ro.code === 0 && /owned by mzsvc/.test(ro.out) && allOwned && privateModes, ro.out.trim());
    const ckOwned = asUser(svc, {}, [process.execPath, "dist/server/datatool.js", "check", "--data", owned2], rel);
    check("U check as the service user: OK (one room, one Memory Book, lock and a test write)", ckOwned.code === 0 && /^check OK: 1 room\(s\), 1 Memory Book\(s\)/.test(ckOwned.out), ckOwned.out.trim());
    us = await start(rel, { ...env, MCHEZO_DATA_DIR: owned2 }, "U-svc-2", svc);
    check("U the service starts on the restore", !!us.port, us.port ? `port ${us.port}` : us.p.out.slice(-300));
    const ub2 = `http://127.0.0.1:${us.port}`;
    const get2 = (path, token) => fetch(`${ub2}${path}`, { headers: { cookie, ...(token ? { "x-session-token": token } : {}) } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const rr = await get2(`/rooms/${uroom.body.roomId}/projection?audience=tv`);
    const book = await get2(`/rooms/${uroom.body.roomId}/memory?revision=1`, uhost.body.recoveryToken);
    check("U it loads the room and the Memory Book", rr.status === 200 && book.status === 200 && (book.body.entries ?? []).some((e) => e.text === "Restored under the service user"), `${rr.status}/${book.status}`);
    check("U it holds the lock (its record, written as the service user)", (() => { const r = JSON.parse(readFileSync(join(owned2, "server.lock"), "utf8")); return r.role === "server" && statSync(join(owned2, "server.lock")).uid === svc.uid; })());
    const before = readFileSync(join(owned2, `${uroom.body.roomId}.json`), "utf8");
    const later = await fetch(`${ub2}/rooms/join-by-code`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ joinCode: uroom.body.joinCode, displayName: "Amina" }) });
    const after = readFileSync(join(owned2, `${uroom.body.roomId}.json`), "utf8");
    check("U it saves a later change to disk (a new player)", later.status === 201 && after !== before && after.includes("Amina") && statSync(join(owned2, `${uroom.body.roomId}.json`)).uid === svc.uid, String(later.status));
    check("U it stops cleanly", (await stop(us.p)) === 0);
    // The backup stays private and intact; the original is untouched.
    const bkPrivate = statSync(ubk).uid === 0 && (statSync(ubk).mode & 0o777) === 0o700 && readdirSync(ubk).every((n) => (statSync(join(ubk, n)).mode & 0o777) === 0o600 && statSync(join(ubk, n)).uid === 0);
    const svcReads = asUser(svc, {}, ["ls", ubk], U);
    const otherReads = asUser(other, {}, ["ls", ubk], U);
    const otherData = asUser(other, {}, ["ls", owned2], U);
    const seenModes = [ubk, ...readdirSync(ubk).map((n) => join(ubk, n))].map((p) => `${p === ubk ? "folder" : p.slice(ubk.length + 1)} ${(statSync(p).mode & 0o777).toString(8)} uid ${statSync(p).uid}`).join(", ");
    check("U the backup is private: root's, 0700 and 0600; neither the service nor another user can read it", bkPrivate && svcReads.code !== 0 && otherReads.code !== 0, `${seenModes}; service: ${svcReads.code}, other: ${otherReads.code}`);
    check("U another user can't read the service's restored data either", otherData.code !== 0, otherData.out.trim().slice(0, 80));
    const vf = root(process.execPath, [join(rel, "dist/server/datatool.js"), "verify", "--backup", ubk]);
    check("U the backup still verifies against its manifest", vf.code === 0 && /^verify OK/.test(vf.out), vf.out.trim());
    check("U the original data is byte-for-byte unchanged", JSON.stringify(treeHashes(live)) === JSON.stringify(original), `${Object.keys(original).length} file(s)`);
  }

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
  for (const d of owned.dirs) { root("rm", ["-rf", d]); rmSync(d, { recursive: true, force: true }); }
  for (const u of users) { const r = root("userdel", [u]); if (r.code !== 0) { console.log(`could not remove the local user ${u}: ${r.out.trim()}`); failures++; } }
  if (users.length) { const left = users.filter((u) => root("id", [u]).code === 0); console.log(`cleanup: local users removed: ${users.length - left.length} of ${users.length}`); if (left.length) failures++; }
  const left = owned.dirs.filter((d) => existsSync(d));
  const running = owned.procs.filter((p) => p.child.exitCode === null && p.child.signalCode === null).length;
  console.log(`cleanup: ${owned.procs.length} process(es) stopped, ${owned.dirs.length} temporary dir(s) removed; still running: ${running || "none"}; left on disk: ${left.length ? left.join(", ") : "none"}`);
  if (running || left.length) failures++;
}
console.log(failures === 0 ? "RELEASE PACKAGE PASSED" : `RELEASE PACKAGE FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
