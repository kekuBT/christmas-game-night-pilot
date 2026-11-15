import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentTestMode, loadContent, type ContentLibrary } from "../content/registry.js";
import { LocalServer } from "./http.js";
import { DataDirLock, DataDirLocked } from "./datalock.js";
import { normalizeOrigin, type AccessOptions } from "./access.js";

// Configuration (all optional):
//   PORT                 listen port (default 3000; 0 picks a free port)
//   MCHEZO_DATA_DIR      room snapshot directory (default ./data)
//   MCHEZO_WEB_DIST      built web app directory (default apps/web/dist)
//   MCHEZO_CONTENT_TEST_MODE=approve-provisional  TESTING ONLY: treat
//                        provisional content as approved. Refused in production.
//   MCHEZO_LIFECYCLE_SCALE  TESTING ONLY: multiply game/phase time limits
//                        (e.g. 0.1). Refused when NODE_ENV=production.
//   MCHEZO_CONTENT_DIR   TESTING ONLY: load the content library from this
//                        directory instead of the shipped one (Stage 7.4: a
//                        small controlled pool for browser checks). Refused
//                        when NODE_ENV=production.
// Beta R1 (docs/beta/beta-r1-architecture.md):
//   MCHEZO_PUBLIC_ORIGIN    the site's public origin, e.g. https://games.example.org
//                        (requests and WebSocket handshakes from other origins are refused)
//   MCHEZO_BETA_ACCESS_CODE the beta access code (at least 12 characters; a secret:
//                        never logged); every page, API call and socket needs it
//   MCHEZO_TRUST_PROXY      reverse proxies in front that append X-Forwarded-For (e.g. 1)
//   MCHEZO_BUILD_REVISION   the revision /health reports when there is no release.json
//   MCHEZO_LISTEN_HOST      the address to listen on (default: every interface, so phones on the
//                        Wi-Fi reach a computer in development). Behind a proxy on the same machine:
//                        127.0.0.1, so nobody reaches the server around the proxy.
// With NODE_ENV=production the server refuses to start without an absolute
// MCHEZO_DATA_DIR outside this release, without MCHEZO_PUBLIC_ORIGIN, and without
// MCHEZO_BETA_ACCESS_CODE (unless MCHEZO_PUBLIC_ACCESS=open is set on purpose).
// Behind a proxy (MCHEZO_TRUST_PROXY) production also requires MCHEZO_LISTEN_HOST: a client reaching the
// server directly could otherwise claim any address in X-Forwarded-For, and skip HTTPS.
// One server per data directory: a second one is refused (server.lock).
const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === "production";
const refuse = (why: string): never => { console.error(why); process.exit(2); };
// The release's root: two levels above this file (src/server under tsx, dist/server when built).
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataDir = resolve(process.env.MCHEZO_DATA_DIR || join(appRoot, "data"));
if (production) {
  const raw = process.env.MCHEZO_DATA_DIR ?? "";
  if (!raw || !isAbsolute(raw)) refuse("In production MCHEZO_DATA_DIR must be an absolute path outside the release, so an update or rollback never touches the family's data.");
  const rel = relative(appRoot, dataDir);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) refuse(`MCHEZO_DATA_DIR (${dataDir}) is inside the release (${appRoot}). Put the data outside it, e.g. on its own volume.`);
  if (!process.env.MCHEZO_PUBLIC_ORIGIN) refuse("In production MCHEZO_PUBLIC_ORIGIN must be set to the site's public origin, e.g. https://games.example.org.");
  if (!process.env.MCHEZO_BETA_ACCESS_CODE && process.env.MCHEZO_PUBLIC_ACCESS !== "open") refuse("In production MCHEZO_BETA_ACCESS_CODE must be set (the private beta's access code), or MCHEZO_PUBLIC_ACCESS=open set on purpose.");
}
let access: AccessOptions;
try {
  access = {
    ...(process.env.MCHEZO_PUBLIC_ORIGIN ? { publicOrigin: normalizeOrigin(process.env.MCHEZO_PUBLIC_ORIGIN) } : {}),
    ...(process.env.MCHEZO_BETA_ACCESS_CODE ? { betaAccessCode: process.env.MCHEZO_BETA_ACCESS_CODE } : {}),
    ...(process.env.MCHEZO_TRUST_PROXY ? { trustProxyHops: Number(process.env.MCHEZO_TRUST_PROXY) } : {}),
  };
  if (access.trustProxyHops !== undefined && !(Number.isInteger(access.trustProxyHops) && access.trustProxyHops >= 0 && access.trustProxyHops <= 3)) throw new Error(`MCHEZO_TRUST_PROXY must be 0 to 3, got "${process.env.MCHEZO_TRUST_PROXY}".`);
  if (access.betaAccessCode !== undefined && access.betaAccessCode.length < 12) throw new Error("MCHEZO_BETA_ACCESS_CODE must be at least 12 characters.");
} catch (e) { refuse((e as Error).message); }
const listenHost = process.env.MCHEZO_LISTEN_HOST || undefined;
if (production && access!.trustProxyHops && !listenHost) refuse("Behind a proxy (MCHEZO_TRUST_PROXY) MCHEZO_LISTEN_HOST must be set to where only the proxy reaches the server (127.0.0.1 when it runs on this machine). Otherwise a client connecting directly could claim any address and skip HTTPS.");
// Which release this is: release.json (written by scripts/release/pack.mjs), else the environment, else "dev".
let revision = process.env.MCHEZO_BUILD_REVISION || "dev";
const releaseFile = join(appRoot, "release.json");
if (existsSync(releaseFile)) {
  try { revision = String((JSON.parse(readFileSync(releaseFile, "utf8")) as { revision?: unknown }).revision ?? revision); } catch { refuse(`release.json is unreadable: ${releaseFile}`); }
}
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
const contentDir = process.env.MCHEZO_CONTENT_DIR;
if (contentDir && process.env.NODE_ENV === "production") {
  console.error("MCHEZO_CONTENT_DIR is for tests only and is not allowed in production.");
  process.exit(2);
}
let content: ContentLibrary | undefined;
if (contentDir) {
  content = loadContent(contentDir, { testApproveProvisional: contentTestMode() });
  for (const p of content.problems) console.error(`[content] ${p.file}${p.itemId ? ` ${p.itemId}` : ""}: ${p.message}`);
  console.log(`TEST MODE: content loaded from ${contentDir} (${content.items.size} items), not the shipped library`);
}
const lock = new DataDirLock(dataDir);
try {
  const note = lock.acquire();
  if (note) console.warn(`[data] ${note} (${lock.path})`);
} catch (e) {
  if (e instanceof DataDirLocked) refuse(e.message);
  throw e;
}
const server = new LocalServer({
  dataDir,
  access: access!,
  revision,
  webDistDir: process.env.MCHEZO_WEB_DIST || undefined,
  lifecycleScale,
  ...(content ? { content } : {}),
});
const actual = await server.listen(port, listenHost);
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
if (production) {
  // Reached through the public origin only; the Wi-Fi hint below is for a computer at home.
  console.log(`Listening on ${listenHost ?? "every interface"}; public origin ${access!.publicOrigin ?? "(not set)"}.`);
} else if (codespace && forwardDomain) {
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
  lock.release();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
