import { LocalServer } from "./http.js";

// Configuration (all optional):
//   PORT                 listen port (default 3000; 0 picks a free port)
//   MCHEZO_DATA_DIR      room snapshot directory (default ./data)
//   MCHEZO_WEB_DIST      built web app directory (default apps/web/dist)
const port = Number(process.env.PORT ?? 3000);
const server = new LocalServer({
  dataDir: process.env.MCHEZO_DATA_DIR || undefined,
  webDistDir: process.env.MCHEZO_WEB_DIST || undefined,
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
