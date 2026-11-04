// API-level playthrough driver mirroring the browser UI's exact intent flows.
// Usage: node scripts/clickthrough-api.mjs [baseUrl]
// Created as a fallback when the live-browser click-through could not run
// (browser tab service failure, 2026-11-04 cron run). It exercises every game
// to completion through the same HTTP endpoints and intent actions App.tsx uses.
// Fictional test players only; run against a local server only.
const BASE = process.argv[2] ?? "http://localhost:3457";
const NAMES = ["Alex", "Sam", "Jo", "Kim"];

async function post(path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${j.error ?? ""}`);
  return j;
}
async function get(path, token) {
  const headers = {};
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${j.error ?? ""}`);
  return j;
}
const intent = (roomId, player, gameInstanceId, action, payload) =>
  post(`/rooms/${roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId, action, payload } }, player.token);
const proj = (roomId, player) => get(`/rooms/${roomId}/projection?audience=player`, player.token);
const myGame = async (roomId, player, gid) => (await proj(roomId, player)).myGames.find((g) => g.id === gid);
const tid = (text) => `tile-${text.toLowerCase().replace(/[^a-z]/g, "-")}`;
const CONNECTIONS_GROUPS = [
  ["Gingerbread", "Candy cane", "Mince pie", "Roast turkey"],
  ["Snowfall", "Frost", "Blizzard", "Icicle"],
  ["Tinsel", "Bauble", "Wreath", "Stocking"],
  ["Dasher", "Dancer", "Prancer", "Vixen"],
];
function solveMath(prompt, options) {
  let m = prompt.match(/^(\d+) \+ (\d+) = \?$/);
  if (m) return options.indexOf(Number(m[1]) + Number(m[2]));
  m = prompt.match(/^(\d+) − (\d+) = \?$/);
  if (m) return options.indexOf(Number(m[1]) - Number(m[2]));
  m = prompt.match(/^(\d+) × (\d+) = \?$/);
  if (m) return options.indexOf(Number(m[1]) * Number(m[2]));
  m = prompt.match(/^(\d+) ÷ (\d+) = \?$/);
  if (m) return options.indexOf(Number(m[1]) / Number(m[2]));
  m = prompt.match(/^(\d+)% of (\d+) = \?$/);
  if (m) return options.indexOf((Number(m[1]) * Number(m[2])) / 100);
  return -1;
}

const results = [];
async function playGame(roomId, players, gameId) {
  const host = players[0];
  const started = await post(`/rooms/${roomId}/games`, { gameId, official: true }, host.token);
  const gid = started.gameId;
  let steps = 0;
  const guard = 500;
  const note = [];
  while (steps++ < guard) {
    const g = await myGame(roomId, host, gid);
    if (!g) throw new Error(`game ${gid} missing from projection`);
    if (g.status === "finished") {
      results.push({ gameId, status: "finished", scores: g.rawScores ?? null, steps, note: note.join("; ") });
      return;
    }
    const st = g.state ?? {};
    if (gameId === "math-mayhem") {
      for (const p of players) {
        const pg = await myGame(roomId, p, gid);
        for (const q of pg.questions ?? []) {
          if (pg.myAnswers?.[q.id] === undefined) {
            let idx = solveMath(q.prompt, q.options);
            if (idx < 0) { idx = 0; note.push(`math parse fallback on "${q.prompt}"`); }
            const r = await intent(roomId, p, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
            if (!r.accepted) throw new Error(`math answer rejected: ${r.reason}`);
          }
        }
      }
    } else if (["trivia", "who-said-that", "geography"].includes(gameId)) {
      const action = gameId === "trivia" ? "trivia-answer" : gameId === "who-said-that" ? "whosaid-answer" : "geography-answer";
      for (const p of players) {
        const pg = await myGame(roomId, p, gid);
        for (const q of pg.state?.questions ?? []) {
          if (pg.state.myAnswers?.[q.id] === undefined) {
            const r = await intent(roomId, p, gid, action, { questionId: q.id, chosenIndex: 0 });
            if (!r.accepted) throw new Error(`${action} rejected: ${r.reason}`);
          }
        }
      }
    } else if (gameId === "guess-the-year") {
      for (const p of players) {
        const pg = await myGame(roomId, p, gid);
        for (const e of pg.state?.events ?? []) {
          if (pg.state.myGuesses?.[e.id] === undefined) {
            const r = await intent(roomId, p, gid, "year-guess", { eventId: e.id, value: 2000 });
            if (!r.accepted) throw new Error(`year-guess rejected: ${r.reason}`);
          }
        }
      }
    } else if (gameId === "closest-wins") {
      for (const p of players) {
          const pg = await myGame(roomId, p, gid);
          if (pg.state?.myGuess === undefined) {
            const r = await intent(roomId, p, gid, "closest-guess", { value: 100 });
            if (!r.accepted) throw new Error(`closest-guess rejected: ${r.reason}`);
          }
        }
    } else if (gameId === "impostor") {
      if (st.phase === "clue") {
        for (const p of players) {
          const pg = await myGame(roomId, p, gid);
          if (!(pg.state.clues ?? {})[p.id]) {
            const r = await intent(roomId, p, gid, "impostor-clue", { clue: `clue from ${p.displayName}` });
            if (!r.accepted) throw new Error(`impostor-clue rejected: ${r.reason}`);
          }
        }
      } else if (st.phase === "vote") {
        for (const p of players) {
          const pg = await myGame(roomId, p, gid);
          if (!pg.state.myVote) {
            const suspect = players.find((x) => x.id !== p.id);
            const r = await intent(roomId, p, gid, "impostor-vote", { suspectId: suspect.id });
            if (!r.accepted) throw new Error(`impostor-vote rejected: ${r.reason}`);
          }
        }
      } else if (st.phase === "guess") {
        // find impostor by role in its own projection
        let imp = null;
        for (const p of players) { const pg = await myGame(roomId, p, gid); if (pg.state?.role === "impostor") imp = p; }
        if (!imp) throw new Error("impostor not found in guess phase");
        const r = await intent(roomId, imp, gid, "impostor-guess", { guess: "snowman" });
        if (!r.accepted) throw new Error(`impostor-guess rejected: ${r.reason}`);
      } else if (st.phase === "finished") {
        break;
      } else {
        throw new Error(`unexpected impostor phase ${st.phase}`);
      }
    } else if (gameId === "caption-clash") {
      if (st.phase === "caption") {
        for (const p of players) {
          const pg = await myGame(roomId, p, gid);
          if (!pg.state.myCaption) {
            const r = await intent(roomId, p, gid, "caption-submit", { caption: `caption by ${p.displayName} round ${st.roundIndex}` });
            if (!r.accepted) throw new Error(`caption-submit rejected: ${r.reason}`);
          }
        }
      } else if (st.phase === "vote") {
        for (const p of players) {
          const pg = await myGame(roomId, p, gid);
          if (!pg.state.myVote) {
            const target = (pg.state.captions ?? []).find((c) => c.id !== p.id);
            if (!target) throw new Error("no votable caption");
            const r = await intent(roomId, p, gid, "caption-vote", { captionId: target.id });
            if (!r.accepted) throw new Error(`caption-vote rejected: ${r.reason}`);
          }
        }
      } else if (st.phase === "finished") break;
      else throw new Error(`unexpected caption phase ${st.phase}`);
    } else if (gameId === "word-connections") {
      for (const p of players) {
        for (const group of CONNECTIONS_GROUPS) {
          const pg = await myGame(roomId, p, gid);
          if ((pg.state.myState?.solved ?? []).length >= 4) break;
          const r = await intent(roomId, p, gid, "connections-guess", { tileIds: group.map(tid) });
          if (!r.accepted) throw new Error(`connections-guess rejected: ${r.reason}`);
        }
      }
    } else if (gameId === "category-sprint") {
      for (const p of players) {
        const answers = [`${p.displayName}Alpha`, `${p.displayName}Bravo`, `${p.displayName}Charlie`];
        const r = await intent(roomId, p, gid, "sprint-answers", { answers });
        if (!r.accepted) throw new Error(`sprint-answers rejected: ${r.reason}`);
      }
    } else if (gameId === "charades") {
      let actor = null;
      for (const p of players) { const pg = await myGame(roomId, p, gid); if (pg.state?.prompt) actor = p; }
      if (!actor) throw new Error("no actor with prompt in charades turn");
      const r = await intent(roomId, actor, gid, "charades-turn", { outcome: "correct" });
      if (!r.accepted) throw new Error(`charades-turn rejected: ${r.reason}`);
    } else {
      throw new Error(`no driver for ${gameId}`);
    }
  }
  throw new Error(`game ${gameId} did not finish within ${guard} steps`);
}

const room = await post("/rooms", { name: "Christmas Game Night" });
const players = [];
for (let i = 0; i < NAMES.length; i++) {
  const j = await post(`/rooms/${room.roomId}/join`, { displayName: NAMES[i], asHost: i === 0, hostClaimToken: room.hostClaimToken });
  players.push({ id: j.playerId, displayName: NAMES[i], token: j.recoveryToken });
}
console.log(`room ${room.roomId} code ${room.joinCode} players ${players.map((p) => p.displayName).join(",")}`);
const games = await get("/games");
for (const g of games) {
  try {
    await playGame(room.roomId, players, g.id);
    const last = results[results.length - 1];
    console.log(`OK ${g.id}: finished in ${last.steps} driver steps; scores=${JSON.stringify(last.scores)}${last.note ? `; note: ${last.note}` : ""}`);
  } catch (e) {
    console.log(`FAIL ${g.id}: ${e.message}`);
    results.push({ gameId: g.id, status: "failed", error: e.message });
  }
}
// TV projection + ledger + memory-book checks
const tv = await get(`/rooms/${room.roomId}`);
console.log(`TV projection: games=${tv.games.length} finished=${tv.games.filter((g) => g.status === "finished").length}`);
for (const g of tv.games) console.log(`  score ${g.gameId}: ${JSON.stringify(g.rawScores)}`);
// Category-leak check on a fresh, still-playing Connections game
const room2 = await post("/rooms", { name: "Leak check" });
const p2 = await post(`/rooms/${room2.roomId}/join`, { displayName: "LeakHost", asHost: true, hostClaimToken: room2.hostClaimToken });
await post(`/rooms/${room2.roomId}/games`, { gameId: "word-connections", official: false }, p2.recoveryToken);
const tv2 = await get(`/rooms/${room2.roomId}`);
const tiles = tv2.games[0].state.tiles;
console.log(`playing-connections tiles leak category: ${tiles.some((t) => t.category !== undefined)}; sample: ${JSON.stringify(tiles[0])}`);
const ledger = await get(`/rooms/${room.roomId}/ledger`, players[0].token);
console.log(`ledger: game-finished events=${ledger.filter((e) => e.type === "game-finished").length} total=${ledger.length}`);
const mem = await post(`/rooms/${room.roomId}/memory`, { day: 1, text: "Test highlight from playthrough", sourceEventIds: ledger.filter((e) => e.type === "game-finished").slice(-1).map((e) => e.eventId) }, players[0].token);
await post(`/rooms/${room.roomId}/memory/${mem.id}/approve`, {}, players[0].token);
const exp = await get(`/rooms/${room.roomId}/memory/export`, players[0].token);
console.log(`memory export includes test entry: ${exp.markdown.includes("Test highlight from playthrough")}`);
// reconnect check
const rc = await post(`/rooms/${room.roomId}/reconnect`, { playerId: players[1].id, recoveryToken: players[1].token });
console.log(`reconnect: ${JSON.stringify(rc)}`);
const failed = results.filter((r) => r.status !== "finished");
console.log(failed.length === 0 ? "ALL GAMES FINISHED" : `FAILED: ${failed.map((f) => f.gameId).join(",")}`);
process.exit(failed.length === 0 ? 0 : 1);
