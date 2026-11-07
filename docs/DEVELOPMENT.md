# Developing Mchezo: clean start

Works on Windows (PowerShell), macOS and Linux, including cloud containers. Nothing needs to be installed globally except Node.js.

## 1. Prerequisites

- **Node.js 22 or 24** (`engines: >=22`) with the npm that ships with it. Check with `node -v`.
- **Git.**
- About 700 MB of disk for `node_modules` plus one Chromium build.

## 2. Install

```sh
git clone https://github.com/kekuBT/christmas-game-night-pilot.git
cd christmas-game-night-pilot
npm ci                              # exact versions from package-lock.json
npx playwright install chromium     # browser matching the pinned Playwright (browser tests only)
```

Use `npm ci`, not `npm install`: it fails loudly if `package.json` and `package-lock.json` disagree, instead of quietly rewriting the lockfile.

**Pre-provisioned Chromium.** If your machine already has a Chromium build and cannot download one (a managed cloud container, or a network that blocks the Playwright CDN), skip `playwright install` and point the drivers at it explicitly. Prefer a **`chrome-headless-shell`** build, which is what Playwright itself uses for headless runs:

```sh
export MCHEZO_CHROMIUM_PATH=/path/to/chrome-headless-shell        # macOS/Linux
$env:MCHEZO_CHROMIUM_PATH = "C:\path\to\chrome-headless-shell.exe" # Windows PowerShell
```

A full Chrome binary also works but renders more slowly. Some drivers then fail on their own timing assumptions: measured on 2026-11-06, `check-game-night` failed and `check-leaderboard`/`check-f5` ran past their budgets under full Chrome, on both the handoff code and Sprint 1, and all three passed under the headless shell. The gate warns when it detects a full Chrome build.

The gate report records which browser was used, so results from an overridden browser are never mistaken for results from the pinned one. Without either, browser checks stop with a `MCHEZO_INFRA_ERROR` explaining what is missing. They never quietly fall back to another browser.

## 3. Verify

```sh
npm run gate            # fast level: typecheck, lint, unit tests, production build
npm run gate:selftest   # optional: proves the gate fails when it should
```

See [TESTING.md](TESTING.md) for targeted and full browser runs and what each verdict means.

## 4. Run the app

```sh
npm run build:web       # builds apps/web/dist
npm run serve           # http://localhost:3000 (PORT=xxxx to change)
```

Server configuration (environment variables, all optional):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Listen port; `0` picks a free one and prints it |
| `MCHEZO_DATA_DIR` | `./data` | Room snapshots (git-ignored) |
| `MCHEZO_WEB_DIST` | `apps/web/dist` | Built web app to serve |

Phones on the same Wi-Fi can join at `http://<your-computer's-LAN-IP>:3000`; the server prints that address when it starts.

For real-device testing use `npm run serve:device-test` (test-mode content, separate `./data-device-test` data) and follow [REAL_DEVICE_TESTING.md](REAL_DEVICE_TESTING.md).

## 5. Day-to-day

| Task | Command |
|---|---|
| Unit tests (watch) | `npx vitest` |
| Web dev server with hot reload | `npm run dev:web` (proxies the API to `localhost:3000`, so run `npm run serve` too) |
| Typecheck / lint | `npm run typecheck` / `npm run lint` |
