// The review's check, on any checkout: recover the actual v1 saved briefing, read the phone's and the TV's briefing
// entries and the shared rules copy they get, then ready both and play 8 accepted answers.
// Run: node --import tsx <this file> <checkout> <fixture.json>
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const [checkout, fixture] = process.argv.slice(2);
const { RoomEngine } = await import(join(checkout!, "src/server/room.ts"));
const { briefingRules } = await import(join(checkout!, "apps/web/src/ui/mchezo/lib/briefing.ts"));
const { JEBENA_CATEGORIES } = await import(join(checkout!, "src/games/modules/packs/jebena-banks.ts"));
const engine = RoomEngine.fromJSON(JSON.parse(readFileSync(fixture!, "utf8")));
let t = 1_800_000_005_000;
engine.clock = () => t;
const gid = "game-1";
const g = engine.games.get(gid);
const phone = engine.project("player", "player-2").games.find((x: { id: string }) => x.id === gid);
const tv = engine.project("tv").games.find((x: { id: string }) => x.id === gid);
const copy = (e: { gameId: string; rulesVersion?: number }) => briefingRules(e.gameId, "", e.rulesVersion).steps.join(" ");
const advertises = (e: { gameId: string; rulesVersion?: number }) => copy(e).includes("5 to 8");
const send = (pid: string, action: string, payload: Record<string, unknown>) => engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
for (const pid of g.players) send(pid, "briefing-ready", { ready: true });
const first = g.extra.category;
let accepted = 0;
for (let i = 0; i < 8; i++) {
  const s = g.extra; t += 1000;
  const c = JEBENA_CATEGORIES.find((x: { id: string }) => x.id === s.category);
  const name = c.answers.find((a: { id: string }) => !(s.used[s.category] ?? []).includes(a.id)).name;
  if (send(s.turn.player, "jebena-answer", { turn: s.turn.n, text: name }).accepted) accepted++;
}
console.log(JSON.stringify({ savedBriefingRulesVersion: g.extra.rulesVersion, projectedRulesVersion: { phone: phone.rulesVersion ?? null, tv: tv.rulesVersion ?? null }, phoneAdvertisesStreak: advertises(phone), tvAdvertisesStreak: advertises(tv), status: g.status, accepted, categoryChanged: g.extra.category !== first }));
