/* Renders for the phase 10 direction, second pass (redesign ticket 06).

   The first pass rendered one set of rules over the built app and was
   signed off, then re-briefed: a direction that yields the same screens
   with more whitespace has failed. This script renders several candidate
   directions over the same two screens so they can be compared side by
   side - /stats (dense: ten chart cards) and / (sparse: header, mood row,
   tiles, lists) - in three palettes and both themes. The three palettes
   are the ones that stress a rule hardest: trans (a white band that is the
   light page), nonbinary (a yellow that a contrast floor turns olive),
   agender (a black band that is the dark page).

   Nothing in the app is edited. A direction is a stylesheet laid over the
   built app after every navigation, so two shots with different sheets
   differ only by the rules; ticket 07 lands the chosen sheet's rules in the
   token layer.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/direction-swing-gallery.mjs --tag before
        node tests/direction-swing-gallery.mjs --tag field --css tests/direction-field.css
        node tests/direction-swing-gallery.mjs --tag field-320 --css tests/direction-field.css --width 320
        node tests/direction-swing-gallery.mjs --tag field-zoom --css tests/direction-field.css --width 195
   --width 195 is what 200% zoom leaves of a 390px phone's CSS viewport
   (kit.css's own note on the tile grid); the device scale factor doubles
   so the pixels come out the same size as the 390 shots.
   --palettes trans,rainbow,... overrides the default three.
   Shots land in .claude/direction-shots/<tag>/, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'before');
/* One sheet, or several laid on in order (`--css a.css,b.css`): a direction
   and a variant raised from another direction's discipline. */
const cssPaths = flag('css', null) ? flag('css').split(',').map((p) => resolve(p)) : [];
const cssPath = cssPaths[0] ?? null;
const width = Number(flag('width', '390'));
const scale = width < 300 ? 4 : width > 800 ? 1 : 2;
const height = width > 800 ? 900 : 844;
const PALETTES = flag('palettes', 'trans,nonbinary,agender').split(',');
const THEMES = flag('themes', 'light,dark').split(',');
const outDir = resolve(here, `../.claude/direction-shots/${tag}`);

const SCREENS = [
  /* The header, not the hello line: at a 195px viewport the app's own
     sun reservation leaves the hello line no width, so Playwright reads it
     as hidden - which is a finding about 200% zoom in its own right. */
  ['home', '/', '[data-home-header]'],
  ['stats', '/stats', '[data-list-row="words"], [data-chart-card="highest-days"]']
];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: scale
});

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    /* Headless Chromium draws a classic scrollbar gutter beside the scroll
       region; a phone draws an overlay one over the content. Hidden for the
       shot so the header's right edge is the screen's, as it is on device. */
    if (!document.getElementById('direction-shot-css')) {
      const style = document.createElement('style');
      style.id = 'direction-shot-css';
      style.textContent = '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/* The app scrolls `[data-app-scroll-region]` rather than the document, so
   the whole screen is captured by growing the viewport to the content and
   shrinking it back (stats-gallery.mjs's note on why fullPage does not). */
const shoot = async (name) => {
  await strip();
  const tall = await page.evaluate(() => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    scroller.scrollTop = 0;
    return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 12000);
  });
  await page.setViewportSize({ width, height: tall });
  await page.waitForTimeout(600);
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  shots.push(name);
};

const GEAR =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>';

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
    for (const path of cssPaths) await page.addStyleTag({ path });
    /* What a stylesheet cannot read: the flag's first colour and the ink
       that sits on it. roles.ts computes both for the app (role 0 and the
       heat ramp's deepest-step ink); this is the same arithmetic in the
       page, so the proposal is honest about contrast rather than
       eyeballing it. The "Field" direction paints its headers with it;
       the others ignore it. */
    await page.evaluate(() => {
      const html = document.documentElement;
      const stripes = getComputedStyle(html)
        .getPropertyValue('--motif-stripes')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lum = (hex) => {
        const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const chroma = (hex) => {
        const c = rgb(hex);
        return Math.max(...c) - Math.min(...c);
      };
      /* The field is the flag's second colour: the first band that is a
         colour and is not the outermost, so the whole flag stays drawn in
         the sun and the field is one of its inner bands (Alicja, on the
         agender render). Where a flag has no such band the outermost
         colour stands in. */
      const inner = stripes.slice(1, -1);
      const outer = stripes[0].toUpperCase();
      const field =
        inner.find((s) => chroma(s) > 0.15 && s.toUpperCase() !== outer) ??
        stripes.find((s) => chroma(s) > 0.15) ??
        stripes[0];
      const ink = contrast('#101820', field) >= contrast('#FFFFFF', field) ? '#101820' : '#FFFFFF';
      html.style.setProperty('--flag-0', field);
      html.style.setProperty('--flag-0-ink', ink);
      html.style.setProperty('--flag-0-contrast', contrast(ink, field).toFixed(2));
    });
    /* The one thing a stylesheet cannot propose: Today's gear (spec: Settings
       is a gear in this screen's header). A decoy control, positioned by the
       direction's own sheet, so the header rule can be seen; ticket 09 builds
       the real one. */
    await page.evaluate((gear) => {
      const header = document.querySelector('[data-home-header]');
      if (!header || header.querySelector('.direction-gear')) return;
      const el = document.createElement('button');
      el.className = 'icon-btn direction-gear';
      el.setAttribute('aria-label', 'Settings');
      el.innerHTML = gear;
      header.prepend(el);
    }, GEAR);
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
      await shoot(`${name}-${palette}-${theme}`);
    }
  }
}

await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const shot of shots) console.log(`  ${shot}.png`);
