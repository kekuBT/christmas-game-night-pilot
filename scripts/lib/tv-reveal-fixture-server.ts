// TEST TOOLING ONLY (scripts/check-tv-reveal.mjs). Never used by the app.
//
// A local server whose Trivia library is the shipped touchdown question
// ("How many points is a touchdown worth in American football?", answer 6)
// plus nine other shipped Trivia items, so every Trivia game includes it.
// The driver asks, over stdin, for the seed that makes a given room's next
// game show the touchdown options in a documented order; it then starts the
// game through the ordinary HTTP API with that seed. Selection and the
// option shuffle are the real ones, so the browser sees exactly what the
// audit's rooms produced. Nothing here is reachable from the app's HTTP API.
//
//   stdin:  seed <roomId> <order, e.g. 3,7,6,2> <playerId,playerId,...>
//   stdout: seed <n>            (or: seed-error <message>)
import { createInterface } from "node:readline";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary } from "../../src/content/registry.js";
import { selectContent } from "../../src/content/select.js";
import { materialize } from "../../src/content/materialize.js";
import { LocalServer } from "../../src/server/http.js";

if (process.env.NODE_ENV === "production") {
  console.error("tv-reveal-fixture-server is test tooling and is not allowed in production.");
  process.exit(2);
}
export const TOUCHDOWN = "trv-spor-085";
const shipped = loadContent(DEFAULT_CONTENT_DIR);
const trivia = shipped.byGame.get("trivia") ?? [];
const touchdown = trivia.find((li) => li.item.id === TOUCHDOWN);
if (!touchdown) { console.error(`${TOUCHDOWN} is missing from the shipped content`); process.exit(1); }
const chosen = [touchdown, ...trivia.filter((li) => li.item.id !== TOUCHDOWN && li.status !== "rejected").slice(0, 9)];
const lib: ContentLibrary = { ...shipped, items: new Map(chosen.map((li) => [li.item.id, li])), byGame: new Map([["trivia", chosen]]) };

const server = new LocalServer({ dataDir: process.env.MCHEZO_DATA_DIR || undefined, webDistDir: process.env.MCHEZO_WEB_DIST || undefined, content: lib });
const port = await server.listen(Number(process.env.PORT ?? 0));
console.log(`tv-reveal fixture server on http://localhost:${port}`);

createInterface({ input: process.stdin }).on("line", (line) => {
  const [cmd, roomId, order, ids] = line.trim().split(/\s+/);
  if (cmd !== "seed" || !roomId || !order || !ids) return;
  try {
    const engine = server.rooms.get(roomId);
    if (!engine) throw new Error(`no room ${roomId}`);
    const pick = selectContent({ roomKind: engine.kind, lib, gameId: "trivia", count: 10, mode: "practice", cupId: engine.cup.cupId, usage: engine.contentUsage, seq: engine.contentSeq, today: new Date().toISOString().slice(0, 10) });
    if (!pick.ok) throw new Error(pick.message);
    for (let seed = 1; seed < 200_000; seed++) {
      const extra = materialize("trivia", pick.items, { seed, playerIds: ids.split(",") }) as { questions: { id: string; options: string[] }[] };
      if (extra.questions.find((q) => q.id === TOUCHDOWN)!.options.join(",") === order) { console.log(`seed ${seed}`); return; }
    }
    throw new Error(`no seed gives ${order}`);
  } catch (e) {
    console.log(`seed-error ${(e as Error).message}`);
  }
});
process.on("SIGTERM", () => { void server.close().then(() => process.exit(0)); });
