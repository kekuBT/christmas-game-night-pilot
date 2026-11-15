// Child process for beta-r1r-lock.test.ts: one "start" racing others. It prints READY, waits for GO on stdin (sent to
// every child at once), takes the data directory lock, and prints ACQ or REFUSED. A holder keeps the lock until END
// arrives (sent once every child has answered), then prints REL and releases. No timing assumptions.
import { DataDirLock } from "../../src/server/datalock.js";

const dir = process.argv[2]!;
const lock = new DataDirLock(dir, "server");
const now = () => (performance.timeOrigin + performance.now()).toFixed(3);
let buf = "";
const waitFor = (word: string) => new Promise<void>((res) => {
  const on = (d: Buffer) => { buf += d.toString(); if (buf.includes(word)) { process.stdin.off("data", on); res(); } };
  process.stdin.on("data", on);
  on(Buffer.alloc(0));
});
console.log("READY");
await waitFor("GO");
try {
  await lock.acquire();
  console.log(`ACQ ${process.pid} ${now()}`);
  await waitFor("END");
  console.log(`REL ${process.pid} ${now()}`);
  await lock.release();
} catch (e) { console.log(`REFUSED ${process.pid} ${(e as Error).message}`); }
process.stdin.destroy();
