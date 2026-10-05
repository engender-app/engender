/* Run after VITE_DEMO=1 npm run build:
   node scripts/store-listing-assets.mjs [metadataDir]
   Fresh browser contexts hold only the full demo fixture. Port 5111 belongs
   to this capture; no existing journal or browser profile is opened. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium } from '../tests/browser-harness.mjs';

const output = resolve(process.argv[2] ?? 'fastlane/metadata/android');
const fixedTime = new Date('2026-10-05T10:00:00Z');
const locales = [
  { code: 'en-US', language: 'en', claim: 'A transition journal that stays on your device.', note: 'A quiet afternoon. A walk, then coffee by the window.' },
  { code: 'pl-PL', language: 'pl', claim: 'Dziennik tranzycji, który zostaje na twoim urządzeniu.', note: 'Spokojne popołudnie. Spacer, potem kawa przy oknie.' }
];
const screens = [
  ['01-home', '/', '[data-home-hello]'],
  ['02-new-entry', '/entry/new/today?seedMood=4', '#ed-note'],
  ['03-journal', '/calendar', '[data-cal-month-body]'],
  ['04-care', '/care', '[data-care-regimen]'],
  ['05-look-back', '/stats', '[data-lookback-readings]'],
  ['06-settings-privacy', '/settings', '[data-list-row="security"]']
];
const browser = await launchChromium();
let server;
try {
  const artwork = await browser.newPage();
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    const suffix = purpose === 'maskable' ? '-maskable' : `-${size}`;
    const svg = await readFile(`static/icons/icon-notes${purpose === 'maskable' ? '-maskable' : ''}.svg`, 'utf8');
    await artwork.setViewportSize({ width: size, height: size });
    await artwork.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await artwork.screenshot({ path: `static/icons/icon-notes${suffix}.png`, omitBackground: false });
  }
  await copyFile('static/icons/icon-notes-192.png', 'static/apple-touch-icon-notes.png');
  for (const [target, source] of [['icon-192', 'trans-tile-192'], ['icon-512', 'trans-tile-512'], ['icon-maskable', 'trans-maskable-512']]) {
    await copyFile(`brand/mark/png/${source}.png`, `static/icons/${target}.png`);
  }
  await copyFile('brand/mark/png/trans-tile-192.png', 'static/apple-touch-icon.png');
  const font = (await readFile('static/fonts/outfit-latin.woff2')).toString('base64');
  const extendedFont = (await readFile('static/fonts/outfit-latin-ext.woff2')).toString('base64');
  for (const locale of locales) {
    const dir = resolve(output, locale.code, 'images');
    await mkdir(resolve(dir, 'phoneScreenshots'), { recursive: true });
    await copyFile('brand/mark/png/trans-tile-512.png', resolve(dir, 'icon.png'));
    await artwork.setViewportSize({ width: 1024, height: 500 });
    await artwork.setContent(`<!doctype html><html lang="${locale.language}"><style>
      @font-face{font-family:Outfit;src:url(data:font/woff2;base64,${font})}
      @font-face{font-family:Outfit;src:url(data:font/woff2;base64,${extendedFont});unicode-range:U+0100-024F}
      *{box-sizing:border-box}body{margin:0;width:1024px;height:500px;background:#F4F8FB;color:#152F43;font-family:Outfit,sans-serif;padding:100px 72px}
      h1{font-size:92px;line-height:1;margin:0 0 32px;font-weight:600;letter-spacing:-3px}
      p{font-size:29px;margin:0;white-space:nowrap}
      footer{position:absolute;inset:auto 0 0;height:40px;background:linear-gradient(to right,#5BCEFA 0% 20%,#F5A9B8 20% 40%,#FFFFFF 40% 60%,#F5A9B8 60% 80%,#5BCEFA 80% 100%)}
      </style><h1>engender</h1><p>${locale.claim}</p><footer></footer></html>`);
    await artwork.evaluate(() => document.fonts.ready);
    if (!await artwork.locator('p').evaluate((node) => node.scrollWidth <= node.clientWidth)) throw new Error(`Feature graphic text exceeds margins: ${locale.code}`);
    await artwork.screenshot({ path: resolve(dir, 'featureGraphic.png'), omitBackground: false });
  }
  await artwork.close();
  server = await preview({ preview: { host: '127.0.0.1', port: 5111, strictPort: true } });
  for (const locale of locales) {
    const context = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, locale: locale.code, timezoneId: 'Europe/Warsaw', colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(fixedTime);
    await context.addInitScript((language) => localStorage.setItem('PARAGLIDE_LOCALE', language), locale.language);
    await page.goto('http://127.0.0.1:5111/', { waitUntil: 'networkidle' });
    await page.locator('[data-app-root][data-boot="ready"]').waitFor({ state: 'attached' });
    const fill = page.locator('[data-fill-every-feature]');
    await fill.waitFor(); // A non-demo build fails here, before any capture.
    await fill.click();
    await page.locator('.demo-bar[data-demo-busy]').waitFor({ state: 'attached' });
    await page.locator('.demo-bar[data-demo-busy]').waitFor({ state: 'detached', timeout: 120000 });
    for (const [name, route, ready] of screens) {
      await page.goto(`http://127.0.0.1:5111${route}`, { waitUntil: 'networkidle' });
      await page.locator('[data-app-root][data-boot="ready"]').waitFor({ state: 'attached' });
      await page.locator('[data-hide-demo-bar]').click();
      await page.locator(ready).first().waitFor();
      await page.locator('[data-toast]').waitFor({ state: 'detached', timeout: 15000 });
      await page.waitForFunction(() => !document.querySelector('.skeleton-stack, .skeleton-block'));
      if (name === '02-new-entry') {
        await page.locator('#ed-note').fill(locale.note);
        for (const slider of await page.locator('.dim-slider [role="slider"]').all()) {
          await slider.focus();
          await slider.press('ArrowRight');
        }
        await page.evaluate(() => document.activeElement?.blur());
        await page.locator('.dim-slider').first().evaluate((node) => node.scrollIntoView({ block: 'center' }));
      }
      if (name === '03-journal') {
        await page.locator('[data-cal-step="prev"]').click();
        await page.locator('[data-cal-open]').click();
        await page.locator('[data-cal-open][aria-expanded="true"]').waitFor();
      }
      await page.evaluate(async () => {
        document.documentElement.dataset.theme = 'light';
        document.documentElement.dataset.palette = 'trans';
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.getAnimations().forEach((animation) => { if (animation.effect?.getTiming().iterations !== Infinity) animation.finish(); });
      });
      if (errors.length) throw new Error(errors.join('\n'));
      await page.screenshot({ path: resolve(output, locale.code, 'images/phoneScreenshots', `${name}.png`), animations: 'disabled' });
      console.log(`${locale.code}/${name}`);
    }
    await context.close();
  }
  await writeFile(resolve(output, 'capture.json'), JSON.stringify({ fixture: 'resetDemoFull', time: fixedTime.toISOString(), palette: 'trans', theme: 'light', viewport: [432, 768], deviceScaleFactor: 2.5, screens: screens.map(([name, route]) => ({ name, route })) }, null, 2) + '\n');
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
