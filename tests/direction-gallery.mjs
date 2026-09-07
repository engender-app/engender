/* Renders for the phase 10 direction (redesign ticket 06).

   Two screens, one dense and one sparse: /stats, which stacks nine chart
   cards and a list, and /, which is a header, a chip row, a strip, tiles and
   a list. Three palettes rather than the default alone, and the three that
   stress a surface rule hardest - trans has a white band that vanishes on
   the light theme, nonbinary a yellow that a contrast floor turns olive,
   agender a black band that is the dark page - in both themes.

   Nothing in the app is edited. The proposal is a stylesheet laid over the
   built app after each navigation (`--css <file>`), so a shot with it and a
   shot without it differ only by the rules the direction proposes; that is
   the pair Alicja signs off on, and ticket 07 lands the winning rules in
   the token layer for real.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/direction-gallery.mjs [outDir] [--css tests/direction-proposal.css]
   Default outDir is .claude/direction-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cssAt = args.indexOf('--css');
const cssPath = cssAt >= 0 ? resolve(args[cssAt + 1]) : null;
const positional = args.filter((a, i) => a !== '--css' && i !== cssAt + 1);
const outDir = resolve(positional[0] ?? resolve(here, '../.claude/direction-shots'));
const suffix = cssPath ? '-after' : '-before';

const PALETTES = ['trans', 'nonbinary', 'agender'];
const THEMES = ['light', 'dark'];
const SCREENS = [
  ['home', '/', '[data-home-hello]'],
  ['stats', '/stats', '[data-list-row="words"]']
];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2
});

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
  });

/* The app scrolls `[data-app-scroll-region]` rather than the document, so
   the whole screen is captured by growing the viewport to the content and
   shrinking it back - stats-gallery.mjs's own note on why fullPage does
   not do it. */
const shoot = async (name) => {
  await strip();
  const tall = await page.evaluate(() => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    scroller.scrollTop = 0;
    return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 12000);
  });
  await page.setViewportSize({ width: 390, height: tall });
  await page.waitForTimeout(600);
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  shots.push(name);
};

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (cssPath) {
    await page.addStyleTag({ path: cssPath });
    /* The one thing a stylesheet cannot propose: Today's gear. The spec puts
       Settings in this screen's header and the direction has to say where,
       so the proposal render adds a decoy control there - the kit's own
       icon-btn with the catalogue's settings glyph - and nothing else. It
       is a picture of the rule, not the control (ticket 09 builds it). */
    await page.evaluate(() => {
      const header = document.querySelector('[data-home-header]');
      if (!header || header.querySelector('.direction-gear')) return;
      const gear = document.createElement('button');
      gear.className = 'icon-btn direction-gear';
      gear.setAttribute('aria-label', 'Settings');
      gear.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>';
      header.prepend(gear);
    });
  }
};

/* The palette and the theme go on after the last navigation, never before:
   `goto` remounts the shell and takes a manually stamped `data-theme` with
   it. The preference persists, so dressing once per pair is enough. */
const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/* The seed resolves by navigating to /more, so that URL is the signal it
   finished rather than a timeout. */
await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await dress(palette, theme);
    for (const [name, path, waitFor] of SCREENS) {
      await settle(path);
      await page.waitForSelector(waitFor, { timeout: 20000 });
      await page.waitForTimeout(1200);
      await shoot(`${name}-${palette}-${theme}${suffix}`);
    }
  }
}

await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const shot of shots) console.log(`  ${shot}.png`);
