// Local test only (review 6955337359): drive the probe's two pages in headless Chromium, on plain http loopback:
// the other page, its control button, then the target. It uses the machine's preinstalled Chromium (W7OP_CHROMIUM,
// default /opt/pw-browsers/chromium), not the browser of whichever Playwright package resolves here, and exits non-zero
// on any failure, so a browser that never launched can't be mistaken for a browser result.
const { chromium } = require('playwright');
(async () => {
  const [other, target] = process.argv.slice(2);
  const executablePath = process.env.W7OP_CHROMIUM || '/opt/pw-browsers/chromium';
  const b = await chromium.launch({ executablePath });
  console.log(`browser launched: Chromium ${b.version()} (${executablePath})`);
  const p = await (await b.newContext()).newPage();
  await p.goto(other); await p.getByText('Control ready', { exact: false }).waitFor({ timeout: 20000 });
  await Promise.all([p.waitForNavigation({ timeout: 10000 }).catch(() => {}), p.getByRole('button').first().click()]);
  await p.goto(target); await p.getByText('VERDICT:', { exact: false }).waitFor({ timeout: 20000 });
  const v = (await p.locator('body').innerText()).split('\n').find((l) => l.startsWith('VERDICT:'));
  console.log(`target page shows: ${v}`); await b.close();
})().catch((e) => { console.error('DRIVE FAILED:', e.message.split('\n')[0]); process.exit(1); });
