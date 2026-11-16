# Beta R4: independent cloud hosting, a proposal (handoff 6916543972)

**Planning only.** Nothing was created, deployed, configured or bought, and no implementation changed.
- **Bases:** docs `d554b800e51ae78a9ca205d12a2d6622eb7795f9`; pinned runtime `7097ac2bb062925bb296a129f4771f1e68fd522d`, with the audited archive's SHA-256 `a693c543…3a5131`.
- **Who decides:** ChatGPT owns the final route recommendation, and the owner decides.
- **The requirement:** an independently hosted full website, with no dependency on a home computer. It supersedes the home-route (H1) prerequisite.

## Recommendation
**Option A: run the pinned server unchanged on Fly.io**, as one always-on Machine with one persistent volume.
- **Expected cost:** $0, by Fly's under-$5 waiver, with a card on file.
- **Supabase:** not used now. Its free plan neither hosts the room server nor raises durability: free projects pause after a week inactive and have no automatic backups.
- **Kept on record:** Option C (Cloudflare Durable Objects), as the only path found with a no-charge free plan for a stateful WebSocket room server. It is a large port.

| | A. The existing server on Fly.io (recommended) | B. Supabase for persistence, plus a runtime host | C. Cloudflare Workers + Durable Objects |
|---|---|---|---|
| **Components** | One `shared-cpu-1x` 512 MB Machine; a 1 GB volume at `/data`; Fly Proxy for TLS and WebSockets; the access gate as today | Supabase Postgres (and Storage) for rooms and Memory Books, **plus** a separate always-on Node host; Edge Functions can't host rooms | One Durable Object per room (SQLite storage, WebSocket hibernation, alarms for game clocks); static app on Workers |
| **Code fit** | **No runtime change.** The same process, data folder, lock (Linux abstract socket inside the Machine), atomic writes and restore-on-start | `RoomStore` replaced by an async Postgres store: 37 synchronous save sites and the Memory Book's write-then-swap made async, with per-room ordering; the lock becomes a Postgres advisory lock; `datatool` rewritten | The HTTP/WebSocket layer (`http.ts`, about 1,800 lines) and persistence ported to the Workers runtime; the room engine (pure TypeScript) mostly reused |
| **Migration scope** | Two new deploy files (a Dockerfile that runs the artifact gate; `fly.toml`), and a cloud variant of the runbook's stages | Medium to large, and integrity-sensitive: the full gate plus new failure-injection tests | Large: a port, then a full re-verification |
| **Free-tier facts (official, pinned)** | No free tier for new organizations. Bills under $5 are waived (personal org, Pay As You Go, **card on file**). This setup lists at $3.69 + $0.15 = **$3.84 per 30 days**, plus $0.02/GB outbound. | Free: 500 MB database, **paused after 1 week of inactivity**, 2 active projects; **no automatic backups** (Pro and up only; free projects should export their own). Edge Functions: **150 s** wall clock on Free. | The Free plan includes SQLite-backed Durable Objects: 100,000 requests/day (incoming WebSocket messages counted 20:1), 13,000 GB-s/day, 100,000 rows written/day, 5 GB total. Past a limit, operations **fail** until 00:00 UTC. |
| **Durability** | The volume lives on one server with no replication; Fly warns that a single volume risks data loss. Daily snapshots, 5 days by default (configurable up to 60), first 10 GB free; Fly says they shouldn't be the primary backup. So **our own `datatool` backups are copied off-host after each game night.** | Free: none automatic | Not checked here |
| **Availability** | Downtime on deploys and on host failure; rooms restore from the volume on start; clients reconnect | Depends on the runtime host chosen | Per-room objects; free-plan limits can refuse operations mid-game |

## Why A, with the evidence behind each requirement
- **Server-authoritative scores, the ledger, room and role isolation, projections:** the code at `7097ac2` is unchanged. It runs as one process with one writer, just as tested (full gate `20261116-035311-7097ac2b-9479`, PASSED; ChatGPT's private Firefox audit).
- **Reconnects:**
  - Fly Proxy keeps idle WebSockets open. It closes them with code 1012 on a proxy restart or an auto-stop, a signal to reconnect, which the client already does.
  - Auto-stop is **off** (one Machine always running), so a game isn't cut short by scaling.
- **Mobile Safari and Android Chrome:** the same web app over HTTPS, with Fly's certificate (`*.fly.dev`, or a custom domain). Native-device checks P1–P8 are still pending.
- **Memory Books:** on the volume, with the same durable write-then-swap.
- **Shutdown:** Fly sends `SIGINT` by default; the server handles both `SIGINT` and `SIGTERM` (`serve.ts`). Set `kill_signal = "SIGTERM"` and `kill_timeout = 20` to match the systemd unit.

## The configuration that changes (no runtime code)
| Setting | Today (home route) | On Fly |
|---|---|---|
| Process manager and proxy | systemd and Caddy | A Fly Machine and Fly Proxy |
| `MCHEZO_LISTEN_HOST` | `127.0.0.1` (the proxy on the same machine) | `0.0.0.0`: Fly Proxy reaches the Machine over Fly's private network. With no dedicated public IP, the proxy is the only public path. **This replaces the loopback rule (B-07) and needs ChatGPT's review.** |
| `MCHEZO_TRUST_PROXY` | Counted at V2 | Counted the same way at V2. Fly sets `X-Forwarded-For` and `Fly-Client-IP`; 1 is expected, but it must be measured. |
| Data folder | `/var/lib/…` | The volume, e.g. `/data` (one Machine, one volume) |
| Access code | `/etc/christmas-game-night/env` | A Fly secret, set by the owner; never in GitHub |
| The artifact gate | "Promoting it", step 1, on the host | The same checks (the full SHA-256 of the audited archive, revision, inventory, `ws zod`) as the first steps of the image build, so a mismatch fails the build |
| Exposure | LAN only; no public exposure | **A public URL**, protected by the access gate on HTTP and WebSocket. This is a new owner decision: earlier approvals excluded public exposure. |

## Owner decisions and access needed (no secrets in GitHub)
1. **The route:** A (Fly.io), C (the Cloudflare port, later), or B.
2. **A card on file at Fly.io.** The expected bill is $0 under the waiver. **This is not a free tier:** the waiver is Fly's policy, and a month at $5 or more is billed in full. This setup lists at about $3.84 per 30 days. It needs an explicit ruling against the "$0 / no paid resources" rule.
3. **A public URL behind the access code,** replacing "no public exposure".
4. **The account and its details:**
   - an existing or new Fly.io personal organization;
   - a region (Ashburn `iad` and Secaucus `ewr` are the cheapest listed);
   - `*.fly.dev`, or the owner's own domain (a DNS record they add).
5. **Who deploys:** the owner, or the operator with a deploy token entered through a secure form, never in GitHub. Only after the execution approval.
6. **Where the off-host backup copy lives.**
7. **Supabase:** not needed for A. The existing account and project stay untouched; their availability and contents aren't verified.

## Sources (official, read at pinned commits of the providers' own documentation repositories)
The providers' websites were not reachable from this session (blocked: `supabase.com`, `fly.io`, `render.com`, `www.koyeb.com`, `railway.com`, `docs.cloud.google.com`, `docs.oracle.com`, `aws.amazon.com`, `developers.cloudflare.com`, `docs.deno.com`). Their official documentation repositories on GitHub were readable:
- **Fly.io**, [superfly/docs @ 0408586](https://github.com/superfly/docs/tree/040858621eea858652b156a71ffe6472e3af724b):
  - `about/pricing.mdx`: no free tier for new organizations; the Machine and volume prices.
  - `about/free-waiver.mdx`: under $5 waived; personal org, Pay As You Go, card on file.
  - `about/free-trial.mdx`: a $1 credit for 7 days; trial Machines stop after 5 minutes.
  - `volumes/overview.mdx`: one server per volume, no replication, the snapshot policy.
  - `networking/websockets.mdx`: idle connections stay open; 1012 on a restart or auto-stop.
  - `reference/configuration.mdx`: `SIGINT` by default.
  - `networking/request-headers.mdx`: `Fly-Client-IP`, `X-Forwarded-For`.
- **Supabase**, [supabase/supabase @ 311e2c7](https://github.com/supabase/supabase/tree/311e2c721c1e3dc613cb5161f101eaf68ebe5b27):
  - `apps/docs/content/guides/functions/limits.mdx`: 150 s Free, 400 s paid; 2 s CPU.
  - `apps/docs/content/guides/platform/backups.mdx`: daily backups from Pro; free projects should export their own.
  - `packages/shared-data/plans.ts`: Free, 500 MB, paused after 1 week inactive, 2 active projects; Pro $25/month.
  - `apps/docs/content/guides/realtime/limits.mdx`: 200 concurrent connections on Free.
- **Cloudflare**, [cloudflare/cloudflare-docs @ ada7e33](https://github.com/cloudflare/cloudflare-docs/tree/ada7e3355579070344a6893e8285ec357b7ff65d):
  - `src/content/partials/durable-objects/do-plans-note.mdx`: SQLite-backed Durable Objects on Free.
  - `src/content/partials/durable-objects/durable-objects-pricing.mdx`: the Free plan's daily limits.
  - `src/content/docs/durable-objects/platform/pricing.mdx`: past a Free limit, operations fail.

**Not verified here** (their official pages were blocked, and no official docs repository was found): Render, Koyeb, Railway, Google Cloud (Cloud Run, the e2-micro VM), Oracle Cloud Always Free, AWS and Deno Deploy. If ChatGPT wants them compared, their official pages need to be read where they are reachable. Nothing above relies on them.

## Not done
No account, resource, deploy, DNS change, open port or charge. No implementation change and no gate rerun (the runtime is unchanged). #42 is separate. Beta stays on HOLD until the route is selected and execution is explicitly approved.
