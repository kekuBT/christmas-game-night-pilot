/**
 * Beta R1 (docs/beta/beta-r1.md, docs/beta/beta-r1-blockers.md): who may reach the server at all, checked before any
 * route runs, for HTTP requests and WebSocket handshakes alike.
 *
 * - B-02 security headers on every response: no MIME sniffing, no referrer, never framed.
 * - B-03 origin: when the public origin is configured, a request or handshake from another origin is refused. Session
 *   tokens travel in a header or the WebSocket subprotocol (never a cookie), so this is defence in depth, and it keeps
 *   the beta cookie below from being usable from another site.
 * - B-04 beta access: when an access code is configured, every request except the health check and the gate itself
 *   needs the beta cookie, which the gate page sets after the right code. The cookie is an HMAC of the code (the code is
 *   never stored in it), HttpOnly, SameSite=Lax, Secure over HTTPS. A WebSocket handshake without it is refused, so the
 *   gate covers live updates as well as pages and the API. Wrong codes are rate-limited per client address.
 * - B-05 client address behind a proxy: with `trustProxyHops` = 1 the address is the last X-Forwarded-For entry (the one
 *   our own proxy appended), so per-device limits stay per device; values a client sends itself are never trusted.
 *
 * Nothing here applies when nothing is configured (the default, and every test and browser check), so local play is
 * unchanged. Production (serve.ts) requires the public origin and the access code unless explicitly opened.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AccessOptions {
  /** The beta access code. A secret: from the environment, never logged, never stored in the cookie. */
  betaAccessCode?: string;
  /** The public origin, e.g. "https://games.example.org" (scheme, host and port only). */
  publicOrigin?: string;
  /** How many reverse proxies in front of the server append to X-Forwarded-For (0: trust none, the default). */
  trustProxyHops?: number;
}

export const BETA_COOKIE = "cgn_beta";
/** Paths reachable without the beta cookie: the health check (for the proxy and monitoring) and the gate. */
const OPEN_PATHS = new Set(["/health", "/beta", "/beta/enter"]);
const COOKIE_MAX_AGE_S = 30 * 24 * 3600;

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
};

export function normalizeOrigin(origin: string): string {
  const u = new URL(origin);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`The public origin must be http(s), got "${origin}".`);
  if (u.pathname !== "/" || u.search || u.hash) throw new Error(`The public origin is a scheme, host and port only, got "${origin}".`);
  return u.origin;
}

export class AccessGuard {
  private readonly cookieValue?: string;
  private readonly origin?: string;
  private readonly hops: number;

  constructor(readonly opts: AccessOptions) {
    if (opts.betaAccessCode !== undefined) {
      if (opts.betaAccessCode.length < 12) throw new Error("The beta access code must be at least 12 characters.");
      this.cookieValue = createHmac("sha256", opts.betaAccessCode).update("cgn-beta-cookie-v1").digest("base64url");
    }
    this.origin = opts.publicOrigin ? normalizeOrigin(opts.publicOrigin) : undefined;
    this.hops = Math.max(0, Math.floor(opts.trustProxyHops ?? 0));
  }

  get gated(): boolean { return this.cookieValue !== undefined; }

  /** B-05: the client's address, through at most `trustProxyHops` proxies we control. */
  clientAddress(req: IncomingMessage): string {
    const direct = req.socket.remoteAddress ?? "unknown";
    if (this.hops === 0) return direct;
    const xff = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // Each trusted proxy appends the address it saw; the client's own entries come first and are never trusted.
    return xff.length >= this.hops ? xff[xff.length - this.hops]! : direct;
  }

  /** B-03: true when the request carries an Origin that isn't ours. A missing Origin is allowed (same-origin GETs). */
  foreignOrigin(originHeader: string | undefined): boolean {
    if (!this.origin || !originHeader) return false;
    try { return new URL(originHeader).origin !== this.origin; } catch { return true; }
  }

  hasAccess(req: IncomingMessage): boolean {
    if (!this.cookieValue) return true;
    const got = readCookie(req, BETA_COOKIE);
    if (!got) return false;
    const a = Buffer.from(got), b = Buffer.from(this.cookieValue);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  codeMatches(code: string): boolean {
    if (!this.opts.betaAccessCode) return false;
    const a = createHmac("sha256", "cgn-beta-compare").update(code).digest();
    const b = createHmac("sha256", "cgn-beta-compare").update(this.opts.betaAccessCode).digest();
    return timingSafeEqual(a, b);
  }

  setCookieHeader(): string {
    const secure = this.origin?.startsWith("https:") ? "; Secure" : "";
    return `${BETA_COOKIE}=${this.cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_S}${secure}`;
  }

  isOpenPath(pathname: string): boolean { return OPEN_PATHS.has(pathname); }
}

export function applySecurityHeaders(res: ServerResponse): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** A relative path on this site to return to after the gate; anything else (other hosts, "//x", "/\x") becomes "/". */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next.length > 500 ? "/" : next;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The gate page: self-contained (no scripts, no other files), so it works before the app's own files are reachable. */
export function gatePage(next: string, failed: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Christmas Game Night · beta</title>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1b1530;color:#f6f1e7;font:16px/1.4 system-ui,sans-serif}
main{width:min(92vw,360px);padding:24px;border-radius:16px;background:#2a2147}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;color:#d9d2c3}
label{display:block;font-weight:600;margin-bottom:6px}input{box-sizing:border-box;width:100%;font-size:18px;padding:12px;border-radius:10px;border:1px solid #6c5fa0;background:#fff;color:#111}
button{margin-top:14px;width:100%;min-height:48px;font-size:17px;font-weight:700;border:0;border-radius:12px;background:#ff6b4a;color:#111}.err{color:#ffb4a3;font-weight:600}</style></head>
<body><main><h1>Christmas Game Night</h1><p>This is a private beta. Enter the access code the host gave you.</p>
${failed ? '<p class="err" role="alert">That code didn’t work. Check it and try again.</p>' : ""}<form method="post" action="/beta/enter">
<label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="next" value="${esc(next)}"><button type="submit">Continue</button></form></main></body></html>`;
}
