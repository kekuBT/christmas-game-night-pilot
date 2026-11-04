import { useState } from "react";
import type { PublicPlayer } from "../types.js";
import { ornamentColor } from "./showPhase.js";

/**
 * Living Christmas lobby (M6.2): players as ornaments. Tapping your own
 * ornament produces a brief local sparkle — no server call, no score effect.
 * Presence and host/cohost roles are shown on the ornament itself.
 */
export function LivingLobby(props: { players: PublicPlayer[]; myId: string | null }) {
  const [sparkle, setSparkle] = useState<string | null>(null);
  return <div className="card" data-testid="living-lobby">
    <h2>🎄 The Lodge</h2>
    <p className="muted">Everyone here is an ornament on the tree. Tap your own ornament to make it sparkle.</p>
    <div className="ornament-row">
      {props.players.map((p) => {
        const mine = p.id === props.myId;
        return <button key={p.id} type="button" className="ornament" style={{ ["--orn" as string]: ornamentColor(p.id) }}
          aria-label={`${p.displayName}${p.isHost ? ", host" : ""}${p.isCohost ? ", cohost" : ""}${p.connected ? "" : ", away"}`}
          onClick={() => { if (mine) { setSparkle(p.id); setTimeout(() => setSparkle(null), 1200); } }}>
          <span className="ornament-ball">{p.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="ornament-name">{p.displayName}{p.isHost ? " 👑" : ""}{p.isCohost ? " ⭐" : ""}</span>
          <span className={p.connected ? "dot on" : "dot off"}>{p.connected ? "here" : "away"}</span>
          {sparkle === p.id && <span className="sparkle" aria-hidden="true">✨</span>}
        </button>;
      })}
    </div>
    {props.players.length < 2 && <p className="muted">Waiting for more players — share the room code or QR code below.</p>}
  </div>;
}
