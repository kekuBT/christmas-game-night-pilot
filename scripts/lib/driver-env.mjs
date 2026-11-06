// Shared environment plumbing for the browser drivers.
//
// Browser launch. Drivers use the Chromium build that matches the pinned
// Playwright version (installed with `npx playwright install chromium`).
// A host that provides its own Chromium build (a managed cloud container,
// or a corporate machine without CDN access) can point at it explicitly
// with MCHEZO_CHROMIUM_PATH; the override is visible in every gate
// report, so a result never silently comes from a different browser.
//
// Infrastructure errors (no browser, a browser that cannot start) exit
// with INFRA_EXIT_CODE after printing a MCHEZO_INFRA_ERROR line, so the
// gate can tell "the environment is broken" from "the app is broken".
//
// Screenshots. Drivers historically wrote into tracked docs/ folders, so
// every verification run dirtied the working tree. When
// MCHEZO_SCREENSHOT_DIR is set (the gate always sets it) screenshots go
// there instead; without it, drivers keep their documented docs/ paths,
// which is how the reference screenshots are deliberately regenerated.
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium, firefox, webkit } from "playwright";

export const INFRA_EXIT_CODE = 3;
export const INFRA_MARKER = "MCHEZO_INFRA_ERROR";

export function infraError(message) {
  console.error(`${INFRA_MARKER}: ${message}`);
  process.exit(INFRA_EXIT_CODE);
}

/**
 * The Chromium the drivers will use, and where that choice came from.
 * Playwright-managed headless runs use chrome-headless-shell (Playwright's
 * default since 1.49), whatever chromium.executablePath() says, which is
 * the full build used for headed runs.
 */
export function chromiumExecutable() {
  const override = process.env.MCHEZO_CHROMIUM_PATH;
  if (override) return { path: override, source: "MCHEZO_CHROMIUM_PATH" };
  return { path: "chrome-headless-shell (playwright-managed)", source: "playwright-managed" };
}

const BROWSERS = { chromium, firefox, webkit };

/** Launch a browser, turning a missing/broken browser into an infrastructure error. */
export async function launchBrowser(name = "chromium", options = {}) {
  const type = BROWSERS[name];
  if (!type) infraError(`unknown browser "${name}"`);
  const opts = { ...options };
  if (name === "chromium") {
    const exe = chromiumExecutable();
    if (exe.source === "MCHEZO_CHROMIUM_PATH") {
      if (!existsSync(exe.path)) infraError(`MCHEZO_CHROMIUM_PATH points at ${exe.path}, which does not exist`);
      opts.executablePath = exe.path;
    }
  }
  try {
    return await type.launch(opts);
  } catch (err) {
    const first = String(err?.message ?? err).split("\n")[0];
    if (/Executable doesn't exist/.test(first)) {
      infraError(`the browser for the pinned Playwright is not installed (${first.replace(/^.*Executable doesn't exist at /, "expected ")}). Run "npx playwright install chromium", or set MCHEZO_CHROMIUM_PATH to an existing chrome-headless-shell build.`);
    }
    infraError(`${name} failed to launch: ${first}`);
  }
}

export function launchChromium(options = {}) {
  return launchBrowser("chromium", options);
}

/** Where to write a screenshot whose documented location is `defaultPath`. */
export function screenshotPath(defaultPath) {
  const dir = process.env.MCHEZO_SCREENSHOT_DIR;
  if (!dir) return defaultPath;
  mkdirSync(dir, { recursive: true });
  return join(dir, basename(defaultPath));
}

/** Directory variant, for drivers that take an output folder. */
export function screenshotDir(defaultDir) {
  const dir = process.env.MCHEZO_SCREENSHOT_DIR;
  return dir ? join(dir, basename(defaultDir)) : defaultDir;
}
