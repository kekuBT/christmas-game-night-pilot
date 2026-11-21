/**
 * Review 7058937812: the phone's and the TV's briefing, rendered, describe the rules frozen in the match.
 *
 * The server gives a Jebena Rush briefing its match's `rulesVersion` (tests/jebena-briefing-rules.test.ts, from an
 * actual version 1 save). Here the real BriefingScreen (a phone) and BriefingTv render a briefing with that field:
 * version 1 never promises the 5-to-8 streak change; version 2 does, and so does a briefing without the field (an
 * older server: today's rules, as before).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefingScreen, BriefingTv } from "./Briefing.js";
import type { PublicGame, PublicPlayer, RegistryGame } from "../../types.js";

const STREAK = "After a run of 5 to 8 right answers, a new category starts.";
const V1 = "Each answer counts once. Time runs out: one of your cups breaks, and a new category starts.";
const NOW = Date.now();
const player = (id: string, displayName: string): PublicPlayer => ({ id, displayName, avatar: "🙂", isHost: id === "p1", isCohost: false, connected: true });
const PLAYERS = [player("p1", "Keku"), player("p2", "Amina")];
const REGISTRY = { id: "jebena-rush", title: "Jebena Rush", minPlayers: 2, maxPlayers: 10, defaultDurationMinutes: 12, tutorial: "Name it. Pass it." } as RegistryGame;

function briefingGame(rulesVersion?: number): PublicGame {
  return {
    id: "game-1", gameId: "jebena-rush", official: false, status: "briefing", timedOut: false, players: ["p1", "p2"], settings: { hearts: 5 },
    timingVersion: 2, briefing: { createdAt: NOW, startNowAt: NOW + 20_000, warnAt: NOW + 240_000, expiresAt: NOW + 300_000, ready: [], warned: false },
    ...(rulesVersion === undefined ? {} : { rulesVersion }),
  } as PublicGame;
}
const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
const noop = async () => {};
function phone(game: PublicGame) {
  const html = renderToStaticMarkup(
    <BriefingScreen game={game as PublicGame & { briefing: NonNullable<PublicGame["briefing"]> }} registry={REGISTRY} players={PLAYERS} meId="p2" isHost={false}
      onReady={noop} onStartNow={async () => ({ ok: true })} onCancel={noop} />,
  );
  expect(html).toContain('data-testid="briefing"');
  return text(html);
}
function tv(game: PublicGame) {
  const html = renderToStaticMarkup(<BriefingTv game={game as PublicGame & { briefing: NonNullable<PublicGame["briefing"]> }} registry={REGISTRY} players={PLAYERS} joinCode="BB3N55" onBack={() => {}} backLabel="Stop watching" />);
  expect(html).toContain('data-testid="tv-briefing"');
  return text(html);
}

describe("review 7058937812: the rendered briefing follows the match's rules version", () => {
  it("version 1 (a match saved before D-JR-01): neither the phone nor the TV promises the streak change", () => {
    for (const [surface, shown] of [["phone", phone(briefingGame(1))], ["tv", tv(briefingGame(1))]] as const) {
      expect(shown, surface).toContain(V1);
      expect(shown, surface).not.toContain("5 to 8");
      expect(shown, surface).toContain("everyone starts with 5 cups");
    }
  });

  it("version 2 (a fresh match): the phone and the TV both say a run of 5 to 8 right answers changes the category", () => {
    for (const [surface, shown] of [["phone", phone(briefingGame(2))], ["tv", tv(briefingGame(2))]] as const) {
      expect(shown, surface).toContain(STREAK);
      expect(shown, surface).not.toContain(V1);
    }
  });

  it("no version in the briefing (an older server): today's rules, as before", () => {
    for (const [surface, shown] of [["phone", phone(briefingGame())], ["tv", tv(briefingGame())]] as const) expect(shown, surface).toContain(STREAK);
  });
});
