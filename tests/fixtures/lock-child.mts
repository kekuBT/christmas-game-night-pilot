// Child process for beta-r1r-lock.test.ts: one "start" racing others (review 6901841738 R3: an explicit protocol).
//   prints READY, waits for GO on stdin (sent to every contender at once), takes the data directory lock, then:
//   - got it: prints ACQ, keeps the lock until END arrives on stdin (sent only to a holder), prints REL, releases,
//     exits 0;
//   - refused (DataDirLocked): prints REFUSED and exits 0 at once. It never reads stdin again, and nothing is sent to it;
//   - any other error: prints ERROR and exits 1, which the test counts as a failure, never as a refusal.
import { DataDirLock, DataDirLocked } from "../../src/server/datalock.js";

const dir = process.argv[2]!;
const lock = new DataDirLock(dir, "server");
const now = () => (performance.timeOrigin + performance.now()).toFixed(3);
let buf = "";
const waitFor = (word: string) => new Promise<void>((res) => {
  const on = (d: Buffer) => { buf += d.toString(); if (buf.includes(word)) { process.stdin.off("data", on); process.stdin.pause(); res(); } };
  process.stdin.on("data", on);
  process.stdin.resume();
  on(Buffer.alloc(0));
});
console.log("READY");
await waitFor("GO");
try {
  await lock.acquire();
} catch (e) {
  if (e instanceof DataDirLocked) { console.log(`REFUSED ${process.pid} ${e.message}`); process.exit(0); }
  console.log(`ERROR ${process.pid} ${(e as Error).stack ?? e}`);
  process.exit(1);
}
console.log(`ACQ ${process.pid} ${now()}`);
await waitFor("END");
console.log(`REL ${process.pid} ${now()}`);
await lock.release();
process.exit(0);
