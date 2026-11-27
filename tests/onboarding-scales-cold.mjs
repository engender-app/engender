/* Delay journal reads and enter the scales step before the mirror fills.
   Sample each frame until the rows settle. Every visible frame needs either
   a scale row or a data-read-reserve placeholder. Run
   node tests/onboarding-scales-cold.mjs on a demo build. --delay defaults to
   1500ms and --runs to five. */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, previewBuild } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const root = resolve(flag('--root', resolve(here, '..')));
const delay = Number(flag('--delay', 1500));
const runs = Number(flag('--runs', 5));

const browser = await launchChromium();
const app = await previewBuild(root);
const base = `http://localhost:${app.httpServer.address().port}`;

async function once() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  if (delay > 0) {
    await context.route(/mc-worker-[^/]*\.js$/, async (route) => {
      await new Promise((done) => setTimeout(done, delay));
      await route.continue();
    });
  }
  const page = await context.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('[data-next]', { timeout: 60000 });
  /* Sample every animation frame from here on. */
  await page.evaluate(() => {
    window.__samples = [];
    const tick = () => {
      const question = document.querySelector('[data-setup-question]')?.textContent?.trim() ?? '';
      window.__samples.push({
        question,
        rows: document.querySelectorAll('[data-list-row^="scale-"]').length,
        reserve: !!document.querySelector('[data-read-reserve], [data-skeleton]')
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('[data-next]').click(); // welcome -> name
  await page.locator('#ob-name').fill('Ola');
  await page.locator('[data-next]').click(); // name -> flag
  await page.locator('[data-next]').click(); // flag -> scales
  await page.waitForTimeout(delay + 2500);
  const samples = await page.evaluate(() => window.__samples);
  await context.close();
  const onStep = samples.filter((s) => /gender scales/i.test(s.question));
  const empty = onStep.filter((s) => s.rows === 0 && !s.reserve);
  return { onStep: onStep.length, empty: empty.length, last: onStep.at(-1) };
}

let red = 0;
for (let i = 0; i < runs; i++) {
  const r = await once();
  console.log(`run ${i + 1}: frames on step ${r.onStep}, empty-and-unexplained ${r.empty}, last ${JSON.stringify(r.last)}`);
  if (r.empty > 0 || r.onStep === 0) red++;
}
await browser.close();
app.httpServer.close();
console.log(red ? `RED ${red}/${runs}` : `GREEN ${runs}/${runs}`);
process.exit(red ? 1 : 0);
