/**
 * Stage 5.1 (Phase 4): room snapshots are written as compact JSON (a busy
 * drawing room was ~4.5x larger indented). Same content, same atomic write
 * and `.prev`; an older indented snapshot still loads unchanged.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoomStore, SNAPSHOT_FORMAT } from "../src/server/persistence.js";
import { RoomEngine } from "../src/server/room.js";

function drawingRoom() {
  const engine = new RoomEngine("Persist", { timing: 2 });
  const ids = ["Keku", "Amina", "Baraka"].map((n, i) => engine.join(n, i === 0 ? { asHost: true } : {}).player.id);
  const g = engine.startGame(ids[0]!, "draw-guess", { official: false });
  const send = (pid: string, action: string, payload: Record<string, unknown>) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action, payload }, pid);
  for (const p of ids) send(p, "briefing-ready", { ready: true });
  const drawer = ids.find((p) => (((engine.project("player", p).myGames as { id: string; state: { amDrawing?: boolean } }[]).find((x) => x.id === g.id))!.state.amDrawing))!;
  for (let s = 0; s < 10; s++) send(drawer, "draw-strokes", { pieces: [{ s, c: 1, w: 1, p: Array.from({ length: 80 }, (_, i) => (i * 37) % 1000) }] });
  return engine;
}

describe("compact room snapshots", () => {
  it("are written without indentation, keep `.prev`, and load back to the same room", () => {
    const dir = mkdtempSync(join(tmpdir(), "mz-compact-"));
    const store = new RoomStore(dir);
    const engine = drawingRoom();
    store.saveRoom(engine.id, engine.toJSON(), null);
    store.saveRoom(engine.id, engine.toJSON(), null); // a second save makes the `.prev` generation
    const text = readFileSync(join(dir, `${engine.id}.json`), "utf8");
    expect(text).not.toMatch(/\n\s/); // one line: no indentation anywhere
    expect(statSync(join(dir, `${engine.id}.json.prev`)).size).toBeGreaterThan(0);
    const { rooms } = new RoomStore(dir).restoreAll();
    const back = rooms.find((r) => r.room["id"] === engine.id)!;
    expect(back.format).toBe(SNAPSHOT_FORMAT);
    expect(JSON.stringify(back.room)).toBe(JSON.stringify(engine.toJSON()));
  });

  it("an older indented snapshot still loads unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "mz-indented-"));
    const engine = drawingRoom();
    const indented = JSON.stringify({ format: SNAPSHOT_FORMAT, savedAt: new Date().toISOString(), hostClaimHash: null, room: engine.toJSON() }, null, 2);
    writeFileSync(join(dir, `${engine.id}.json`), indented);
    const { rooms, report } = new RoomStore(dir).restoreAll();
    expect(report.quarantined).toHaveLength(0);
    expect(JSON.stringify(rooms.find((r) => r.room["id"] === engine.id)!.room)).toBe(JSON.stringify(engine.toJSON()));
  });
});
