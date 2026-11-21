// Handoff 7060711859: side-by-side sheets (current app | Option A | Option B) for each phone screen, from the
// screenshots capture-before.mjs and render.mjs wrote (embedded as data URLs: a page set from a string can't load files).
//   node docs/design/compact-options/compare.mjs <beforeDir> <optionsDir> <outDir>
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join as joinPath, resolve } from "node:path";
import { launchChromium } from "../../../scripts/lib/driver-env.mjs";

const [beforeDir, optDir, outDir] = process.argv.slice(2).map((p) => resolve(p));
if (!outDir) { console.error("usage: compare.mjs <beforeDir> <optionsDir> <outDir>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const SHEETS = [];
for (const screen of ["home", "lobby", "picker", "results"]) for (const [w, look] of [[390, "everyday"], [320, "christmas"]]) SHEETS.push({ screen, w, look });
const LABEL = { home: "Home: host and join", lobby: "Lobby (host)", picker: "Game picker", results: "Jebena Rush results" };

const browser = await launchChromium();
try {
  for (const s of SHEETS) {
    const name = `${s.screen}-${s.w}-${s.look}`;
    const cols = [
      { title: "Now", src: joinPath(beforeDir, `${name}.jpg`) },
      { title: "Option A · Compact list", src: joinPath(optDir, "option-a", `${name}.jpg`) },
      { title: "Option B · Focus and sheets", src: joinPath(optDir, "option-b", `${name}.jpg`) },
    ];
    for (const c of cols) if (!existsSync(c.src)) throw new Error(`missing ${c.src}`);
    const dark = s.look === "everyday";
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px 24px 24px;background:${dark ? "#0E0A13" : "#EDE5D6"};color:${dark ? "#F7F1E8" : "#2B211C"};font:600 16px system-ui,sans-serif}
      h1{margin:0 0 14px;font-size:20px} .row{display:flex;gap:24px} figure{margin:0} figcaption{margin:0 0 8px;font-weight:800}
      img{display:block;width:${s.w}px;border-radius:14px;box-shadow:0 0 0 1px ${dark ? "#3A3048" : "#C9BBA6"}}</style>
      <h1>${LABEL[s.screen]} · ${s.w} px · ${s.look === "everyday" ? "Everyday" : "Christmas"} · same content</h1>
      <div class="row">${cols.map((c) => `<figure><figcaption>${c.title}</figcaption><img src="data:image/jpeg;base64,${readFileSync(c.src).toString("base64")}"></figure>`).join("")}</div>`;
    const ctx = await browser.newContext({ viewport: { width: s.w * 3 + 24 * 2 + 48, height: 400 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: joinPath(outDir, `${name}.jpg`), type: "jpeg", quality: 80, fullPage: true });
    await ctx.close();
    console.log("sheet", name);
  }
} finally {
  await browser.close();
}
