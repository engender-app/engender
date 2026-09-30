/* Exercise Android's live tab presentation over the real web journal.
   Painted pixels behind the system icons must retain the page background
   through the field's movement and cleanup. Requires a VITE_DEMO=1 build. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, screencast, settlePage } from './browser-harness.mjs';
import { decodePng } from './png-decode.mjs';
import { DEMO_THEME_EXPRESSION, INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const out = resolve('.claude/ticket287-status-strip');
await mkdir(out, { recursive: true });
const browser = await launchChromium();
const app = await previewBuild(process.cwd());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
const base = `http://localhost:${app.httpServer.address().port}`;
await settlePage(page, base, '/', 'light');
await page.evaluate(() => {
  window.Capacitor.getPlatform = () => 'android';
  document.documentElement.style.setProperty('--inset-top', '40px');
  document.documentElement.style.setProperty('--field-bleed-top', '9px');
});

const stripPixels = (bytes) => {
  const image = decodePng(bytes);
  const pixels = [];
  for (const y of [6, 16, 26]) for (const x of [90, 190, 290]) {
    const at = (y * image.width + x) * image.channels;
    pixels.push(...image.pixels.slice(at, at + 3));
  }
  return pixels.join(',');
};

let failed = false;
try {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(DEMO_THEME_EXPRESSION(theme));
    await page.waitForTimeout(900);
    const expected = stripPixels(await page.screenshot());
    for (const pass of ['first', 'remembered']) for (const tab of ['calendar', 'stats', 'settings', 'home']) {
      let wrong = 0;
      const count = await screencast(page, async (frames) => {
        await page.evaluate(`document.querySelector('[data-nav-item="${tab}"]').click()`);
        await page.waitForTimeout(1200);
        if (pass === 'remembered') {
          const scrollTop = await page.evaluate(() => document.querySelector('[data-app-scroll-region]').scrollTop);
          if (scrollTop < 59) throw new Error(`${theme} ${tab}: remembered scroll was ${scrollTop}, expected 60`);
        }
        for (let i = 0; i < frames.length; i++) {
          const bytes = Buffer.from(frames[i].data, 'base64');
          if (stripPixels(bytes) !== expected) wrong++;
          await writeFile(`${out}/${theme}-${pass}-${tab}-${i}.png`, bytes);
        }
        return frames.length;
      });
      const ok = count >= 3 && wrong === 0;
      if (!ok) failed = true;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${theme} ${pass} ${tab}: system strip stable in ${count - wrong}/${count} painted frames`);
      if (pass === 'first') {
        await page.evaluate(() => { document.querySelector('[data-app-scroll-region]').scrollTop = 60; });
        await page.waitForTimeout(100);
      }
    }
  }
  if (errors.length) {
    failed = true;
    console.error(errors.join('\n'));
  }
} finally {
  await browser.close();
  await app.close();
}
process.exitCode = failed ? 1 : 0;
