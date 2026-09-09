/* Setup's own renders and its own measurements (phase 10 redesign ticket 33).

   Ticket 29 drew rules 12 to 14 as a stylesheet laid over the built app and
   shot them; this shoots the built thing, so the two sets are comparable
   shot for shot: `.claude/setup-shape-shots/after/` is the proposal and
   `.claude/setup-shots/` is what shipped.

   Two jobs. It writes a `scroll.json` beside the shots recording, per step
   and per viewport, whether the app's scroll region has anything to scroll
   and how tall each part of the frame is - which is what rule 14 is
   measured against rather than eyeballed. And it writes the shots the
   sign-off page is built from.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/setup-gallery.mjs
        node tests/setup-gallery.mjs --palette nonbinary --theme dark

   Trans in light by default, which is the ticket's own brief. Shots land in
   .claude/setup-shots/<palette>-<theme>/, gitignored and durable. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { SETUP_STEPS } from './setup-flow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const palette = flag('palette', 'trans');
/* Shooting a worktree of main, where these parts have their old names. */
const legacyNames = args.includes('--legacy');
const theme = flag('theme', 'light');
/* `--out` so the same script can shoot another checkout: it serves the
   cwd's build (vite preview reads the cwd, not this file's directory), so a
   before set is this script run from a worktree of main with somewhere else
   to write. */
const outDir = flag('out', null)
  ? resolve(flag('out'))
  : resolve(here, `../.claude/setup-shots/${palette}-${theme}`);

/* The viewports rule 14 names: the phone the renders are read on, the
   narrow floor, a raised keyboard's remainder, and the wide end. 360 wide
   is in the walkthrough's own assertion rather than here - it shows nothing
   a shot at 320 and one at 390 do not. */
const SIZES = {
  phone: { width: 390, height: 844 },
  narrow: { width: 320, height: 568 },
  keyboard: { width: 390, height: 360 },
  wide: { width: 430, height: 932 }
};

const ORDER = SETUP_STEPS;

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const scroll = {};
const shots = [];

const page = await browser.newPage({ viewport: SIZES.phone, deviceScaleFactor: 2 });

/* The storage toast lands over the foot on a headless run and arrives fresh
   on every boot, so a tap on Skip or on the way out waits for it rather
   than going through it. Hidden for the length of the run in the document
   itself, which survives the navigations this script makes; nothing else
   about the app is touched. */
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent = '[data-toast]{display:none!important}';
  addEventListener('DOMContentLoaded', () => document.head.append(style));
});

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    document.body.classList.remove('has-demo-bar');
  });

const click = (selector) => page.locator(selector).click();

/** What rule 14 asks, read off the built app: does anything scroll, and how
    tall is each part of the frame. */
const measure = () =>
  page.evaluate(() => {
    const region = document.querySelector('[data-app-scroll-region]');
    const h = (sel) =>
      Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0);
    const answers = document.querySelector('[data-setup-answers]');
    return {
      /* The screen's own overflow, which rule 14 holds at zero. */
      overflow: region ? region.scrollHeight - region.clientHeight : 0,
      /* And the frame's, which is the read that matters more: it is
         `overflow: clip`, so it draws nothing and still reports what it is
         hiding. A step that stopped fitting would clip its own foot in
         silence rather than scroll. */
      frame: (() => {
        const screen = document.querySelector('.screen-setup');
        return screen ? screen.scrollHeight - screen.clientHeight : 0;
      })(),
      viewport: window.innerHeight,
      field: h('[data-setup-field]'),
      question: h('[data-setup-question]'),
      foot: h('.setup-foot'),
      /* Rule 12: one line, two at most. 15/1.5 is 22.5px a line, so
         anything over 45 here is a paragraph on a step. */
      line: h('.setup-line'),
      pad: h('[data-pin-pad]'),
      /* The answers' own region, which is the one thing allowed to. */
      answersOverflow: answers ? answers.scrollHeight - answers.clientHeight : 0,
      answers: h('[data-setup-answers]')
    };
  });

/* The components and the rules this ticket changed, shot one at a time
   rather than as a screen. Alicja's note on ticket 07's sign-off: a review
   page is crops of the things that actually changed, not the whole app
   again. `legacy` is what the same part was called before this ticket, so a
   before set shot off a worktree of main lands the pair under one name.

   The keys are the pairs the review page puts side by side. */
const PARTS = {
  flag: [
    ['field', '[data-setup-field]', '.setup-head'],
    ['question', '[data-setup-question]', '.setup-title'],
    ['line', '.setup-line', '.setup-body'],
    ['flags', '.setup-flags', '.palette-grid'],
    ['flag-chosen', '.palette-swatch.is-active', '.palette-swatch.is-active'],
    ['foot', '.setup-foot', '.setup-foot']
  ],
  name: [['typed', '.setup-typed', '.setup-step .input']],
  areas: [
    ['caption', '.setup-caption', '.setup-areas .kit-heading'],
    ['rows', '.setup-areas [data-list-card]', '.setup-areas [data-list-card]']
  ],
  permissions: [['perm-list', '[data-permission-list]', '[data-permission-list]']],
  done: [['field-full', '[data-setup-field]', '.setup-head']]
};

const shootParts = async (step) => {
  for (const [name, fresh, legacy] of PARTS[step] ?? []) {
    const selector = legacyNames ? legacy : fresh;
    const at = page.locator(selector).first();
    if (!(await at.count())) {
      console.log(`  part missing: ${name} (${selector})`);
      continue;
    }
    await at.screenshot({ path: `${outDir}/part-${name}.png` });
    shots.push(`part-${name}`);
  }
};

const shoot = async (name) => {
  await strip();
  await page.waitForTimeout(600);
  scroll[name] = await measure();
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await click('[data-leave-setup]');
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

/** The palette and theme the shots are read in. */
const wear = async () => {
  await settle('/settings');
  await click(`[data-palette-pick="${palette}"]`);
  await click(`[data-segment="${theme}"]`);
  await page.waitForFunction(
    ([p, t]) =>
      document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

const size = async (key) => {
  await page.setViewportSize(SIZES[key]);
  await page.waitForTimeout(300);
};

/** First run, walked forward to `target`, the name typed on the way.

    Always walked at the phone's size and resized afterwards, which is both
    the honest order and the only one that works: the demo bar is 239px tall
    in the web frame, so at 390x360 the app is left about 120px to draw in
    and the foot is outside the window - a tap on Skip then lands on the
    scroll region rather than on the control. Resizing at the end is also
    what a raised keyboard actually does to a step somebody is already on,
    which is the case rule 14's short form is for. */
const stepTo = async (target, key = 'phone') => {
  await size('phone');
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  for (const step of ORDER) {
    await page.waitForTimeout(500);
    if (step === 'name') await page.locator('#ob-name').fill('Ola');
    if (step === target) break;
    await click('[data-next]');
  }
  if (key !== 'phone') await size(key);
};

await wear();

/* ---------- every step, on the phone ---------- */
for (const step of ORDER) {
  await stepTo(step);
  await shoot(`${step}-phone`);
  await shootParts(step);
}

/* ---------- the sizes rule 14 is measured at ---------- */
for (const [key, steps] of [
  ['narrow', ['flag', 'scales', 'areas', 'permissions']],
  ['keyboard', ['name', 'flag']],
  ['wide', ['flag', 'areas']]
]) {
  for (const step of steps) {
    await stepTo(step, key);
    await shoot(`${step}-${key}`);
  }
}

/* ---------- the pad, through the security module ---------- */
/* The demo journal already has an access mode, so setup's own lock step
   falls to its toggle rather than to the module; the pad's own address is
   the security screen, which is the same drawing (rule 13, ticket 30). */
const padTo = async () => {
  await settle('/settings/access-mode');
  await click('[data-list-row="pin"]');
  await page.waitForSelector('[data-access-continue]');
  await click('[data-access-continue]');
  await page.waitForSelector('[data-pin-pad]');
};
for (const key of ['phone', 'narrow']) {
  await size('phone');
  await padTo();
  if (key !== 'phone') await size(key);
  await shoot(`pad-${key}`);
}

await writeFile(`${outDir}/scroll.json`, JSON.stringify(scroll, null, 2));
await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
/* 4px of tolerance for the same reason the walkthrough gives: the field's
   height is a fraction of 175px and scrollHeight is an integer. */
for (const [name, m] of Object.entries(scroll)) {
  if (m.overflow > 4) console.log(`  SCREEN SCROLLS: ${name} by ${m.overflow}px`);
  if (m.frame > 4) console.log(`  FRAME CLIPPED: ${name} by ${m.frame}px`);
}
