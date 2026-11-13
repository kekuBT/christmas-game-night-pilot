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
//
// Stage 10.5 (docs/stage10/stage105.md §5–6; D-S105-04, D-S105-05): every new export first gets a fresh, authorized
// snapshot of the book and is built from that snapshot's approved entries only. If that check fails nothing is
// downloaded and the screen says so; it never falls back to the approvals already on screen. A newer revision heard
// during the check restarts it (up to three times), then the export is cancelled. The Markdown on screen is removed
// once the book moves past the revision it was made from. A file already downloaded can't be recalled. Approve and
// revoke show their progress and failures, and never change an entry before the server has.
import { jsPDF } from "jspdf";
import { useId, useState } from "react";
import { canvasNoteY, exportFilename, paginateLines, selectShareEntries } from "../exportLayout.js";
import type { LedgerEvent, MemoryEntry, PublicGame, PublicPlayer, RegistryGame } from "../../types.js";
import { titleFor } from "../../ui/mchezo/lib/names.js";
import { memoryLink } from "../../ui/mchezo/lib/memoryLink.js";
import { exportIsStale, exportStep, type BookSnapshot } from "../../ui/mchezo/lib/bookSync.js";
import { memoryTeamLine, type MemoryTeamFacts } from "../../../../../src/shared/memoryTeam.js";
import { bookModeOf, entryFactLines, entryLabel, type BookContext } from "../../../../../src/shared/memoryPresent.js";
import { useMchezo } from "../../ui/mchezo/MchezoProvider.js";

export type PostFn = <T>(path: string, body: Record<string, unknown>) => Promise<T>;
export type GetFn = <T>(path: string) => Promise<T>;
type ExportState = { kind: "idle" | "working" | "done" | "error"; text: string };
type EntryOp = { id: string; kind: "approve" | "revoke"; state: "busy" | "error"; text?: string };
/** Why an export didn't happen (D-S105-04): the check failed, or the book kept moving. */
class NoFreshSnapshot extends Error {}
const CHECK_FAILED = "Couldn’t check the latest approvals, so nothing was downloaded. Try again.";
const BOOK_MOVING = "The book is changing right now, so nothing was downloaded. Try again in a moment.";
/** A request's failure in plain words: the server's own sentence when it sent one, else that it didn't answer. */
const whyFailed = (e: unknown) => e instanceof Error && e.message && !/fetch|network|abort|timed? ?out|load failed/i.test(e.message) ? e.message : "The game didn’t answer. Nothing changed; try again.";

export function MemoryScreen(props: {
  roomId: string;
  roomCode?: string;
  /** The Cup's current day: a new entry is filed under it (it used to be always Day 1). */
  day: number;
  /** Stage 5.1 (3E): the room's ledger seq from the live projection; the loaded ledger is current when its watermark has reached it. */
  roomSeq?: number;
  /** Stage 10.2 repair (S102-R1): the freshness watermark of the loaded ledger (the room's seq when it was read); undefined before the first load. */
  ledgerAt?: number;
  book: MemoryEntry[];
  ledger: LedgerEvent[];
  games: PublicGame[];
  registry: RegistryGame[];
  players: PublicPlayer[];
  bookText: string;
  setBookText: (s: string) => void;
  /** Stage 10.5: the Markdown export on screen and the book revision it was made from. */
  exportDoc: { markdown: string; revision: number } | null;
  setExportDoc: (d: { markdown: string; revision: number } | null) => void;
  post: PostFn;
  get: GetFn;
  /** Stage 10.5: the revision of the book on screen, and the highest this page has heard of. */
  bookRevision: number;
  heardRevision: number;
  /** The highest revision heard right now (read at the moment of an export's check, not at render). */
  heard: () => number;
  /** A fresh, authorized snapshot (it also updates the screen when newer); throws when none came. */
  fetchSnapshot: () => Promise<BookSnapshot>;
  /** Fetch the book now (after this page's own change). */
  refreshBook: () => Promise<void>;
  canApprove: boolean;
  /** Stage 11.2 (D-S112-01): the room's kind (fixed for its life): a Cup book shows days, a casual one doesn't. */
  roomKind?: "cup" | "casual" | "solo";
  onBack: () => void;
  onMenu: () => void;
}) {
  const { roomId, roomCode, day, roomSeq, ledgerAt, book, ledger, games, registry, players, bookText, setBookText, exportDoc, setExportDoc, post, get, bookRevision, heardRevision, heard, fetchSnapshot, refreshBook, canApprove, roomKind, onBack, onMenu } = props;
  const textId = useId();
  const theme = useMchezo().theme;
  const look = theme.color;
  // Stage 10.3 (D-S103-06): the title follows this device's look; only the title and decoration change, never a fact.
  const christmas = theme.id === "christmas";
  const bookTitle = christmas ? "Christmas Memory Book" : "Mchezo Memory Book";
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle", text: "" });
  const [addError, setAddError] = useState("");
  const [entryOp, setEntryOp] = useState<EntryOp | null>(null);
  const approved = book.filter((e) => e.approved);
  // Stage 10.5 (D-S105-04): the Markdown on screen is shown only while no newer book is known.
  const mdStale = !!exportDoc && exportIsStale(exportDoc.revision, { heard: heardRevision, applied: bookRevision });
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName;
  const title = (gameId: string) => titleFor(gameId, registry);
  // Stage 11.2 (D-S112-01, D-S112-02): one presentation rule for the screen, the PDF and the server's Markdown. A Cup
  // book shows days; a casual one names the game instead. Names come from the entry, else this room's players.
  const cupBook = bookModeOf(roomKind) === "cup";
  const gameOfEvent = (id: string) => { const ev = ledger.find((x) => x.eventId === id); return ev?.gameInstanceId ? games.find((x) => x.id === ev.gameInstanceId) : undefined; };
  const bookCtx: BookContext = {
    roomKind,
    nameOf,
    sourceGames: (e) => e.sourceEventIds.map((id) => { const g = gameOfEvent(id); return g ? { title: title(g.gameId), ...(g.day !== undefined ? { day: g.day } : {}) } : {}; }),
  };
  // Stage 5.1 (3E): the game a new highlight will cite, shown before adding,
  // and exactly what is sent. While the loaded ledger is behind the room's
  // (a game just finished), adding waits for the reload instead of citing
  // the game before it. Stage 10.2 repair (S102-R1, D-S102-06): "behind" is
  // judged by the loaded ledger's own watermark, never by its newest visible
  // event (which trails for good when the room's newest events are private
  // to someone else); a team game says plainly that it can't be saved yet.
  const link = memoryLink({ ledger, ledgerAt, roomSeq, games, registry });
  const { target, targetGame } = link;
  const syncing = link.state === "loading" || link.state === "syncing";
  /** Stage 10.3: a team entry's facts, in the one shared wording (src/shared/memoryTeam.ts). */
  const teamLine = (t: MemoryTeamFacts) => memoryTeamLine(t, title(t.kind));
  // What a team game would be saved with (a preview from the public result; the server derives the facts it keeps).
  const teamPreview = link.state === "ready" && targetGame?.outcome?.team && target?.eventId
    ? teamLine({ kind: targetGame.outcome.team.kind, gameInstanceId: targetGame.id, finishedEventId: target.eventId, total: targetGame.outcome.team.total, max: targetGame.outcome.team.max, roundsRevealed: targetGame.outcome.team.rounds.length, roundsPlanned: targetGame.outcome.team.roundsPlanned, end: targetGame.outcome.team.end === "too-few-players" ? "too-few-players" : "completed" })
    : null;

  /** The recorded final scores of the game(s) an entry cites, by name. */
  const results = (e: MemoryEntry) => e.sourceEventIds.flatMap((id) => {
    const ev = ledger.find((x) => x.eventId === id);
    const g = ev?.gameInstanceId ? games.find((x) => x.id === ev.gameInstanceId) : undefined;
    if (!g?.rawScores) return [];
    const scores = Object.entries(g.rawScores).sort((a, b) => b[1] - a[1]).map(([pid, v]) => `${nameOf(pid) ?? "A player"} ${v.toLocaleString("en-US")}`);
    // Stage 11.2: the game and its day in a Cup book; the game alone in a casual one.
    return [`${title(g.gameId)}${cupBook ? ` · Day ${g.day ?? e.day}` : ""}: ${scores.join(" · ")}`];
  });

  /** Stage 10.5: the entries an export is built from: the fresh snapshot's approved ones, never the screen's. */
  function downloadPdf(approvedNow: MemoryEntry[]): string {
    const doc = new jsPDF();
    // Stage 11.1 (spec §3 A10): a light look's PDF takes its page, title and text colours; a dark look's PDF stays
    // plain black on white, as before (a dark page wastes ink). Which notes and words go in is unchanged.
    const light = theme.tone === "light";
    const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const paintPage = () => {
      if (!light) return;
      doc.setFillColor(...rgb(look.ground));
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
      doc.setTextColor(...rgb(look.text));
    };
    paintPage();
    doc.setFontSize(20);
    if (light) doc.setTextColor(...rgb(look.brand));
    doc.text(bookTitle, 14, 20);
    if (light) doc.setTextColor(...rgb(look.text));
    doc.setFontSize(12);
    // Flatten to lines, then paginate lines (review 5769441799 P2): a single
    // oversized entry is split across pages at line boundaries.
    const lines: { text: string; height: number }[] = [];
    for (const e of approvedNow) {
      // Stage 11.2: "(Day 2)" in a Cup book, "(Trivia Showdown)" in a casual one; facts with names, never ids.
      for (const l of doc.splitTextToSize(`${e.text} (${entryLabel(e, bookCtx)})`, 180)) lines.push({ text: l, height: 7 });
      // Stage 10.3: a team entry's facts come from its frozen team record ("From the game"), others as before.
      for (const f of e.team ? [teamLine(e.team)] : entryFactLines(e, bookCtx)) {
        for (const l of doc.splitTextToSize(`${e.team ? "From the game" : "From the ledger"}: ${f}`, 180)) lines.push({ text: l, height: 7 });
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
      if (page !== pages[pages.length - 1]) { doc.addPage(); paintPage(); }
    }
    const name = exportFilename("pdf", roomCode, new Date(), christmas ? "christmas" : "everyday");
    doc.save(name);
    return name;
  }

  function downloadShareImage(approvedNow: MemoryEntry[]): string {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas"); // used to fail silently
    // Stage 8.2 (§3.6): the share image takes this device's look (the
    // retired "Midnight Christmas" colours are gone); its words are unchanged.
    ctx.fillStyle = look.ground; ctx.fillRect(0, 0, 1080, 1080);
    // Stage 10.3 (D-S103-06): the title and its decoration follow the look; Everyday has no tree.
    ctx.fillStyle = look.highlight; ctx.font = "bold 64px system-ui"; ctx.fillText(christmas ? `🎄 ${bookTitle}` : bookTitle, 60, 120);
    ctx.fillStyle = look.text; ctx.font = "36px system-ui";
    let y = 200;
    // At most 8 entries, and it says so (review 5769121221 #5).
    const { shown, overflow } = selectShareEntries(approvedNow);
    let truncated = false;
    const wrap = (text: string, step: number) => {
      let line = "";
      for (const w of text.split(" ")) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > 940 && line) { ctx.fillText(line, 60, y); y += step; line = w; } else line = test;
      }
      if (line) { ctx.fillText(line, 60, y); y += step; }
    };
    for (const e of shown) {
      wrap(e.text, 48);
      if (e.team) {
        // Stage 10.3: a team entry's facts line under its note, smaller, in the shared wording.
        ctx.font = "28px system-ui";
        wrap(teamLine(e.team), 38);
        ctx.font = "36px system-ui";
      }
      y += 24;
      if (y > 980) { truncated = true; break; }
    }
    if (truncated) { ctx.fillText("…entry continues in the PDF export.", 60, canvasNoteY(y + 24)); }
    else if (overflow > 0) { ctx.fillText(`…and ${overflow} more in the PDF export.`, 60, canvasNoteY(y + 24)); }
    const name = exportFilename("png", roomCode, new Date(), christmas ? "christmas" : "everyday");
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = name;
    a.click();
    return name;
  }

  /**
   * Stage 10.5 (D-S105-04): a snapshot no older than anything this page has heard of. A newer revision heard while it
   * was fetched means it's already out of date: fetch again, up to three times, then give up (the book keeps moving).
   */
  async function latestSnapshot(): Promise<BookSnapshot> {
    for (let attempt = 1; ; attempt++) {
      let snap: BookSnapshot;
      try { snap = await fetchSnapshot(); } catch { throw new NoFreshSnapshot(CHECK_FAILED); }
      const step = exportStep(snap.revision, heard(), attempt);
      if (step === "use") return snap;
      if (step === "cancel") throw new NoFreshSnapshot(BOOK_MOVING);
    }
  }

  async function runExport(kind: "pdf" | "image") {
    const what = kind === "pdf" ? "PDF" : "share image";
    setExportState({ kind: "working", text: `Preparing your Memory Book ${what}…` });
    await new Promise((r) => setTimeout(r, 30)); // let "Preparing…" paint before the work
    let approvedNow: MemoryEntry[];
    try {
      approvedNow = (await latestSnapshot()).entries.filter((e) => e.approved);
    } catch (e) {
      setExportState({ kind: "error", text: e instanceof NoFreshSnapshot ? e.message : CHECK_FAILED });
      return;
    }
    if (approvedNow.length === 0) {
      setExportState({ kind: "error", text: "Nothing is approved right now, so nothing was downloaded." });
      return;
    }
    try {
      // Built straight from the snapshot just checked, with no wait in between.
      const name = kind === "pdf" ? downloadPdf(approvedNow) : downloadShareImage(approvedNow);
      setExportState({ kind: "done", text: `Download started: ${name}. If you don’t see it, check your browser’s downloads.` });
    } catch {
      setExportState({ kind: "error", text: `Couldn’t prepare the ${what}. Try again.` });
    }
  }

  /** Stage 10.5: the Markdown export, from the server, at a revision no older than this page has heard of. */
  async function exportMarkdown() {
    setExportState({ kind: "working", text: "Preparing the export…" });
    try {
      for (let attempt = 1; ; attempt++) {
        const r = await get<{ markdown?: unknown; revision?: unknown }>(`/rooms/${roomId}/memory/export`);
        if (typeof r.markdown !== "string" || typeof r.revision !== "number") throw new Error("unexpected reply");
        const step = exportStep(r.revision, heard(), attempt);
        if (step === "use") { setExportDoc({ markdown: r.markdown, revision: r.revision }); setExportState({ kind: "idle", text: "" }); return; }
        if (step === "cancel") { setExportState({ kind: "error", text: BOOK_MOVING }); return; }
      }
    } catch {
      setExportState({ kind: "error", text: "Couldn’t load the export. Try again." });
    }
  }

  /** Stage 10.5 (§6): approve or revoke; busy while it runs, a plain failure that changes nothing, then the server's book. */
  async function decide(e: MemoryEntry, kind: "approve" | "revoke") {
    setEntryOp({ id: e.id, kind, state: "busy" });
    try {
      await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/${kind}`, {});
      setEntryOp(null);
    } catch (err) {
      setEntryOp({ id: e.id, kind, state: "error", text: `Couldn’t ${kind} it. ${whyFailed(err)}` });
    }
    await refreshBook(); // what the server holds now, either way
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
      <h2 className="mz-memory__title" data-testid="memory-title">{bookTitle}</h2>
      <p className="mz-foot mz-memory__lede">Highlights from real games in this room. Only entries the host approves go into the exports; revoked entries never do.</p>

      {/* Add a highlight. */}
      <section className="mz-card mz-memory__add" aria-label="Add a highlight">
        <label htmlFor={textId} className="mz-field__label">Highlight text</label>
        <textarea id={textId} className="mz-input mz-memory__text" value={bookText} onChange={(e) => setBookText(e.target.value)} placeholder="e.g. Ada won Math Mayhem in a tie-break" maxLength={280} />
        {link.state !== "none" && (
          <p className="mz-foot mz-memory__target" data-testid="memory-link-target" data-state={link.state} data-event={target?.eventId} aria-live="polite">
            {syncing ? "Checking for the latest finished game…"
              : link.state === "unavailable" && link.why === "team-not-final" ? <>The last game that finished is <b>{targetGame ? title(targetGame.gameId) : "the last game"}</b>. It was stopped before its team result was final, so it can&rsquo;t be saved.</>
              : link.state === "unavailable" ? <>The last game that finished is <b>{targetGame ? title(targetGame.gameId) : "the last game"}</b>, a team game: team games like this one aren&rsquo;t saved to the Memory Book yet.</>
              : <>Linked to <b>{targetGame ? title(targetGame.gameId) : "the last finished game"}</b>{targetGame && cupBook ? ` · Day ${targetGame.day ?? day}` : ""}: the last game that finished.</>}
          </p>
        )}
        {teamPreview && <p className="mz-foot mz-memory__target" data-testid="memory-link-facts">Saved with: {teamPreview}</p>}
        <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="memory-add" disabled={!bookText.trim() || link.state !== "ready"} onClick={async () => {
          setAddError("");
          try {
            const src = target ? [target.eventId] : [];
            await post<MemoryEntry>(`/rooms/${roomId}/memory`, { day, text: bookText, sourceEventIds: src });
            setBookText("");
            await refreshBook();
          } catch (e) { setAddError(e instanceof Error ? e.message : "The highlight could not be added."); }
        }}>Add from last finished game</button>
        <p className="mz-foot mz-memory__hint" data-testid="memory-add-hint">
          {link.state === "none" ? "Finish a game first — then you can add a Memory Book entry." : link.state === "unavailable" ? "You can add a highlight after the next game." : !bookText.trim() ? "Write the highlight, then add it. It's linked to the last finished game." : canApprove ? "You can approve it straight after adding it." : "The host approves it before it goes into the exports."}
        </p>
        {addError && <p className="err" role="alert">{addError}</p>}
      </section>

      {/* Entries. */}
      <section className="mz-memory__entries" aria-label="Entries">
        {book.length === 0 ? (
          <p className="mz-foot mz-memory__empty" data-testid="memory-empty">No entries yet. Add the first highlight after a game.</p>
        ) : book.map((e) => {
          const res = e.team ? [] : results(e);
          return (
            <article key={e.id} className={`mz-card mz-memory__entry${e.approved ? " mz-memory__entry--approved" : ""}`} data-testid="memory-entry">
              <p className="mz-memory__entrytext">{e.text}</p>
              <p className="mz-memory__status"><span className={`mz-badge ${e.approved ? "mz-badge--mint" : "mz-memory__pending"}`} data-testid="memory-entry-badge">{entryLabel(e, bookCtx)} · {e.approved ? "approved" : "pending"}</span></p>
              {res.map((r) => <p key={r} className="mz-foot mz-memory__result">{r}</p>)}
              {/* Stage 10.3: the server's team facts, visibly apart from the note above. */}
              {e.team && <p className="mz-foot mz-memory__result" data-testid="memory-entry-team">From the game: {teamLine(e.team)}</p>}
              {!e.team && e.derivedFacts.length > 0 && (
                <details className="mz-memory__facts">
                  <summary>From the ledger ({e.derivedFacts.length} score {e.derivedFacts.length === 1 ? "event" : "events"})</summary>
                  <ul>{entryFactLines(e, bookCtx).map((f, i) => <li key={i}>{f}</li>)}</ul>
                </details>
              )}
              {canApprove ? (
                <div className="mz-memory__actions">
                  {/* Stage 10.5 (§6): busy while it runs; the entry changes only when the server's book does. */}
                  {!e.approved && <button type="button" className="mz-chip-btn" aria-busy={entryOp?.id === e.id && entryOp.state === "busy"} disabled={entryOp?.id === e.id && entryOp.state === "busy"} onClick={() => void decide(e, "approve")}>Approve</button>}
                  {e.approved && <button type="button" className="mz-chip-btn" aria-busy={entryOp?.id === e.id && entryOp.state === "busy"} disabled={entryOp?.id === e.id && entryOp.state === "busy"} onClick={() => void decide(e, "revoke")}>Revoke</button>}
                  {entryOp?.id === e.id && entryOp.state === "busy" && <span className="mz-foot" role="status" data-testid="memory-entry-busy">{entryOp.kind === "approve" ? "Approving…" : "Revoking…"}</span>}
                </div>
              ) : (
                !e.approved && <p className="mz-foot mz-memory__who">Waiting for the host to approve it.</p>
              )}
              {entryOp?.id === e.id && entryOp.state === "error" && <p className="err" role="alert" data-testid="memory-entry-error">{entryOp.text}</p>}
            </article>
          );
        })}
      </section>

      {/* Exports. */}
      <section className="mz-card mz-memory__export" aria-label="Export">
        <p className="mz-kicker">Keep it</p>
        <div className="mz-memory__exportrow">
          <button type="button" className="mz-chip-btn" data-testid="memory-md" disabled={exportState.kind === "working"} onClick={() => void exportMarkdown()}>Export approved</button>
          <button type="button" className="mz-chip-btn" data-testid="memory-pdf" disabled={noApproved || exportState.kind === "working"} onClick={() => void runExport("pdf")}>Download PDF</button>
          <button type="button" className="mz-chip-btn" data-testid="memory-image" disabled={noApproved || exportState.kind === "working"} onClick={() => void runExport("image")}>Download share image</button>
        </div>
        <p className={`mz-foot mz-memory__exportstatus${exportState.kind === "error" ? " mz-memory__exportstatus--error" : ""}`} role="status" aria-live="polite" data-testid="memory-export-status" data-state={exportState.kind}>
          {exportState.kind !== "idle" ? exportState.text : noApproved ? "Downloads open once an entry is approved: only approved entries are exported." : `${approved.length} approved ${approved.length === 1 ? "entry" : "entries"}. The share image shows the first 8; the PDF and the export have them all.`}
        </p>
        {/* Stage 10.5 (D-S105-04): an export made before the book last changed is taken down, and says why. */}
        {exportDoc && !mdStale && <pre className="mz-memory__md" data-testid="memory-md-text" data-revision={exportDoc.revision}>{exportDoc.markdown}</pre>}
        {mdStale && <p className="mz-foot" role="status" data-testid="memory-md-stale">The book changed since this export. Export again for the current approvals.</p>}
        <p className="mz-foot mz-memory__boundary">Each export uses the approvals at the moment you ask. A file you&rsquo;ve already downloaded doesn&rsquo;t change if a note is revoked later.</p>
      </section>
    </main>
  );
}
