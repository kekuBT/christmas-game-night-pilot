// Memory Book (Stage 4, S3-MEM-01 and v1 A-14): a Night Circle screen with
// honest export feedback.
//
// Exports say what is happening and only what is true:
//   "Preparing your Memory Book PDF…" → "Download started: <file>." (the
//   browser took the file; we can't see whether it was saved) or "Couldn't
//   prepare the PDF. Try again." Downloads are disabled, with the reason, until
//   an entry is approved. File names carry the room code and the date.
//
// Unchanged: who may add (anyone in the room, citing a real finished game),
// who may approve or revoke (host/cohost, enforced by the server; guests no
// longer see disabled buttons, just who decides), and what is exported (only
// approved entries; the PDF keeps the server's ledger facts as recorded).
// Inside the room, an entry shows its game's recorded final scores by name,
// with the raw ledger facts folded away.
import { jsPDF } from "jspdf";
import { useId, useState } from "react";
import { canvasNoteY, exportFilename, paginateLines, readableFact, selectShareEntries } from "../exportLayout.js";
import type { LedgerEvent, MemoryEntry, PublicGame, PublicPlayer, RegistryGame } from "../../types.js";

export type PostFn = <T>(path: string, body: Record<string, unknown>) => Promise<T>;
export type GetFn = <T>(path: string) => Promise<T>;
type ExportState = { kind: "idle" | "working" | "done" | "error"; text: string };

export function MemoryScreen(props: {
  roomId: string;
  roomCode?: string;
  /** The Cup's current day: a new entry is filed under it (it used to be always Day 1). */
  day: number;
  book: MemoryEntry[];
  ledger: LedgerEvent[];
  games: PublicGame[];
  registry: RegistryGame[];
  players: PublicPlayer[];
  bookText: string;
  setBookText: (s: string) => void;
  exportText: string;
  setExportText: (s: string) => void;
  post: PostFn;
  get: GetFn;
  loadMemory: () => Promise<void>;
  canApprove: boolean;
  onBack: () => void;
  onMenu: () => void;
}) {
  const { roomId, roomCode, day, book, ledger, games, registry, players, bookText, setBookText, exportText, setExportText, post, get, loadMemory, canApprove, onBack, onMenu } = props;
  const textId = useId();
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle", text: "" });
  const [addError, setAddError] = useState("");
  const approved = book.filter((e) => e.approved);
  const finishedEvents = ledger.filter((e) => e.type === "game-finished");
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName;
  const title = (gameId: string) => registry.find((g) => g.id === gameId)?.title ?? gameId;

  /** The recorded final scores of the game(s) an entry cites, by name. */
  const results = (e: MemoryEntry) => e.sourceEventIds.flatMap((id) => {
    const ev = ledger.find((x) => x.eventId === id);
    const g = ev?.gameInstanceId ? games.find((x) => x.id === ev.gameInstanceId) : undefined;
    if (!g?.rawScores) return [];
    const scores = Object.entries(g.rawScores).sort((a, b) => b[1] - a[1]).map(([pid, v]) => `${nameOf(pid) ?? pid} ${v.toLocaleString("en-US")}`);
    return [`${title(g.gameId)} · Day ${g.day ?? e.day}: ${scores.join(" · ")}`];
  });

  function downloadPdf(): string {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Christmas Memory Book", 14, 20);
    doc.setFontSize(12);
    // Flatten to lines, then paginate lines (review 5769441799 P2): a single
    // oversized entry is split across pages at line boundaries.
    const lines: { text: string; height: number }[] = [];
    for (const e of approved) {
      for (const l of doc.splitTextToSize(`${e.text} (Day ${e.day})`, 180)) lines.push({ text: l, height: 7 });
      for (const f of e.derivedFacts) {
        for (const l of doc.splitTextToSize(`From the ledger: ${f}`, 180)) lines.push({ text: l, height: 7 });
      }
      lines.push({ text: "", height: 4 });
    }
    const pages = paginateLines(lines.map((l) => l.height), 280, 32);
    for (const page of pages) {
      let y = 32;
      for (const idx of page) {
        const l = lines[idx]!;
        if (l.text) doc.text(l.text, 14, y);
        y += l.height;
      }
      if (page !== pages[pages.length - 1]) doc.addPage();
    }
    const name = exportFilename("pdf", roomCode, new Date());
    doc.save(name);
    return name;
  }

  function downloadShareImage(): string {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas"); // used to fail silently
    ctx.fillStyle = "#102C25"; ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = "#E5BC70"; ctx.font = "bold 64px system-ui"; ctx.fillText("🎄 Christmas Memory Book", 60, 120);
    ctx.fillStyle = "#F7F2E8"; ctx.font = "36px system-ui";
    let y = 200;
    // At most 8 entries, and it says so (review 5769121221 #5).
    const { shown, overflow } = selectShareEntries(approved);
    let truncated = false;
    for (const e of shown) {
      const words = e.text.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > 940 && line) { ctx.fillText(line, 60, y); y += 48; line = w; } else line = test;
      }
      if (line) { ctx.fillText(line, 60, y); y += 48; }
      y += 24;
      if (y > 980) { truncated = true; break; }
    }
    if (truncated) { ctx.fillText("…entry continues in the PDF export.", 60, canvasNoteY(y + 24)); }
    else if (overflow > 0) { ctx.fillText(`…and ${overflow} more in the PDF export.`, 60, canvasNoteY(y + 24)); }
    const name = exportFilename("png", roomCode, new Date());
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = name;
    a.click();
    return name;
  }

  async function runExport(kind: "pdf" | "image") {
    const what = kind === "pdf" ? "PDF" : "share image";
    setExportState({ kind: "working", text: `Preparing your Memory Book ${what}…` });
    await new Promise((r) => setTimeout(r, 30)); // let "Preparing…" paint before the work
    try {
      const name = kind === "pdf" ? downloadPdf() : downloadShareImage();
      setExportState({ kind: "done", text: `Download started: ${name}. If you don’t see it, check your browser’s downloads.` });
    } catch {
      setExportState({ kind: "error", text: `Couldn’t prepare the ${what}. Try again.` });
    }
  }

  const noApproved = approved.length === 0;
  return (
    <main className="mz-screen mz-screen--wide mz-memory" aria-label="Memory Book" data-testid="memory-screen">
      <header className="mz-appbar">
        <button type="button" className="mz-iconbtn" aria-label="Back to lobby" data-testid="memory-back" onClick={onBack}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="mz-appbar__title">Memory Book</h1>
        <button type="button" className="mz-iconbtn" aria-label="Room menu" aria-haspopup="dialog" data-testid="room-menu" onClick={onMenu}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        </button>
      </header>
      <h2 className="mz-memory__title">Christmas Memory Book</h2>
      <p className="mz-foot mz-memory__lede">Highlights from real games in this room. Only entries the host approves go into the exports; revoked entries never do.</p>

      {/* Add a highlight. */}
      <section className="mz-card mz-memory__add" aria-label="Add a highlight">
        <label htmlFor={textId} className="mz-field__label">Highlight text</label>
        <textarea id={textId} className="mz-input mz-memory__text" value={bookText} onChange={(e) => setBookText(e.target.value)} placeholder="e.g. Ada won Math Mayhem in a tie-break" maxLength={280} />
        <button type="button" className="mz-key mz-key--brand mz-key--md" disabled={!bookText.trim() || finishedEvents.length === 0} onClick={async () => {
          setAddError("");
          try {
            const src = finishedEvents.slice(-1).map((e) => e.eventId);
            await post<MemoryEntry>(`/rooms/${roomId}/memory`, { day, text: bookText, sourceEventIds: src });
            setBookText("");
            await loadMemory();
          } catch (e) { setAddError(e instanceof Error ? e.message : "The highlight could not be added."); }
        }}>Add from last finished game</button>
        <p className="mz-foot mz-memory__hint" data-testid="memory-add-hint">
          {finishedEvents.length === 0 ? "Finish a game first — then you can add a Memory Book entry." : !bookText.trim() ? "Write the highlight, then add it. It's linked to the last finished game." : canApprove ? "You can approve it straight after adding it." : "The host approves it before it goes into the exports."}
        </p>
        {addError && <p className="err" role="alert">{addError}</p>}
      </section>

      {/* Entries. */}
      <section className="mz-memory__entries" aria-label="Entries">
        {book.length === 0 ? (
          <p className="mz-foot mz-memory__empty" data-testid="memory-empty">No entries yet. Add the first highlight after a game.</p>
        ) : book.map((e) => {
          const res = results(e);
          return (
            <article key={e.id} className={`mz-card mz-memory__entry${e.approved ? " mz-memory__entry--approved" : ""}`} data-testid="memory-entry">
              <p className="mz-memory__entrytext">{e.text}</p>
              <p className="mz-memory__status"><span className={`mz-badge ${e.approved ? "mz-badge--mint" : "mz-memory__pending"}`}>Day {e.day} · {e.approved ? "approved" : "pending"}</span></p>
              {res.map((r) => <p key={r} className="mz-foot mz-memory__result">{r}</p>)}
              {e.derivedFacts.length > 0 && (
                <details className="mz-memory__facts">
                  <summary>From the ledger ({e.derivedFacts.length} score {e.derivedFacts.length === 1 ? "event" : "events"})</summary>
                  <ul>{e.derivedFacts.map((f, i) => <li key={i}>{readableFact(f, nameOf)}</li>)}</ul>
                </details>
              )}
              {canApprove ? (
                <div className="mz-memory__actions">
                  {!e.approved && <button type="button" className="mz-chip-btn" onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/approve`, {}); await loadMemory(); }}>Approve</button>}
                  {e.approved && <button type="button" className="mz-chip-btn" onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/revoke`, {}); await loadMemory(); }}>Revoke</button>}
                </div>
              ) : (
                !e.approved && <p className="mz-foot mz-memory__who">Waiting for the host to approve it.</p>
              )}
            </article>
          );
        })}
      </section>

      {/* Exports. */}
      <section className="mz-card mz-memory__export" aria-label="Export">
        <p className="mz-kicker">Keep it</p>
        <div className="mz-memory__exportrow">
          <button type="button" className="mz-chip-btn" onClick={async () => {
            try { const r = await get<{ markdown: string }>(`/rooms/${roomId}/memory/export`); setExportText(r.markdown); }
            catch { setExportState({ kind: "error", text: "Couldn’t load the export. Try again." }); }
          }}>Export approved</button>
          <button type="button" className="mz-chip-btn" data-testid="memory-pdf" disabled={noApproved || exportState.kind === "working"} onClick={() => void runExport("pdf")}>Download PDF</button>
          <button type="button" className="mz-chip-btn" data-testid="memory-image" disabled={noApproved || exportState.kind === "working"} onClick={() => void runExport("image")}>Download share image</button>
        </div>
        <p className={`mz-foot mz-memory__exportstatus${exportState.kind === "error" ? " mz-memory__exportstatus--error" : ""}`} role="status" aria-live="polite" data-testid="memory-export-status" data-state={exportState.kind}>
          {exportState.kind !== "idle" ? exportState.text : noApproved ? "Downloads open once an entry is approved: only approved entries are exported." : `${approved.length} approved ${approved.length === 1 ? "entry" : "entries"}. The share image shows the first 8; the PDF and the export have them all.`}
        </p>
        {exportText && <pre className="mz-memory__md">{exportText}</pre>}
      </section>
    </main>
  );
}
