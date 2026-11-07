/**
 * npm run content:sprint-sources              fetch every source, refresh snapshots, rewrite the report
 * npm run content:sprint-sources -- --offline rebuild the report from the committed snapshots only
 * npm run content:sprint-sources -- --only <id> refetch one source, keep the other snapshots
 *
 * Category Sprint closed sets: fetch each list from the primary or
 * authoritative source the owner named (2026-11-07), extract the published
 * names, save a snapshot (docs/content-quality-2/sprint-sources/<id>.json),
 * and write docs/content-quality-2/SPRINT_SOURCE_CHECK.md comparing every
 * reference list with its source.
 *
 * NOT a check and not in the gate: it needs the network, and its output is
 * evidence for a human source check, never an approval. It never writes
 * `sourceCheck` on a reference. See docs/TESTING.md ("Scripts that are not checks").
 *
 * Needs: curl, pdftotext (poppler-utils), and the pre-installed Playwright
 * Chromium for pages that only render in a browser. Outbound requests go
 * through the environment's HTTPS proxy.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONTENT_DIR } from "../../src/content/registry.js";
import type { SprintReference } from "../../src/content/schema.js";
import { compareMembership, type Comparison, type Crosswalk, type SnapshotPage, type SourceSnapshot } from "./sprint-source-compare.js";

const ROOT = join(DEFAULT_CONTENT_DIR, "..");
const SNAP_DIR = join(ROOT, "docs", "content-quality-2", "sprint-sources");
const REPORT = join(ROOT, "docs", "content-quality-2", "SPRINT_SOURCE_CHECK.md");
const REF_DIR = join(DEFAULT_CONTENT_DIR, "reference", "sprint");
const PACK = join(DEFAULT_CONTENT_DIR, "packs", "category-sprint-closed.json");
const DRAFT_PACK = join(DEFAULT_CONTENT_DIR, "packs", "category-sprint-closed-drafts.json");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const offline = process.argv.includes("--offline");
/** `-- --only <id>` refetches one source and keeps every other committed snapshot. */
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;

// ------------------------------------------------------------------ fetching

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const ws = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, " ").trim();
const decode = (s: string) => s.replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
const textOf = (html: string) => ws(decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, "\n")));
const linesOf = (html: string) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, "\n")).split("\n").map(ws).filter(Boolean);

function http(url: string): { body: string; page: SnapshotPage } {
  const buf = execFileSync("curl", ["-sS", "-L", "--fail", "-m", "60", "-A", UA, url], { maxBuffer: 64 << 20 });
  return { body: buf.toString("utf8"), page: { url, sha256: sha(buf), bytes: buf.length, via: "http" } };
}
function pdf(url: string): { body: string; page: SnapshotPage } {
  const buf = execFileSync("curl", ["-sS", "-L", "--fail", "-m", "60", "-A", UA, url], { maxBuffer: 64 << 20 });
  const tmp = join(process.env.TMPDIR ?? "/tmp", `sprint-src-${sha(buf).slice(0, 12)}.pdf`);
  writeFileSync(tmp, buf);
  const text = execFileSync("pdftotext", ["-layout", tmp, "-"], { maxBuffer: 64 << 20 }).toString("utf8");
  return { body: text, page: { url, sha256: sha(buf), bytes: buf.length, via: "pdf" } };
}
async function browser(url: string): Promise<{ body: string; page: SnapshotPage }> {
  const { chromium } = await import("playwright");
  // The project pins its own Playwright; use the machine's Chromium when the pinned build is absent.
  const exe = existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {};
  const b = await chromium.launch({ ...exe, ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
  try {
    const p = await b.newPage({ userAgent: UA });
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await p.waitForTimeout(15_000); // these pages fill in from their own APIs after load
    const text = await p.evaluate(() => document.body?.innerText ?? "");
    return { body: text, page: { url, sha256: sha(text), bytes: Buffer.byteLength(text), via: "browser" } };
  } finally { await b.close(); }
}

// UN pages spell seven member states differently from M49; this is the join, not a correction.
const UN_TO_M49: Record<string, string> = {
  "Bahamas (The)": "Bahamas",
  "China (the People's Republic of)": "China",
  "Côte D'Ivoire": "Côte d’Ivoire",
  "Gambia (Republic of The)": "Gambia",
  "Guinea Bissau": "Guinea-Bissau",
  "Lao People’s Democratic Republic": "Lao People's Democratic Republic",
  "Venezuela, Bolivarian Republic of": "Venezuela (Bolivarian Republic of)",
};
async function unMembersAndM49() {
  const un = http("https://www.un.org/en/about-us/member-states");
  const members = [...un.body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => textOf(m[1]!)).filter((n) => n && n !== "Search the United Nations");
  const m49 = http("https://unstats.un.org/unsd/methodology/m49/overview/");
  const table = m49.body.match(/<table[\s\S]*?<\/table>/)![0]; // the first table is the English one
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)
    .map((r) => [...r[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => textOf(c[1]!)));
  const unSet = new Set(members.map((n) => UN_TO_M49[n] ?? n));
  return { pages: [un.page, m49.page], members, unSet, rows };
}

type Source = { id: string; authority: string; extraction: string; blocked?: string; run?: () => Promise<Omit<SourceSnapshot, "id" | "authority" | "fetchedAt" | "extraction">> };

const SOURCES: Source[] = [
  {
    id: "us-states", authority: "U.S. Census Bureau, 2020 state codes file (national_state2020.txt), linked from the ANSI codes page",
    extraction: "STATE_NAME column of every row with STATEFP 01-56, except 11 (District of Columbia); rows above 56 are territories.",
    run: async () => {
      const f = http("https://www2.census.gov/geo/docs/reference/codes2020/national_state2020.txt");
      const rows = f.body.trim().split("\n").slice(1).map((l) => l.split("|"));
      const keep = rows.filter(([, fp]) => Number(fp) <= 56 && fp !== "11");
      return {
        pages: [f.page], published: keep.map((r) => ws(r[3]!)),
        excluded: rows.filter((r) => !keep.includes(r)).map((r) => ({ name: ws(r[3]!), why: r[1] === "11" ? "federal district, not a state" : "territory, not a state" })),
      };
    },
  },
  {
    id: "eu-member-states", authority: "European Union, 'EU countries' (european-union.europa.eu), both result pages",
    extraction: "Link text of every /principles-countries-history/eu-countries/<name>_en link on result pages 1 and 2.",
    run: async () => {
      const base = "https://european-union.europa.eu/principles-countries-history/eu-countries_en";
      const p = [http(base), http(`${base}?page=1`)];
      const names = p.flatMap((x) => [...x.body.matchAll(/href="\/principles-countries-history\/eu-countries\/[a-z-]+_en"[^>]*>(?:\s*<[^>]+>)*\s*([^<]+?)\s*</g)].map((m) => ws(decode(m[1]!))));
      return { pages: p.map((x) => x.page), published: [...new Set(names)] };
    },
  },
  {
    id: "un-members-africa", authority: "United Nations DGACM, 'Regional groups of Member States': African States",
    extraction: "Every name between the 'African States' heading and the 'Asia-Pacific States' heading (the page lays names out in three columns; order is not alphabetical).",
    run: async () => {
      const f = http("https://www.un.org/dgacm/en/content/regional-groups");
      const lines = linesOf(f.body.slice(f.body.indexOf("<body")));
      const a = lines.indexOf("African States"), b = lines.indexOf("Asia-Pacific States");
      return { pages: [f.page], published: lines.slice(a + 1, b).sort((x, y) => x.localeCompare(y)) };
    },
  },
  {
    id: "chemical-elements", authority: "IUPAC Periodic Table of the Elements (PDF, version dated 4 May 2022), linked from iupac.org",
    extraction: "pdftotext -layout; every line made only of lowercase words is an element-name row (the key's words name/atomic/number/symbol/abridged/standard/weight are dropped).",
    run: async () => {
      const f = pdf("https://iupac.org/wp-content/uploads/2022/07/IUPAC_Periodic_Table-04May22_CRA.pdf");
      const stop = new Set(["name", "atomic", "number", "symbol", "abridged", "standard", "weight", "Key:"]);
      const names: string[] = [];
      for (const l of f.body.split("\n")) {
        const t = l.trim().split(/\s+/).filter((x) => x && !stop.has(x));
        if (t.length && t.every((x) => /^[a-z]+$/.test(x))) names.push(...t);
      }
      return { pages: [f.page], published: names };
    },
  },
  {
    id: "iau-planets-dwarf-planets", authority: "NASA Science, 'Planets' overview (the IAU page named in the old reference now returns 404)",
    extraction: "Names in the page's 'Explore <body>' links, in page order; the page states 'eight planets, and five officially recognized dwarf planets' and lists the dwarf planets as 'Ceres, Pluto, Haumea, Makemake, and Eris'.",
    run: async () => {
      const f = http("https://science.nasa.gov/solar-system/planets/");
      const t = textOf(f.body);
      if (!/eight planets, and five officially recognized dwarf planets/.test(t)) throw new Error("NASA page no longer states eight planets and five dwarf planets");
      const names = [...new Set([...t.matchAll(/Explore ([A-Z][a-z]+)/g)].map((m) => m[1]!))].filter((n) => !["Search", "This"].includes(n));
      return { pages: [f.page], published: names };
    },
  },
  {
    id: "south-america-sovereign", authority: "UN Statistics Division M49 (South America), joined with the UN member-state list for the sovereign-state criterion",
    extraction: "M49 overview, English table: 'Country or Area' where 'Intermediate Region Name' is South America; kept only if it is a UN member state (un.org member-states page, with seven UN spellings mapped to M49's).",
    run: async () => {
      const u = await unMembersAndM49();
      const sa = u.rows.filter((r) => r[7] === "South America").map((r) => r[8]!);
      return { pages: u.pages, published: sa.filter((n) => u.unSet.has(n)), excluded: sa.filter((n) => !u.unSet.has(n)).map((name) => ({ name, why: "not a UN member state (a territory)" })) };
    },
  },
  {
    // Britannica (the first source named) answers automated requests with a
    // Cloudflare bot challenge; the owner named this UN publication instead (2026-11-07).
    id: "chinese-zodiac", authority: "United Nations, 'The Chinese Zodiac: In Praise of the Jade Rabbit' (Chinese Language Day 2023 exhibition introduction)",
    extraction: "PDF text; the sentence 'In order, the 12 animals of the Chinese zodiac, also known as Shengxiao (\"生肖\"), are: …', split on commas and the final 'and'.",
    run: async () => {
      const f = pdf("https://www.un.org/sites/un2.un.org/files/2023/04/the_chinese_zodiac_introduction.pdf");
      const t = f.body.replace(/\s+/g, " ");
      const m = /In order, the 12 animals of the Chinese zodiac,[^:]*are: ([^.]+)\./.exec(t);
      if (!m) throw new Error("UN zodiac PDF no longer contains the 'In order, the 12 animals' sentence");
      return { pages: [f.page], published: m[1]!.split(/, | and /).map(ws).filter(Boolean) };
    },
  },
  // ---- candidates for the new draft batch (not official; see the draft pack)
  {
    id: "un-members-asia", authority: "UN Statistics Division M49 (Asia), joined with the UN member-state list",
    extraction: "M49 overview, English table: 'Country or Area' where 'Region Name' is Asia; kept only if it is a UN member state (as for South America).",
    run: async () => {
      const u = await unMembersAndM49();
      const asia = u.rows.filter((r) => r[3] === "Asia").map((r) => r[8]!);
      return { pages: u.pages, published: asia.filter((n) => u.unSet.has(n)), excluded: asia.filter((n) => !u.unSet.has(n)).map((name) => ({ name, why: /State of Palestine/.test(name) ? "UN non-member observer state, not a member state" : "special administrative region of China, not a member state" })) };
    },
  },
  {
    id: "fifa-world-cup-2026-teams", authority: "FIFA, FIFA World Cup 2026 'Teams & Stats' page (tournament completed)",
    extraction: "Rendered in a browser; every line directly above a 'Final position' line is a team name (3 hosts and 45 qualified teams).",
    run: async () => {
      const f = await browser("https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams");
      const lines = f.body.split("\n").map(ws).filter(Boolean);
      const names = lines.flatMap((l, i) => (lines[i + 1] === "Final position" ? [l] : []));
      return { pages: [f.page], published: [...new Set(names)] };
    },
  },
  {
    id: "nfl-teams", authority: "NFL, 'NFL Football Teams' (nfl.com/teams)",
    extraction: "Rendered in a browser; every line directly above a 'VIEW PROFILE VIEW FULL SITE' line is a team name.",
    run: async () => {
      const f = await browser("https://www.nfl.com/teams/");
      const lines = f.body.split("\n").map(ws).filter(Boolean);
      const names = lines.flatMap((l, i) => (/^VIEW PROFILE/.test(lines[i + 1] ?? "") ? [l] : []));
      return { pages: [f.page], published: [...new Set(names)] };
    },
  },
  {
    id: "us-presidents", authority: "The White House, 'The Presidential Walk of Fame' (whitehouse.gov/presidents)",
    extraction: "The page's own data: every `{ n:<number>, name:\"<name>\"` entry, in order; a person who served two non-consecutive terms has two plaques and is listed once.",
    run: async () => {
      const f = http("https://www.whitehouse.gov/presidents/");
      const plaques = [...f.body.matchAll(/\{\s*n:(\d+),\s*name:"([^"]+)"/g)].map((m) => ({ n: Number(m[1]), name: ws(m[2]!) }));
      if (!plaques.length) throw new Error("no presidents found in the page data");
      const names = [...new Set(plaques.map((p) => p.name))];
      const twice = names.filter((n) => plaques.filter((p) => p.name === n).length > 1);
      return { pages: [f.page], published: names, excluded: twice.map((name) => ({ name: `${name} (second plaque)`, why: "same person, second non-consecutive term" })) };
    },
  },
  {
    id: "pokemon-generation-1", authority: "The Pokémon Company, official Pokédex (pokemon.com)",
    extraction: "Not extracted.",
    blocked: "www.pokemon.com returns HTTP 403 to automated requests and an empty page in a headless browser. Not worked around. See the report for the separate matching problem (Nidoran).",
  },
];

// ------------------------------------------------------------------ crosswalks and notes

/**
 * Where the source's name for a member differs from the reference's in more than
 * spelling and no item alias covers it. Each needs a person to confirm.
 */
const CROSSWALK: Record<string, Crosswalk[]> = (() => {
  const j = JSON.parse(readFileSync(join(SNAP_DIR, "crosswalk.json"), "utf8")) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(j).filter(([k]) => !k.startsWith("_"))) as Record<string, Crosswalk[]>;
})();

/** Questionable or ambiguous entries a reviewer should look at, whatever the diff says. */
const NOTES: Record<string, string[]> = {
  "un-members-africa": [
    "**Congo (owner ruling 2026-11-07).** The UN lists two members: 'Congo' (capital Brazzaville) and 'Democratic Republic of the Congo' (capital Kinshasa). The UN's short name 'Congo' is shown as 'Republic of the Congo' (crosswalk). In Cups created under answer rules 2, a bare 'Congo' is ambiguous and scores nothing; results tell the player to type Republic of the Congo (Congo-Brazzaville) or DR Congo (Congo-Kinshasa). Cups created earlier keep scoring a bare 'Congo' as the Republic, from the item's frozen `answerRules1` copy.",
    "**Côte d'Ivoire.** The regional-groups page writes Côte d'Ivoire; the member-states page writes Côte D'Ivoire. Both normalise to the same answer. 'Ivory Coast' is accepted by alias.",
    "**Tanzania.** The UN's name is 'United Republic of Tanzania'. The reference now uses the UN form; 'Tanzania' is accepted by alias.",
    "**Not members:** Western Sahara, Somaliland. Both stay as known non-answers with reasons.",
    "**Morocco** is listed (it is a UN member in the African group).",
  ],
  "eu-member-states": ["**Czechia / Czech Republic**, **Netherlands / Holland**: accepted by alias. 'Holland' strictly names two provinces; it is accepted as the common English name, and the editor confirms that ruling.", "**United Kingdom** left in 2020; it stays a known non-answer."],
  "chemical-elements": ["**IUPAC spellings** are aluminium, caesium and sulfur. US 'aluminum', 'cesium' and British 'sulphur' are accepted by alias."],
  "us-states": ["**District of Columbia** and the territories (Puerto Rico, Guam, ...) are not states. The Census file lists them; they are excluded with reasons, and DC and Puerto Rico are known non-answers."],
  "south-america-sovereign": ["**French Guiana** is part of France and the **Falkland Islands** are a British Overseas Territory under M49; both are excluded by the sovereign-state criterion and are known non-answers.", "M49 names Bolivia and Venezuela by their full official forms; the short forms are accepted by alias."],
  "us-presidents": [
    "**Not usable as the reference.** The White House page's entry for the 46th president (2021–2025) reads 'AUTOPEN' instead of a name, so its list is not a neutral, complete membership source. No category was built from it, and the missing name was not filled in from memory. A different authority (for example the National Archives or the Library of Congress) would be needed, plus an editor's call on whether a presidents category suits a family game night.",
    "Other issues for any presidents list: five surnames are shared by two presidents (Adams, Harrison, Johnson, Roosevelt, Bush), so surname-only answers need a ruling; Grover Cleveland and Donald J. Trump each served two non-consecutive terms (45 people, 47 presidencies).",
  ],
  "pokemon-generation-1": [
    "**Matching problem, independent of the source.** The original 151 include two Pokémon named Nidoran (♀ and ♂). The matcher keeps letters only, so both normalise to `nidoran` and the closed-set check rejects the list (two members, one answer). Building this category needs a matcher or schema change (per-member answer keys), which is out of scope.",
    "**Also:** Mr. Mime and Farfetch'd normalise acceptably (`mr mime`, `farfetch d`), but 151 names with idiosyncratic spellings make typing errors likely; typo tolerance (length >= 6, one edit) covers some.",
  ],
  "chinese-zodiac": ["**Source (owner-named, 2026-11-07):** the UN publication 'The Chinese Zodiac: In Praise of the Jade Rabbit', which lists the twelve animals in order. Britannica, named first, answers automated requests with a bot challenge and was not used.", "The UN text names the sign 羊 'Goat' and 鸡 'Rooster'. The aliases (Sheep, Ram, Chicken, Cockerel, Boar, Hare, Mouse) are editorial choices this source does not settle; the editor confirms them."],
  "iau-planets-dwarf-planets": ["The old reference URL (iau.org/public/themes/pluto/) now returns 404. NASA's page states the IAU recognises these five dwarf planets; IAU is still the authority for the definition.", "**Pluto** is a member (as a dwarf planet)."],
};

// ------------------------------------------------------------------ main

function loadSnapshot(id: string): (SourceSnapshot & { blocked?: string }) | undefined {
  const p = join(SNAP_DIR, `${id}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
}

async function refresh() {
  mkdirSync(SNAP_DIR, { recursive: true });
  for (const s of SOURCES.filter((x) => !only || x.id === only)) {
    const fetchedAt = new Date().toISOString().slice(0, 10);
    if (s.blocked || !s.run) {
      writeFileSync(join(SNAP_DIR, `${s.id}.json`), JSON.stringify({ id: s.id, authority: s.authority, fetchedAt, blocked: s.blocked, extraction: s.extraction, pages: [], published: [] }, null, 2) + "\n");
      console.log(`${s.id}: BLOCKED`);
      continue;
    }
    try {
      const r = await s.run();
      const snap: SourceSnapshot = { id: s.id, authority: s.authority, fetchedAt, extraction: s.extraction, ...r };
      writeFileSync(join(SNAP_DIR, `${s.id}.json`), JSON.stringify(snap, null, 2) + "\n");
      console.log(`${s.id}: ${snap.published.length} names`);
    } catch (e) {
      console.error(`${s.id}: FETCH FAILED: ${(e as Error).message.split("\n")[0]}`);
      process.exitCode = 1;
    }
  }
}

interface ItemLike { id: string; membership?: { reference: string }; aliases?: Record<string, { to: string; reason: string }>; eligibility: string }
function items(): ItemLike[] {
  const out: ItemLike[] = [];
  for (const f of [PACK, DRAFT_PACK]) if (existsSync(f)) out.push(...(JSON.parse(readFileSync(f, "utf8")).items as ItemLike[]));
  return out;
}

function report() {
  const refs = new Map(readdirSync(REF_DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const r = JSON.parse(readFileSync(join(REF_DIR, f), "utf8")) as SprintReference;
    return [r.id, r] as const;
  }));
  const its = items();
  const L: string[] = [
    "# Category Sprint closed sets: source comparison (generated)",
    "",
    "Generated by `npm run content:sprint-sources` (`scripts/content-quality/sprint-sources.ts`); `-- --offline` rebuilds it from the committed snapshots in [`sprint-sources/`](sprint-sources/). Do not edit by hand.",
    "",
    "**This is a machine comparison, not a source check.** It shows exactly what each source publishes next to each reference list. A person still compares and signs the reference's `sourceCheck`; until then the loader refuses any real approval of the item.",
    "",
    "Match kinds: **exact** (same text); **spelling** (written differently, same canonical answer); **alias** (the source's name is one of the item's accepted aliases); **crosswalk** (an editor-documented name mapping). **Omission**: in the source, not in our list. **Extra**: in our list, not in the source.",
    "",
    "| List | Source fetched | Published | Ours | Exact | Spelling | Alias | Crosswalk | Omissions | Extras | Verdict |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const detail: string[] = [];
  const ids = [...new Set([...SOURCES.map((s) => s.id), ...refs.keys()])];
  for (const id of ids) {
    const snap = loadSnapshot(id);
    const ref = refs.get(id);
    if (!snap) { L.push(`| \`${id}\` | no snapshot | | ${ref?.members.length ?? ""} | | | | | | | not compared |`); continue; }
    if (snap.blocked) {
      L.push(`| \`${id}\` | **blocked** | | ${ref?.members.length ?? "-"} | | | | | | | **not verified** |`);
      detail.push(`## \`${id}\`: blocked`, "", `**Source:** ${snap.authority}.`, "", snap.blocked, "", ...(NOTES[id] ?? []).map((n) => `- ${n}`), "");
      continue;
    }
    if (!ref) {
      L.push(`| \`${id}\` | ${snap.fetchedAt} | ${snap.published.length} | (no reference) | | | | | | | **not used** |`);
      detail.push(`## \`${id}\`: fetched, not used`, "", `**Source:** ${snap.authority}. Fetched ${snap.fetchedAt}.`, ...snap.pages.map((p) => `- ${p.url} (${p.via}, ${p.bytes} bytes)`), "",
        `**Published (${snap.published.length}):** ${snap.published.join(", ")}`, "", ...(NOTES[id] ?? []).map((n) => `- ${n}`), "");
      continue;
    }
    const item = its.find((i) => i.membership?.reference === id);
    const c: Comparison = compareMembership({ snapshot: snap, members: ref.members, declaredCount: ref.source.publishedCount, aliases: item?.aliases, crosswalk: CROSSWALK[id] });
    const n = (k: string) => c.matches.filter((m) => m.kind === k).length;
    L.push(`| \`${id}\` | ${snap.fetchedAt} | ${c.publishedCount} | ${c.referenceCount} | ${n("exact")} | ${n("spelling")} | ${n("alias")} | ${n("crosswalk")} | ${c.omissions.length} | ${c.extras.length} | ${c.verdict === "matches source" ? "matches source" : "**differs**"} |`);
    detail.push(`## \`${id}\`: ${c.verdict}`, "");
    detail.push(`**Source:** ${snap.authority}. Fetched ${snap.fetchedAt}.`);
    for (const p of snap.pages) detail.push(`- ${p.url} (${p.via}, ${p.bytes} bytes, sha256 \`${p.sha256.slice(0, 16)}…\`)`);
    detail.push("", `**Extraction:** ${snap.extraction}`, "");
    detail.push(`**Counts:** source publishes ${c.publishedCount}; our list has ${c.referenceCount}; the reference declares ${c.declaredCount}. ${ref.sourceCheck ? `Human source check: ${ref.sourceCheck.by}, ${ref.sourceCheck.date}.` : "No human source check recorded."}`, "");
    const sp = c.matches.filter((m) => m.kind !== "exact");
    if (sp.length) {
      detail.push("| Source writes | Our member | How it matches |", "|---|---|---|");
      for (const m of sp) detail.push(`| ${m.source} | ${m.member} | ${m.kind}${m.kind === "alias" ? ` (\`${m.alias}\`)` : m.kind === "crosswalk" ? `: ${m.reason}` : ""} |`);
      detail.push("");
    } else detail.push("Every name matches exactly.", "");
    if (c.omissions.length) detail.push(`**Omissions (in the source, not ours):** ${c.omissions.join(", ")}`, "");
    if (c.extras.length) detail.push(`**Extras (ours, not in the source):** ${c.extras.join(", ")}`, "");
    if (c.collisions.length) detail.push(`**Collisions:** ${c.collisions.join("; ")}`, "");
    if (snap.excluded?.length) detail.push(`**Excluded by the stated criterion:** ${snap.excluded.map((e) => `${e.name} (${e.why})`).join("; ")}`, "");
    const al = Object.entries(item?.aliases ?? {});
    if (al.length) detail.push(`**Aliases (${item!.id}):** ${al.map(([k, v]) => `\`${k}\` → \`${v.to}\` (${v.reason})`).join("; ")}`, "");
    if (NOTES[id]?.length) detail.push("**Questionable or ambiguous entries:**", "", ...NOTES[id]!.map((x) => `- ${x}`), "");
  }
  writeFileSync(REPORT, [...L, "", ...detail].join("\n"));
  console.log("wrote docs/content-quality-2/SPRINT_SOURCE_CHECK.md");
}

if (!offline) await refresh();
report();
