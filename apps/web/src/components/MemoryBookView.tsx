import { jsPDF } from "jspdf";
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
    let y = 32;
    for (const e of approved) {
      const lines = doc.splitTextToSize(`${e.text} (Day ${e.day})`, 180);
      doc.text(lines, 14, y);
      y += lines.length * 7 + 4;
      for (const f of e.derivedFacts) {
        const fl = doc.splitTextToSize(`From the ledger: ${f}`, 180);
        doc.text(fl, 14, y);
        y += fl.length * 7 + 2;
      }
      y += 4;
      if (y > 260) { doc.addPage(); y = 20; }
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
    for (const e of approved.slice(0, 8)) {
      const words = e.text.split(" ");
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > 940 && line) { ctx.fillText(line, 60, y); y += 48; line = w; } else line = test;
      }
      if (line) { ctx.fillText(line, 60, y); y += 48; }
      y += 24;
      if (y > 980) break;
    }
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
    <button className="secondary" onClick={downloadShareImage}>Download share image</button></div>
    {ledger.filter((e) => e.type === "game-finished").length === 0 && <p className="muted">Finish a game first — then you can add a Memory Book entry.</p>}
    {book.map((e) => <div key={e.id} className="card"><p>{e.text} <span className="muted">(Day {e.day} · {e.approved ? "approved" : "pending"})</span></p>{e.derivedFacts.map((f, i) => <p key={i} className="muted">From the ledger: {f}</p>)}<div className="row"><button className="secondary" disabled={!canApprove} onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/approve`, {}); await loadMemory(); }}>Approve</button><button className="secondary" disabled={!canApprove} onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/memory/${e.id}/revoke`, {}); await loadMemory(); }}>Revoke</button></div></div>)}
    {exportText && <pre style={{ whiteSpace: "pre-wrap" }}>{exportText}</pre>}
  </div>;
}
