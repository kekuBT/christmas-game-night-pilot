// Stage 11.2 (docs/stage11/stage112.md; D-S112-01..03): readable casual Memory Books.
// A casual entry carries no "Day 1" and is identified by its game; a Cup entry shows its game's own day (also when it's
// added on a later day); exports print names, never internal ids; the mode and names come from the server, never the
// request; typed text can't inject Markdown or HTML; older books load unchanged.
import { afterEach, describe, expect, it } from "vitest";
import { MemoryBook, MemorySourceSchema } from "../src/server/memorybook.js";
import { bookModeOf, entryDayLabel, entryFactLines, entryLabel, entryMode, mdEscape, NO_NAME, type PresentableEntry } from "../src/shared/memoryPresent.js";
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
  it("day label: a Cup entry's game day(s); never one for a casual entry", () => {
    expect(entryDayLabel(entry({ day: 3 }), { roomKind: "cup" })).toBe("Day 3");
    expect(entryDayLabel(entry({ day: 3, source: { mode: "cup", days: [1], titles: [] } }), { roomKind: "cup" })).toBe("Day 1");
    expect(entryDayLabel(entry({ source: { mode: "cup", days: [2, 1, 2], titles: [] } }), { roomKind: "cup" })).toBe("Days 1, 2");
    expect(entryDayLabel(entry({ day: 1 }), { roomKind: "casual" })).toBeNull();
    expect(entryDayLabel(entry({ day: 1, source: { mode: "casual", titles: ["Trivia Showdown"] } }), { roomKind: "cup" })).toBeNull();
  });
  it("label: Day N for Cup, the game's title for casual (recorded, else the room's game), else \"A game\"", () => {
    const ctx = { roomKind: "casual", nameOf };
    expect(entryLabel(entry({ source: { mode: "casual", titles: ["Jebena Rush"] } }), ctx)).toBe("Jebena Rush");
    expect(entryLabel(entry(), { ...ctx, sourceGames: () => [{ title: "Math Mayhem", day: 1 }] })).toBe("Math Mayhem");
    expect(entryLabel(entry(), ctx)).toBe("A game");
    expect(entryLabel(entry({ day: 2 }), { roomKind: "cup", nameOf })).toBe("Day 2");
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
