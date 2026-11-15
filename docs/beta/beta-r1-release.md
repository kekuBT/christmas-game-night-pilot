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

## Building the package (on a development machine)

```
git clone <repository> cgn-release && cd cgn-release
git checkout <cleared-sha>                       # a detached, clean checkout
npm ci
node scripts/release/pack.mjs --out ../cgn-<sha> # refuses a dirty tree, or an output folder inside the repo
cat ../cgn-<sha>/release.json                    # "revision" must be <cleared-sha>, with no "-dirty"
tar -czf ../cgn-<sha>.tgz -C ../cgn-<sha> .
sha256sum ../cgn-<sha>.tgz                       # record it with the release note
```

- **What the package holds:** the compiled server, the built web app, `content/` (no pilot batches, and no approvals unless the repository has them), the two package files and `release.json`. `scripts/check-release-package.mjs` proves this on every gate run.
- **It isn't byte-for-byte reproducible:** `release.json` records the build time, and the tarball the files' times. Two builds of one SHA have different hashes (the drill's logs show it). That is why the host gets the same file that was checked, by its recorded hash, never a rebuild.

## Promoting it (on the host, between sessions)

```
# 1. Unpack and install it (root owns the release folder; the service only reads it)
sha256sum cgn-<sha>.tgz                          # must match the recorded hash
mkdir /opt/christmas-game-night/releases/<sha> && tar -xzf cgn-<sha>.tgz -C /opt/christmas-game-night/releases/<sha>
cd /opt/christmas-game-night/releases/<sha> && npm ci --omit=dev --ignore-scripts   # installs ws and zod only

# 2. Maintenance: stop the server (it saves, closes the sockets and frees its lock)
systemctl stop christmas-game-night

# 3. Back up, with the server stopped, using the NEW release's tool
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
- **Where backups go:** `/var/backups/christmas-game-night/` (root, 0700; the tool writes 0700 folders and 0600 files). A second copy goes off the host, somewhere the owner chooses and keeps private.
  - Never in git (`backups/` is ignored), never in a release folder, never under anything the proxy serves.
  - Backups hold the family's names, rooms and Memory Book.
- **How many to keep:** at least the backup before each of the last three deploys, and the last 14 after game nights. Deleting older ones is a person's decision.
- **A restore drill before the beta opens, then monthly:**

  ```
  node dist/server/datatool.js verify  --backup <backup>
  node dist/server/datatool.js restore --backup <backup> --into /tmp/cgn-restore-drill   # refuses a non-empty folder
  NODE_ENV=production MCHEZO_DATA_DIR=/tmp/cgn-restore-drill MCHEZO_PUBLIC_ORIGIN=https://<host> \
    MCHEZO_BETA_ACCESS_CODE=<code> MCHEZO_LISTEN_HOST=127.0.0.1 PORT=3999 node dist/server/serve.js
  ```

  Check that the rooms load, stop the server, and remove the drill copy.
- **Room retention:**
  - Once a month, run `datatool prune --data /var/lib/christmas-game-night --older-than-days 60`. It is a dry run that lists rooms idle for 60 days.
  - With `--apply`, only with the server stopped and after a backup, it moves them into `data/archive/<time>/`. Archived rooms aren't loaded or served.
  - Deleting an archive is the owner's decision. Nothing deletes family data by itself.
- **A full disk:**
  - A save that fails answers the phone with "could not be saved to disk" (HTTP 500). The last saved state stays intact, and the server keeps running.
  - Free space (old archives, after a backup and the owner's go), and the next change is saved.
  - Check `df` before each game night.

## What the person deploying reports

- the SHA and the package's SHA-256;
- the time;
- the backup folder name;
- the `/health` revision after the start;
- the restore line;
- any rollback.

These go into the deploy note on the release PR or issue, without the access code, names or room data.
