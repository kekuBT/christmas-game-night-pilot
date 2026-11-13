// Stage 11.2 (docs/stage11/stage112.md; D-S112-01..03): readable casual Memory Books.
// A casual entry carries no "Day 1" and is identified by its game; a Cup entry shows its game's own day (also when it's
// added on a later day); exports print names, never internal ids; the mode and names come from the server, never the
// request; typed text can't inject Markdown or HTML; older books load unchanged.
import { afterEach, describe, expect, it } from "vitest";
import { MemoryBook, MemorySourceSchema } from "../src/server/memorybook.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { bookModeOf, entryDayLabel, entryFactLines, entryLabel, entryMode, mdEscape, NO_NAME, pdfLoses, pdfText, type PresentableEntry } from "../src/shared/memoryPresent.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

const entry = (over: Partial<PresentableEntry> = {}): PresentableEntry => ({ day: 1, sourceEventIds: ["evt-1"], derivedFacts: [], ...over });
const names: Record<string, string> = { "player-1": "Keku", "player-2": "Amina" };
const nameOf = (id: string) => names[id];

describe("the shared presentation rule (src/shared/memoryPresent.ts)", () => {
  it("mode: a room's kind; solo counts as casual; a recorded source wins", () => {
    expect([bookModeOf("cup"), bookModeOf("casual"), bookModeOf("solo"), bookModeOf(undefined)]).toEqual(["cup", "casual", "casual", "cup"]);
    expect(entryMode(entry(), { roomKind: "casual" })).toBe("casual");
    expect(entryMode(entry({ source: { mode: "cup", titles: [] } }), { roomKind: "casual" })).toBe("cup");
  });
  it("day label: a Cup entry's game day(s) as recorded; never one for a casual entry", () => {
    expect(entryDayLabel(entry({ day: 3, source: { mode: "cup", days: [1], titles: [] } }), { roomKind: "cup" })).toBe("Day 1");
    expect(entryDayLabel(entry({ source: { mode: "cup", days: [2, 1, 2], titles: [] } }), { roomKind: "cup" })).toBe("Days 1, 2");
    expect(entryDayLabel(entry({ day: 1 }), { roomKind: "casual", sourceGames: () => [{ title: "Trivia", day: 1 }] })).toBeNull();
    expect(entryDayLabel(entry({ day: 1, source: { mode: "casual", titles: ["Trivia Showdown"] } }), { roomKind: "cup" })).toBeNull();
  });
  it("older Cup entry (review 6851031292, D-S112-05): its day comes from the same room's citation, never its stored day", () => {
    // Stored on Day 2 (the day it was added) about a game the room recorded on Day 1.
    const legacy = entry({ day: 2, sourceEventIds: ["evt-7"] });
    expect(entryDayLabel(legacy, { roomKind: "cup", sourceGames: () => [{ title: "Trivia Showdown", day: 1 }] })).toBe("Day 1");
    // A recorded day still wins over the citation (it was verified when the entry was made).
    expect(entryDayLabel(entry({ day: 2, source: { mode: "cup", days: [2], titles: [] } }), { roomKind: "cup", sourceGames: () => [{ day: 1 }] })).toBe("Day 2");
    // Unverifiable: no citation context, a cited finish the room doesn't have, a game without a day, or one of two
    // cited games missing. Then there's no day label at all, never the stored day.
    expect(entryDayLabel(legacy, { roomKind: "cup" })).toBeNull();
    expect(entryDayLabel(legacy, { roomKind: "cup", sourceGames: () => [{}] })).toBeNull();
    expect(entryDayLabel(legacy, { roomKind: "cup", sourceGames: () => [{ title: "Trivia Showdown" }] })).toBeNull();
    expect(entryDayLabel(entry({ day: 2, sourceEventIds: ["evt-7", "evt-9"] }), { roomKind: "cup", sourceGames: () => [{ day: 1 }, {}] })).toBeNull();
    // Without a day, the label falls back to the citation's title, then "A game".
    expect(entryLabel(legacy, { roomKind: "cup", nameOf, sourceGames: () => [{ title: "Trivia Showdown" }] })).toBe("Trivia Showdown");
    expect(entryLabel(legacy, { roomKind: "cup", nameOf, sourceGames: () => [{}] })).toBe("A game");
  });
  it("label: Day N for Cup, the game's title for casual (recorded, else the room's citation), else \"A game\"", () => {
    const ctx = { roomKind: "casual", nameOf };
    expect(entryLabel(entry({ source: { mode: "casual", titles: ["Jebena Rush"] } }), ctx)).toBe("Jebena Rush");
    expect(entryLabel(entry(), { ...ctx, sourceGames: () => [{ title: "Math Mayhem", day: 1 }] })).toBe("Math Mayhem");
    expect(entryLabel(entry(), ctx)).toBe("A game");
    expect(entryLabel(entry({ day: 2 }), { roomKind: "cup", nameOf, sourceGames: () => [{ title: "Trivia", day: 2 }] })).toBe("Day 2");
  });
  it("facts: recorded names, else the room's players, else \"A player\" — never an id; the points exactly as stored", () => {
    const facts = ["player-1: 480 points", "player-2: 360 points", "player-9: 0 points", "unknown: 5 points"];
    expect(entryFactLines(entry({ derivedFacts: facts }), { nameOf })).toEqual(["Keku: 480 points", "Amina: 360 points", `${NO_NAME}: 0 points`, `${NO_NAME}: 5 points`]);
    const recorded = entry({ derivedFacts: facts.slice(0, 2), source: { mode: "casual", titles: ["Trivia"], scores: [{ playerId: "player-1", name: "Kéku 🎄", points: 480 }, { playerId: "player-2", name: null, points: 360 }] } });
    // A recorded null (not a player when the entry was made) falls back to the room's lookup.
    expect(entryFactLines(recorded, { nameOf })).toEqual(["Kéku 🎄: 480 points", "Amina: 360 points"]);
    expect(entryFactLines(recorded, { nameOf: () => undefined })).toEqual(["Kéku 🎄: 480 points", `${NO_NAME}: 360 points`]);
  });
  it("a recorded score that disagrees with its fact is ignored (the stored fact wins)", () => {
    const e = entry({ derivedFacts: ["player-1: 480 points"], source: { mode: "casual", titles: [], scores: [{ playerId: "player-2", name: "Impostor", points: 999 }] } });
    expect(entryFactLines(e, { nameOf })).toEqual(["Keku: 480 points"]);
  });
  it("one name on two different players becomes \"Ada\" and \"Ada (2)\", in id order (deterministic)", () => {
    const e = entry({ derivedFacts: ["player-10: 1 points", "player-2: 2 points"], source: { mode: "casual", titles: [], scores: [{ playerId: "player-10", name: "Ada", points: 1 }, { playerId: "player-2", name: "Ada", points: 2 }] } });
    expect(entryFactLines(e, { nameOf })).toEqual(["Ada (2): 1 points", "Ada: 2 points"]);
  });
  it("a team entry's line is kept as it is; a line in another form passes through", () => {
    expect(entryFactLines(entry({ team: {}, derivedFacts: ["Spectrum team result: 27 out of 40 · all 4 rounds played"] }), { nameOf })).toEqual(["Spectrum team result: 27 out of 40 · all 4 rounds played"]);
    expect(entryFactLines(entry({ derivedFacts: ["no score here"] }), { nameOf })).toEqual(["no score here"]);
  });
  it("mdEscape: one line, and no heading, link, image, code, emphasis or HTML can be made", () => {
    const evil = "## Day 99\n[click](http://x) ![img](y) `code` *b* _i_ <script>alert(1)</script> | a & b ~~s~~";
    const out = mdEscape(evil);
    expect(out).not.toMatch(/\n/);
    for (const ch of ["#", "[", "]", "`", "*", "_", "<", ">", "|", "&", "~"]) {
      expect(out.split(ch).length - 1).toBe(out.split(`\\${ch}`).length - 1); // every such character is escaped
    }
    expect(out).toContain("\\[click\\](http://x)"); // "(" after an escaped "]" is plain text: no link
    expect(out).toContain("!\\[img\\](y)"); // and "!" before an escaped "[" is no image
  });
  it("mdEscape keeps readable punctuation readable: a Spectrum early-ending line exports verbatim (targeted gate 20261113-111520-9e85bd5f-5011, check-spectrum M3)", () => {
    const early = "Spectrum team result: 9 out of 40 · ended early, 1 of 4 rounds played (fewer than two players were left)";
    expect(mdEscape(early)).toBe(early);
    expect(mdEscape("What a night! (Again.)")).toBe("What a night! (Again.)");
    const book = new MemoryBook();
    const e = book.addFromLedger(1, "Cut short", ["evt-1"], [{ eventId: "evt-1", type: "game-finished", gameInstanceId: "g1" } as never]);
    // Shaped like a Spectrum entry (its line is the server's own team line), approved.
    Object.assign(book.entries.find((x) => x.id === e.id)!, { derivedFacts: [early], team: {}, approved: true });
    expect(book.exportMarkdown("Den")).toContain(`Note: Cut short\nFrom the game:\n- ${early}`);
  });
});

describe("PDF text: every line printable by the PDF's built-in font (D-S112-04)", () => {
  /** The text operators jsPDF writes for `s` on one page. A NUL byte means it fell back to two-byte text. */
  const pdfOps = (s: string) => {
    const doc = new jsPDF();
    doc.text(s, 10, 10);
    return Buffer.from(doc.output("arraybuffer")).toString("latin1").split("\n").filter((l) => / Tj$/.test(l)).join("\n");
  };
  const hard = ["李雷: 120 points", "Łukasz: 30 points", "Şule", "Ἀθηνᾶ", "Amani 🎄", "Ёлка", "👨‍👩‍👧 night", "é (decomposed)"];
  it("control: unmapped, any character outside Windows-1252 garbles the whole line, its points included", () => {
    expect(pdfOps("From the ledger: 李雷: 120 points")).toContain("\u0000");
    expect(pdfOps("From the ledger: Łukasz: 30 points")).toContain("\u0000");
  });
  it("mapped: no line ever falls back to two-byte text, and the rest of the line survives", () => {
    for (const s of hard) {
      const ops = pdfOps(`From the ledger: ${pdfText(s)}`);
      expect(ops, s).not.toContain("\u0000");
    }
    expect(pdfText("李雷: 120 points")).toBe("??: 120 points");
    expect(pdfText("Łukasz")).toBe("?ukasz");
    expect(pdfText("Amani 🎄")).toBe("Amani ?");
    expect(pdfText("é")).toBe("é"); // NFC first: a decomposed accent is printable
  });
  it("kept: Latin-1 and every Windows-1252 extra (curly quotes, dashes, €, Š, Œ, …) print as themselves", () => {
    const kept = "Zoë ñ ß Keku’s “quoted” a—b a–b €5 Šárka Œuvre … • ™ Ÿ";
    expect(pdfText(kept)).toBe(kept);
    expect(pdfLoses(kept)).toBe(false);
    expect(pdfOps(kept)).not.toContain("\u0000");
    expect(pdfLoses("李雷")).toBe(true);
  });
  it("names that print alike stay apart: the duplicate rule runs on the printed names, in id order", () => {
    const e = entry({ derivedFacts: ["player-1: 30 points", "player-2: 20 points", "player-3: 10 points"], source: { mode: "casual", titles: [], scores: [
      { playerId: "player-1", name: "李雷", points: 30 }, { playerId: "player-2", name: "王芳", points: 20 }, { playerId: "player-3", name: "Keku", points: 10 }] } });
    expect(entryFactLines(e, { nameOf }, { printable: pdfText })).toEqual(["??: 30 points", "?? (2): 20 points", "Keku: 10 points"]);
    expect(entryFactLines(e, { nameOf })).toEqual(["李雷: 30 points", "王芳: 20 points", "Keku: 10 points"]); // screen and Markdown: in full
  });
});

describe("restore: an older book is unchanged; an invalid recorded source is dropped, not fatal (D-S112-03)", () => {
  it("restores older entries exactly, keeps a valid source, drops an invalid one", () => {
    const old = { id: "book-1", day: 1, type: "game-result", text: "Old", sourceEventIds: ["evt-1"], approved: true, derivedFacts: ["player-1: 30 points"] };
    const good = { ...old, id: "book-2", source: { mode: "casual", titles: ["Trivia Showdown"], scores: [{ playerId: "player-1", name: "Keku", points: 30 }] } };
    const bad = { ...old, id: "book-3", source: { mode: "weekly", titles: "nope", extra: 1 } };
    const book = MemoryBook.fromJSON({ entries: [old, good, bad], next: 4 });
    expect(book.entries[0]).toEqual(old);
    expect(book.entries[1]!.source).toEqual(good.source);
    expect(book.entries[2]!.source).toBeUndefined();
    expect(MemorySourceSchema.safeParse(bad.source).success).toBe(false);
  });
  it("after restore, presentation data can't override the stored score facts (review 6851031292)", () => {
    const facts = ["player-1: 30 points", "player-2: 20 points"];
    const forged = {
      id: "book-1", day: 1, type: "game-result", text: "Forged names", sourceEventIds: ["evt-1"], approved: true, derivedFacts: facts,
      // Wrong points for player-1, a different player in player-2's slot, and an extra row with no fact.
      source: { mode: "casual", titles: ["Trivia Showdown"], scores: [
        { playerId: "player-1", name: "Impostor", points: 999 }, { playerId: "player-9", name: "Ghost", points: 20 }, { playerId: "player-3", name: "Extra", points: 50 }] },
    };
    const book = MemoryBook.fromJSON({ entries: [forged], next: 2 });
    expect(book.entries[0]!.derivedFacts).toEqual(facts); // the stored facts, untouched
    const md = book.exportMarkdown("Den", { roomKind: "casual", nameOf });
    const lines = md.split("\n").filter((l) => l.startsWith("- "));
    // Exactly one line per stored fact, in order, with the stored points; names from the room, since no record agrees.
    expect(lines).toEqual(["- Keku: 30 points", "- Amina: 20 points"]);
    expect(md).not.toMatch(/Impostor|Ghost|Extra|999|50 points/);
  });
});

// ---- over HTTP ----
async function newRoom(h: Harness, kind?: "casual"): Promise<void> {
  const r = await h.post("/rooms", { name: "Book <night> #1", ...(kind ? { kind } : {}) });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
}
/** A Jebena Rush match the guest leaves (the host wins by her leaving): a finished competitive casual game. */
async function jebena(h: Harness, host: Player, guest: Player): Promise<string> {
  const s = await h.startGame(host, "jebena-rush", { official: false });
  expect(s.status).toBe(201);
  const gid = s.body["gameId"] as string;
  for (const p of [host, guest]) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  expect((await h.intent(guest, gid, "abstain", {}))["accepted"]).toBe(true);
  expect(h.game(gid).status).toBe("finished");
  return gid;
}
/** A practice Trivia game in a Cup room that everyone sits out: finished, on the room's current day. */
async function cupTrivia(h: Harness, host: Player, guest: Player): Promise<string> {
  const s = await h.startGame(host, "trivia", { official: false });
  expect(s.status).toBe(201);
  const gid = s.body["gameId"] as string;
  for (const p of [host, guest]) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  for (const p of [host, guest]) await h.intent(p, gid, "abstain", {});
  expect(h.game(gid).status).toBe("finished");
  return gid;
}
const save = (h: Harness, p: Player, body: Json) => h.post(`/rooms/${h.roomId}/memory`, { day: 1, ...body }, p.token);
const approve = (h: Harness, p: Player, id: string) => h.post(`/rooms/${h.roomId}/memory/${id}/approve`, {}, p.token);
const exportMd = async (h: Harness, p: Player) => ((await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": p.token })).body["markdown"] as string);

describe("over HTTP", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });
  async function seats(kind?: "casual", hostName = "Keku", guestName = "Amina") {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    await newRoom(h, kind);
    const host = await h.join(hostName, { host: true });
    const guest = await h.join(guestName);
    return { h, host, guest };
  }

  it("two casual games: each entry records casual, its game, and its players' names; the Markdown has no Day and no ids", async () => {
    const { h, host, guest } = await seats("casual");
    const g1 = await jebena(h, host, guest);
    const g2 = await jebena(h, host, guest);
    const e1 = await save(h, guest, { fromGame: g1, text: "First cup", requestId: "s112-0001-aaaa" });
    const e2 = await save(h, guest, { fromGame: g2, text: "Second cup", requestId: "s112-0002-bbbb" });
    expect([e1.status, e2.status]).toEqual([201, 201]);
    for (const [e, gid] of [[e1, g1], [e2, g2]] as const) {
      const src = e.body["source"] as Json;
      expect(src["mode"]).toBe("casual");
      expect(src["days"]).toBeUndefined();
      expect(src["titles"]).toEqual(["Jebena Rush"]);
      const facts = e.body["derivedFacts"] as string[];
      expect(facts.every((f) => /^player-\d+: \d+ points$/.test(f))).toBe(true); // stored facts unchanged
      expect((src["scores"] as Json[]).map((s) => s["name"]).sort()).toEqual(["Amina", "Keku"]);
      expect(h.engine().ledger.some((x) => x.type === "game-finished" && x.gameInstanceId === gid && (e.body["sourceEventIds"] as string[]).includes(x.eventId))).toBe(true);
    }
    expect((await approve(h, host, e1.body["id"] as string)).status).toBe(200);
    expect((await approve(h, host, e2.body["id"] as string)).status).toBe(200);
    const md = await exportMd(h, guest);
    expect(md).not.toMatch(/Day \d/);
    expect(md).not.toMatch(/player-\d/);
    expect(md.match(/^## Jebena Rush$/gm)).toHaveLength(2);
    expect(md).toMatch(/^- Keku: \d+ points$/m);
    expect(md).toMatch(/^- Amina: \d+ points$/m);
  });

  it("nothing about the source comes from the request: a forged source and day are ignored", async () => {
    const { h, host, guest } = await seats("casual");
    const g = await jebena(h, host, guest);
    const r = await save(h, guest, { fromGame: g, text: "Forged", requestId: "s112-0003-cccc", day: 5, source: { mode: "cup", days: [5], titles: ["Fake"], scores: [] } });
    expect(r.status).toBe(201);
    expect(r.body["day"]).toBe(1);
    expect(r.body["source"]).toMatchObject({ mode: "casual", titles: ["Jebena Rush"] });
    expect((r.body["source"] as Json)["days"]).toBeUndefined();
  });

  it("a Cup entry shows its game's own day, also when it's added after the day moved on", async () => {
    const { h, host, guest } = await seats();
    const g1 = await cupTrivia(h, host, guest); // Day 1
    expect((await h.post(`/rooms/${h.roomId}/day`, {}, host.token)).body["day"]).toBe(2);
    // Added on Day 2 (the page sends its current day, 2) about the Day 1 game.
    const r = await save(h, guest, { fromGame: g1, text: "From the first night", requestId: "s112-0004-dddd", day: 2 });
    expect(r.status).toBe(201);
    expect(r.body["day"]).toBe(1);
    expect(r.body["source"]).toMatchObject({ mode: "cup", days: [1] });
    const g2 = await cupTrivia(h, host, guest); // Day 2
    const r2 = await save(h, guest, { fromGame: g2, text: "Second night", requestId: "s112-0005-eeee", day: 2 });
    expect([r2.body["day"], (r2.body["source"] as Json)["days"]]).toEqual([2, [2]]);
    await approve(h, host, r.body["id"] as string);
    await approve(h, host, r2.body["id"] as string);
    const md = await exportMd(h, host);
    expect(md).toMatch(/^## Day 1$/m);
    expect(md).toMatch(/^## Day 2$/m);
  });

  it("names and notes can't inject Markdown or HTML; the room name is escaped too; only approved entries export", async () => {
    const { h, host, guest } = await seats("casual", "<b>Host</b>", "[Ada](x)");
    const g = await jebena(h, host, guest);
    const evil = "line one\n## Day 99 <script>alert(1)</script> [link](http://x) `x`";
    const r = await save(h, guest, { fromGame: g, text: evil, requestId: "s112-0006-ffff" });
    expect(r.status).toBe(201);
    const pending = await save(h, guest, { fromGame: g, text: "Still pending", requestId: "s112-0007-gggg" });
    await approve(h, host, r.body["id"] as string);
    const md = await exportMd(h, host);
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<b>");
    expect(md).not.toMatch(/^## Day 99/m);
    expect(md).not.toMatch(/(^|[^\\])\[Ada\]\(x\)/);
    expect(md).toContain("# Mchezo Memory Book — Book \\<night\\> \\#1");
    expect(md).toMatch(/^- \\<b\\>Host\\<\/b\\>: \d+ points$/m);
    expect(md).not.toContain("Still pending");
    expect(pending.status).toBe(201);
  });

  /** Rewrite this room's book file while the server is down, then start it again: a real restore from disk. */
  async function restoreWith(h: Harness, edit: (entries: Json[]) => void): Promise<void> {
    await h.stop();
    const file = join(h.dataDir, `${h.roomId}.book.json`);
    const data = JSON.parse(readFileSync(file, "utf8")) as { entries: Json[] };
    edit(data.entries);
    writeFileSync(file, JSON.stringify(data, null, 2));
    await h.start();
  }
  const book = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": p.token })).body as unknown as Json[];

  it("a restored older Cup entry, saved on Day 2 about a Day 1 finish, is labelled Day 1 from the room's citation; the stored entry is unchanged (review 6851031292)", async () => {
    const { h, host, guest } = await seats();
    const g1 = await cupTrivia(h, host, guest); // Day 1
    expect((await h.post(`/rooms/${h.roomId}/day`, {}, host.token)).body["day"]).toBe(2);
    const r = await save(h, guest, { fromGame: g1, text: "Saved the old way on Day 2", requestId: "s112-0009-iiii", day: 2 });
    await approve(h, host, r.body["id"] as string);
    // Exactly what the base build stored for it: the day it was added, and no recorded source.
    await restoreWith(h, (entries) => { const e = entries.find((x) => x["id"] === r.body["id"])!; delete e["source"]; e["day"] = 2; });
    const stored = (await book(h, host)).find((x) => x["id"] === r.body["id"])!;
    expect([stored["day"], stored["source"]]).toEqual([2, undefined]); // no migration: the stored entry is as it was
    const md = await exportMd(h, host);
    expect(md).toMatch(/^## Day 1$/m);
    expect(md).not.toMatch(/^## Day 2$/m);
  });

  it("a restored older Cup entry whose cited finish isn't in the room gets no day label, never its stored day", async () => {
    const { h, host, guest } = await seats();
    const g1 = await cupTrivia(h, host, guest);
    const r = await save(h, guest, { fromGame: g1, text: "Cites a finish the room doesn't have", requestId: "s112-0010-jjjj" });
    await approve(h, host, r.body["id"] as string);
    await restoreWith(h, (entries) => { const e = entries.find((x) => x["id"] === r.body["id"])!; delete e["source"]; e["day"] = 2; e["sourceEventIds"] = ["evt-999999"]; });
    const md = await exportMd(h, host);
    expect(md).not.toMatch(/Day \d/);
    expect(md).toMatch(/^## A game$/m);
  });

  it("restored with forged presentation data, an entry still exports exactly its stored facts and points", async () => {
    const { h, host, guest } = await seats("casual");
    const g = await jebena(h, host, guest);
    const r = await save(h, guest, { fromGame: g, text: "Forged on disk", requestId: "s112-0011-kkkk" });
    await approve(h, host, r.body["id"] as string);
    const facts = r.body["derivedFacts"] as string[];
    await restoreWith(h, (entries) => {
      const e = entries.find((x) => x["id"] === r.body["id"])!;
      for (const s of ((e["source"] as Json)["scores"] as Json[])) { s["name"] = "Impostor"; s["points"] = 999; }
    });
    const lines = (await exportMd(h, host)).split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(facts.length);
    lines.forEach((l, i) => expect(l).toBe(`- ${l.slice(2).split(":")[0]}: ${/: (-?\d+) points$/.exec(facts[i]!)![1]} points`));
    expect(lines.join("\n")).not.toMatch(/Impostor|999/);
    expect(lines.every((l) => /^- (Keku|Amina): \d+ points$/.test(l))).toBe(true);
  });

  it("an older entry (no recorded source) in a casual room shows no Day and resolves names from the room", async () => {
    const { h, host, guest } = await seats("casual");
    const g = await jebena(h, host, guest);
    const r = await save(h, guest, { fromGame: g, text: "Made the old way", requestId: "s112-0008-hhhh" });
    // Make it look like an entry from before Stage 11.2, then export.
    const live = h.server["books"].get(h.roomId) as MemoryBook;
    delete live.entries.find((e) => e.id === r.body["id"])!.source;
    await approve(h, host, r.body["id"] as string);
    const md = await exportMd(h, host);
    expect(md).toMatch(/^## Jebena Rush$/m);
    expect(md).not.toMatch(/Day \d|player-\d/);
    expect(md).toMatch(/^- (Keku|Amina): \d+ points$/m);
  });
});
