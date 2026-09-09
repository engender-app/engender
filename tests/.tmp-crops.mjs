/* Scratch: the three crops the carpet 28 review page needs. Not committed. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { launchChromium } from './browser-harness.mjs';

const root = '/home/alice/_projekty/priv/gender-diary/.claude/worktrees/ticket-carpet-28';
const out = `${root}/.claude/carpet-28-shots`;
await mkdir(out, { recursive: true });
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('[data-toast]')) t.remove();
    for (const b of document.querySelectorAll('.demo-bar')) b.remove();
  });
  await page.waitForTimeout(900);
};

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

const crop = async (name, selector, pad = 12) => {
  const box = await page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.left - p), y: Math.max(0, r.top - p), width: r.width + p * 2, height: r.height + p * 2 };
    },
    [selector, pad]
  );
  if (!box) {
    console.log(`MISS ${name} (${selector})`);
    return;
  }
  await page.screenshot({ path: `${out}/${name}.png`, clip: box });
  console.log(`${name} ${JSON.stringify(box)}`);
};

await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

await dress('trans', 'light');

// 1. The save bar over the last control, at rest.
await settle('/settings/dimension');
console.log(
  JSON.stringify(
    await page.evaluate(() => {
      const s = document.querySelector('.dim-slider .slider');
      const b = document.querySelector('.editor-savebar');
      const r = s.getBoundingClientRect();
      const q = b.getBoundingClientRect();
      return { slider: [Math.round(r.top), Math.round(r.bottom)], bar: [Math.round(q.top), Math.round(q.bottom)] };
    })
  )
);
await crop('savebar-over-slider', '.dim-slider', 16);

// 2. The back control under the title set solid.
await crop('title-over-back', '.screen-header-row', 8);

// 3. The tonal rows.
await settle('/settings');
await crop('tonal-rows', '.card.spread', 10);

// 4. The Android branch of the reminders list, if this build is the pinned one.
await settle('/settings/reminders');
await crop('checkin-card', '.card.checkin-card', 10);

await browser.close();
await app.close();
