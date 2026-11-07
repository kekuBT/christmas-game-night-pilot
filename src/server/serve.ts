import { networkInterfaces } from "node:os";
import { LocalServer } from "./http.js";

// Configuration (all optional):
//   PORT                 listen port (default 3000; 0 picks a free port)
//   MCHEZO_DATA_DIR      room snapshot directory (default ./data)
//   MCHEZO_WEB_DIST      built web app directory (default apps/web/dist)
//   MCHEZO_CONTENT_TEST_MODE=approve-provisional  TESTING ONLY: treat
//                        provisional content as approved. Refused in production.
//   MCHEZO_LIFECYCLE_SCALE  TESTING ONLY: multiply game/phase time limits
//                        (e.g. 0.1). Refused when NODE_ENV=production.
const port = Number(process.env.PORT ?? 3000);
const scaleRaw = process.env.MCHEZO_LIFECYCLE_SCALE;
if (process.env.MCHEZO_CONTENT_TEST_MODE && process.env.NODE_ENV === "production") {
  console.error("MCHEZO_CONTENT_TEST_MODE is for tests only and is not allowed in production.");
  process.exit(2);
}
if (process.env.MCHEZO_CONTENT_TEST_MODE) console.log("TEST MODE: provisional content treated as approved (not a human review)");
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
// Phones can't use "localhost". Print this computer's home-network addresses
// so the host opens one of them, and the lobby QR code then points phones there.
const lan = Object.values(networkInterfaces()).flat()
  .filter((a): a is NonNullable<typeof a> => !!a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a.address}:${actual}`);
// In a GitHub Codespace the port is reached through Codespaces' own HTTPS
// forwarding (docs/CODESPACES_PREVIEW.md), not the Wi-Fi.
const codespace = process.env["CODESPACE_NAME"];
const forwardDomain = process.env["GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN"];
if (codespace && forwardDomain) {
  console.log(`Codespaces preview (private: only your signed-in GitHub account can open it): https://${codespace}-${actual}.${forwardDomain}/`);
} else {
  console.log(lan.length
    ? `Phones on the same Wi-Fi: open ${lan.join(" or ")} on the host device (not localhost), so the QR code works.`
    : "No network address found: phones can't reach this computer. Check that it is on Wi-Fi.");
}

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
