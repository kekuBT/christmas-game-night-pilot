// Sprint 3 (Workstream H): when a driver fails, say WHERE the game was,
// from both sides, in one line, and classify the failure.
//
//   DIAG player=Bea game=trivia(game-3) server=playing phase=- deadlineIn=212s
//        phaseIn=- submitted=2/3 outcome=- | screen="Question 4 of 10"
//        clock="Time left in this game: 3:32" | type=waiting-on-players
//
// Server facts come from the player's own projection (their session token,
// as the app itself reads it), so this never needs privileged access.
// Failure types:
//   server-ended-client-behind  the server finished the game; this screen
//                               still shows play (a client refresh bug)
//   deadline-overdue            the server still says playing more than 5 s
//                               after the deadline (a lifecycle bug)
//   waiting-on-players          the game is legitimately waiting (in time)
//   client-not-on-game          the server has a game; the screen shows
//                               something else (lobby, intro, error)
//   no-game                     the server has no playing or recent game
//   server-unreachable          the projection could not be read
//   finished-and-shown          not a failure: the server ended it and the
//                               screen shows the results

async function clientView(page) {
  try {
    return await page.evaluate(() => {
      const main = document.querySelector("main.mz-screen");
      const clock = document.querySelector('[data-testid="mz-game-clock"]');
      const outcome = document.querySelector('[data-testid="mz-outcome"]');
      const text = document.body.innerText.replace(/\s+/g, " ").trim();
      return {
        label: main?.getAttribute("aria-label") ?? "",
        clock: clock?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        outcome: outcome?.getAttribute("data-reason") ?? "",
        results: !!outcome || /Back to lobby/i.test(text) || !!document.querySelector('[data-testid="show-results"]'),
        snippet: text.slice(0, 80),
      };
    });
  } catch (e) {
    return { label: "", clock: "", outcome: "", results: false, snippet: `(page unavailable: ${String(e?.message ?? e).split("\n")[0]})` };
  }
}

async function serverView(page) {
  try {
    return await page.evaluate(async () => {
      const roomId = sessionStorage.getItem("cgn_roomId");
      const token = sessionStorage.getItem("cgn_token");
      if (!roomId) return { ok: false, why: "no room in this tab" };
      const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: token ? { "x-session-token": token } : {} });
      if (!r.ok) return { ok: false, why: `projection HTTP ${r.status}` };
      const p = await r.json();
      const games = p.games ?? [];
      const g = games.find((x) => x.status === "playing") ?? games.at(-1);
      const me = p.me?.id;
      return {
        ok: true,
        serverNow: p.serverNow,
        game: g ? {
          id: g.id, gameId: g.gameId, status: g.status, phaseKey: g.lifecycle?.phaseKey,
          deadlineAt: g.deadlineAt, phaseDeadlineAt: g.phaseDeadlineAt,
          submitted: g.submittedCount, total: g.totalPlayers,
          outcome: g.outcome?.reason, mine: me && g.outcome ? g.outcome.participation?.[me] : undefined,
        } : null,
      };
    });
  } catch (e) {
    return { ok: false, why: String(e?.message ?? e).split("\n")[0] };
  }
}

export function classify(server, client) {
  if (!server.ok) return "server-unreachable";
  const g = server.game;
  if (!g) return "no-game";
  if (g.status === "finished") return client.results ? "finished-and-shown" : "server-ended-client-behind";
  const now = server.serverNow ?? Date.now();
  const overdue = (d) => typeof d === "number" && now - d > 5000;
  if (overdue(g.deadlineAt) || overdue(g.phaseDeadlineAt)) return "deadline-overdue";
  if (client.results || /lobby|You’re in/i.test(client.snippet)) return "client-not-on-game";
  return "waiting-on-players";
}

/** One diagnostic line for a player's page. Never throws. */
export async function lifecycleDiagnosis(page, player = "player") {
  const [server, client] = await Promise.all([serverView(page), clientView(page)]);
  const secs = (d) => (typeof d === "number" && typeof server.serverNow === "number" ? `${Math.round((d - server.serverNow) / 1000)}s` : "-");
  const g = server.ok ? server.game : null;
  const serverPart = !server.ok
    ? `server=unavailable(${server.why})`
    : !g ? "server=no-game"
    : `game=${g.gameId}(${g.id}) server=${g.status} phase=${g.phaseKey ?? "-"} deadlineIn=${secs(g.deadlineAt)} phaseIn=${secs(g.phaseDeadlineAt)} submitted=${g.submitted ?? "?"}/${g.total ?? "?"} outcome=${g.outcome ?? "-"}${g.mine ? ` mine=${g.mine.done}/${g.mine.of}` : ""}`;
  const clientPart = `screen="${client.label || client.snippet}" clock="${client.clock}"${client.outcome ? ` shownOutcome=${client.outcome}` : ""}`;
  return `DIAG player=${player} ${serverPart} | ${clientPart} | type=${classify(server, client)}`;
}

/** Diagnose several players; returns the lines (also suitable for logging). */
export async function diagnoseAll(pages) {
  const lines = [];
  for (const { page, name } of pages) lines.push(await lifecycleDiagnosis(page, name));
  return lines;
}
