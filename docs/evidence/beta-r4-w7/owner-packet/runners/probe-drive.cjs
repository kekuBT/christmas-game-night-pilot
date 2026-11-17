// Local test only: drive the probe's two pages in headless Chromium (other page, its control button, then the target).
const { chromium } = require('playwright');
(async () => {
  const [other, target] = process.argv.slice(2);
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  await p.goto(other); await p.getByText('Control ready', { exact: false }).waitFor({ timeout: 20000 });
  await Promise.all([p.waitForNavigation({ timeout: 10000 }).catch(() => {}), p.getByRole('button').first().click()]);
  await p.goto(target); await p.getByText('VERDICT:', { exact: false }).waitFor({ timeout: 20000 });
  console.log((await p.locator('body').innerText()).split('\n')[0]); await b.close();
})().catch((e) => { console.error('drive failed:', e.message); process.exit(1); });
