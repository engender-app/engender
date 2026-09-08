/* Renders for setup's shape (phase 10 redesign ticket 29).

   The ticket writes the look-and-feel rules for a step machine into
   DIRECTION.md and renders them as a proposal before anything is built
   (ticket 33 builds). Same method as the direction sweep (ticket 06): a
   stylesheet laid over the built app after every navigation, so a "before"
   and an "after" shot differ only by the rules. Nothing in the app is
   edited by the sheet.

   Two sources, because the pad has two addresses. Setup's own steps are
   driven through the demo bar's first-run jump; the PIN pad is the security
   module, reached through /settings/access-mode, because the demo journal
   already has an access mode and setup's lock step falls to its toggle.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/setup-shape-gallery.mjs --tag before
        node tests/setup-shape-gallery.mjs --tag after --css tests/setup-shape-proposal.css
   Trans, light theme only (the ticket). Shots land in
   .claude/setup-shape-shots/<tag>/, gitignored and durable, with a
   scroll.json beside them recording how far each screen would scroll: the
   no-scroll rule is measured, not eyeballed. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
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
const cssPath = flag('css', null) ? resolve(flag('css')) : null;
const outDir = resolve(here, `../.claude/setup-shape-shots/${tag}`);

/* The viewports the no-scroll rule is measured at. 390x844 is the phone the
   renders are read on; 320x568 is the narrow floor and also a short one;
   390x360 stands in for a raised keyboard; 430x932 is the wide end. */
const SIZES = {
  phone: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
  keyboard: { width: 390, height: 360 },
  wide: { width: 430, height: 932 }
};

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const scroll = {};

const page = await browser.newPage({ viewport: SIZES.phone, deviceScaleFactor: 2 });

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
    if (!document.getElementById('setup-shot-css')) {
      const style = document.createElement('style');
      style.id = 'setup-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

/* The sheet, plus the one number a stylesheet cannot read: the sun's
   per-step scale, which the route writes as --grow on .setup-sun and the
   proposal needs on <html> to size the field's reserve. */
const dress = async () => {
  if (!cssPath) return;
  await page.addStyleTag({ path: cssPath });
  await page.evaluate(() => {
    const sun = document.querySelector('.setup-sun');
    const grow = sun ? getComputedStyle(sun).getPropertyValue('--grow').trim() : '1';
    document.documentElement.style.setProperty('--step-grow', grow || '1');
  });
};

/* The shot is the viewport, never grown to the content: the whole point is
   whether the step fits. What would have scrolled is recorded instead. */
const shoot = async (name) => {
  await strip();
  await dress();
  await page.waitForTimeout(500);
  /* Read from the top, as a person arrives at the step, and measured: the
     overflow is the finding, and the frame's heights are the numbers the
     section's proportion rule is written from. */
  scroll[name] = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    if (s) s.scrollTop = 0;
    const h = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0);
    return {
      overflow: s ? s.scrollHeight - s.clientHeight : 0,
      viewport: window.innerHeight,
      head: h('.setup-head'),
      title: h('.setup-title'),
      foot: h('.setup-foot'),
      pad: h('[data-pin-pad]')
    };
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
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
};

const wear = async () => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator('[data-segment="light"]').click();
  await page.waitForFunction(
    () => document.documentElement.dataset.palette === 'trans' && document.documentElement.dataset.theme === 'light'
  );
};

/** First run, walked forward to `target`, the name typed on the way. */
const ORDER = ['welcome', 'name', 'flag', 'scales', 'areas', 'lock', 'checkin', 'done'];
const stepTo = async (target) => {
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  for (const step of ORDER) {
    await page.waitForTimeout(450);
    if (step === 'name') await page.locator('#ob-name').fill('Ola');
    if (step === target) break;
    await page.locator(step === 'done' ? '[data-finish]' : '[data-next]').click();
  }
  await page.waitForTimeout(500);
};

const size = async (key) => {
  await page.setViewportSize(SIZES[key]);
  await page.waitForTimeout(200);
};

await wear();

/* ---------- every step, on the phone ---------- */
for (const step of ORDER) {
  await size('phone');
  await stepTo(step);
  await shoot(`${step}-phone`);
}

/* ---------- the sizes the rule is measured at ---------- */
await size('keyboard');
await stepTo('name');
await shoot('name-keyboard');

for (const step of ['flag', 'scales']) {
  await size('narrow');
  await stepTo(step);
  await shoot(`${step}-narrow`);
}

await size('wide');
await stepTo('flag');
await shoot('flag-wide');

/* ---------- the pad, through the security module ---------- */
const padTo = async () => {
  await settle('/settings/access-mode');
  await page.locator('[data-list-row="pin"]').click();
  await page.waitForSelector('[data-pin-pad]');
};
for (const key of ['phone', 'narrow']) {
  await size(key);
  await padTo();
  await shoot(`pad-${key}`);
}

await writeFile(`${outDir}/scroll.json`, JSON.stringify(scroll, null, 2));
await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
for (const [name, m] of Object.entries(scroll)) if (m.overflow > 0) console.log(`  scrolls: ${name} by ${m.overflow}px`);
