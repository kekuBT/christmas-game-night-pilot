// Beta R1 (docs/beta/beta-r1-blockers.md B-04; D-BR1-03): the private-beta gate in a real browser, on a server of its
// own started with an access code (every other driver runs with the gate off, the default).
//   G1 at 320 and 390 px: a page load without the cookie gets the gate page; it fits the screen (no sideways scroll, the
//      card inside the viewport), the code field is labelled, and the field and button are at least 44 px tall
//   G2 a wrong code: the page says so (role=alert), still fits, and the server is still gated
//   G3 the right code returns to the page that was asked for (a join link keeps its query) and the app loads
//   G4 with the cookie, the API answers and a live WebSocket opens; in a browser without it, the API refuses
//      (BETA_ACCESS_REQUIRED) and the WebSocket is refused
// Usage: node scripts/check-beta-gate.mjs   (starts its own server; screenshots under docs/beta/screenshots/)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CODE = "driver-gate-code-1234";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }

const data = mkdtempSync(join(tmpdir(), "mz-beta-gate-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: data, MCHEZO_BETA_ACCESS_CODE: CODE };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
let out = "";
child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
let browser;
try {
  let port = null;
  for (let i = 0; i < 160 && !port && child.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
  if (!port) throw new Error(`the server did not start (exit ${child.exitCode}): ${out.slice(-300)}`);
  const base = `http://localhost:${port}`;
  browser = await launchChromium();
  const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/beta/screenshots/${name}.png`) });
  const fits = (page) => page.evaluate(() => {
    const card = document.querySelector("main").getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, width: innerWidth, left: Math.round(card.left), right: Math.round(card.right) };
  });

  // G1 and G2 at both widths
  for (const width of [320, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: 844 } })).newPage();
    const res = await page.goto(`${base}/?join=ABCD`);
    check(`G1 ${width}px: a page load without the cookie gets the gate (401)`, res.status() === 401 && (await page.getByRole("heading", { name: "Christmas Game Night" }).count()) === 1);
    let f = await fits(page);
    check(`G1 ${width}px: it fits the screen (no sideways scroll; the card is inside the viewport)`, f.scroll <= f.width && f.left >= 0 && f.right <= f.width, JSON.stringify(f));
    const field = page.getByLabel("Access code");
    const fieldH = (await field.boundingBox())?.height ?? 0, buttonH = (await page.getByRole("button", { name: "Continue" }).boundingBox())?.height ?? 0;
    check(`G1 ${width}px: the code field is labelled, and the field and button are at least 44 px tall`, (await field.count()) === 1 && fieldH >= 44 && buttonH >= 44, `field ${fieldH}, button ${buttonH}`);
    await shot(page, `beta-gate-${width}`);
    await field.fill("not-the-code-at-all");
    await Promise.all([page.waitForLoadState("load"), page.getByRole("button", { name: "Continue" }).click()]);
    await page.getByRole("alert").waitFor({ timeout: 5000 }).catch(() => {});
    f = await fits(page);
    check(`G2 ${width}px: a wrong code is refused with a plain message, and the page still fits`, /didn.t work/.test(await page.getByRole("alert").innerText().catch(() => "")) && f.scroll <= f.width && f.right <= f.width, JSON.stringify(f));
    if (width === 390) await shot(page, "beta-gate-wrong-code-390");
    await page.context().close();
  }

  // G3 and G4
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/?join=ABCD`);
  await page.getByLabel("Access code").fill(CODE);
  await Promise.all([page.waitForURL(/\/\?join=ABCD$/, { timeout: 10000 }).catch(() => {}), page.getByRole("button", { name: "Continue" }).click()]);
  check("G3 the right code returns to the page that was asked for, query kept", new URL(page.url()).search === "?join=ABCD", page.url());
  const cookie = (await ctx.cookies()).find((c) => c.name === "cgn_beta");
  check("G3 the beta cookie is HttpOnly and SameSite=Lax (Secure only over https), and isn't the code", !!cookie && cookie.httpOnly && cookie.sameSite === "Lax" && !cookie.value.includes(CODE), cookie ? `${cookie.httpOnly}/${cookie.sameSite}/${cookie.secure}` : "no cookie");
  const appUp = await page.getByTestId("home-host").waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("G3 the app loads after the gate", appUp);
  await shot(page, "beta-gate-then-app-390");
  const live = await page.evaluate(async () => {
    const r = await fetch("/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Gate check", kind: "casual" }) });
    const room = await r.json();
    const ws = await new Promise((resolve) => {
      const w = new WebSocket(`${location.origin.replace("http", "ws")}/?roomId=${room.roomId}&audience=tv`);
      w.onmessage = () => { w.close(); resolve("open, live update received"); };
      w.onerror = () => resolve("refused");
      setTimeout(() => resolve("timeout"), 5000);
    });
    return { status: r.status, roomId: room.roomId, ws };
  });
  check("G4 with the cookie: the API creates a room and a live WebSocket opens", live.status === 201 && live.ws === "open, live update received", JSON.stringify(live));
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`${base}/beta`);
  const refused = await stranger.evaluate(async (roomId) => {
    const r = await fetch("/games");
    const body = await r.json().catch(() => ({}));
    const ws = await new Promise((resolve) => {
      const w = new WebSocket(`${location.origin.replace("http", "ws")}/?roomId=${roomId}&audience=tv`);
      w.onopen = () => { w.close(); resolve("open"); };
      w.onerror = () => resolve("refused");
      setTimeout(() => resolve("timeout"), 5000);
    });
    return { status: r.status, code: body.code, ws };
  }, live.roomId);
  check("G4 without the cookie: the API refuses (401 BETA_ACCESS_REQUIRED) and the WebSocket is refused", refused.status === 401 && refused.code === "BETA_ACCESS_REQUIRED" && refused.ws === "refused", JSON.stringify(refused));
  check("the server never printed the access code", !out.includes(CODE));
} catch (e) {
  check("the driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (failures) console.log(`--- server output ---\n${out.slice(-1500)}`);
  await browser?.close().catch(() => {});
  if (child.exitCode === null && child.signalCode === null) { const exited = new Promise((r) => child.once("exit", r)); child.kill("SIGTERM"); const hard = setTimeout(() => child.kill("SIGKILL"), 5000); await exited; clearTimeout(hard); }
  rmSync(data, { recursive: true, force: true });
  console.log(`cleanup: server stopped (${child.exitCode ?? child.signalCode}); data dir removed`);
}
console.log(failures === 0 ? "BETA GATE PASSED" : `BETA GATE FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
