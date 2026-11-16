// Beta R4 (handoff 6932053542): the private-beta gate's NATIVE form sign-in, reproduced locally against the packaged
// pinned runtime, under four stand-in forwarders. LOCAL ONLY: local Docker, 127.0.0.1, a synthetic throwaway code, a
// self-signed certificate for this run, no hosting account, no forwarding, no real credential.
//
//   node scripts/beta/gate-origin-repro.mjs --image <packaged image tag> --evidence <dir>
//
// Each case starts its own container of the image (a unique name and the label gate.owner=<run id>; only that container
// is removed afterwards), authorizes it with cgn-authorize for that case's public origin, and puts a TLS forwarder of
// this script in front of it on 127.0.0.1:18443. Chromium opens https://preview.test:18443/ (mapped to 127.0.0.1), sees
// the gate, types the code into the RENDERED form and clicks Continue: a native form navigation, never a fetch, and the
// script never supplies an Origin. Recorded: the Origin the browser sent (from the browser's own request), the Origin
// the app received (from the forwarder), the gate's Referrer-Policy as the browser received it, the answer, and whether
// the app loaded. The forwarder modes:
//   A  preserve   Host and Origin passed through unchanged (the release architecture's proxy). Public origin: the URL's.
//                 Also a wrong code first: the gate's normal refusal, and no cookie.
//   B  rewrite    a Codespaces-like forwarder: an Origin EQUAL to the forwarded URL's own origin becomes
//                 https://localhost:18443, Host becomes localhost:18443, X-Forwarded-Host keeps the URL's host (finding
//                 F1 in docs/beta/beta-r1-preview-route.md, measured in review 6903475177). Public origin: the URL's,
//                 the reviewer's configuration.
//   C  rewrite    the same forwarder, with the public origin set to the rewritten value (route A of that document).
//   D  no-referrer an origin-preserving forwarder that APPENDS "Referrer-Policy: no-referrer" to every answer: tests the
//                 hypothesis that a no-referrer gate page makes the browser post with "Origin: null".
// Exit: 0 when every case behaved as stated in its "expected"; 1 otherwise; 2 bad options. Evidence holds no code value.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "../lib/driver-env.mjs";

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const IMAGE = opt("image"), EVIDENCE = opt("evidence");
if (!IMAGE || !EVIDENCE || argv.length !== 4) { console.error("usage: node scripts/beta/gate-origin-repro.mjs --image <tag> --evidence <dir>"); process.exit(2); }
const PIN = "7097ac2bb062925bb296a129f4771f1e68fd522d";
const BACK = 18080, FRONT = 18443, HOST = "preview.test";
const URL_ORIGIN = `https://${HOST}:${FRONT}`, LOCAL_ORIGIN = `https://localhost:${FRONT}`;
const RUN = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(3).toString("hex")}`;
const CODE = randomBytes(12).toString("hex");
const priv = mkdtempSync(join(tmpdir(), "gate-repro-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) => String(s).split(CODE).join("<code>").replace(/cgn_beta=[^;,\s"]+/g, "cgn_beta=<redacted>");
const docker = (args, input) => execFileSync("docker", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trim();
const owned = new Set();
const ev = { tool: "scripts/beta/gate-origin-repro.mjs", run: RUN, image: IMAGE, url: URL_ORIGIN, cases: [], verdicts: [] };

async function portFree(port) {
  return new Promise((resolve) => { const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true))).listen(port, "127.0.0.1"); });
}
function removeOwned() {
  // This run's containers: the IDs its `docker run` returned, plus any carrying its label (a run that failed after
  // creating one). Each is removed only after its label is read back as this run's.
  try { for (const id of docker(["ps", "-aq", "--no-trunc", "--filter", `label=gate.owner=${RUN}`]).split("\n").filter(Boolean)) owned.add(id); } catch { /* docker unavailable */ }
  for (const id of [...owned]) {
    try { if (docker(["inspect", "-f", "{{index .Config.Labels \"gate.owner\"}}", id]) === RUN) docker(["rm", "-f", "-v", id]); } catch { /* already gone */ }
    owned.delete(id);
  }
}
async function startService(publicOrigin, tag) {
  writeFileSync(join(priv, "code.env"), `MCHEZO_BETA_ACCESS_CODE=${CODE}\n`, { mode: 0o600 });
  const id = docker(["run", "-d", "--name", `gate-repro-${RUN}-${tag}`, "--label", `gate.owner=${RUN}`, "-p", `127.0.0.1:${BACK}:10000`,
    "-e", "MCHEZO_DATA_DIR=/var/data/cgn-w1", "-e", `MCHEZO_PUBLIC_ORIGIN=${publicOrigin}`, "-e", "MCHEZO_TRUST_PROXY=1", "--env-file", join(priv, "code.env"), IMAGE]);
  owned.add(id);
  let health = null;
  for (let i = 0; i < 80 && !health; i++) { health = await fetch(`http://127.0.0.1:${BACK}/health`).then((r) => (r.ok ? r.json() : null)).catch(() => null); if (!health) await sleep(250); }
  if (!health) throw new Error("the service never became ready");
  if (health.revision !== PIN) throw new Error(`the service reports revision ${health.revision}, not ${PIN}`);
  const auth = docker(["exec", "-i", id, "cgn-authorize", "/var/data/cgn-w1", publicOrigin, "1"], CODE);
  if (!/^AUTHORIZED /m.test(auth)) throw new Error("cgn-authorize did not confirm");
  return { id, revision: health.revision, authorized: auth.split("\n")[0] };
}
// The stand-in forwarder: TLS for preview.test, then plain HTTP to the service, in one of the modes above.
function startForwarder(mode, seen) {
  const tls = { key: readFileSync(join(priv, "key.pem")), cert: readFileSync(join(priv, "cert.pem")) };
  const server = https.createServer(tls, (req, res) => {
    const headers = { ...req.headers };
    const inOrigin = req.headers.origin ?? null;
    if (mode === "rewrite") {
      if (inOrigin === URL_ORIGIN) headers.origin = LOCAL_ORIGIN;
      headers["x-forwarded-host"] = req.headers.host;
      headers.host = `localhost:${FRONT}`;
    }
    headers["x-forwarded-for"] = [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", ");
    headers["x-forwarded-proto"] = "https";
    const up = http.request({ host: "127.0.0.1", port: BACK, method: req.method, path: req.url, headers }, (ur) => {
      const out = { ...ur.headers };
      if (mode === "no-referrer") out["referrer-policy"] = [ur.headers["referrer-policy"], "no-referrer"].filter(Boolean);
      seen.push({ method: req.method, path: req.url.split("?")[0], originFromBrowser: inOrigin, originToApp: headers.origin ?? null, secFetchSite: req.headers["sec-fetch-site"] ?? null, status: ur.statusCode });
      res.writeHead(ur.statusCode, out);
      ur.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  return new Promise((resolve) => server.listen(FRONT, "127.0.0.1", () => resolve(server)));
}

const CASES = [
  { id: "A", mode: "preserve", publicOrigin: URL_ORIGIN, wrongFirst: true, expect: "admitted", what: "origin-preserving forwarder; public origin = the URL's (the release architecture)" },
  { id: "B", mode: "rewrite", publicOrigin: URL_ORIGIN, expect: "FOREIGN_ORIGIN", what: "Codespaces-like forwarder (F1 rewrite); public origin = the URL's (the reviewer's configuration)" },
  { id: "C", mode: "rewrite", publicOrigin: LOCAL_ORIGIN, expect: "admitted", what: "the same forwarder; public origin = the rewritten value (route A)" },
  { id: "D", mode: "no-referrer", publicOrigin: URL_ORIGIN, expect: "FOREIGN_ORIGIN", what: "origin-preserving forwarder that appends Referrer-Policy: no-referrer (the no-referrer hypothesis)" },
];

let exitCode = 1, browser = null;
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(priv, "key.pem"), "-out", join(priv, "cert.pem"), "-days", "1", "-subj", `/CN=${HOST}`, "-addext", `subjectAltName=DNS:${HOST},DNS:localhost`], { stdio: "ignore" });
  const noProxyEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_proxy$/i.test(k)));
  browser = await launchChromium({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, "--no-proxy-server"], env: noProxyEnv });
  ev.browser = `chromium ${browser.version()}`;
  for (const c of CASES) {
    if (!(await portFree(BACK)) || !(await portFree(FRONT))) throw new Error(`port ${BACK} or ${FRONT} is in use; nothing started for case ${c.id}`);
    const svc = await startService(c.publicOrigin, c.id);
    const seen = [];
    const fwd = await startForwarder(c.mode, seen);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const posts = [];
    page.on("request", async (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/beta/enter") posts.push({ origin: await r.headerValue("origin"), secFetchSite: await r.headerValue("sec-fetch-site"), mode: await r.headerValue("sec-fetch-mode") }); });
    const gateResp = await page.goto(`${URL_ORIGIN}/`, { waitUntil: "domcontentloaded" });
    const rec = { id: c.id, what: c.what, mode: c.mode, publicOrigin: c.publicOrigin, expect: c.expect, revision: svc.revision, container: svc.id.slice(0, 12),
      gate: { status: gateResp.status(), referrerPolicyAsReceived: (await gateResp.headersArray()).filter((h) => h.name.toLowerCase() === "referrer-policy").map((h) => h.value), formShown: (await page.locator('form[action="/beta/enter"] input#code').count()) === 1 } };
    const submit = async (code) => {
      await page.locator("input#code").fill(code);
      const [resp] = await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/beta/enter", { timeout: 15000 }), page.getByRole("button", { name: "Continue" }).click()]);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return resp.status();
    };
    if (c.wrongFirst) {
      const st = await submit("not-the-code-0000");
      rec.wrongCode = { status: st, alert: (await page.getByRole("alert").textContent().catch(() => null)) ?? null, cookieSet: (await ctx.cookies()).some((k) => k.name === "cgn_beta"), gateStillShown: (await page.locator("input#code").count()) === 1 };
    }
    const status = await submit(CODE);
    const appLoaded = await page.getByTestId("home-host").waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    const cookie = (await ctx.cookies()).find((k) => k.name === "cgn_beta");
    rec.rightCode = {
      postStatus: status, finalPath: new URL(page.url()).pathname, appLoaded,
      pageText: redact((await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 120)),
      cookie: cookie ? { secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, hostOnly: !cookie.domain.startsWith(".") } : null,
    };
    rec.formPostsAsSentByBrowser = posts;
    rec.formPostsAsForwarded = seen.filter((s) => s.method === "POST");
    const outcome = appLoaded && status === 303 ? "admitted" : /FOREIGN_ORIGIN/.test(rec.rightCode.pageText) && status === 403 ? "FOREIGN_ORIGIN" : `other (${status})`;
    rec.outcome = outcome;
    const ok = outcome === c.expect && rec.gate.formShown && (!c.wrongFirst || (rec.wrongCode.status === 401 && !rec.wrongCode.cookieSet && rec.wrongCode.gateStillShown));
    ev.cases.push(rec);
    ev.verdicts.push({ id: c.id, ok, outcome, expected: c.expect });
    const p = rec.formPostsAsForwarded.at(-1) ?? {};
    console.log(`${ok ? "AS EXPECTED" : "UNEXPECTED"} case ${c.id} (${c.what}): ${outcome}; gate Referrer-Policy as received ${JSON.stringify(rec.gate.referrerPolicyAsReceived)}; Origin sent by the browser ${JSON.stringify(posts.at(-1)?.origin ?? null)}, received by the app ${JSON.stringify(p.originToApp ?? null)}; POST ${status}; app loaded: ${appLoaded}${cookie ? `; cookie Secure=${cookie.secure} HttpOnly=${cookie.httpOnly} SameSite=${cookie.sameSite}` : ""}${c.wrongFirst ? `; wrong code first: ${rec.wrongCode.status}, alert "${rec.wrongCode.alert}", cookie set: ${rec.wrongCode.cookieSet}` : ""}`);
    await ctx.close();
    await new Promise((r) => fwd.close(r));
    removeOwned();
  }
  exitCode = ev.verdicts.every((v) => v.ok) ? 0 : 1;
} catch (e) {
  console.log(`FAILED: ${redact(String(e?.message ?? e).split("\n")[0])}`);
  ev.error = redact(String(e?.message ?? e).split("\n")[0]);
  exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  removeOwned();
  rmSync(priv, { recursive: true, force: true });
  mkdirSync(EVIDENCE, { recursive: true });
  const out = redact(JSON.stringify(ev, null, 1));
  const file = join(EVIDENCE, `gate-origin-${RUN}.json`);
  writeFileSync(file, out + "\n");
  console.log(`evidence: ${file}`);
  console.log(`containers of this run left: ${(() => { try { return docker(["ps", "-aq", "--filter", `label=gate.owner=${RUN}`]).split("\n").filter(Boolean).length; } catch { return "unknown"; } })()}; code in the evidence: ${out.includes(CODE) ? "YES" : "no"}`);
  console.log(`GATE ORIGIN REPRO ${exitCode === 0 ? "AS EXPECTED" : "UNEXPECTED"} (run ${RUN})`);
  process.exit(exitCode);
}
