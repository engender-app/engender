/* Check the Android-only screenshot switch on a demo web build. Spoof
   Capacitor's platform only for Security's mount. Check the default, persisted
   choice, English and Polish labels, and thumb movement in both themes.

   Run node tests/screenshot-block-row-check.mjs after VITE_DEMO=1 npm run build.
   --root selects the build, --shots and --frames save evidence, and --before
   captures without assertions. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReporter, launchChromium, previewBuild, screencast, setAppLanguage, settlePage } from './browser-harness.mjs';
import { DEMO_THEME_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from './yank-sweep-core.mjs';

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const shots = flag('--shots') && resolve(flag('--shots'));
const framesDir = flag('--frames') && resolve(flag('--frames'));
const before = args.includes('--before');
for (const dir of [shots, framesDir]) if (dir) await mkdir(dir, { recursive: true });

const ROW = '[data-list-row="screen-capture"]';
const NAMES = { en: 'Block screenshots', pl: 'Blokuj zrzuty ekranu' };
const TRAVEL_PX = 16;

const { ok, fail, finish, block } = createReporter();
const browser = await launchChromium();
const app = await previewBuild(resolve(flag('--root') ?? process.cwd()));
const base = `http://localhost:${app.httpServer.address().port}`;
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(STUB_PERSIST_SCRIPT);

async function openSecurity(theme) {
  await settlePage(page, base, '/settings', theme);
  await page.evaluate(DEMO_THEME_EXPRESSION(theme));
  await page.evaluate(() => {
    const capacitor = (window.Capacitor ??= {});
    window.__webPlatform = capacitor.getPlatform;
    capacitor.getPlatform = () => 'android';
  });
  try {
    await page.locator('a[href="/settings/security"]').click();
    await page.waitForSelector(ROW);
  } finally {
    await page.evaluate(() => { window.Capacitor.getPlatform = window.__webPlatform; });
  }
  await settle();
}

/* Fonts in, no finite animation running, the row's box unchanged for 600ms. */
async function settle() {
  await page.evaluate(async (selector) => {
    await document.fonts.ready;
    const box = () => JSON.stringify(document.querySelector(selector).getBoundingClientRect());
    let last = box();
    let since = performance.now();
    while (performance.now() - since < 600) {
      await new Promise((r) => requestAnimationFrame(r));
      const moving = document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
      const now = box();
      if (moving || now !== last) { last = now; since = performance.now(); }
    }
  }, ROW);
}

const toggle = () => page.locator(`${ROW} [role="switch"]`);
const state = async () => ({ name: await toggle().getAttribute('aria-label'), checked: await toggle().getAttribute('aria-checked') });
const crop = async (name) => { if (shots) await page.locator(ROW).screenshot({ path: `${shots}/${name}.png`, animations: 'disabled' }); };

/* One flip, read twice: the thumb's own numbers on every animation frame, and
   the frames the compositor painted while it ran. */
async function flip(label) {
  return screencast(page, async (cast) => {
    const samples = await page.evaluate(async (selector) => {
      const button = document.querySelector(`${selector} [role="switch"]`);
      const thumb = button.querySelector('.switch-thumb');
      const track = button.querySelector('.switch-track');
      const read = () => ({
        at: Math.round(performance.now() * 10) / 10,
        x: Math.round(thumb.getBoundingClientRect().left * 100) / 100,
        track: getComputedStyle(track).backgroundColor,
        checked: button.getAttribute('aria-checked')
      });
      const rows = [read()];
      button.click();
      const start = performance.now();
      while (performance.now() - start < 700) {
        await new Promise((r) => requestAnimationFrame(r));
        rows.push(read());
      }
      return rows;
    }, ROW);
    if (framesDir) {
      const first = cast[0]?.at ?? 0;
      const manifest = [];
      for (let i = 0; i < cast.length; i++) {
        const file = `${label}-${String(i).padStart(2, '0')}.png`;
        await writeFile(`${framesDir}/${file}`, Buffer.from(cast[i].data, 'base64'));
        manifest.push({ file, ms: Math.round(cast[i].at - first) });
      }
      const box = await page.locator(ROW).boundingBox();
      await writeFile(`${framesDir}/${label}.json`, JSON.stringify({ row: box, frames: manifest, samples }, null, 1));
    }
    return samples;
  });
}

function travel(label, samples, from, to) {
  const xs = samples.map((s) => s.x);
  const start = xs[0];
  const end = xs.at(-1);
  const between = xs.filter((x) => Math.abs(x - start) > 0.5 && Math.abs(x - end) > 0.5);
  const step = Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
  const colours = new Set(samples.map((s) => s.track)).size;
  const facts = `${between.length} frames in between, largest step ${step.toFixed(1)}px of ${TRAVEL_PX}, ${colours} track colours`;
  if (Math.abs(Math.abs(end - start) - TRAVEL_PX) > 0.5) return fail(`${label}: the thumb travels ${TRAVEL_PX}px`, `moved ${(end - start).toFixed(1)}px`);
  if (samples[0].checked !== from || samples.at(-1).checked !== to) return fail(`${label}: the state goes ${from} to ${to}`, `${samples[0].checked} to ${samples.at(-1).checked}`);
  if (between.length < 3 || step > TRAVEL_PX / 2 || colours < 3) return fail(`${label}: the thumb and track travel, they do not arrive`, facts);
  ok(`${label}: ${facts}`);
}

try {
  for (const locale of ['en', 'pl']) {
    await settlePage(page, base, '/settings', 'light');
    await setAppLanguage(page, locale);
    for (const theme of ['light', 'dark']) {
      const tag = `${locale}-${theme}`;
      await openSecurity(theme);
      if (before) {
        await crop(`row-${tag}`);
        if (framesDir) {
          await flip(`${tag}-first`);
          await settle();
          await flip(`${tag}-second`);
          await settle();
        }
        continue;
      }
      await block(`${tag} row`, 5, async () => {
        let now = await state();
        now.name === NAMES[locale] && now.checked === 'false'
          ? ok(`${tag}: a screen reader hears "${now.name}, off"`)
          : fail(`${tag}: named "${NAMES[locale]}" and off`, JSON.stringify(now));
        await crop(`row-${tag}-off`);

        travel(`${tag} on`, await flip(`${tag}-on`), 'false', 'true');
        await settle();
        await crop(`row-${tag}-on`);

        await openSecurity(theme);
        now = await state();
        now.checked === 'true' ? ok(`${tag}: on survives a reload`) : fail(`${tag}: on survives a reload`, JSON.stringify(now));

        travel(`${tag} off`, await flip(`${tag}-off`), 'true', 'false');
        await settle();
        now = await state();
        now.checked === 'false' ? ok(`${tag}: back to off`) : fail(`${tag}: back to off`, JSON.stringify(now));
      });
    }
  }
  await settlePage(page, base, '/settings', 'light');
  await setAppLanguage(page, 'en');
  errors.length ? fail('no page errors', errors.join('\n')) : ok('no page errors');
} finally {
  await browser.close();
  await app.close();
}
finish(before ? 'captured the row as it was' : 'the screenshot blocker row holds');
