// A phone on the home Wi-Fi opens the server over plain http at the host's
// network address (http://192.168.x.x:port), which browsers treat as an
// INSECURE context: no crypto.randomUUID, among other things. localhost is a
// secure context, so a driver on localhost can never see what that phone
// sees. This gives drivers the same server at this machine's own network
// address, a real insecure context, when the machine has one.
import { networkInterfaces } from "node:os";

/** `base` at this machine's first non-loopback IPv4 address, or null. */
export function lanBase(base) {
  const u = new URL(base);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) { u.hostname = a.address; return u.origin; }
    }
  }
  return null;
}

/**
 * A browser context that is (or, with no network address, behaves like) a
 * phone on plain http. Returns { ctx, base, real } where `real` says whether
 * the context is genuinely insecure or only has randomUUID removed.
 */
export async function plainHttpContext(browser, base, options = {}) {
  const lan = lanBase(base);
  const ctx = await browser.newContext(options);
  if (lan) return { ctx, base: lan, real: true };
  await ctx.addInitScript(() => { try { delete Crypto.prototype.randomUUID; } catch { /* already absent */ } });
  return { ctx, base, real: false };
}
