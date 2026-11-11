/**
 * S3-TV-05 (Stage 3 live QA): the TV's Trivia reveal for "How many points
 * is a touchdown worth in American football?" (correct answer: 6).
 *
 * The audit's spectator reported the TV marking 7 correct in two games and,
 * in one, a vote on the wrong option. These fixtures replay both games
 * through the real path, from content item to the TV and phone projections:
 * the shipped item, the real selection service and the real seeded option
 * shuffle (seeds are chosen so the touchdown question comes out in exactly
 * the documented option order), then submitted answers, aggregate counts,
 * the spectator ("tv") projection, and a server restart.
 *
 *   Game 4 (2 players): TV order 3, 7, 6, 2. Host chose 6, guest chose 3.
 *   Game 5 (3 players): TV order 2, 7, 3, 6. Host and guest chose 6;
 *   the third player sat out.
 *
 * Every screen must agree on one canonical order: labels, the correct
 * marker and the counts all index the same `options` array.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { selectContent } from "../src/content/select.js";
import { materialize } from "../src/content/materialize.js";
import { FakeClock, Harness, myGame, type Json, type Player } from "./helpers/harness.js";

const TOUCHDOWN = "trv-spor-085";
const shipped = loadContent(DEFAULT_CONTENT_DIR);

/** The shipped touchdown item plus nine other shipped Trivia items: a full game of ten. */
function fixtureLibrary(): ContentLibrary {
  const trivia = shipped.byGame.get("trivia")!;
  const touchdown = trivia.find((li) => li.item.id === TOUCHDOWN);
  if (!touchdown) throw new Error(`${TOUCHDOWN} is missing from the shipped content`);
  const others = trivia.filter((li) => li.item.id !== TOUCHDOWN && li.status !== "rejected").slice(0, 9);
  const chosen = [touchdown, ...others];
  return { ...shipped, items: new Map(chosen.map((li) => [li.item.id, li])), byGame: new Map([["trivia", chosen]]) };
}

type Q = { id: string; prompt: string; options: string[]; correctIndex?: number };

/**
 * The seed whose game, in this room, shows the touchdown question in
 * `order`. Uses the same selection inputs the engine uses at start, so the
 * real materializer produces the documented order (asserted after start).
 */
function seedFor(h: Harness, playerIds: string[], order: string[], now: number): number {
  const engine = h.engine();
  const pick = selectContent({ roomKind: engine.kind, lib: engine.content, gameId: "trivia", count: 10, mode: "practice", cupId: engine.cup.cupId, usage: engine.contentUsage, seq: engine.contentSeq, today: new Date(now).toISOString().slice(0, 10) });
  if (!pick.ok) throw new Error(pick.message);
  for (let seed = 1; seed < 200_000; seed++) {
    const extra = materialize("trivia", pick.items, { seed, playerIds }) as { questions: Q[] };
    const q = extra.questions.find((x) => x.id === TOUCHDOWN)!;
    if (q.options.join() === order.join()) return seed;
  }
  throw new Error(`no seed gives ${order.join(",")}`);
}

const questionsOf = (g: Json) => ((g["state"] as Json)["questions"] as Q[]);
const tvGame = (tv: Json, gid: string) => ((tv["games"] as Json[]) ?? []).find((g) => g["id"] === gid)!;

let h: Harness | undefined;
afterEach(async () => { await h?.dispose(); h = undefined; });

async function room(names: string[]): Promise<{ players: Player[]; clock: FakeClock }> {
  const clock = new FakeClock(Date.parse("2026-11-08T10:00:00Z"));
  h = new Harness(undefined, { clock, content: fixtureLibrary() });
  await h.start();
  await h.createRoom("TV reveal");
  const players: Player[] = [];
  for (const [i, n] of names.entries()) players.push(await h.join(n, { host: i === 0 }));
  return { players, clock };
}

/** Each player answers every question in canonical order; `pick(q)` is the label they choose. */
async function answerAll(p: Player, gid: string, qs: Q[], pick: (q: Q) => string): Promise<void> {
  for (const q of qs) {
    const idx = q.options.indexOf(pick(q));
    expect(idx).toBeGreaterThanOrEqual(0);
    const r = await h!.intent(p, gid, "trivia-answer", { questionId: q.id, chosenIndex: idx });
    expect(r["accepted"], JSON.stringify(r)).toBe(true);
  }
}
const correctLabel = (q: Q) => (shipped.items.get(q.id)!.item as { answer: string }).answer;
const wrongLabel = (q: Q) => q.options.find((o) => o !== correctLabel(q))!;

/** What the TV draws for one question: label → count, and the label it marks correct. */
function tvReveal(tv: Json, gid: string, qid: string): { order: string[]; byLabel: Record<string, number>; marked: string | undefined } {
  const g = tvGame(tv, gid);
  const q = questionsOf(g).find((x) => x.id === qid)!;
  const counts = ((g["answerCounts"] as Record<string, number[]> | undefined) ?? {})[qid] ?? [];
  const byLabel = Object.fromEntries(q.options.map((label, i) => [label, counts[i] ?? 0]));
  return { order: q.options, byLabel, marked: q.correctIndex === undefined ? undefined : q.options[q.correctIndex] };
}

/** Nothing about the answer key or the room's choices is visible before the game finishes. */
function expectNoLeak(view: Json, gid: string): void {
  const g = tvGame(view, gid) ?? myGame(view, gid);
  expect(g, "game in projection").toBeTruthy();
  for (const q of questionsOf(g)) {
    expect(q.correctIndex).toBeUndefined();
    expect((q as Record<string, unknown>)["explanation"]).toBeUndefined();
  }
  expect(g["answerCounts"]).toBeUndefined();
  expect(g["questionPoints"]).toBeUndefined();
  expect(JSON.stringify(g)).not.toContain('"answers"');
}

async function expectEveryScreenAgrees(gid: string, players: Player[], order: string[], byLabel: Record<string, number>): Promise<void> {
  const tv = await h!.tv();
  const reveal = tvReveal(tv, gid, TOUCHDOWN);
  expect(reveal.order).toEqual(order);
  expect(reveal.marked).toBe("6");
  expect(reveal.byLabel).toEqual(byLabel);
  // Every phone sees the same labels in the same order and the same key.
  for (const p of players) {
    const mine = myGame(await h!.projection(p), gid);
    const q = questionsOf(mine).find((x) => x.id === TOUCHDOWN)!;
    expect(q.options, p.name).toEqual(order);
    expect(q.options[q.correctIndex!], p.name).toBe("6");
  }
  // Server truth: the stored key and every stored answer index point into this order.
  const extra = h!.game(gid).extra as { questions: Q[]; answers: Record<string, Record<string, number>> };
  const stored = extra.questions.find((x) => x.id === TOUCHDOWN)!;
  expect(stored.options).toEqual(order);
  expect(stored.options[stored.correctIndex!]).toBe("6");
}

describe("S3-TV-05: the touchdown question on the TV (correct answer 6)", () => {
  it("Game 4 fixture: order 3,7,6,2; host 6, guest 3 → 6 marked correct, one vote each on 6 and 3, none on 7", async () => {
    const { players, clock } = await room(["Host", "Guest"]);
    const [host, guest] = players as [Player, Player];
    const order = ["3", "7", "6", "2"];
    const seed = seedFor(h!, players.map((p) => p.playerId), order, clock.now());
    const start = await h!.startGame(host, "trivia", { seed, official: false });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    const gid = String(start.body["gameId"]);
    const qs = questionsOf(myGame(await h!.projection(host), gid));
    expect(qs.find((q) => q.id === TOUCHDOWN)!.options, "fixture precondition: documented order").toEqual(order);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);

    // While playing: no key, no counts, no answers on the TV or a phone.
    expectNoLeak(await h!.tv(), gid);
    await answerAll(host, gid, qs, correctLabel); // host: 10/10, touchdown → 6
    expectNoLeak(await h!.tv(), gid);
    expectNoLeak(await h!.projection(guest), gid);
    await answerAll(guest, gid, qs, (q) => (q.id === TOUCHDOWN ? "3" : wrongLabel(q)));

    const byLabel = { "3": 1, "7": 0, "6": 1, "2": 0 };
    await expectEveryScreenAgrees(gid, players, order, byLabel);
    // Host scored on the touchdown question; guest did not.
    const tv = await h!.tv();
    const raw = tvGame(tv, gid)["rawScores"] as Record<string, number>;
    expect(raw[host.playerId]).toBeGreaterThan(raw[guest.playerId]!);

    // Refresh and server restart: the same order, key and counts.
    await h!.restart();
    await expectEveryScreenAgrees(gid, players, order, byLabel);
  });

  it("Game 5 fixture: order 2,7,3,6; host and guest 6, third sat out → 6 marked correct with 2 votes, 7 none", async () => {
    const { players, clock } = await room(["Host", "Guest", "Third"]);
    const [host, guest, third] = players as [Player, Player, Player];
    const order = ["2", "7", "3", "6"];
    const seed = seedFor(h!, players.map((p) => p.playerId), order, clock.now());
    const start = await h!.startGame(host, "trivia", { seed, official: false });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    const gid = String(start.body["gameId"]);
    const qs = questionsOf(myGame(await h!.projection(host), gid));
    expect(qs.find((q) => q.id === TOUCHDOWN)!.options, "fixture precondition: documented order").toEqual(order);

    const sat = await h!.intent(third, gid, "abstain", {});
    expect(sat["accepted"], JSON.stringify(sat)).toBe(true);
    await answerAll(host, gid, qs, correctLabel);
    expectNoLeak(await h!.tv(), gid);
    await answerAll(guest, gid, qs, correctLabel);

    expect(h!.game(gid).status).toBe("finished");
    const byLabel = { "2": 0, "7": 0, "3": 0, "6": 2 };
    await expectEveryScreenAgrees(gid, players, order, byLabel);
    // Across the whole game the TV's markers give 20 correct answers (host 10 + guest 10), not fewer.
    const tv = await h!.tv();
    const g = tvGame(tv, gid);
    const counts = g["answerCounts"] as Record<string, number[]>;
    const right = questionsOf(g).reduce((n, q) => n + (counts[q.id]![q.correctIndex!] ?? 0), 0);
    expect(right).toBe(20);

    await h!.restart();
    await expectEveryScreenAgrees(gid, players, order, byLabel);
  });

  it("an answer index outside the question's options is refused and does not lock the question", async () => {
    const { players, clock } = await room(["Host", "Guest"]);
    const [host] = players as [Player, Player];
    const seed = seedFor(h!, players.map((p) => p.playerId), ["3", "7", "6", "2"], clock.now());
    const gid = String((await h!.startGame(host, "trivia", { seed, official: false })).body["gameId"]);
    for (const bad of [-1, 4, 1.5, Number.NaN]) {
      const r = await h!.intent(host, gid, "trivia-answer", { questionId: TOUCHDOWN, chosenIndex: bad });
      expect(r["accepted"], `chosenIndex ${bad}`).toBe(false);
    }
    const ok = await h!.intent(host, gid, "trivia-answer", { questionId: TOUCHDOWN, chosenIndex: 2 });
    expect(ok["accepted"], JSON.stringify(ok)).toBe(true);
  });
});

describe("materialized Trivia keeps the key with the label through every shuffle", () => {
  it("options[correctIndex] is the item's answer for every shipped Trivia item, across seeds", () => {
    const items = shipped.byGame.get("trivia")!.filter((li) => li.status !== "rejected");
    for (const seed of [1, 2, 3, 42, 1234, 99_999, 2_147_483_646]) {
      const extra = materialize("trivia", items, { seed, playerIds: ["a", "b"] }) as { questions: Q[] };
      for (const [i, q] of extra.questions.entries()) {
        const it = items[i]!.item as { id: string; options: string[]; answer: string };
        expect(q.id).toBe(it.id);
        expect([...q.options].sort()).toEqual([...it.options].sort());
        expect(q.options[q.correctIndex!], `${q.id} seed ${seed}`).toBe(it.answer);
      }
    }
  });
});
