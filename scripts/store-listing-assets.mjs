/* Run after VITE_DEMO=1 npm run build:
   node scripts/store-listing-assets.mjs [metadataDir]
   Fresh browser contexts hold only the full demo fixture. Port 5111 belongs
   to this capture; no existing journal or browser profile is opened. */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium } from '../tests/browser-harness.mjs';

const output = resolve(process.argv[2] ?? 'fastlane/metadata/android');
const fixedTime = new Date('2026-10-05T10:00:00Z');
const locales = [
  { code: 'en-US', language: 'en', claim: 'Track your transition.', note: 'The barista called out my new name today and it sounded right.' },
  { code: 'pl-PL', language: 'pl', claim: 'Zapisuj tranzycję.', note: 'W kawiarni zawołali mnie nowym imieniem. Dobrze to brzmiało.' }
];
// Store order: the transition areas the listing describes, HRT first after Today.
const screens = [
  ['01-home', '/', '[data-home-hello]'],
  ['02-care', '/care', '[data-care-regimen]'],
  ['03-new-entry', '/entry/new/today?seedMood=4', '#ed-note'],
  ['04-roadmap', '/transition/roadmap', '[data-goal]'],
  ['05-voice', '/voice?tab=compare', '[data-voice-cell]'],
  ['06-look-back', '/stats', '[data-lookback-readings]'],
  ['07-settings-privacy', '/settings', '[data-list-row="security"]']
];
// Settles by condition: finite animations done, every box still for 600ms,
// then two shots 500ms apart that match byte for byte.
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const boxes = (page) => page.evaluate(() => [...document.querySelectorAll('body *')]
  .map((node) => { const r = node.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}`; }).join('|'));
async function settledShot(page, path) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForFunction(() => document.getAnimations()
      .every((animation) => animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running'));
    let last = await boxes(page);
    let stillSince = Date.now();
    while (Date.now() - stillSince < 600) {
      await pause(100);
      const now = await boxes(page);
      if (now !== last) { last = now; stillSince = Date.now(); }
    }
    const first = await page.screenshot({ animations: 'disabled' });
    await pause(500);
    const second = await page.screenshot({ animations: 'disabled' });
    if (first.equals(second)) return writeFile(path, second);
  }
  throw new Error(`Never settled: ${path}`);
}
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
  // The graphic sets type the way the app does (src/lib/theme/base.css,
  // fonts.css): Outfit and Nunito are variable fonts, so each face declares
  // its weight range or the browser fakes the weight from the 400 master.
  const fontFaces = (await Promise.all([
    ['Outfit', 'outfit-latin', '100 900', ''], ['Outfit', 'outfit-latin-ext', '100 900', ';unicode-range:U+0100-024F'],
    ['Nunito', 'nunito-latin', '200 1000', ''], ['Nunito', 'nunito-latin-ext', '200 1000', ';unicode-range:U+0100-024F']
  ].map(async ([family, file, weight, range]) => `@font-face{font-family:${family};font-weight:${weight};src:url(data:font/woff2;base64,${(await readFile(`static/fonts/${file}.woff2`)).toString('base64')})${range}}`))).join('');
  // The app's mark as generated, white tile and black edge, the drawing the
  // rail, About and the landing header set beside the name.
  const mark = await readFile('brand/mark/svg/trans-tile.svg', 'utf8');
  for (const locale of locales) {
    const dir = resolve(output, locale.code, 'images');
    // A shot dropped from the list must not linger in the upload folder.
    await rm(resolve(dir, 'phoneScreenshots'), { recursive: true, force: true });
    await mkdir(resolve(dir, 'phoneScreenshots'), { recursive: true });
    await copyFile('brand/mark/png/trans-tile-512.png', resolve(dir, 'icon.png'));
    await artwork.setViewportSize({ width: 1024, height: 500 });
    // Lockup in app.css's .lockup proportions (mark 1.23em, gap 0.5em, track
    // -0.03em, word lifted 0.23em, Outfit at --weight-display 800). The line
    // is a lede, set as the landing sets one: Nunito at --weight-medium 600.
    // Ink and ground are the trans palette's light --text and --bg.
    await artwork.setContent(`<!doctype html><html lang="${locale.language}"><style>
      ${fontFaces}
      *{box-sizing:border-box}body{margin:0;width:1024px;height:500px;background:#F4F8FB;color:#1B2B36;padding:0 72px 40px;display:flex;flex-direction:column;justify-content:center}
      h1{display:flex;align-items:center;gap:0.5em;margin:0 0 28px;font:800 92px/1 Outfit;letter-spacing:-0.03em}
      h1 svg{display:block;width:1.23em;height:1.23em;flex:none}
      h1 span{padding-bottom:0.23em}
      p{font:600 40px/1.35 Nunito;margin:0;white-space:nowrap}
      footer{position:absolute;inset:auto 0 0;height:40px;background:linear-gradient(to right,#5BCEFA 0% 20%,#F5A9B8 20% 40%,#FFFFFF 40% 60%,#F5A9B8 60% 80%,#5BCEFA 80% 100%)}
      </style><h1>${mark}<span>engender</span></h1><p>${locale.claim}</p><footer></footer></html>`);
    await artwork.evaluate(async () => { await Promise.all(['800 92px Outfit', '600 40px Nunito'].map((f) => document.fonts.load(f, 'engender Track your transition. Zapisuj tranzycję.'))); await document.fonts.ready; });
    if (!await artwork.locator('p').evaluate((node) => node.scrollWidth <= node.clientWidth)) throw new Error(`Feature graphic text exceeds margins: ${locale.code}`);
    await artwork.screenshot({ path: resolve(dir, 'featureGraphic.png'), omitBackground: false });
  }
  await artwork.close();
  server = await preview({ preview: { host: '127.0.0.1', port: 5111, strictPort: true } });
  for (const locale of locales) {
    const context = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, locale: locale.code, timezoneId: 'Europe/Warsaw', colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await context.addInitScript(() => {
      // Headless Chromium denies persist(); the app would cover the shot with a storage notice.
      navigator.storage.persist = async () => true;
      navigator.storage.persisted = async () => true;
    });
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
      if (name === '01-home') {
        // The demo persona has a binder session running for nine hours, and
        // Today then leads with its over-eight-hours caution. End it here, in
        // this throwaway context, so Today opens on Coming up.
        await page.locator('[data-wear-stop]').click();
        await page.locator('[data-wear-running-tile]').waitFor({ state: 'detached' });
        await page.locator('[data-toast]').waitFor({ state: 'detached', timeout: 15000 });
      }
      if (name === '03-new-entry') {
        await page.locator('#ed-note').fill(locale.note);
        for (const slider of await page.locator('.dim-slider [role="slider"]').all()) {
          await slider.focus();
          await slider.press('ArrowRight');
        }
        await page.evaluate(() => document.activeElement?.blur());
        // The note leads, with the first scale and the mood bar under it.
        await page.locator('#ed-note').evaluate((node) => {
          node.style.scrollMarginTop = '24px';
          node.scrollIntoView({ block: 'start' });
        });
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
      await settledShot(page, resolve(output, locale.code, 'images/phoneScreenshots', `${name}.png`));
      console.log(`${locale.code}/${name}`);
    }
    await context.close();
  }
  await writeFile(resolve(output, 'capture.json'), JSON.stringify({ fixture: 'resetDemoFull', time: fixedTime.toISOString(), palette: 'trans', theme: 'light', viewport: [432, 768], deviceScaleFactor: 2.5, screens: screens.map(([name, route]) => ({ name, route })) }, null, 2) + '\n');
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
