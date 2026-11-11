// Stage 8.1 probe (scratch, not shipped): photograph and measure the solo
// journey in a checkout. Run from the checkout: node <this> <outDir>
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { launchChromium } = await import(pathToFileURL(join(process.cwd(), "scripts/lib/driver-env.mjs")).href);

const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA = mkdtempSync(join(tmpdir(), "mz-probe81-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
const report = [];
async function measure(page, label, view) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const scrollers = [...document.querySelectorAll("*")].filter((e) => { const s = getComputedStyle(e); return (s.overflowY === "auto" || s.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 2; });
    const sideways = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} [${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}]`);
    const small = [...document.querySelectorAll("button, a, [role=button], input, select")].filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && (r.height < 44 || r.width < 44); }).map((e) => `${(e.getAttribute("data-testid") || e.textContent || e.tagName).trim().slice(0, 28)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const cards = [...document.querySelectorAll(".mz-solo__card")].map((c) => { const r = c.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; });
    const sc = scrollers[0];
    return { docScrollW: doc.scrollWidth, innerW: window.innerWidth, contentH: sc ? sc.scrollHeight : doc.scrollHeight, sideways, small, cards };
  });
  report.push({ label, view: `${view.width}x${view.height}`, ...m });
}
async function shot(page, name, view) { await sleep(400); await page.screenshot({ path: join(OUT, `${name}-${view.width}x${view.height}.png`) }); }

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(1200);
    await shot(p, "00-home", view); await measure(p, "home", view);
    await p.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await shot(p, "01-shelf", view); await measure(p, "shelf", view);
    await p.getByTestId("solo-start-pattern-pulse").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await shot(p, "02-pulse-ready-r1", view); await measure(p, "pulse-ready-r1", view);
    // Round 1 then the between-pattern ready screen.
    await p.getByTestId("mz-pp-open").click();
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    const pattern = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    await shot(p, "03-pulse-input", view); await measure(p, "pulse-input", view);
    for (const s of pattern) await p.getByTestId(`mz-pp-key-${s}`).click();
    await p.getByTestId("mz-pp-submit").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 });
    await shot(p, "04-pulse-ready-r2", view); await measure(p, "pulse-ready-r2", view);
    await p.getByTestId("solo-leave").click(); await p.getByTestId("solo-leave-yes").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await p.getByTestId("solo-start-math-mayhem").click();
    await p.waitForTimeout(1500);
    await shot(p, "05-math-playing", view); await measure(p, "math-playing", view);
    await ctx.close();
  }
} finally { await browser.close(); srv.kill(); }
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
for (const r of report) console.log(`${r.view} ${r.label}: contentH ${r.contentH} sideways ${r.sideways.length ? r.sideways.join("; ") : "none"} | small(${r.small.length}) ${r.small.slice(0, 5).join(", ")}${r.cards.length ? ` | cards ${JSON.stringify(r.cards)}` : ""}`);
