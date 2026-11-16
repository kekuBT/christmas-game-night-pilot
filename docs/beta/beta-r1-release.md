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
- **Under the current handoff, only H1 can go to Approval 1** (review 6909578563). H2–H4 need public exposure, new provisioning or possibly spending, so they are recorded as **unavailable**. See "The order of execution" below. Making one of them available would take a separate, explicit owner decision, which this runbook doesn't give.

### The order of execution (Beta R3; review 6909578563)
**One sequence.** Each stage starts only when every step of the one before it is recorded, and any failure stops it: record a no-go and use "Rolling back" (or, on a first install, "When there is no previous package"). The go/no-go record ([draft for `7097ac2`](../device-testing/beta-go-no-go-DRAFT-7097ac2.md)) collects the evidence.

| Stage | What happens | Changes the host? | Starts only after | Checks that need the running isolated preview |
|---|---|---|---|---|
| **0. Read-only preflight** | R1–R8 below: observing and reading only | **No** | The route is selected for a route available under this handoff (below) | none |
| **Approval 1** | The owner explicitly approves private validation on the selected route | — | Stage 0 recorded | — |
| **1. Isolated staging** | The checksum-gated unpack of the pinned archive. A first install with a **throwaway** data folder and a **throwaway** access code. | **Yes**, privately | Approval 1 | — |
| **2. Route checks** | V1–V3 below: TLS, WebSockets, the proxy count | Configuration only | Stage 1 | **V1, V2, V3** |
| **3. Host and device checks** | H1–H6 and P1–P8 ([REAL_DEVICE_TESTING.md §7](../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2)) | Restarts, backups, a restore drill | Stage 2 | **H1–H6, P1–P8** |
| **4. Go/no-go, then Approval 2** | The completed record, the owner's sign-off, ChatGPT's review. Then the switch to the real data folder and code, and only then invitations. | **Yes** | Stage 3 recorded, no blocker | the final `/health` and one P1 |

**Every check in the last column stays PENDING until it is observed on the running isolated preview.** Neither the local rehearsal nor the private Firefox audit counts as observing it.

**Routes available under this handoff:** none may need new public exposure, new provisioning or spending.

| Route | Needs public exposure? | Needs new provisioning? | Needs spending? | Under this handoff |
|---|---|---|---|---|
| H1, LAN only | No: reachable only on the home Wi-Fi | Only configuration of what the owner already has: a DNS record and a narrowly scoped DNS token on the existing domain, plus a Caddy build with that DNS module | No, if the domain is already owned | **Available,** with that configuration named in Approval 1 |
| H2, Cloudflare named Tunnel | **Yes:** a public hostname on the internet | **Yes:** a tunnel, and possibly an account or moving the domain's DNS | Possibly | **Unavailable**: needs a separate explicit owner decision |
| H3, Tailscale Funnel | **Yes:** a public `*.ts.net` address | **Yes:** tailnet HTTPS, the Funnel attribute, possibly an account | Unknown (terms unread) | **Unavailable**: needs a separate explicit owner decision |
| H4, an existing $0 VM | **Yes:** ports 80 and 443 open to the internet | Firewall and DNS changes | Account-dependent | **Unavailable**: needs a separate explicit owner decision |

#### Stage 0: the read-only preflight
Observing and reading only: nothing is installed, configured, opened, created or bought.
- **Who:** the owner, or the person they name (F6), on the candidate host and their own accounts.
- **Where the results go:** the go/no-go record.

| # | Check | How to observe it (read-only) | Pass when |
|---|---|---|---|
| R1 | Linux, always on | `uname -s`; the machine's sleep and power settings | `Linux`; no sleep during game nights |
| R2 | Node 22 where the unit expects it | `command -v node; node -v` | `/usr/bin/node`, `v22.x`.<br>If it is missing or another version, installing Node is a host change: it waits for Stage 1, from the OS's or nodejs.org's own packages, at $0. |
| R3 | Free disk for data and backups | `df -h /var/lib /var/backups` | At least 1 GB free on each |
| R4 | A private backup destination | The owner names it (F5): an external drive or private storage they already use | Named, and not in git, a release folder or anything served |
| R5 | $0 eligibility | The owner reads their own account, billing and terms pages for everything the route uses (H1: the domain's renewal and its DNS provider's API tokens) | Nothing new to buy, no new account, trial or card, and nothing past a free limit |
| R6 | Network constraints | The router's port-forwarding list, and the host's firewall (`sudo nft list ruleset` or `sudo iptables -S`, read only) | Nothing forwarded to the host from outside, and the route needs no inbound port |
| R7 | The name and who will create its record | The planned hostname under the owner's domain; `dig +short <name>` shows whether it exists yet | Written down. Creating or changing the record is configuration, done in Stage 1 under Approval 1. |
| R8 | The operator | Who runs Stages 1–4 with shell access (F6) | Named |

#### Stage 1: isolated staging (after Approval 1)
1. **Host software, only what Stage 0 found missing and Approval 1 names,** at $0 and from official packages:
   - Node 22 (R2);
   - for H1, Caddy built with the DNS provider's module, its narrowly scoped DNS token in a private file, and the DNS record from R7.

   Nothing beyond that.
2. **"First install", parts 1–5, as written.** It uses:
   - the throwaway data folder `DATA=/var/lib/cgn-validation`, never the beta's;
   - a throwaway `MCHEZO_BETA_ACCESS_CODE` that nobody in the family will be given;
   - no `MCHEZO_TRUST_PROXY` until V2.

   Its part 3 is the artifact gate ("Promoting it", step 1): it must print `VERIFIED`. Its part 4 starts the service only if this run's verification, the link, the settings, the data check, the unit and the reload all succeeded. On any `STOP`, stop and record a no-go.
3. **The proxy in front** (for H1, Caddy as in the architecture page's example, with the DNS challenge). It is then the running isolated preview.

#### Stage 2: the route checks (on the running isolated preview)
| # | Check | Pass when |
|---|---|---|
| V1 | **TLS:** `curl -s https://<name>/health` from a device on the route, and the same address on a phone | `{"ok":true,"revision":"7097ac2bb062925bb296a129f4771f1e68fd522d"}`, with no certificate warning |
| V2 | **The proxy count** (below) | Counted, or `MCHEZO_TRUST_PROXY` left unset with the reason recorded |
| V3 | **WebSockets:** on a phone on the route, enter the throwaway code and create a room, then a second phone joins | The second phone appears live, without a reload |

**Counting the proxies (V2).** The server takes the client's address from the X-Forwarded-For entry `MCHEZO_TRUST_PROXY` places from the end (`src/server/access.ts`), so the value must be the number of proxies that append to it.
1. Stop the service, and run `nc -l 127.0.0.1 3000` in its place: it prints each request exactly as the route delivers it.
2. From another computer on the route, send a fake entry first: `curl -H 'X-Forwarded-For: 203.0.113.7' https://<name>/proxy-count-test`.
3. Read the `X-Forwarded-For` line `nc` prints, then stop `nc` with Ctrl-C and start the service again. The curl gets an error; that is expected.

- **The reading:** ignore `203.0.113.7` if it is still there. A proxy that refuses client-sent values drops it: Caddy does by default, and Caddy 2.6.2 did here (`docs/evidence/beta-r2-preflight/xff-caddy-2.6.2.out.txt`).
  - The **remaining entries** are the ones the route's proxies wrote.
  - **The first of them** should be the curl computer's own address.
- **The setting:** `MCHEZO_TRUST_PROXY` is the number of those entries, if it is 1 to 3. For example, `<curl's address>` alone, or `203.0.113.7, <curl's address>`, means `1`.
- **If the first appended entry isn't the curl computer's address, or there are none,** leave the setting unset and record why. The per-device limits then count everyone together, which is safe.
- **Then:** write the value (or nothing) to the settings file, restart the service, and run V1 again.

#### Stage 3: the host and device checks (on the running isolated preview)
- **What runs:** H1–H6 and P1–P8 from [REAL_DEVICE_TESTING.md §7](../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2).
- **Where:** against the isolated install from Stage 1, with the owner's own testers, recorded in the go/no-go record.
- **The rooms played** live only in the throwaway data folder.

#### Stage 4: go/no-go, Approval 2, then the switch
1. **Complete the go/no-go record** with no blocker. Then the owner's sign-off and ChatGPT's review: that is Approval 2.
2. **After Approval 2 only,** switch to a new, empty data folder and the real code, in one shell, as root.
   - **Part A** stops the service. Only after a successful stop does it create the new real data folder, and only if nothing is there yet: an existing folder, empty or not, is refused and left exactly as it is.

     ```
     # >>> switch, stop and prepare (begin)
     ENVFILE=/etc/christmas-game-night/env
     DATA=/var/lib/christmas-game-night
     STOPPED=; PREPARED=
     OLD_CODE=$(grep '^MCHEZO_BETA_ACCESS_CODE=' "$ENVFILE" | sha256sum | cut -c1-64)   # a hash of the line; no code printed
     if systemctl stop christmas-game-night; then STOPPED=1
     else echo "STOP: the service didn't stop. Nothing was changed; record a no-go."; fi
     if [ -z "$STOPPED" ]; then :
     elif mkdir -m 0700 "$DATA" && chown cgn:cgn "$DATA"; then PREPARED=1
     else echo "STOP: $DATA already exists or couldn't be made. It is left as it is; don't start or invite."; fi
     # <<< switch, stop and prepare (end)
     ```
   - **Then edit the settings file by hand:** `MCHEZO_DATA_DIR=/var/lib/christmas-game-night`, exactly once, and the real `MCHEZO_BETA_ACCESS_CODE` in place of the throwaway one. Don't print either code.
   - **Part B** starts the service only if all of these hold:
     - part A stopped and prepared in this shell;
     - the settings name the new folder exactly once;
     - the access-code line changed (compared by hash);
     - the new folder is still empty;
     - the unit names the folder, and the reload succeeded.

     ```
     # >>> switch, start (begin)
     UNIT=/etc/systemd/system/christmas-game-night.service
     NEW_CODE=$(grep '^MCHEZO_BETA_ACCESS_CODE=' "$ENVFILE" | sha256sum | cut -c1-64)
     if [ -n "$STOPPED" ] && [ -n "$PREPARED" ] \
        && [ "$(grep -c '^MCHEZO_DATA_DIR=' "$ENVFILE")" = 1 ] && grep -qx "MCHEZO_DATA_DIR=$DATA" "$ENVFILE" \
        && [ "$(grep -c '^MCHEZO_BETA_ACCESS_CODE=' "$ENVFILE")" = 1 ] && [ "$NEW_CODE" != "$OLD_CODE" ] \
        && [ -d "$DATA" ] && [ -z "$(ls -A "$DATA")" ] \
        && sed -i "s#^ReadWritePaths=.*#ReadWritePaths=$DATA#" "$UNIT" && grep -qx "ReadWritePaths=$DATA" "$UNIT" \
        && systemctl daemon-reload
     then systemctl start christmas-game-night && echo "SWITCHED to $DATA"
     else echo "STOP: not stopped and prepared in this run, or the settings, the new code, the empty folder, the unit or the reload didn't check out. The service stays stopped; record a no-go."; fi
     # <<< switch, start (end)
     ```
   - **On any STOP:** nothing is deleted. The service stays stopped, and the throwaway folder and any existing real folder are kept.
     - To bring the validation instance back for another look: put the throwaway settings back, set `ReadWritePaths=/var/lib/cgn-validation` if part B changed it, then `systemctl daemon-reload` and `systemctl start`.
     - A retry of part A needs a new real folder: one that part A made and part B refused is empty and can be removed with `rmdir`.
   - **After `SWITCHED`:** check `/health` and P1 on one phone. Remove the throwaway folder (`rm -r /var/lib/cgn-validation`) once nothing in it is needed.
3. **Then invite the family.**

**Run as a drill here:** this machine played the runbook with the real package, a real service user and Caddy 2.6.2 in front. It used a local CA, because a public certificate can't be had from here: `docs/evidence/beta-r2-preflight/`. Not run here: a real host, a public certificate, systemd as PID 1, any of the four routes, and real phones.

**The drill script is for a disposable machine only.** Never run it on the beta host.
- **Its refusal:** it won't start where a `cgn` user, a `cgn` group or its folder already exists.
- **Its cleanup:** it deletes only what that run itself created, confirmed by its own successful `groupadd`, `useradd` and `mkdir` (reviews 6908455526 and 6908557588; D-BR2-06, D-BR2-07).

### Deciding the route: what is still needed from the owner (Beta R3)
**No new survey.** The options and their sources are above. ChatGPT makes the route recommendation once these facts are known, and the owner chooses.

**The owner's facts, each a short answer:**

| # | Question | What it decides |
|---|---|---|
| F1 | **Where are the players?** All on the home Wi-Fi on game nights, or some remote? | H1 (LAN only) is possible only if everyone is at home. |
| F2 | **Is there an always-on Linux machine** the owner already has and may use (at home), or an already-authorized $0 VM? Which, and what Node version can it run? | H1–H3 need the home machine; H4 needs the VM. Production refuses non-Linux. |
| F3 | **Is a domain already owned?** If so, which DNS provider runs it (Cloudflare, or another with an API)? | H1 needs the DNS API for a public certificate; H2 needs the domain on Cloudflare. With no domain, H3. |
| F4 | **Is a third party in the path acceptable?** Cloudflare (H2) handles the decrypted traffic. | Whether H2 stays an option |
| F5 | **Where does the off-host backup copy go?** A private place the owner already has (an external drive, private storage). | Read-only check R4 and host check H3 |
| F6 | **Who runs the host steps,** with shell access? | The runbook's operator, and §7's host checks |

**Already verified:** these don't need the owner.
- **The app's needs:** one Node 22 process on Linux; a persistent private disk; HTTPS with WebSockets; a stable hostname (the architecture page).
- **One HTTPS origin, with the access gate on HTTP and WebSocket and a loopback backend:**
  - checked in the gate's HTTPS check;
  - checked again through Caddy 2.6.2 in the local rehearsal.
- **One data writer:** the kernel-held lock, plus the datatool's refusals (release check).
- **Caddy, Let's Encrypt and Cloudflare facts:** from official docs at pinned commits (above).
- **Tailscale's Funnel prerequisites:** HTTPS on the tailnet and the `funnel` node attribute, from its source code.

**Unknown until checked on the owner's own accounts and pages** (read-only checks R5–R7):
- Tailscale's plan terms, Funnel's limits and WebSocket behaviour;
- Cloudflare's plan terms and retention;
- a VM account's allowance, idle rules and billing;
- the home router's DNS behaviour for a private address;
- the domain's renewal.

**What doesn't change, whichever route:** one HTTPS origin; the access gate on HTTP and WebSocket; the backend on 127.0.0.1 only; one data writer; and separate private release, data and backup folders.

### Two approvals before anyone is invited (Beta R3)
Execution has two separate boundaries. Each needs the owner's own explicit approval, and the first never implies the second.

| | **Approval 1: private target-host validation** | **Approval 2: invitations and go** |
|---|---|---|
| **When** | After a route **available under this handoff** is selected (F1–F6, ChatGPT's recommendation, the owner's choice) and the read-only preflight R1–R8 is recorded | After every row of the go/no-go record has evidence |
| **What it allows** | **On the selected host, privately, in this order** ("The order of execution"):<br>• Stage 1: only the host software Stage 0 found missing (Node 22; for H1, Caddy with the DNS module), from official packages at $0; the checksum-gated install of the pinned artifact (SHA-256 `a693c543…3a5131`, release record [release-7097ac2.md](release-7097ac2.md)) with throwaway data and a throwaway code; any H1 DNS configuration it names;<br>• Stage 2: route checks V1–V3;<br>• Stage 3: host checks H1–H6 and phone checks P1–P8, with the owner's own testers. | **Stage 4:** switching to the real data folder and access code, and **inviting the family** to the beta at that address |
| **What it doesn't allow** | Inviting anyone; a different artifact; **any public port or public exposure**; any route that needs exposure, provisioning or spending (H2–H4 are unavailable under this handoff); any new account, trial or spending | Changing the artifact. Any new release needs both approvals again. |
| **Evidence it needs** | The route decision and the read-only preflight, recorded | The completed go/no-go record ([draft](../device-testing/beta-go-no-go-DRAFT-7097ac2.md); [template](../device-testing/BETA_GO_NO_GO_TEMPLATE.md)), with no blocker. Then the owner's sign-off and ChatGPT's review. |
| **If something fails** | Stop. Keep the data and use the stop steps: "Rolling back", including "When there is no previous package". Record it as no-go. | §7.3's no-go triggers ([REAL_DEVICE_TESTING.md](../REAL_DEVICE_TESTING.md#73-go-or-no-go)), and "Rolling back" |

**Not evidence for either approval:** the local rehearsal and the private Firefox audit. They are listed in the draft record as earlier evidence, not as host or device checks.

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

On a host that has never run the game. As root (or with `sudo`), between sessions.
- **When:** in Stage 1 of "The order of execution", after the read-only preflight and the owner's Approval 1, with the throwaway data folder and code that Stage 1 names.
- **Where the service and its settings are:** `docs/beta/beta-r1-architecture.md`.

**1. Prepare** (the user, the folders and an empty settings file):

```
# >>> first install, prepare (begin)
# This install's data folder is the THROWAWAY one. Only Stage 4, after Approval 2, switches to the real one.
DATA=/var/lib/cgn-validation
OPT=/opt/christmas-game-night
BACKUPS=/var/backups/christmas-game-night
SETTINGS=/etc/christmas-game-night; ENVFILE="$SETTINGS/env"
# The service user and its folders: the data belongs to it, the backups to root, both private.
useradd --system --no-create-home --shell /usr/sbin/nologin --user-group cgn
install -d -m 0700 -o cgn -g cgn "$DATA"
install -d -m 0700 "$BACKUPS"
install -d -m 0755 "$OPT/releases"
# The settings: readable by root and the service only (they hold the access code). An existing file is kept.
install -d -m 0750 -g cgn "$SETTINGS"
[ -e "$ENVFILE" ] || install -m 0640 -g cgn /dev/null "$ENVFILE"
# <<< first install, prepare (end)
```

**2. The operator's edits**, by hand:
- **The settings file** `/etc/christmas-game-night/env`:
  - `NODE_ENV=production`;
  - `MCHEZO_DATA_DIR=/var/lib/cgn-validation`, exactly once;
  - `MCHEZO_PUBLIC_ORIGIN`;
  - the **throwaway** `MCHEZO_BETA_ACCESS_CODE`;
  - `MCHEZO_LISTEN_HOST=127.0.0.1` and `PORT`.

  Leave `MCHEZO_TRUST_PROXY` out: Stage 2's V2 counts it. Don't print or paste the code into anything that keeps a log.
- **The unit:** it isn't in the package. Write the architecture page's unit to `/etc/systemd/system/christmas-game-night.service` (mode 0644).

**3. The artifact gate:** in the same shell, run "Promoting it", step 1, from `SHA=` up to (not including) `# 2. Maintenance`. It sets `VERIFIED` only if everything verified in this run.

**4. Start:** in the same shell. Each check runs only if the one before it succeeded, and the service starts only if all of them did:

```
# >>> first install, start (begin)
DATA=/var/lib/cgn-validation
ENVFILE=/etc/christmas-game-night/env
UNIT=/etc/systemd/system/christmas-game-night.service
if [ -n "$VERIFIED" ] && [ -f "$MARK" ] \
   && ln -sfn "$REL" "$OPT/current" \
   && [ "$(grep -c '^MCHEZO_DATA_DIR=' "$ENVFILE")" = 1 ] && grep -qx "MCHEZO_DATA_DIR=$DATA" "$ENVFILE" \
   && (cd "$OPT/current" && sudo -u cgn node dist/server/datatool.js check --data "$DATA") \
   && sed -i "s#^ReadWritePaths=.*#ReadWritePaths=$DATA#" "$UNIT" && grep -qx "ReadWritePaths=$DATA" "$UNIT" \
   && systemctl daemon-reload
then systemctl enable --now christmas-game-night
else echo "STOP: not verified in this run, or the link, the settings, the data check, the unit or the reload failed. Not started; record a no-go."; fi
# <<< first install, start (end)
```

**5. Check,** as after any promotion:

```
curl -s https://<host>/health                    # {"ok":true,"revision":"<sha>"}
journalctl -u christmas-game-night -n 20         # "Christmas Game Night server on http://localhost:3000 ..." and
                                                 # "Listening on 127.0.0.1; public origin https://<host>."
                                                 # An empty first install prints no "[restore]" line: the server
                                                 # prints it only when a room loaded or failed (drill, step B8).
```

- **Then:** one phone through the gate, and the first backup after the first game night (below).
- **Rolling back a first install:** there is no previous package. See "Rolling back", below.

## Promoting it (on the host, between sessions)

**The artifact gate** (review 6909578563).
- **Where the values come from:** the release record for the revision (for `7097ac2`: [release-7097ac2.md](release-7097ac2.md)). That means the audited archive's full SHA-256 and its inventory digest, never a rebuild's.
- **What the gate does:** every later command runs only if the one before it passed, starting with removing any marker an earlier attempt left.
  - A marker that can't be removed, a wrong or missing archive, a wrong revision, a wrong inventory or unexpected packages print `STOP`.
  - On any of those, no `VERIFIED` is set for this run.
- **What controls the later steps:** this run's flags, never a marker on disk alone (review 6910988491).
  - Step 2 stops the server only with `VERIFIED`, and sets `STOPPED` only if the stop succeeded.
  - Step 3 backs up only with `STOPPED`.
  - Step 4 switches and starts only with `VERIFIED`, `STOPPED` and `BACKUP_OK`.
  - So a printed `STOP` is never the only safeguard: when the block is run as a whole, the later steps refuse by themselves.
- **The demonstration:** this block, the first install's and the switch's, extracted from this page, were run against disposable test files (`docs/evidence/beta-r3-gate/`, and `docs/evidence/beta-r3-gate/round2/` for review 6910988491).
- **Run it in one shell, as root,** with the audited archive copied to the host unchanged.

```
# >>> promote (begin)
# 1. Verify, then unpack and install. Each step runs only if the one before it passed, starting with removing any
#    marker an earlier attempt left. VERIFIED is set only by a complete chain in THIS run, and steps 2-4 require it:
#    a marker on disk alone never reaches a service command. (Step 1 sets no data-folder variable.)
SHA=7097ac2bb062925bb296a129f4771f1e68fd522d
EXPECTED_SHA256=a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131
EXPECTED_INVENTORY=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
ARCHIVE=./mchezo-7097ac2.tgz
OPT=/opt/christmas-game-night
REL="$OPT/releases/$SHA"; MARK="$OPT/verified-$SHA"
VERIFIED=; STOPPED=; BACKUP_OK=
if rm -f "$MARK" && [ ! -e "$MARK" ] \
   && printf '%s  %s\n' "$EXPECTED_SHA256" "$ARCHIVE" | sha256sum --check --strict --quiet \
   && mkdir "$REL" \
   && tar -xzf "$ARCHIVE" -C "$REL" \
   && grep -q "\"revision\": \"$SHA\"" "$REL/release.json" \
   && [ "$(cd "$REL" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-64)" = "$EXPECTED_INVENTORY" ] \
   && (cd "$REL" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund) \
   && [ "$(cd "$REL" && npm ls --omit=dev --depth=0 --parseable | tail -n +2 | xargs -n1 basename | sort | tr '\n' ' ')" = "ws zod " ] \
   && touch "$MARK"
then VERIFIED=1; echo "VERIFIED $SHA: ready to switch"
else echo "STOP: the old marker, the archive, its revision, its inventory or its packages didn't verify. Don't switch; record a no-go."
fi

# 2. Maintenance: stop the server (it saves, closes the sockets and frees its lock). Only for a release verified in
#    this run; STOPPED is set only if the stop succeeded.
LIVE_DATA=/var/lib/christmas-game-night; BACKUPS=/var/backups/christmas-game-night
if [ -z "$VERIFIED" ]; then echo "STOP: not verified in this run; the server keeps running."
elif systemctl stop christmas-game-night; then STOPPED=1
else echo "STOP: the server didn't stop. Don't back up or switch; record a no-go."; fi

# 3. Back up, with the server stopped, using the NEW release's tool (as root: the backup is root's, 0700/0600).
#    The tool holds the data folder while it copies: a server started meanwhile is refused (systemd retries).
if [ -z "$STOPPED" ]; then echo "STOP: not verified and stopped in this run; no backup."
elif (cd "$REL" && node dist/server/datatool.js backup --data "$LIVE_DATA" \
     --out "$BACKUPS/$(date -u +%Y%m%dT%H%MZ)-before-$SHA"); then BACKUP_OK=1
else echo "STOP: no backup. Don't switch; 'systemctl start christmas-game-night' restarts the previous release."; fi

# 4. Switch and start: only after this run's verification, stop and backup.
if [ -n "$VERIFIED" ] && [ -n "$STOPPED" ] && [ -n "$BACKUP_OK" ] && [ -f "$MARK" ]
then ln -sfn "$REL" "$OPT/current" && systemctl start christmas-game-night
else echo "STOP: not verified, stopped and backed up in this run. Don't switch."; fi
# <<< promote (end)

# 5. Check
curl -s https://<host>/health                    # {"ok":true,"revision":"<sha>"}
journalctl -u christmas-game-night -n 20         # "[restore] N room(s) restored, 0 not loaded"
```

- **If any step printed `STOP`:** don't continue. The later steps of the block have already refused.
  - **If the stop succeeded but the backup didn't:** the previous release is still linked. `systemctl start christmas-game-night` restarts it.
  - **Keep** the unpacked folder, if there is one, for inspection.
  - **Record** a no-go.
  - **Don't** delete or overwrite the archive.
  - **A retry** needs the folder `$REL` removed first: `mkdir` refuses an existing one, on purpose.
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
ls -la "$DATA"                                   # the data folder in use (Stage 1: /var/lib/cgn-validation) is
                                                 # untouched: never delete it
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
