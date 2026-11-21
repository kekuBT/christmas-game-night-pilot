// Saves a Jebena Rush briefing with the pre-cadence engine (af79b67, rules version 1), as a room snapshot.
// Run from that checkout: node --import tsx <this file> <checkout> <out.json>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const [checkout, out] = process.argv.slice(2);
const { RoomEngine } = await import(join(checkout!, "src/server/room.ts"));
const T0 = 1_800_000_000_000;
const engine = new RoomEngine("JR v1 briefing", { kind: "casual", timing: 2 });
engine.clock = () => T0;
const host = engine.join("Keku", { asHost: true }).player.id;
const guest = engine.join("Amina").player.id;
const g = engine.startGame(host, "jebena-rush", { official: false });
const game = engine.games.get(g.id);
if (game.status !== "briefing") throw new Error(`expected a briefing, got ${game.status}`);
if (game.extra.rulesVersion !== 1) throw new Error(`expected rules version 1, got ${game.extra.rulesVersion}`);
const snap = engine.toJSON();
writeFileSync(out!, JSON.stringify(snap, null, 1) + "\n");
console.log(JSON.stringify({ gameInstanceId: g.id, status: game.status, rulesVersion: game.extra.rulesVersion, category: game.extra.category, hasStreak: "streak" in game.extra, players: [host, guest].length }));
