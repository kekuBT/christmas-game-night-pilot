import { LocalServer } from "./http.js";

// Configuration (all optional):
//   PORT                 listen port (default 3000; 0 picks a free port)
//   MCHEZO_DATA_DIR      room snapshot directory (default ./data)
//   MCHEZO_WEB_DIST      built web app directory (default apps/web/dist)
//   MCHEZO_LIFECYCLE_SCALE  TESTING ONLY: multiply game/phase time limits
//                        (e.g. 0.1). Refused when NODE_ENV=production.
const port = Number(process.env.PORT ?? 3000);
const scaleRaw = process.env.MCHEZO_LIFECYCLE_SCALE;
if (scaleRaw && process.env.NODE_ENV === "production") {
  console.error("MCHEZO_LIFECYCLE_SCALE is for tests only and is not allowed in production.");
  process.exit(2);
}
const lifecycleScale = scaleRaw ? Number(scaleRaw) : undefined;
if (lifecycleScale !== undefined && !(lifecycleScale > 0)) {
  console.error(`MCHEZO_LIFECYCLE_SCALE must be a positive number, got "${scaleRaw}".`);
  process.exit(2);
}
if (lifecycleScale !== undefined) console.log(`TEST MODE: game time limits scaled by ${lifecycleScale}`);
const server = new LocalServer({
  dataDir: process.env.MCHEZO_DATA_DIR || undefined,
  webDistDir: process.env.MCHEZO_WEB_DIST || undefined,
  lifecycleScale,
});
const actual = await server.listen(port);
// The test gate and drivers parse this exact line to learn the real port.
console.log(`Christmas Game Night server on http://localhost:${actual} (web app at / after npm run build:web)`);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(`received ${signal}, closing server`);
  await server.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
