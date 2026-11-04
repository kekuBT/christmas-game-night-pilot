import { useState } from "react";
import type { Projection } from "../types.js";

export const REACTION_EMOJIS = ["🎄", "❄️", "🎉", "👏", "😂", "🔥"];

/**
 * Live reactions (M6.5): a curated emoji set only, no free text, no score
 * effect. Rendered only on lobby/TV/results screens — the parent must not
 * mount this during private gameplay phases. Rate limiting and muting are
 * enforced server-side; the client only surfaces the server's answer.
 */
export function Reactions(props: { proj: Projection | null; post: (path: string, body: Record<string, unknown>) => Promise<unknown>; canMute: boolean }) {
  const [note, setNote] = useState("");
  const recent = props.proj?.reactions ?? [];
  const muted = props.proj?.reactionsMuted ?? false;
  async function send(emoji: string) {
    setNote("");
    try { await props.post(`/rooms/${props.proj?.roomId}/reactions`, { emoji }); }
    catch (e) { setNote(e instanceof Error ? e.message : "Reaction failed"); }
  }
  async function toggleMute() {
    try { await props.post(`/rooms/${props.proj?.roomId}/reactions/mute`, { muted: !muted }); }
    catch (e) { setNote(e instanceof Error ? e.message : "Mute failed"); }
  }
  return <div className="card" data-testid="reactions">
    <h3>Reactions</h3>
    {muted
      ? <p className="muted">Reactions are muted by the host.</p>
      : <div className="row" role="group" aria-label="Send a reaction">
        {REACTION_EMOJIS.map((e) => <button key={e} type="button" className="reaction-btn" aria-label={`React ${e}`} onClick={() => send(e)}>{e}</button>)}
      </div>}
    {recent.length > 0 && <p data-testid="recent-reactions" aria-live="polite">{recent.map((r) => `${r.emoji} ${r.sender}`).join(" · ")}</p>}
    {props.canMute && <button type="button" className="secondary" onClick={toggleMute}>{muted ? "Unmute reactions" : "Mute reactions"}</button>}
    {note && <p className="err">{note}</p>}
  </div>;
}
