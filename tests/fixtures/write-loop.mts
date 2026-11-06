// Child process for the crash-safety test: rewrites one snapshot as fast as
// it can until it is SIGKILLed at an arbitrary moment.
import { atomicWriteFileSync } from "../../src/server/persistence.js";

const target = process.argv[2]!;
const filler = "x".repeat(200_000); // large enough that a non-atomic write is visibly torn
for (let i = 0; ; i++) {
  atomicWriteFileSync(target, JSON.stringify({ generation: i, filler }));
  if (i === 0) process.stdout.write("started\n");
}
