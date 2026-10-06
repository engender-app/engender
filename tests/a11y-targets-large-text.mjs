/* Touch targets and whole navigation names (phase 15 after-release ticket
   18; accessibility audit A10, A11 and V13, and the 5 October audit's
   A11Y-04, A11Y-05, L04-08, L06-04 and L07-08).

   A target is measured the way a finger meets it, not by its box: from the
   control's centre, how far left, right, up and down `elementFromPoint`
   still lands on the control or something inside it. That counts a
   transparent `::after` extension the way a press does, and it counts
   nothing a neighbour covers. Each extent is capped at 30px, so 61px is
   "at least 48".

   Every listed control is checked at 320 and 390px wide with the page's
   text at 100% and 200% (the root font size, which every type token is a
   rem of). The bottom navigation is checked at 100%, 130% and 200%: every
   label shows its whole name, no word is broken across lines, and no tab
   is under 48px.

   The calendar's date links are printed at 320 rather than failed: seven
   48px columns need 336px of row, which a 320px screen does not have
   (calendar-month-a11y-check.mjs holds them at 360 and up).

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/a11y-targets-large-text.mjs [--root <built tree>] [--url <running server>]
       [--out <dir for results.json>] [--only <scene,scene>] */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const FLOOR = 48;
const out = flag('out', null);
const only = flag('only', null)?.split(',');

/** Each scene names a route and the controls on it the audits listed. */
const SCENES = [
  { key: 'home', path: '/', targets: '.kit-tile-act, .home-fold' },
  { key: 'settings', path: '/settings', targets: '.segment' },
  { key: 'tally', path: '/tally', targets: '.segment' },
  { key: 'wear', path: '/body/wear', targets: '.segment, .tag-chip' },
  { key: 'body-map', path: '/body-map', targets: '.tag-chip' },
  { key: 'letters', path: '/transition/letters', targets: '.letter-act' },
  { key: 'eras', path: '/transition/milestones', targets: '[data-tl-era]' },
  { key: 'photos', path: '/media/photos', targets: '.photo-year' },
  { key: 'clinician', path: '/health/clinician-summary', targets: '.dossier-row-link' },
  {
    key: 'entry',
    path: '/entry/new/today',
    targets: 'button.contextual-chip, .tag-chip',
    open: async (page) => {
      const tags = page.locator('[data-section-chip="tags"]');
      if ((await tags.count()) && (await tags.first().getAttribute('aria-expanded')) !== 'true') await tags.first().click();
    }
  },
  { key: 'stats', path: '/stats/days', targets: '.kit-donut-item-btn' },
  { key: 'voice', path: '/voice?tab=recordings', targets: '[data-transport-toggle]' },
  {
    key: 'templates',
    path: '/settings/entry-templates',
    targets: '[data-sheet] button.contextual-chip',
    open: async (page) => {
      await page.locator('[data-sheet] [data-add]').first().click();
      await page.locator('[data-sheet] button.contextual-chip').first().waitFor();
    }
  }
];

const WIDTHS = [320, 390];
const TEXT = [100, 200];
const NAV_TEXT = [100, 130, 200];

/** Waits for the screen to stop moving: finite animations finished, then
    the targets' rects unchanged across 600ms. */
async function settle(page, selector) {
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.effect?.getComputedTiming().endTime === Infinity || a.playState !== 'running'),
    null,
    { timeout: 10000 }
  ).catch(() => {});
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(
      (sel) => JSON.stringify([...document.querySelectorAll(sel)].map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round);
      })),
      selector
    );
    if (now === last) return;
    last = now;
    await page.waitForTimeout(600);
  }
}

/** Hit extents of every visible matching control, measured from its centre. */
function measure(page, selector) {
  return page.evaluate((sel) => {
    const CAP = 30;
    const shown = (e) => {
      const b = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !e.closest('[aria-hidden="true"],[inert]') && !e.disabled;
    };
    const rows = [];
    for (const e of [...document.querySelectorAll(sel)].filter(shown)) {
      e.scrollIntoView({ block: 'center', inline: 'nearest' });
      const b = e.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const owns = (x, y) => {
        const h = document.elementFromPoint(x, y);
        return !!h && (h === e || e.contains(h));
      };
      const name = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!owns(cx, cy)) {
        const h = document.elementFromPoint(cx, cy);
        rows.push({ name, box: `${Math.round(b.width)}x${Math.round(b.height)}`, w: 0, h: 0, covered: h ? `${h.tagName.toLowerCase()}.${[...h.classList].join('.')}` : 'nothing' });
        continue;
      }
      let l = 0, r = 0, t = 0, d = 0;
      while (l < CAP && owns(cx - l - 1, cy)) l++;
      while (r < CAP && owns(cx + r + 1, cy)) r++;
      while (t < CAP && owns(cx, cy - t - 1)) t++;
      while (d < CAP && owns(cx, cy + d + 1)) d++;
      rows.push({ name, box: `${Math.round(b.width)}x${Math.round(b.height)}`, w: l + r + 1, h: t + d + 1 });
    }
    return rows;
  }, selector);
}

/** Every nav label whole: no clipped text, no word split across lines, the
    label inside its own tab, and the tab itself at least 48px each way. */
function measureNav(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const item of document.querySelectorAll('[data-app-nav] [data-nav-item]')) {
      const label = item.querySelector('[data-nav-label]');
      const text = label.textContent.trim();
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const words = text.split(/\s+/).length;
      const ib = item.getBoundingClientRect();
      const lb = range.getBoundingClientRect();
      const clipped = label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1;
      const outside = lb.left < ib.left - 0.5 || lb.right > ib.right + 0.5 || lb.top < ib.top - 0.5 || lb.bottom > ib.bottom + 0.5;
      rows.push({ name: text, w: Math.round(ib.width), h: Math.round(ib.height), lines, words, clipped, outside });
    }
    const bar = document.querySelector('[data-app-nav]').getBoundingClientRect();
    return { bar: { top: Math.round(bar.top), height: Math.round(bar.height), bottom: Math.round(bar.bottom) }, rows };
  });
}

const browser = await launchChromium();
const app = flag('url', null) ? null : await previewBuild(resolve(flag('root', resolve(here, '..'))));
const base = flag('url', null) ?? `http://localhost:${app.httpServer.address().port}`;
const results = { scenes: [], nav: [], calendar: [] };
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persist = () => Promise.resolve(true);
      navigator.storage.persisted = () => Promise.resolve(true);
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await settlePage(page, base, '/', 'light');
  if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
  if (!(await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION))) throw new Error('fill every feature never reached /more');

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    for (const text of TEXT) {
      for (const scene of SCENES) {
        if (only && !only.includes(scene.key)) continue;
        await settlePage(page, base, scene.path, 'light');
        await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), text);
        if (scene.open) await scene.open(page);
        await settle(page, scene.targets);
        const rows = await measure(page, scene.targets);
        const label = `${scene.key} ${width}px ${text}%`;
        if (!rows.length) failures.push(`${label}: no listed controls found`);
        for (const row of rows) {
          if (row.covered) failures.push(`${label}: "${row.name}" ${row.box}, centre covered by ${row.covered}`);
          else if (row.w < FLOOR || row.h < FLOOR) failures.push(`${label}: "${row.name}" ${row.box}, hit ${row.w}x${row.h}`);
        }
        results.scenes.push({ scene: scene.key, width, text, rows });
        console.log(`${label}: ${rows.length} controls, ${rows.filter((r) => r.covered || r.w < FLOOR || r.h < FLOOR).length} under ${FLOOR}`);
      }
    }
    if (!only || only.includes('nav')) {
      for (const text of NAV_TEXT) {
        await settlePage(page, base, '/', 'light');
        await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), text);
        await settle(page, '[data-app-nav] [data-nav-item]');
        const nav = await measureNav(page);
        const label = `nav ${width}px ${text}%`;
        for (const row of nav.rows) {
          if (row.clipped) failures.push(`${label}: "${row.name}" is clipped`);
          if (row.outside) failures.push(`${label}: "${row.name}" runs outside its tab`);
          if (row.lines > row.words) failures.push(`${label}: "${row.name}" breaks a word across ${row.lines} lines`);
          if (row.w < FLOOR || row.h < FLOOR) failures.push(`${label}: "${row.name}" tab ${row.w}x${row.h}`);
        }
        results.nav.push({ width, text, ...nav });
        console.log(`${label}: bar ${nav.bar.height}px, ${nav.rows.map((r) => `${r.name} ${r.w}x${r.h} ${r.lines}l${r.clipped ? ' CLIPPED' : ''}`).join(', ')}`);
      }
    }
  }

  if (!only || only.includes('calendar')) {
    await page.setViewportSize({ width: 320, height: 844 });
    await settlePage(page, base, '/calendar', 'light');
    await page.locator('[data-cal-open]').click();
    await settle(page, '[data-cal-month-state="grid"] a');
    const rows = await measure(page, '[data-cal-month-state="grid"] a');
    results.calendar = rows;
    const under = rows.filter((r) => r.covered || r.w < FLOOR || r.h < FLOOR);
    console.log(`calendar 320px (printed, not failed): ${rows.length} date links, ${under.length} under ${FLOOR}${under[0] ? `, e.g. ${under[0].box} hit ${under[0].w}x${under[0].h}` : ''}`);
  }
} finally {
  await browser.close();
  await app?.httpServer.close();
}

results.failures = failures;
if (out) {
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 1));
}
if (failures.length) {
  console.error(`\n${failures.length} failures:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nevery listed control reaches 48px and every navigation name is whole');
