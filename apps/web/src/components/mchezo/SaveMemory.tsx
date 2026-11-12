// Stage 10.4 (docs/stage10/stage104.md §4; D-S104-01..03): Save a memory, on a result screen.
//
// One tap opens a small inline composer: the match's facts (read-only, a preview of what the server derives), the
// player's own note, and explicit Save and Cancel. A save names the game on this screen (`fromGame`), never "the last
// finished game", and carries one request key per draft, so a double tap, a lost reply or a reconnect saves once. It
// lands pending: only the host or a cohost approves. Nothing here touches a score or the result's controls.
import { useEffect, useId, useRef, useState } from "react";
import type { MemoryEntry } from "../../types.js";
import { SAVE_NOTE_MAX, type SaveMemoryFacts } from "../../ui/mchezo/lib/saveMemory.js";

/** POST the save; resolves with the server's status and reply, or throws when no reply came (network, time-out). */
export type SaveMemorySend = (body: { text: string; requestId: string }) => Promise<{ status: number; body: Record<string, unknown> }>;

type State =
  | { kind: "closed" }
  | { kind: "open"; error?: string; retry?: boolean }
  | { kind: "saving" }
  | { kind: "saved"; entry: MemoryEntry; earlier: boolean };

export function SaveMemory({ facts, send, newKey, canApprove, onOpenBook }: {
  facts: SaveMemoryFacts;
  send: SaveMemorySend;
  /** A fresh request key (one per draft). */
  newKey: () => string;
  /** Host or cohost: their own saves still wait for approval, which they give in the Memory Book. */
  canApprove: boolean;
  onOpenBook: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<State>({ kind: "closed" });
  const [draft, setDraft] = useState("");
  const key = useRef<string | null>(null);
  const openBtn = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLTextAreaElement>(null);
  const saved = useRef<HTMLParagraphElement>(null);
  const closedBefore = useRef(false);

  useEffect(() => {
    if (state.kind === "open" && !state.error) note.current?.focus();
    if (state.kind === "saved") saved.current?.focus();
    if (state.kind === "closed" && closedBefore.current) openBtn.current?.focus();
  }, [state.kind]);

  if (!facts.saveable) {
    return (
      <section className="mz-save" aria-label="Save a memory" data-testid="save-memory" data-state="unavailable">
        <p className="mz-foot" data-testid="save-memory-unavailable">{facts.why}</p>
      </section>
    );
  }

  const cancel = () => { closedBefore.current = true; key.current = null; setDraft(""); setState({ kind: "closed" }); };
  async function submit() {
    const text = draft;
    if (!text.trim() || state.kind === "saving") return;
    key.current ??= newKey(); // one key per draft: a retry of this draft reuses it
    setState({ kind: "saving" });
    try {
      const r = await send({ text, requestId: key.current });
      if (r.status === 200 || r.status === 201) { key.current = null; setState({ kind: "saved", entry: r.body as unknown as MemoryEntry, earlier: false }); return; }
      if (r.status === 409 && r.body["code"] === "ATTEMPT_MISMATCH" && r.body["entry"]) {
        // The first save of this draft had reached the book before its reply was lost: it stands, unchanged.
        key.current = null;
        setState({ kind: "saved", entry: r.body["entry"] as MemoryEntry, earlier: true });
        return;
      }
      setState({ kind: "open", error: typeof r.body["error"] === "string" ? r.body["error"] : "That didn't save. Try again." });
    } catch {
      setState({ kind: "open", error: "Couldn't reach the game. Your note is still here; try again.", retry: true });
    }
  }

  if (state.kind === "closed") {
    return (
      <section className="mz-save" aria-label="Save a memory" data-testid="save-memory" data-state="closed">
        <button ref={openBtn} type="button" className="mz-key mz-key--md mz-save__open" data-testid="save-memory-open" aria-expanded={false} aria-controls={`${id}-composer`} onClick={() => setState({ kind: "open" })}>Save a memory</button>
      </section>
    );
  }

  if (state.kind === "saved") {
    return (
      <section className="mz-save mz-card" aria-label="Save a memory" data-testid="save-memory" data-state="saved">
        <p ref={saved} tabIndex={-1} className="mz-save__done" role="status" data-testid="save-memory-saved">
          {state.earlier ? "Your first save had already reached the Memory Book, so it was kept as it was. " : "Saved to the Memory Book. "}
          {canApprove ? "Approve it there to put it in the exports." : "It's waiting for the host to approve it."}
        </p>
        <p className="mz-save__note" data-testid="save-memory-saved-note">“{state.entry.text}”</p>
        <button type="button" className="mz-chip-btn" data-testid="save-memory-open-book" onClick={onOpenBook}>Open the Memory Book</button>
      </section>
    );
  }

  const saving = state.kind === "saving";
  return (
    <section id={`${id}-composer`} className="mz-save mz-card" aria-labelledby={`${id}-title`} data-testid="save-memory" data-state={saving ? "saving" : state.error ? "error" : "open"}
      onKeyDown={(e) => { if (e.key === "Escape" && !saving) { e.stopPropagation(); cancel(); } }}>
      <h3 id={`${id}-title`} className="mz-save__title">Save a memory</h3>
      <div className="mz-save__facts" data-testid="save-memory-facts">
        <p className="mz-kicker">From the game</p>
        <ul>{facts.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      <label htmlFor={`${id}-note`} className="mz-field__label">Your note</label>
      <textarea ref={note} id={`${id}-note`} className="mz-input mz-save__text" data-testid="save-memory-note" value={draft} maxLength={SAVE_NOTE_MAX} disabled={saving}
        placeholder="What do you want to remember?" onChange={(e) => setDraft(e.target.value)} aria-describedby={`${id}-help`} />
      <p id={`${id}-help`} className="mz-foot">Your words, saved with the facts above. {SAVE_NOTE_MAX - draft.length} characters left.</p>
      {state.kind === "open" && state.error && <p className="err" role="alert" data-testid="save-memory-error">{state.error}</p>}
      <div className="mz-save__actions">
        <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="save-memory-save" disabled={saving || !draft.trim()} onClick={() => void submit()}>
          {saving ? "Saving…" : state.kind === "open" && state.retry ? "Try again" : "Save"}
        </button>
        <button type="button" className="mz-chip-btn" data-testid="save-memory-cancel" disabled={saving} onClick={cancel}>Cancel</button>
      </div>
    </section>
  );
}
