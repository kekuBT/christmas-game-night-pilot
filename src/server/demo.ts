import { randomUUID } from "node:crypto";
import { RoomEngine } from "./room.js";
import { midrankScore } from "../scoring/championship.js";

/** Synthetic 10-player Math Mayhem room through the real engine. Fictional players only. */
const engine = new RoomEngine("Demo Family Cup");
const names = ["Ada", "Ben", "Cleo", "Dan", "Eve", "Finn", "Gus", "Hana", "Ivy", "Jay"];
const tokens = new Map<string, string>();
let hostId = "";
for (let i = 0; i < names.length; i++) {
  const { player, recoveryToken } = engine.join(names[i] as string, { asHost: i === 0 });
  tokens.set(player.id, recoveryToken);
  if (player.isHost) hostId = player.id;
}
const game = engine.startGame(hostId, "math-mayhem", { official: false, seed: 7 });
console.log(`Room ${engine.id} join code ${engine.joinCode} — ${engine.players.size} players`);
console.log(`Game ${game.id} with ${game.questions?.length} questions`);

// Each player answers every question; even players answer correctly, odd players answer incorrectly.
for (const pid of game.players) {
  const idx = game.players.indexOf(pid);
  for (const q of game.questions ?? []) {
    const chosen = idx % 2 === 0 ? q.correctIndex : (q.correctIndex + 1) % 4;
    engine.submitIntent(
      {
        kind: "intent",
        schemaVersion: 1,
        clientEventId: randomUUID(),
        roomId: engine.id,
        gameInstanceId: game.id,
        action: "submit-math-answer",
        payload: { questionId: q.id, chosenIndex: chosen },
      },
      pid,
      (game.startedAt ?? 0) + 3000,
    );
  }
}
console.log("Game status:", game.status);
console.log("Raw scores:", game.rawScores);
const raws = Object.values(game.rawScores);
for (const [pid, raw] of Object.entries(game.rawScores)) {
  const name = engine.players.get(pid)?.displayName;
  console.log(`${name}: raw ${raw}, normalised ${midrankScore(raw, raws).toFixed(2)}`);
}
console.log("Ledger events:", engine.ledger.length, "checksum:", engine.ledgerChecksum());
// Projection leak check: TV payload must not contain answer keys or tokens
const tv = JSON.stringify(engine.project("tv"));
console.log("TV payload contains correctIndex?", tv.includes("correctIndex"));
console.log("TV payload contains recovery token?", [...tokens.values()].some((t) => tv.includes(t)));
