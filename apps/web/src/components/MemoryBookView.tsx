import { jsPDF } from "jspdf";
import { selectShareEntries, paginateLines, canvasNoteY } from "./exportLayout.js";
import type { LedgerEvent, MemoryEntry } from "../types.js";

export type PostFn = <T>(path: string, body: Record<string, unknown>) => Promise<T>;
export type GetFn = <T>(path: string) => Promise<T>;

export function MemoryBookView(props: {
  roomId: string;
  book: MemoryEntry[];
  ledger: LedgerEvent[];
  bookText: string;
  setBookText: (s: string) => void;
  exportText: string;
  setExportText: (s: string) => void;
  post: PostFn;
  get: GetFn;
  loadMemory: () => Promise<void>;
  canApprove: boolean;
}) {
  const { roomId, book, ledger, bookText, setBookText, exportText, setExportText, post, get, loadMemory, canApprove } = props;
  const approved = book.filter((e) => e.approved);

  function downloadPdf() {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Christmas Memory Book", 14, 20);
    doc.setFontSize(12);
    // Flatten to individual lines, then paginate lines (review 5769441799
    // P2): a single oversized entry is split across pages at line
    // boundaries instead of overflowing one page. Each line is 7 units
    // tall, plus a 4-unit gap after each entry.
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
    if (approved.length === 0) doc.text("No approved entries yet.", 14, 32);
    doc.save("christmas-memory-book.pdf");
  }

  function downloadShareImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#102C25"; ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = "#E5BC70"; ctx.font = "bold 64px system-ui"; ctx.fillText("🎄 Christmas Memory Book", 60, 120);
    ctx.fillStyle = "#F7F2E8"; ctx.font = "36px system-ui";
    let y = 200;
    // The image holds at most 8 entries and says so, instead of silently
    // clipping the rest (review 5769121221 #5). The full set is always in
    // the markdown and PDF exports.
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
    if (approved.length === 0) ctx.fillText("No approved entries yet.", 60, 200);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "christmas-memory-book.png";
    a.click();
  }

  return <div className="card"><h2>Christmas Memory Book</h2><p className="muted">Entries must cite a real game-finished event from this room. Only approved entries appear in exports; revoked entries never export.</p>
    <label>Highlight text<textarea value={bookText} onChange={(e) => setBookText(e.target.value)} placeholder="e.g. Ada won Math Mayhem in a tie-break" /></label>
    <div className="row"><button disabled={!bookText || ledger.filter((e) => e.type === "game-finished").length === 0} onClick={async () => { const src = ledger.filter((e) => e.type === "game-finished").slice(-1).map((e) => e.eventId); await post<MemoryEntry>(`/rooms/${roomId}/memory`, { day: 1, text: bookText, sourceEventIds: src }); setBookText(""); await loadMemory(); }}>Add from last finished game</button>
    <button className="secondary" onClick={async () => { const r = await get<{ markdown: string }>(`/rooms/${roomId}/memory/export`); setExportText(r.markdown); }}>Export approved</button>
    <button className="secondary" onClick={downloadPdf}>Download PDF</button>
    <button className="secondary" onClick={downloadShareImage}>Download share image</button><p className="muted">Share image shows the first 8 approved entries; the PDF and markdown exports contain all of them.</p></div>
    {ledger.filter((e) => e.type === "game-finished").length === 0 && <p className="muted">Finish a game first — then you can add a Memory Book entry.</p>}
    {book.map((e) => <div key={e.id} className="card"><p>{e.text} <span className="muted">(Day {e.day} · {e.approved ? "approved" : "pending"})</span></p>{e.derivedFacts.map((f, i) => <p key={i} className="muted">From the ledger: {f}</p>)}<div className="row"><button className="secondary" disabled={!canApprove} onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/approve`, {}); await loadMemory(); }}>Approve</button><button className="secondary" disabled={!canApprove} onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/revoke`, {}); await loadMemory(); }}>Revoke</button></div></div>)}
    {exportText && <pre style={{ whiteSpace: "pre-wrap" }}>{exportText}</pre>}
  </div>;
}
