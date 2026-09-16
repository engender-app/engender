/* Renders for ticket 09 (redesign phase 10), for sign-off.

   Only what this ticket changed: the rail's new fifth row, the More hub's
   bottom now that the trailing Settings row is gone, and Today's existing
   gear (shipped early by ticket 16/23) re-checked at the zoom floor and
   under disguise, since this ticket is the one whose acceptance criteria
   name both.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/ticket-09-gallery.mjs [outDir]
   Default outDir is .claude/ticket-09-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/ticket-09-shots'));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

let page = await browser.newPage({ viewport: { width: 1400, height: 980 }, deviceScaleFactor: 2 });
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const reopen = async (width, height, scale = 2) => {
  await page.close();
  page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  watch(page);
};

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    if (!document.getElementById('t09-shot-css')) {
      const style = document.createElement('style');
      style.id = 't09-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/* Clips to one element's own box, padded, rather than from the app frame's
   top - the rail and the hub's last card both sit well down the page. */
const cropEl = async (name, selector, pad = 20, note = '') => {
  await strip();
  await page.waitForTimeout(300);
  const box = await page.evaluate(
    ([sel, pad]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(r.x - pad, 0), y: Math.max(r.y - pad, 0), width: r.width + pad * 2, height: r.height + pad * 2 };
    },
    [selector, pad]
  );
  if (!box) throw new Error(`no element for ${selector}`);
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push({ name, note });
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

/* Seed the demo persona so the hub's groups are populated and the count
   line has something to say; the seed ends by navigating to /more. */
await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

/* 1. The rail's fifth row, set apart from the four doors by a rule. Two
   crops: the whole rail (which is mostly empty below four short rows, and
   that emptiness is the point - the row sinks to the actual foot rather
   than trailing the fourth door), and a tight close-up on the seam itself. */
for (const [palette, theme] of [['trans', 'light'], ['trans', 'dark'], ['nonbinary', 'light']]) {
  await dress(palette, theme);
  await settle('/');
  await cropEl(`rail-${palette}-${theme}`, '[data-app-rail]', 0, 'the rail: four doors, a rule, Settings');
  await cropEl(`rail-seam-${palette}-${theme}`, '[data-rail-settings]', 70, 'the rule up close');
}

/* 2. The More hub's bottom: the trailing Settings row is gone, and the
   last group card is now the end of the screen. `data-hub-section` marks
   every row in a group, not just one, so the crop takes the *last* such
   row rather than the first `querySelector` would find. The row sits
   below the fold on a list this long, so it has to be scrolled into view
   before its rect means anything - `getBoundingClientRect()` is viewport-
   relative, and a clip built from the pre-scroll rect lands off-screen
   (Playwright refuses it as "outside the resulting image"). Clamped to
   the scroller's own bottom afterwards, since the extra room this crop
   wants to show may run past where the page actually ends. The persistent
   tab bar is `position: fixed`, so it paints over any clip that reaches
   the viewport's bottom edge regardless of what the page underneath it
   actually ends with - hidden here, the one time this gallery hides real
   chrome rather than only the demo bar, so the crop shows the page's own
   end instead of the bar that always sits in front of it. */
await reopen(390, 844);
for (const theme of ['light', 'dark']) {
  await dress('trans', theme);
  await settle('/more');
  await page.waitForSelector('[data-hub-section="support"]');
  await strip();
  await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-hub-section]');
    rows[rows.length - 1].scrollIntoView({ block: 'end' });
    document.querySelector('[data-app-nav]')?.style.setProperty('display', 'none');
  });
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-hub-section]');
    const r = rows[rows.length - 1].getBoundingClientRect();
    const maxY = window.innerHeight;
    const top = Math.max(r.y - 20, 0);
    return { x: Math.max(r.x - 20, 0), y: top, width: r.width + 40, height: Math.min(r.height + 220, maxY - top) };
  });
  await page.screenshot({ path: `${outDir}/hub-bottom-${theme}.png`, clip: box });
  shots.push({ name: `hub-bottom-${theme}`, note: 'nothing follows the last group' });
}

/* 3. Today's gear (shipped early by ticket 16/23), re-checked here since
   this ticket's own acceptance criteria name the zoom floor and disguise. */
await dress('trans', 'light');
await settle('/');
await cropEl('home-foot-trans-light', '[data-home-foot]', 24);
await dress('trans', 'dark');
await settle('/');
await cropEl('home-foot-trans-dark', '[data-home-foot]', 24);

/* 200% zoom on a 390px phone leaves about 195px. Default palette/theme
   here (a fresh `reopen()` page does not inherit the previous dress(), and
   dress() itself needs its palette-pick/segment controls clickable, which
   this width is specifically narrow enough to put at risk) - the point of
   this shot is layout survival and reachability, not colour. */
await reopen(195, 700);
await settle('/');
await cropEl('home-foot-zoom-195', '[data-home-foot]', 12, '200% zoom, 320px-class phone');

/* Disguise: the rail's row and Today's foot both read as an ordinary
   notes app's - "Settings" says nothing either way. */
await reopen(1400, 980);
await settle('/settings');
await page.getByRole('button', { name: /Disguise/i }).click();
await page.getByRole('switch', { name: 'Disguise app' }).click();
await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
await settle('/');
await cropEl('disguise-rail', '[data-app-rail]', 0);
/* `reopen()` opens a fresh page, and a fresh page is a fresh storage
   partition - disguise (and the palette/theme dress() sets) live there,
   not in the journal's own OPFS-backed database, so an earlier version of
   this script that called reopen() here silently landed back on the
   un-disguised default for this shot. Resizing the live page instead
   keeps the same partition, and the container query re-lays-out on its
   own; no reload needed, but settle() is cheap insurance. */
await page.setViewportSize({ width: 390, height: 844 });
await settle('/');
await cropEl('disguise-home-foot', '[data-home-foot]', 24);
/* Teardown only - every shot is already on disk by this point, so a flake
   turning disguise back off must not cost the run its output. */
try {
  await settle('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title !== 'Notes', null, { timeout: 8000 });
} catch (e) {
  console.log(`disguise-off teardown failed, harmless: ${e.message}`);
}

await page.close();
await browser.close();
await app.close();

if (errors.length) {
  console.log(`${errors.length} page error(s):`);
  for (const e of errors) console.log(`  ${e}`);
}
console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const { name, note } of shots) console.log(`  ${name}.png${note ? ` - ${note}` : ''}`);
