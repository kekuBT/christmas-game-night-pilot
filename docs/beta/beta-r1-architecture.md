# Beta R1: the first release architecture

**Status:** a design and example configuration for the private family beta. Nothing is provisioned, and no host is chosen: ChatGPT selects the host and coordinates, the owner approves, and every step stays at $0. The Caddy and systemd files below are **examples, not run in this session**; the release package and the server settings they use are tested (`scripts/check-release-package.mjs`).

## The shape: one process, one disk, one origin

```
 phones, TV ──HTTPS + WSS (443)──▶ reverse proxy ──HTTP + WS──▶ node dist/server/serve.js
                                   (TLS, HSTS)                 listening on 127.0.0.1:3000
                                                                    │
                                                                    ▼
                                                  /var/lib/christmas-game-night (persistent disk)
                                                  rooms, Memory Books, previous generations, server.lock
```

- **One Node 22 process.** It serves the built web app, the HTTP API and the WebSockets on one origin. The rooms live in its memory and are saved to disk on every change.
- **No second instance, no autoscaling, no shared network volume.** Two servers on one data directory would overwrite each other's rooms. The lock refuses a second one on the same machine, but it can't see another machine.
- **One persistent data directory outside the release folder.** Production refuses anything else.
- **One HTTPS reverse proxy** in front. It terminates TLS, passes WebSocket upgrades, and appends the client's address to `X-Forwarded-For`.
- **The server listens on 127.0.0.1 only,** so nothing reaches it around the proxy (B-07).

## What the host must give

| Need | Why |
|---|---|
| **A process that keeps running** (no sleep on idle) | Rooms, timers and sockets live in the process. A host that sleeps after a few idle minutes breaks every phone's live connection, and its first request waits for a cold start. |
| **A disk that survives restarts and redeploys** (a few MB to start) | The family's rooms and Memory Book are files. An ephemeral filesystem loses them on every restart. |
| **Inbound HTTPS with WebSockets** | Phones need a secure origin (install, cookies) and live updates. |
| **A stable hostname** | `MCHEZO_PUBLIC_ORIGIN` and the Secure beta cookie are bound to it. A new name means re-entering the code. |
| **Node 22 and `npm`** | The package is installed with `npm ci --omit=dev` (only `ws` and `zod`). |

**Ruled out by the app as it is:** per-request serverless platforms, and anything that sleeps or has an ephemeral disk. They would need the persistence rewrite the brief excludes. A GitHub Codespace on a public port is ruled out by the owner.

## Host options at $0 (input for ChatGPT's selection)

**Where these facts come from:** web search results only. The providers' own pages couldn't be read from this session: render.com, fly.io, tailscale.com and developers.cloudflare.com aren't reachable from here, and oracle.com answered 403. **Reconfirm each on the provider's own page before choosing.**

| Option | Fits the needs? | Account and access it needs | Watch out for |
|---|---|---|---|
| **The family's own always-on computer**, published with **Tailscale Funnel** | Yes, if the computer stays on during game nights. The disk is local. | A Tailscale account (free Personal plan, non-commercial use; Funnel is listed in it). The site gets a `*.ts.net` name, so no domain is needed. | Funnel listens only on 443, 8443 or 10000. Its bandwidth limits aren't published. WebSocket support through Funnel wasn't confirmed in the sources found. A home upload link serves about 10 phones. |
| **The same computer**, published with **Cloudflare Tunnel** (named) | Yes, as above. | A Cloudflare account, plus a domain whose DNS is on Cloudflare. **A domain costs money unless the family already has one.** | Quick tunnels (`trycloudflare.com`) need no domain but give a random, temporary name with no uptime guarantee. They aren't for the beta. |
| **Oracle Cloud "Always Free" VM** | Yes: an always-on VM with block storage. | An Oracle account. **A credit or debit card is required at sign-up** for identity verification, and sign-up starts a free trial. Under `docs/COST_FEASIBILITY.md`, registering a card needs the owner's explicit approval. | Secondary sources report the Ampere A1 allowance cut in 2026 (to 2 OCPUs and 12 GB), frequent out-of-capacity errors, and instances disabled if the limit is exceeded. |
| **Free PaaS web services** (for example Render's free plan) | **No** as the app stands: they sleep after idle time (about 15 minutes on Render, per the sources), and no free persistent disk was confirmed. | — | — |
| **Fly.io** | **Not at $0:** the sources say new accounts have had no free allowance since 2024 (trial or pay-as-you-go). | — | — |

**A recommendation for ChatGPT to weigh:** the family's own always-on computer plus Tailscale Funnel is the only option found that is $0 with no card and no domain. Its WebSocket behaviour must be proved with one test room before the beta. Real phones over the real connection are required anyway (`docs/beta/beta-r1-blockers.md` §7).

**Sources (search results, not primary pages):**
- Oracle: [Oracle free tier page](https://www.oracle.com/free/), [OCI free tier breakdown](https://selfhost.it.com/blog/oci-free-tier-breakdown), [Always Free limits 2026](https://space-node.net/blog/oracle-cloud-always-free-limits-2026).
- Tailscale: [plans](https://tailscale.com/plans/), [Funnel limits and ports](https://www.ssdnodes.com/learn/tailscale-funnel-limits-and-ports).
- Cloudflare: [Cloudflare Tunnel guide](https://flaviocopes.com/cloudflare-tunnel/), [TryCloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
- Free tiers compared: [free tiers checked September 2026](https://flaviocopes.com/hosting-free-tiers/), [Render's 2026 free-tier article](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), [state of free hosting](https://snapdeploy.dev/state-of-free-hosting).

## The server's settings

An environment file, readable by root only (`/etc/christmas-game-night/env`, mode 0600):

```
NODE_ENV=production
PORT=3000
MCHEZO_LISTEN_HOST=127.0.0.1
MCHEZO_DATA_DIR=/var/lib/christmas-game-night
MCHEZO_PUBLIC_ORIGIN=https://games.example.org
MCHEZO_BETA_ACCESS_CODE=<at least 12 characters; generate one, never commit it>
MCHEZO_TRUST_PROXY=1
```

- **Generating the code:** `node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"`. Give it to the family in person or in the family chat, not in GitHub.
- **Changing the code:** edit the file and restart. Every device's cookie stops working at once, because the cookie is derived from the code.
- **`MCHEZO_TRUST_PROXY`:**
  - Set it to `1` with one proxy on the same machine (Caddy below): Caddy appends the address it saw, and that is the entry the server uses.
  - **With a tunnel or CDN in front, count the proxies that append to `X-Forwarded-For` and confirm it on the host before the beta.**
  - Until then, leave it unset. The per-device limits then count the whole family together: safe, but one person's wrong codes can make another wait.
- **`MCHEZO_LISTEN_HOST`:** set it in every case to the only address the proxy or tunnel uses to reach the server (`127.0.0.1` when the proxy runs on the same machine). Production requires it when a proxy is trusted.
- **What production refuses (exit 2):** a missing, relative or inside-the-release `MCHEZO_DATA_DIR`; no `MCHEZO_PUBLIC_ORIGIN`; no or a short access code; a trusted proxy without `MCHEZO_LISTEN_HOST`; and every test-only setting.

## Example: Caddy as the HTTPS proxy (not run here)

```
games.example.org {
	reverse_proxy 127.0.0.1:3000
	header Strict-Transport-Security "max-age=31536000"
}
```

- **What it does:** Caddy obtains and renews the certificate itself (ports 80 and 443 reachable, DNS pointing at the host). It passes WebSocket upgrades through `reverse_proxy` with no extra setting, and sets `X-Forwarded-For`.
- **No access log on purpose.** Session, spectator and recovery tokens travel in request headers (`X-Session-Token`, `X-Spectator-Token`, `X-Recovery-Request-Secret`, `Sec-WebSocket-Protocol`), and the beta cookie in `Cookie`. If a log is ever turned on, those headers must be filtered out of it first.
- **What the server adds itself:** `nosniff`, `no-referrer`, `X-Frame-Options: DENY` and `frame-ancestors 'none'`. The proxy adds HSTS, since only it knows the site is HTTPS-only.

## Example: the service (systemd, not run here)

```
[Unit]
Description=Christmas Game Night (private beta)
After=network-online.target
Wants=network-online.target

[Service]
User=cgn
Group=cgn
WorkingDirectory=/opt/christmas-game-night/current
EnvironmentFile=/etc/christmas-game-night/env
ExecStart=/usr/bin/node dist/server/serve.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/christmas-game-night

[Install]
WantedBy=multi-user.target
```

- **The release folders** (`/opt/christmas-game-night/releases/<sha>/`) belong to root. The service user can read them but not write them; `current` is a link to the release in use.
- **The data directory** belongs to the service user (mode 0700) and is the only place it can write.
- **Stop and restart:** SIGTERM closes the server gracefully and frees the lock. After a crash, `Restart=on-failure` starts it again, and it takes the stale lock over (release check step L).

## Restricted admin access

- **The app has no admin pages:** no admin route, debug route or metrics route exists.
- **Administration happens on the host:** an SSH login with keys only, or the provider's console, by the owner or the person they name. That covers starting and stopping the service, the environment file, `datatool` backups and restores, and deploys.
- **The beta gate** (`MCHEZO_BETA_ACCESS_CODE`) covers every page, API call and WebSocket. Only `/health` and the gate itself are open. `/health` says `{ ok, revision }` and nothing else.
- **Content approvals aren't an admin action on the host.** They are records in the repository (`content/approvals.json`, written by `npm run content:approve`), reviewed and shipped in a release. The beta never writes them, and the content test mode is refused in production.

## Development and test data stay apart from the beta

- **Tests and browser checks never touch the beta host.** Every test, driver and gate starts its own server on its own port, with its own temporary data directory.
- **Only reviewed release packages run on the beta host:** no checkout and no `npm run serve`, no test settings (refused), and no development tooling installed (`--omit=dev`).
- **The beta's data directory is used only by the beta's server.** A second server on it is refused.
- **Previews stay private:** a local computer or a private Codespace, each with its own data directory, never the beta's data.
- **Debugging with real data:** restore a backup into a new folder on a private machine (`datatool restore`, which never overwrites). The copy is family data: keep it private, never commit it, and remove it when the owner says it is no longer needed.
