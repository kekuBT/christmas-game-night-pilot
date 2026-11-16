# Beta R1: the release process

**Status:** the process for the private family beta. A person runs every step, and only after the owner approves that exact revision. Nothing deploys itself: CI runs only when started by hand (`workflow_dispatch`), and no workflow deploys anything. Architecture and settings: `docs/beta/beta-r1-architecture.md`.

## The rules

1. **One reviewed revision becomes one package, and that package is what runs.**
   - The package is built once from a clean checkout of the cleared SHA, and copied to the host as a file with a recorded SHA-256.
   - The host never builds, never checks out a branch, and never runs a development server.
   - `release.json` inside the package names the revision, and `/health` reports it.
2. **Promotion is manual.**
   - The candidate needs the full gate `PASSED (exit 0)` on that SHA, the review cleared, the owner's private Codespace audit, and the owner's go.
   - A push, a merge or a green gate deploys nothing by itself.
3. **Deploys happen between sessions.** Not during a game night.
4. **No promise that an active room survives an update.**
   - Rooms are saved on every change and restored at start, so a room in its lobby or between games normally comes back, and phones reconnect by themselves.
   - Everyone shows as disconnected until their phone reconnects.
   - A game in progress may not resume the way it was. An interrupted solo round is never resumed.
   - Tell the family before an update.
5. **A backup before every deploy,** taken with the server stopped.
6. **Previews are private:** local, the home Wi-Fi, or a private Codespace (`docs/CODESPACES_PREVIEW.md`). Never a public port, never the beta's data or access code.

## Preflight: the host and the route, at $0 (Beta R2)

**Status:** a comparison and a checklist for ChatGPT and the owner, from handoff [6908014247](https://github.com/kekuBT/christmas-game-night-pilot/pull/43#issuecomment-6908014247) item 2. **Nothing is chosen, provisioned or bought here.** ChatGPT reviews the recommendation with the owner before anything is executed, and execution needs the owner's explicit approval. The release candidate is recorded in [`release-7097ac2.md`](release-7097ac2.md).

**Scope:** only an **already-authorized private host** (a machine or an account the owner already has, already at $0) or an **owner-provided LAN route**. New accounts that need a card, a paid tier or a domain purchase are out of scope: they need the owner's explicit approval (`docs/COST_FEASIBILITY.md`).

### What every option must keep (unchanged from the architecture page)
- **One Node 22 service:** one process, on Linux. Production refuses to start off Linux, because the single-writer lock is a Linux abstract socket.
- **One HTTPS origin** with WebSocket proxying, in front of a **loopback-only backend** (`MCHEZO_LISTEN_HOST=127.0.0.1`).
- **One data writer** on one local persistent disk: no second instance, no network volume.
- **Separate private folders** for releases (root, read-only to the service), data (`cgn`, 0700) and backups (root, 0700), plus a copy of the backups off the host.

### The viable options
**Facts marked "official"** were read on 2026-11-16 in the providers' own documentation sources, at pinned revisions (listed under "Sources" below).
- **Unreachable from this session:** tailscale.com (refused by this session's network policy), and the Oracle, Google Cloud and AWS documentation sites.
- **So for those providers,** only facts from Tailscale's own source code are stated. Everything else is a fact **to confirm on the provider's page** (the last table).

| | **H1. LAN only:** the owner's always-on Linux computer, home Wi-Fi only, a name in a domain the owner **already** has | **H2. Cloudflare named Tunnel** from that computer, with a domain the owner **already** has on Cloudflare | **H3. Tailscale Funnel** from that computer (no domain) | **H4. A VM the owner already has at $0** (for example, an existing always-free VM) |
|---|---|---|---|---|
| **Compute** | The owner's computer, on during game nights, not sleeping | The same | The same | The provider's VM: always on, if the account allows it |
| **TLS and WebSockets** | Caddy with a **public** certificate through the **DNS challenge**. It needs no open ports, but Caddy needs the DNS provider's API credentials and a Caddy build with that provider's module (official, Caddy). Ubuntu's `caddy` 2.6.2 has **no** DNS-provider module (`caddy list-modules`, checked here). WebSockets pass through `reverse_proxy` (official, Caddy; drilled here). | TLS ends at Cloudflare's edge. "Cloudflare supports proxied WebSocket connections without additional configuration", on all plans (official, Cloudflare). `cloudflared` makes outbound connections only, with no inbound ports, and must reach Cloudflare on port 7844 (official). | A `*.ts.net` name. Caddy fetches `.ts.net` certificates from the local Tailscale (official, Caddy). Funnel needs HTTPS enabled on the tailnet and the `funnel` node attribute, and its ports come from the tailnet's policy (Tailscale's source code). **WebSockets through Funnel: not confirmed from an official page.** | The architecture page as written: Caddy with a public certificate (the A/AAAA record points at the VM, ports 80 and 443 open: official, Caddy) |
| **Stable participant access** | **Only on the home Wi-Fi.** The name must resolve to the computer's LAN address (a DHCP reservation keeps it stable). Some routers refuse DNS answers pointing at private addresses: check it on a phone. No remote players. | Any network, by a stable name in the owner's domain | Any network, by a stable `*.ts.net` name | Any network, by the VM's DNS name |
| **Who sits in the path** | Nobody outside the home | **Cloudflare:** traffic "flows through Cloudflare", which applies caching and WAF to it (official). So Cloudflare handles the decrypted requests, including the beta cookie and session tokens. | Tailscale relays the connection. Whether it ever sees the decrypted traffic is **to confirm** on Tailscale's page. | The VM provider |
| **Persistent private disk and backups** | The computer's own disk; backups to a second local disk, plus an off-host copy | The same | The same | The VM's boot or block volume. **Its retention when an account or VM is idle is to confirm** on the provider's page. |
| **Client address (`MCHEZO_TRUST_PROXY`)** | `1` (Caddy on the same machine) | **Count first.** "X-Forwarded-For maintains proxy server and original visitor IP addresses", with `CF-Connecting-IP` alongside (official). Caddy warns that X-Forwarded-For can be spoofed behind Cloudflare. **Leave it unset until counted on the host.** | Count first; leave it unset until then | `1` (Caddy on the VM) |
| **Quotas and billing** | None beyond the existing domain's renewal (the owner's existing cost) | Tunnel and WebSockets on all plans, the free plan included (official). The domain's existing renewal. | **To confirm:** the plan's price, limits and use terms | **To confirm:** the account's own free allowance, from its billing page |
| **Owner-dependent facts** | A Linux machine; a domain **already** owned; a DNS provider with an API; router DNS behaviour | A Linux machine; a domain **already** on Cloudflare, or moving its nameservers there (this affects the domain's other DNS and email); a Cloudflare account | A Linux machine; a Tailscale account and its plan terms | That the account **already** exists and is authorized, with no card added for this |

**Not viable, and why:**
- **Cloudflare quick tunnels** (`trycloudflare.com`): "for testing and development. For production, create a Cloudflare Tunnel". They have no uptime guarantee, a 200 in-flight-request limit, and a new name each run (official).
- **Caddy's own local CA for the phones:** every guest's phone would have to install and trust its root. "Any client accessing the site without trusting Caddy's root CA certificate will show security errors" (official).
- **Serverless, sleeping or ephemeral-disk platforms:** they break the rooms (architecture page).
- **A public Codespace port:** ruled out by the owner.
- **A non-Linux computer:** production refuses to start off Linux.
- **New accounts that need a card:** need the owner's explicit approval.

**A recommendation for ChatGPT and the owner to weigh (provisional, not a decision).** It depends on two owner facts: is there an always-on Linux computer at home (or an already-authorized $0 VM), and is a domain already owned?
- **All players at home, and a domain already owned → H1.** Nobody outside the home is in the path, and nothing is reachable from the internet. Its cost is a Caddy build with the DNS module and a narrowly scoped DNS token. Let's Encrypt warns that full DNS API credentials on the web server raise the impact of a compromise (official).
- **Remote players, and a domain already on Cloudflare → H2.** Cloudflare then sees the decrypted traffic: the owner accepts that, or chooses H1 or H3.
- **No domain → H3,** the only no-domain $0 route found. It holds only after Tailscale's terms, limits and WebSocket behaviour are confirmed on tailscale.com and one test room is proved over it (below).
- **H4** fits only if such a VM already exists. It is then the closest to the architecture page.

### The preflight checklist (before the first install)
Each line is observable before anything is installed. **Who:** the owner, or the person they name, on the candidate host or account; ChatGPT reviews the record.

| # | Check | How to observe it | Pass when |
|---|---|---|---|
| P1 | Linux, always on | `uname -s`; the machine's sleep and power settings | `Linux`; no sleep during game nights |
| P2 | Node 22 where the unit expects it | `command -v node; node -v` | `/usr/bin/node`, `v22.x` (or edit the unit's `ExecStart=` to the real path) |
| P3 | Free disk for data and backups | `df -h /var/lib /var/backups` | At least 1 GB free on each |
| P4 | An off-host copy for backups | The owner names the private place (an external drive, or private storage they already use) | Named, and not in git, a release folder or anything served |
| P5 | The name and the certificate | H1/H4: `dig +short <name>` from a phone's network; H2: the domain listed in the Cloudflare account; H3: HTTPS and Funnel enabled in the tailnet | The name resolves to the right place; the certificate is publicly trusted (no warning on a phone) |
| P6 | The terms, for H2–H4 | The provider's own pricing and terms pages, and the account's billing page | $0 at the expected use, no card added, and the limits and retention written into the go/no-go record |
| P7 | No inbound port opened by mistake | The router's port-forwarding list (H1–H3) or the VM's firewall (H4) | H1–H3: none; H4: 80 and 443 only, plus SSH by key |
| P8 | The proxy count, for `MCHEZO_TRUST_PROXY` | Below, step 3 | Counted, or the setting left unset |
| P9 | The access code | Generated as on the architecture page, stored only in the env file | At least 12 characters, never in GitHub |

**Then prove the route once, before the beta's data exists:**
1. **Install the package on a throwaway data folder** and a throwaway access code, with the steps in "First install".
2. **Check `/health`:** `curl -s https://<name>/health` gives `{"ok":true,"revision":"7097ac2…"}`.
3. **Count the proxies.** The server takes the client's address from the X-Forwarded-For entry `MCHEZO_TRUST_PROXY` places from the end (`src/server/access.ts`), so the value must be the number of proxies that append to it.
   1. Stop the service, and run `nc -l 127.0.0.1 3000` in its place: it prints each request exactly as the route delivers it.
   2. From another computer, send a fake entry first: `curl -H 'X-Forwarded-For: 203.0.113.7' https://<name>/proxy-count-test`. Use one off the home network for H2–H4, or on the home Wi-Fi for H1.
   3. Read the `X-Forwarded-For` line `nc` prints, then stop `nc` with Ctrl-C and start the service again. The curl gets an error; that is expected.
   - **The reading:** ignore `203.0.113.7` if it is still there. A proxy that refuses client-sent values drops it: Caddy does by default, and Caddy 2.6.2 did here (`docs/evidence/beta-r2-preflight/xff-caddy-2.6.2.out.txt`).
     - The **remaining entries** are the ones the route's proxies wrote.
     - **The first of them** should be the curl computer's own address.
   - **The setting:** `MCHEZO_TRUST_PROXY` is the number of those entries, if it is 1 to 3. For example, `<curl's address>` alone, or `203.0.113.7, <curl's address>`, means `1`.
   - **If the first appended entry isn't the curl computer's address, or there are none,** leave the setting unset and record why. The per-device limits then count everyone together, which is safe.
4. **On one phone off the home network** (H2–H4) or on the home Wi-Fi (H1): enter the code, create a room, and watch a second phone join live. That proves WebSockets over the real route.
5. **Stop, remove the throwaway folder and code,** and start the real first install.

**Run as a drill here:** this machine played the runbook with the real package, a real service user and Caddy 2.6.2 in front. It used a local CA, because a public certificate can't be had from here: `docs/evidence/beta-r2-preflight/`. Not run here: a real host, a public certificate, systemd as PID 1, any of the four routes, and real phones.

**The drill script is for a disposable machine only.** Never run it on the beta host.
- **Its refusal:** it won't start where a `cgn` user, a `cgn` group or its folder already exists.
- **Its cleanup:** it deletes only what that run itself created, confirmed by its own successful `groupadd`, `useradd` and `mkdir` (reviews 6908455526 and 6908557588; D-BR2-06, D-BR2-07).

### Sources (official, read 2026-11-16)
- **Caddy documentation**, `caddyserver/website` at `c33ee8b`:
  - [automatic-https.md](https://github.com/caddyserver/website/blob/c33ee8b02a245045bc18c406a1aa0e06cd1fb772/src/docs/markdown/automatic-https.md): the public-certificate requirements, the local CA, the DNS challenge, `.ts.net`;
  - [reverse_proxy.md](https://github.com/caddyserver/website/blob/c33ee8b02a245045bc18c406a1aa0e06cd1fb772/src/docs/markdown/caddyfile/directives/reverse_proxy.md): WebSockets, X-Forwarded-For, Cloudflare spoofing.
- **Let's Encrypt documentation**, `letsencrypt/website` at `c5aba6d`: [challenge-types.md](https://github.com/letsencrypt/website/blob/c5aba6d794bfabcbbcea2319db9d65734c382461/content/en/docs/challenge-types.md) (DNS-01).
- **Cloudflare documentation**, `cloudflare/cloudflare-docs` at `2a6ef7a`:
  - [Tunnel overview](https://github.com/cloudflare/cloudflare-docs/blob/2a6ef7a61fe2efc78971fa497438526117ef849c/src/content/docs/tunnel/index.mdx) and [get started](https://github.com/cloudflare/cloudflare-docs/blob/2a6ef7a61fe2efc78971fa497438526117ef849c/src/content/docs/tunnel/get-started/index.mdx);
  - [Quick Tunnels](https://github.com/cloudflare/cloudflare-docs/blob/2a6ef7a61fe2efc78971fa497438526117ef849c/src/content/docs/tunnel/get-started/quick-tunnels/index.mdx);
  - [WebSockets](https://github.com/cloudflare/cloudflare-docs/blob/2a6ef7a61fe2efc78971fa497438526117ef849c/src/content/docs/network/websockets.mdx);
  - [HTTP headers](https://github.com/cloudflare/cloudflare-docs/blob/2a6ef7a61fe2efc78971fa497438526117ef849c/src/content/docs/fundamentals/reference/http-headers.mdx).
- **Tailscale source code**, `tailscale/tailscale` at `6e16dac`: [ipn/serve.go](https://github.com/tailscale/tailscale/blob/6e16dac9e9beec391730423198b3115eb3422efe/ipn/serve.go) (`CheckFunnelAccess`, `NodeCanFunnel`, `CheckFunnelPort`).
- **Extracts of every passage relied on,** with the commands that fetched them: `docs/evidence/beta-r2-preflight/official-sources.md`.
- **Node.js:** [nodejs.org previous releases](https://nodejs.org/en/about/previous-releases) and [`nodejs/release`](https://github.com/nodejs/release#release-schedule).

**To confirm on the provider's own page:** none of these could be read from this session.

| Provider | What to confirm | Where |
|---|---|---|
| Tailscale | Plan price and use terms; Funnel's availability on that plan; its limits; WebSockets through Funnel; whether the relay ever decrypts | tailscale.com: pricing, the Funnel docs (kb/1223) |
| Cloudflare | That the free plan's terms allow this use; log and retention terms for proxied traffic | cloudflare.com: plans and terms |
| Oracle, Google Cloud, AWS (H4 only) | The account's free allowance, idle-reclamation rules and billing | The account's console and billing page |

## Building the package (on a development machine)

```
git clone <repository> cgn-release && cd cgn-release
git checkout <cleared-sha>                       # a detached, clean checkout
npm ci
node scripts/release/pack.mjs --out ../cgn-<sha> # refuses a dirty tree, or an output folder inside the repo
cat ../cgn-<sha>/release.json                    # "revision" must be <cleared-sha>, with no "-dirty"
tar -czf ../cgn-<sha>.tgz -C ../cgn-<sha> .
sha256sum ../cgn-<sha>.tgz                       # record it with the release note
(cd ../cgn-<sha> && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 \
   | LC_ALL=C sort -z | xargs -0 sha256sum) > ../cgn-<sha>.inventory.sha256
sha256sum ../cgn-<sha>.inventory.sha256          # the inventory digest: record it too
```

- **What the package holds:** the compiled server, the built web app, `content/` (no pilot batches, and no approvals unless the repository has them), the two package files and `release.json`. `scripts/check-release-package.mjs` proves this on every gate run.
- **It isn't byte-for-byte reproducible:** `release.json` records the build time, and the tarball the files' times. Two builds of one SHA have different hashes (the drill's logs show it). That is why the host gets the same file that was checked, by its recorded hash, never a rebuild.
- **Its files are reproducible:**
  - **What was built:** three builds of `7097ac2`, from fresh clones under Node v22.16.0 and v22.23.4, gave the same 144-file inventory.
  - **So the inventory digest** is how a reviewer confirms that an archive holds exactly the cleared revision's files.
  - **The record:** [`release-7097ac2.md`](release-7097ac2.md) has the digest and the verification steps.

## First install (no previous package)

On a host that has never run the game. As root (or with `sudo`), between sessions, once the owner has approved the revision. The service and its settings are in `docs/beta/beta-r1-architecture.md`.

```
# 1. The service user and its folders: the data belongs to it, the backups to root, both private
useradd --system --no-create-home --shell /usr/sbin/nologin --user-group cgn
install -d -m 0700 -o cgn -g cgn /var/lib/christmas-game-night
install -d -m 0700 /var/backups/christmas-game-night
install -d -m 0755 /opt/christmas-game-night/releases

# 2. The settings: readable by root and the service only (they hold the access code)
install -d -m 0750 -g cgn /etc/christmas-game-night
install -m 0640 -g cgn /dev/null /etc/christmas-game-night/env    # then edit: NODE_ENV=production, MCHEZO_DATA_DIR,
                                                                  # MCHEZO_PUBLIC_ORIGIN, MCHEZO_BETA_ACCESS_CODE,
                                                                  # MCHEZO_TRUST_PROXY=1, MCHEZO_LISTEN_HOST=127.0.0.1, PORT

# 3. The package: as in "Promoting it", step 1 (hash, unpack, npm ci --omit=dev), then
ln -sfn /opt/christmas-game-night/releases/<sha> /opt/christmas-game-night/current

# 4. Check the (empty) data folder as the service user, then the unit, then start
cd /opt/christmas-game-night/current
sudo -u cgn node dist/server/datatool.js check --data /var/lib/christmas-game-night   # "check OK: 0 room(s) ..."
install -m 0644 christmas-game-night.service /etc/systemd/system/   # the unit from the architecture page
systemctl daemon-reload && systemctl enable --now christmas-game-night

# 5. Check, as after any promotion
curl -s https://<host>/health                    # {"ok":true,"revision":"<sha>"}
journalctl -u christmas-game-night -n 20         # "Christmas Game Night server on http://localhost:3000 ..." and
                                                 # "Listening on 127.0.0.1; public origin https://<host>."
                                                 # An empty first install prints no "[restore]" line: the server
                                                 # prints it only when a room loaded or failed (drill, step B8).
```

- **Then:** one phone through the gate, and the first backup after the first game night (below).
- **Rolling back a first install:** there is no previous package. See "Rolling back", below.

## Promoting it (on the host, between sessions)

```
# 1. Unpack and install it (root owns the release folder; the service only reads it)
sha256sum cgn-<sha>.tgz                          # must match the recorded hash
mkdir /opt/christmas-game-night/releases/<sha> && tar -xzf cgn-<sha>.tgz -C /opt/christmas-game-night/releases/<sha>
cd /opt/christmas-game-night/releases/<sha>
cat release.json                                 # "revision": "<sha>", no "-dirty"
LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum
                                                 # the release record's inventory digest (for 7097ac2: release-7097ac2.md)
npm ci --omit=dev --ignore-scripts               # installs ws and zod only
npm ls --omit=dev --depth=0                      # ws and zod, nothing else

# 2. Maintenance: stop the server (it saves, closes the sockets and frees its lock)
systemctl stop christmas-game-night

# 3. Back up, with the server stopped, using the NEW release's tool (as root: the backup is root's, 0700/0600).
#    The tool holds the data folder while it copies: a server started meanwhile is refused (systemd retries).
node dist/server/datatool.js backup --data /var/lib/christmas-game-night \
     --out /var/backups/christmas-game-night/$(date -u +%Y%m%dT%H%MZ)-before-<sha>

# 4. Switch and start
ln -sfn /opt/christmas-game-night/releases/<sha> /opt/christmas-game-night/current
systemctl start christmas-game-night

# 5. Check
curl -s https://<host>/health                    # {"ok":true,"revision":"<sha>"}
journalctl -u christmas-game-night -n 20         # "[restore] N room(s) restored, 0 not loaded"
```

- **Then one phone:** open the site, enter the code, and open an existing room.
- **Check the restore line:** if it reports anything "NOT LOADED" or quarantined, roll back (below) before anyone plays. Quarantined files are kept in `quarantine/`, never deleted.

**While the server is stopped:**
- Phones show the app's own offline or reconnecting screens.
- To show a plain page instead of the proxy's error, the example Caddy configuration can add the block below inside the site block (not run in this session):

  ```
  handle_errors {
  	respond "Christmas Game Night is updating. Back in a few minutes." 503
  }
  ```

## Rolling back

```
systemctl stop christmas-game-night
ln -sfn /opt/christmas-game-night/releases/<previous-sha> /opt/christmas-game-night/current
systemctl start christmas-game-night
curl -s https://<host>/health                    # the previous revision
```

### When there is no previous package (the first install)
There is nothing to switch back to, and the data stays where it is.

```
systemctl disable --now christmas-game-night     # stop it, and keep it stopped
ls -la /var/lib/christmas-game-night             # the data is untouched: never delete it
```

- **The site:** it shows the proxy's error, or the maintenance page below, until a corrected package is reviewed, approved and installed with the steps in "Promoting it".
- **If the data itself is in doubt:** restore the latest backup into a **new** folder for the service user, as in "Restore" below. Point `MCHEZO_DATA_DIR` at it only after `check` passes as `cgn`. The old folder is kept.
- **The release folder can stay:** `/opt/christmas-game-night/releases/<sha>` changes nothing while the service is stopped. Removing it is optional.

- **Keep the previous release folder until the new one has run a game night.**
- **Data compatibility is shown before each promotion.**
  - For this branch, `1955c28` reads and writes what this branch writes, both ways (`docs/evidence/beta-r1-local/rollback-compat-*.txt`).
  - The steps on this page ran as a drill on this machine with real packages (`release-drill.mjs.txt`; run 4 passed on `fe9319e`, with `8dfe323` as the previous release). It covered pack, install, stop, back up, switch, start, play, roll back, and restore into a new folder. Not run in the drill: systemd, Caddy, a real host and real phones.
  - Each later release needs the same check against the release it replaces.
- **If a release ever changes the saved format so the previous one can't read it,** rolling back means restoring the pre-deploy backup into a **new** folder and pointing `MCHEZO_DATA_DIR` at it. That loses what was played since the deploy, so the release note must say so before the owner approves.

## Backups, restore and retention

- **When to back up:**
  - before every deploy (above, with the server stopped);
  - after each game night, between sessions.
  - `--allow-running` is possible: every file is still whole, but a room and its Memory Book may be a moment apart.
- **Where backups go:** `/var/backups/christmas-game-night/` (root, 0700). The tool writes 0700 folders and 0600 files that belong to whoever runs it (root), whoever owns the data. A second copy goes off the host, somewhere the owner chooses and keeps private.
  - Never in git (`backups/` is ignored), never in a release folder, never under anything the proxy serves.
  - Backups hold the family's names, rooms and Memory Book.
- **How many to keep:** at least the backup before each of the last three deploys, and the last 14 after game nights. Deleting older ones is a person's decision.
- **Restore, always under the service user** (Beta R1-R, review 6900450343 R2). A restore made as root belongs to root, and the service, which runs as `cgn`, can't read it. `check` and the server both refuse such a folder and say why.
  - **The steps:** restore with `--owner`, which hands the new folder to `cgn` (still 0700 and 0600), then run `check` as `cgn`.
  - **Where:** never into the live folder. `restore` refuses a folder that isn't empty, and it holds the new folder while it writes.

  ```
  cd /opt/christmas-game-night/current
  node dist/server/datatool.js verify  --backup <backup>
  node dist/server/datatool.js restore --backup <backup> --into /var/lib/christmas-game-night-restored-<date> --owner cgn
  sudo -u cgn node dist/server/datatool.js check --data /var/lib/christmas-game-night-restored-<date>
  # to serve it: stop the service, set MCHEZO_DATA_DIR to the new folder (and add it to ReadWritePaths= in the
  # unit, then systemctl daemon-reload), start, check /health and the restore line. The old folder is kept.
  ```

- **A restore drill before the beta opens, then monthly,** into a drill folder, run as the service user:

  ```
  node dist/server/datatool.js restore --backup <backup> --into /var/lib/cgn-restore-drill --owner cgn
  sudo -u cgn node dist/server/datatool.js check --data /var/lib/cgn-restore-drill
  sudo -u cgn env NODE_ENV=production MCHEZO_DATA_DIR=/var/lib/cgn-restore-drill MCHEZO_PUBLIC_ORIGIN=https://<host> \
    MCHEZO_BETA_ACCESS_CODE=<code> MCHEZO_LISTEN_HOST=127.0.0.1 PORT=3999 node dist/server/serve.js
  ```

  Check that the rooms and Memory Books load, stop the server, and remove the drill copy (`rm -r /var/lib/cgn-restore-drill`). The release check runs these steps with real local users on every gate (step U).
- **Room retention:**
  - Once a month, run `datatool prune --data /var/lib/christmas-game-night --older-than-days 60`. It is a dry run that lists rooms idle for 60 days.
  - With `--apply`, after a backup, it moves them into `data/archive/<time>/`. Archived rooms aren't loaded or served. It holds the data folder while it works, so it refuses while the server runs, and a server can't start meanwhile.
  - Deleting an archive is the owner's decision. Nothing deletes family data by itself.
- **A full disk:**
  - A save that fails answers the phone with "could not be saved to disk" (HTTP 500). The last saved state stays intact, and the server keeps running.
  - Free space (old archives, after a backup and the owner's go), and the next change is saved.
  - Check `df` before each game night.

## What the person deploying reports

- the SHA, the package's SHA-256 and its inventory digest;
- the time;
- the backup folder name;
- the `/health` revision after the start;
- the restore line;
- any rollback.

These go into the deploy note on the release PR or issue, without the access code, names or room data. For the first install they are part of the go/no-go record ([`docs/device-testing/BETA_GO_NO_GO_TEMPLATE.md`](../device-testing/BETA_GO_NO_GO_TEMPLATE.md); the checks are in [`docs/REAL_DEVICE_TESTING.md` §7](../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2)).
