/* Nothing on the field paints past the field (ticket 285).

   "Text on the field sometimes paints outside the coloured field, over the
   page background behind it" - and the field is one object that only moves
   up or down, with whatever is printed on it moving as it does. This probe
   drives every change that moves a field and reads, on every animation
   frame, where the field's painted edge is and where every text, control and
   ring on it is. It fails when any of them is below the edge, and when one
   teleports relative to the edge or appears or vanishes in a single frame.

   Scenes: the four doors both ways from the top, the middle and the bottom
   of the screen, there-and-back and interrupted by a second navigation, the
   deep push and back, the gear into a screen with no field and back out,
   Polish, reduced motion, a window resize, the setup steps forward and back
   and setup's handover to Today, and the door field's height at rest on a
   cold load. Widths 390 and 1440.

   Two instruments (field-text-core.mjs says why): a per-frame geometry
   sampler, and the pixels of the screencast with the field forced pure blue
   and its ink pure green, which is the authority on what was painted.

   Run: node tests/field-text-probe.mjs [--widths 390,1440] [--only text]
        [--runs 3] [--json file] [--frames dir] [--report]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves build/.
   Exits 1 on any finding unless --report is given, which prints the same
   table for a before/after record. */
import { createServer, preview } from 'vite';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { SETUP_STEPS } from './setup-flow.mjs';
import { JUMP_FIRST_RUN_EXPRESSION } from './yank-sweep-core.mjs';
import {
  PROBE_CSS,
  findGeometry,
  findHeightJumps,
  readInk,
  samplerExpression,
  summarise
} from './field-text-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(here, '..'));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const WIDTHS = opt('widths', '390,1440').split(',').map(Number);
const ONLY_LIST = opt('only', '').split(',').filter(Boolean);
const ONLY = ONLY_LIST.length === 1 ? ONLY_LIST[0] : '';
const wanted = (name) => !ONLY_LIST.length || ONLY_LIST.some((o) => name.includes(o));
const ALL_ROUTES = argv.includes('--all-routes');
const RUNS = Number(opt('runs', '1'));
const JSON_OUT = opt('json', '');
const FRAMES = opt('frames', '');
const REPORT = argv.includes('--report');
/* Real colours instead of the forced blue and green, for a flipbook a person
   reads; the pixel instrument has nothing to read there and is skipped. */
const NATURAL = argv.includes('--natural');
const KEEP_ALL = argv.includes('--keep-all');
const THEME = opt('theme', '');

const HEIGHT = { 390: 844, 1440: 900 };
/** Every screen with a ScreenHeader that has an address of its own; the
    doors first. A field whose height moves at rest does it on one of these
    - a title that wraps in Polish, a slot that fills when a query answers. */
const COLD_ROUTES = (ALL_ROUTES ? (x) => x : (x) => x.slice(0, 4))([
  ['home', '/'],
  ['calendar', '/calendar'],
  ['stats', '/stats'],
  ['settings', '/more'],
  ...[
    '/body/hair-progress', '/body/hair-removal', '/body-map', '/body/measurements', '/body/wear',
    '/care', '/care/changes', '/care/curve', '/care/doses', '/care/labs', '/care/regimen',
    '/coming-back', '/compare', '/doubt', '/doubt/comfort', '/doubt/evidence',
    '/health/appointments', '/health/appointments/in-the-room', '/health/clinician-summary',
    '/health/cycle-events', '/health/dilation', '/health/surgery', '/media/documents',
    '/media/photos', '/media/photos/export', '/on-this-day', '/search', '/settings',
    '/settings/access-mode', '/settings/affirmations', '/settings/body-regions',
    '/settings/dimension', '/settings/eras', '/settings/export', '/settings/journal-book',
    '/settings/journaling-pause', '/settings/notifications', '/settings/passphrase',
    '/settings/permissions', '/settings/recovery-key', '/settings/reminders', '/settings/security',
    '/settings/tags', '/settings/trash', '/settings/words', '/support/resources', '/tally',
    '/transition/letters', '/transition/milestones', '/transition/roadmap', '/transition/tryouts',
    '/voice'
  ].map((route) => [route.slice(1).replaceAll('/', '-'), route])
]);
const ROUTE = { home: '/', calendar: '/calendar', stats: '/stats', settings: '/more' };
const TABS = Object.keys(ROUTE);
const tab = (key) => `[data-nav-item="${key}"]`;
/** The door change is 380ms, the sun opens over 900ms. */
const MS = 1100;

/* ---------- the scenes ---------- */

const scenes = [];
const add = (scene) => scenes.push({ ms: MS, scroll: 'top', ...scene });

for (const A of TABS) {
  for (const B of TABS) {
    if (A === B) continue;
    for (const scroll of ['top', 'mid', 'bottom']) {
      add({ name: `door ${A}>${B} ${scroll}`, at: ROUTE[A], scroll, steps: [{ at: 0, click: tab(B) }] });
    }
    add({
      name: `door ${A}>${B}>${A} reversed at 140ms`,
      at: ROUTE[A],
      steps: [{ at: 0, click: tab(B) }, { at: 140, click: tab(A) }]
    });
    for (const C of TABS) {
      if (C === A || C === B) continue;
      add({
        name: `door ${A}>${B}>${C} interrupted at 140ms`,
        at: ROUTE[A],
        steps: [{ at: 0, click: tab(B) }, { at: 140, click: tab(C) }]
      });
    }
  }
}
/* There and back at rest, both legs in one recording, from a scrolled origin
   so the return lands on a restored scroll position. */
for (const [A, B] of [['calendar', 'home'], ['settings', 'stats'], ['home', 'settings']]) {
  for (const scroll of ['top', 'bottom']) {
    add({
      name: `door ${A}>${B}>${A} there and back ${scroll}`,
      at: ROUTE[A],
      scroll,
      ms: 2000,
      steps: [{ at: 0, click: tab(B) }, { at: 900, click: tab(A) }]
    });
  }
}
for (const scroll of ['top', 'bottom']) {
  add({ name: `deep settings>measurements ${scroll}`, at: '/more', scroll, steps: [{ at: 0, click: 'a[href="/body/measurements"]' }] });
  add({
    name: `deep measurements back ${scroll}`,
    at: '/more',
    scroll,
    enter: 'a[href="/body/measurements"]',
    steps: [{ at: 0, back: true }]
  });
  add({ name: `gear home>settings ${scroll}`, at: '/', scroll, steps: [{ at: 0, click: '[data-home-gear]' }] });
  add({ name: `gear settings>home ${scroll}`, at: '/', enter: '[data-home-gear]', scroll, steps: [{ at: 0, back: true }] });
}
for (const [A, B] of [['home', 'calendar'], ['calendar', 'stats'], ['stats', 'settings'], ['settings', 'home']]) {
  add({ name: `polish door ${A}>${B} top`, at: ROUTE[A], locale: 'pl', steps: [{ at: 0, click: tab(B) }] });
  add({ name: `reduced door ${A}>${B} top`, at: ROUTE[A], reduced: true, steps: [{ at: 0, click: tab(B) }] });
  add({ name: `reduced door ${A}>${B} bottom`, at: ROUTE[A], reduced: true, scroll: 'bottom', steps: [{ at: 0, click: tab(B) }] });
}
/* The rest of the matrix the ticket names (review round): Polish scrolled,
   reversed and interrupted; reduced motion reversed, interrupted and there
   and back; there and back from the middle of the screen; one in-tab step;
   and a door field whose height really changes at rest. */
const PAIRS = [['home', 'calendar'], ['calendar', 'stats'], ['stats', 'settings'], ['settings', 'home']];
for (const [A, B] of PAIRS) {
  const C = TABS.find((k) => k !== A && k !== B && k !== 'home') ?? 'stats';
  for (const scroll of ['mid', 'bottom']) {
    add({ name: `polish door ${A}>${B} ${scroll}`, at: ROUTE[A], locale: 'pl', scroll, steps: [{ at: 0, click: tab(B) }] });
  }
  add({ name: `polish door ${A}>${B}>${A} reversed at 140ms`, at: ROUTE[A], locale: 'pl', steps: [{ at: 0, click: tab(B) }, { at: 140, click: tab(A) }] });
  add({ name: `polish door ${A}>${B}>${C} interrupted at 140ms`, at: ROUTE[A], locale: 'pl', steps: [{ at: 0, click: tab(B) }, { at: 140, click: tab(C) }] });
  add({ name: `reduced door ${A}>${B}>${A} reversed at 140ms`, at: ROUTE[A], reduced: true, steps: [{ at: 0, click: tab(B) }, { at: 140, click: tab(A) }] });
  add({ name: `reduced door ${A}>${B}>${C} interrupted at 140ms`, at: ROUTE[A], reduced: true, steps: [{ at: 0, click: tab(B) }, { at: 140, click: tab(C) }] });
  add({ name: `reduced door ${A}>${B}>${A} there and back bottom`, at: ROUTE[A], reduced: true, scroll: 'bottom', ms: 2000, steps: [{ at: 0, click: tab(B) }, { at: 900, click: tab(A) }] });
  add({ name: `door ${A}>${B}>${A} there and back mid`, at: ROUTE[A], scroll: 'mid', ms: 2000, steps: [{ at: 0, click: tab(B) }, { at: 900, click: tab(A) }] });
}
/* An in-tab step: the Journal's month, which changes what the field holds. */
add({ name: 'in-tab step calendar month prev', at: '/calendar', steps: [{ at: 0, click: '[data-cal-step="prev"]' }], ms: 900 });
add({ name: 'in-tab step calendar month prev twice', at: '/calendar', steps: [{ at: 0, click: '[data-cal-step="prev"]' }, { at: 120, click: '[data-cal-step="prev"]' }], ms: 900 });
/* A door field whose height really changes at rest: the title takes a long
   text and wraps to more lines, and back. `still` scenes read the field's own
   box, so a jump is a frame where the layout moved and nothing eased it. */
for (const [key, route, sel] of [['stats', '/stats', '[data-screen-title]'], ['transition', '/settings/eras', '[data-screen-title]']]) {
  const long = 'A title that is much too long to sit on one line of a phone and so wraps onto several';
  add({ name: `rewrap ${key} title grows`, at: route, still: true, ms: 900, steps: [{ at: 0, set: { sel, text: long } }] });
}
for (const A of ['calendar', 'stats', 'settings', 'home']) {
  add({ name: `resize ${A} 390>320`, at: ROUTE[A], resize: { at: 200, width: 320 }, ms: 900, steps: [] });
}

/* ---------- the browser ---------- */

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const contexts = new Map();

async function pageFor(width, { reduced = false, fresh = false, tag = '', height = 0 } = {}) {
  const key = `${width}:${reduced}:${tag}:${height}`;
  if (contexts.has(key) && !fresh) return contexts.get(key);
  if (contexts.has(key)) await contexts.get(key).context.close();
  const context = await browser.newContext({
    viewport: { width, height: height || (HEIGHT[width] ?? 900) },
    deviceScaleFactor: 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference'
  });
  await context.addInitScript(
    ({ css, natural }) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = natural ? '.demo-bar { display: none !important; } [data-toast] { display: none !important; }' : css;
        document.head.append(style);
      });
    },
    { css: PROBE_CSS, natural: NATURAL }
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const cdp = await context.newCDPSession(page);
  const held = { context, page, cdp };
  contexts.set(key, held);
  /* The default palette in the theme asked for, through the real controls:
     a goto resets a hand-set data-theme, the stored preference survives it. */
  if (THEME && !fresh) {
    await boot(page, '/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${THEME}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, THEME);
  }
  return held;
}

async function boot(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function rest(page, scene) {
  if (scene.locale) {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((l) => localStorage.setItem('PARAGLIDE_LOCALE', l), scene.locale);
  }
  await boot(page, scene.at);
  if (scene.enter) {
    await page.waitForTimeout(400);
    await page.locator(scene.enter).first().click();
    await page.waitForTimeout(700);
  }
  const room = await page.evaluate((where) => {
    const region = document.querySelector('[data-app-scroll-region]');
    if (!region) return 0;
    const max = region.scrollHeight - region.clientHeight;
    region.scrollTop = where === 'bottom' ? max : where === 'mid' ? max / 2 : 0;
    return Math.round(max);
  }, scene.scroll);
  await page.waitForTimeout(600);
  return room;
}

/** Records the page for the scene's length and reads both instruments. */
async function measure(held, scene) {
  const { page, cdp } = held;
  const cast = [];
  const onFrame = async ({ data, sessionId, metadata }) => {
    cast.push({ data, ts: metadata.timestamp * 1000 });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* stopped between the frame and its ack, the ordinary end of a scene */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await page.waitForTimeout(80);
  const sampled = page.evaluate(samplerExpression(scene.steps ?? [], scene.ms));
  if (scene.resize) {
    await page.waitForTimeout(scene.resize.at);
    await page.setViewportSize({ width: scene.resize.width, height: HEIGHT[390] });
  }
  const { epoch, rows } = await sampled;
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  return { epoch, rows, cast };
}

function analyse({ epoch, rows, cast }, { step = false, still = false, cuts = false } = {}) {
  const series = step
    ? rows.filter((r) => r.step).map((r) => ({ t: r.t, edge: r.step.edge, parts: r.step.parts }))
    : rows.filter((r) => r.edge !== undefined).map((r) => ({ ...r }));
  const geometry = findGeometry(series, { persist: step ? 2 : 1 });
  /* Reduced motion substitutes a cut for a movement (ADR-0078): the edge and
     the words arrive in one frame by design, so a jump or a change of opacity
     in one frame is the substitute, not a yank. What it may never do is paint
     outside the field, which the overspill and the pixels still judge. */
  if (cuts) {
    /* And a step field's held frame paints the old edge for one frame while
       its words are already at their new size, which the clip cuts: the
       pixels judge that. */
    if (step) {
      geometry.clipped = geometry.overspill;
      geometry.overspill = [];
    }
    geometry.cut = { teleports: geometry.teleports, pops: geometry.pops };
    geometry.teleports = [];
    geometry.pops = [];
  }
  const ink = NATURAL
    ? { frames: 0, bad: 0, worst: { deepest: 0, at: 0 }, first: null }
    : readInk(cast, epoch, { top: 0, bottom: 520 });
  const jumps = findHeightJumps(rows.filter((r) => r.field && r.edge === undefined && !r.nav).map((r) => ({ t: r.t, height: r.field.height })));
  /* A navigation swaps the screen under the transition, so the real field's
     height changes when the outgoing one is removed: only a scene with no
     navigation in it reads the field's own height. */
  return { geometry, ink, jumps: still ? jumps : [], series: series.length };
}

const failed = (r) =>
  r.geometry.overspill.length > 0 ||
  r.geometry.teleports.length > 0 ||
  r.geometry.pops.length > 0 ||
  r.ink.bad > 0;

const results = [];
async function keep(name, width, run, m) {
  if (!FRAMES) return;
  const dir = resolve(FRAMES, `${width}-${name.replace(/[^a-z0-9]+/gi, '-')}-${run}`);
  await mkdir(dir, { recursive: true });
  const frames = [];
  for (const [i, shot] of m.cast.entries()) {
    const file = `${String(i).padStart(3, '0')}.png`;
    await writeFile(resolve(dir, file), Buffer.from(shot.data, 'base64'));
    frames.push({ file, at: Math.round(shot.ts - m.epoch) });
  }
  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify({ name, width, run, frames, rows: m.rows }, null, 2));
}

function log(width, name, run, r, extra = '') {
  const bits = summarise(r);
  const verdict = failed(r) || r.jumps.length ? 'FAIL' : 'ok  ';
  console.log(`${verdict} ${width} ${name}${RUNS > 1 ? ` #${run + 1}` : ''}${extra} ${bits.length ? '- ' + bits.join('; ') : ''}`);
}

try {
  for (const width of WIDTHS) {
    for (const scene of scenes) {
      if (!wanted(scene.name)) continue;
      const held = await pageFor(width, { reduced: !!scene.reduced });
      for (let run = 0; run < RUNS; run++) {
        const room = await rest(held.page, scene);
        if (scene.scroll !== 'top' && room < 120) {
          console.log(`skip ${width} ${scene.name} - only ${room}px of scroll`);
          break;
        }
        const m = await measure(held, scene);
        const r = analyse(m, { still: !!scene.resize || !!scene.still, cuts: !!scene.reduced });
        if (scene.resize) await held.page.setViewportSize({ width, height: HEIGHT[width] ?? 900 });
        results.push({ width, name: scene.name, run, ...r, cast: undefined });
        log(width, scene.name, run, r, room && scene.scroll !== 'top' ? ` [scroll ${room}px]` : '');
        if (failed(r) || r.jumps.length) await keep(scene.name, width, run, m);
        else if (FRAMES && argv.includes('--keep-all')) await keep(scene.name, width, run, m);
      }
    }

    /* ---- setup: every step forward, two back, and the handover ---- */
    if (!ONLY_LIST.length || ONLY_LIST.some((o) => 'setup'.startsWith(o) || o.startsWith('setup'))) {
      /* English, Polish, reduced motion, and a short window - what a raised
         keyboard leaves, where the form drops to its short form. */
      for (const mode of [
        { label: 'en', lang: 'en' },
        { label: 'pl', lang: 'pl' },
        { label: 'en reduced', lang: 'en', reduced: true },
        { label: 'en short', lang: 'en', height: 568 }
      ]) {
        const locale = mode.label;
        const held = await pageFor(width, { fresh: true, tag: `setup-${locale}`, reduced: !!mode.reduced, height: mode.height ?? 0 });
        const { page } = held;
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((l) => localStorage.setItem('PARAGLIDE_LOCALE', l), mode.lang);
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-app-root][data-boot="ready"]');
        /* A fresh profile boots into the demo persona; the demo bar's own
           jump is the way into the first run. */
        await page.evaluate(JUMP_FIRST_RUN_EXPRESSION);
        await page.waitForSelector('[data-next]', { timeout: 90000 });
        const wait = (ms) => page.waitForTimeout(ms);
        const sequence = [];
        for (const step of SETUP_STEPS) {
          if (step === 'done') break;
          sequence.push({ step, click: '[data-next]', label: `${step} next` });
        }
        sequence.push({ step: 'done', click: '[data-back]', label: 'done back' });
        sequence.push({ step: 'permissions', click: '[data-back]', label: 'permissions back' });
        for (const item of sequence) {
          await wait(900);
          if (item.step === 'name') {
            await page.evaluate(() => {
              const name = document.querySelector('#ob-name');
              Object.getOwnPropertyDescriptor(Object.getPrototypeOf(name), 'value').set.call(name, 'Ola');
              name.dispatchEvent(new Event('input', { bubbles: true }));
            });
          }
          if (item.step === 'lock' && !(await page.locator('[data-next]').count()) && (await page.locator('[data-access-modes]').count())) {
            await page.locator('[data-list-row="unlocked"]').click();
            await page.waitForSelector('[data-access-submit]');
            await page.locator('[data-access-submit]').click();
            await page.waitForSelector('[data-next]');
            await wait(700);
          }
          if (!(await page.locator(item.click).count())) {
            console.log(`skip ${width} setup ${locale} ${item.label} - no ${item.click}`);
            continue;
          }
          const scene = { name: `setup ${locale} ${item.label}`, ms: 900, steps: [{ at: 0, click: item.click }] };
          if (ONLY && !scene.name.includes(ONLY) && ONLY !== 'setup') {
            await page.locator(item.click).click();
            continue;
          }
          const m = await measure(held, scene);
          const r = analyse(m, { step: true, cuts: /reduced/.test(scene.name || name || '') });
          results.push({ width, name: scene.name, run: 0, ...r, cast: undefined });
          log(width, scene.name, 0, r);
          if (failed(r) || (KEEP_ALL && FRAMES)) await keep(scene.name, width, 0, m);
        }
        /* Interrupted: a second gesture lands while the first is in flight,
           forward twice, back twice, and back then forward. */
        for (const [label, steps] of [
          ['back and back again at 120ms', [{ at: 0, click: '[data-back]' }, { at: 120, click: '[data-back]' }]],
          ['next and back at 120ms', [{ at: 0, click: '[data-next]' }, { at: 120, click: '[data-back]' }]],
          ['next and next again at 120ms', [{ at: 0, click: '[data-next]' }, { at: 120, click: '[data-next]' }]]
        ]) {
          await wait(1100);
          const scene = { name: `setup ${locale} ${label}`, ms: 1000, steps };
          if (ONLY && !scene.name.includes(ONLY) && ONLY !== 'setup') continue;
          const m = await measure(held, scene);
          const r = analyse(m, { step: true, cuts: /reduced/.test(scene.name || name || '') });
          results.push({ width, name: scene.name, run: 0, ...r, cast: undefined });
          log(width, scene.name, 0, r);
          if (failed(r) || (KEEP_ALL && FRAMES)) await keep(scene.name, width, 0, m);
        }
        /* The handover: walk to the end and let setup open the app. */
        await wait(900);
        if (await page.locator('[data-next]').count()) {
          for (let i = 0; i < 12 && !(await page.locator('[data-finish]').count()); i++) {
            await page.locator('[data-next]').click();
            await wait(700);
          }
        }
        if (await page.locator('[data-finish]').count()) {
          const scene = { name: `setup ${locale} finish to today`, ms: MS, steps: [{ at: 0, click: '[data-finish]' }] };
          const m = await measure(held, scene);
          const r = analyse(m);
          results.push({ width, name: scene.name, run: 0, ...r, cast: undefined });
          log(width, scene.name, 0, r);
          if (failed(r) || (KEEP_ALL && FRAMES)) await keep(scene.name, width, 0, m);
        } else console.log(`skip ${width} setup ${locale} finish - no [data-finish]`);
      }
    }

    /* ---- a gate changing its own title, on the fixture page ---- */
    if (!ONLY_LIST.length || ONLY_LIST.some((o) => o.startsWith('gate'))) {
      const fixture = await createServer({
        configFile: 'tests/browser-tier/browser-tier.vite.config.ts',
        server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
      });
      await fixture.listen();
      try {
        for (const mode of [
          { label: 'gate', reduced: false, height: 0 },
          { label: 'gate reduced', reduced: true, height: 0 },
          { label: 'gate short', reduced: false, height: 568 }
        ]) {
          const held = await pageFor(width, { fresh: true, tag: mode.label, reduced: mode.reduced, height: mode.height });
          const { page } = held;
          const open = async () => {
            await page.goto(`http://localhost:${fixture.config.server.port}/gates.html`, { waitUntil: 'networkidle' });
            await page.waitForSelector('body[data-gates-ready]', { state: 'attached' });
            await page.selectOption('select[aria-label="Scene"]', 'access-choice');
            await page.waitForSelector('[data-gate-field]');
          };
          await open();
          const record = async (name, steps) => {
            const scene = { name, ms: 900, steps };
            const m = await measure(held, scene);
            const r = analyse(m, { step: true, cuts: /reduced/.test(scene.name || name || '') });
            results.push({ width, name, run: 0, ...r, cast: undefined });
            log(width, name, 0, r);
            if (failed(r) || (KEEP_ALL && FRAMES)) await keep(name, width, 0, m);
          };
          for (const gesture of [
            { label: 'choose a mode', click: '[data-list-row="pin"]' },
            { label: 'continue to the pad', click: '[data-access-continue]' },
            { label: 'back to the list', click: '[data-gate-back], [data-access-back]' }
          ]) {
            await page.waitForTimeout(900);
            if (!(await page.locator(gesture.click).count())) {
              console.log(`skip ${width} ${mode.label} ${gesture.label} - no ${gesture.click}`);
              continue;
            }
            await record(`${mode.label} ${gesture.label}`, [{ at: 0, click: gesture.click.split(', ')[0] }]);
          }
          /* Interrupted: the second tap lands while the first is in flight. */
          await open();
          await page.waitForTimeout(900);
          await record(`${mode.label} choose a mode and continue at 120ms`, [
            { at: 0, click: '[data-list-row="pin"]' },
            { at: 120, click: '[data-access-continue]' }
          ]);
        }
      } finally {
        await fixture.close();
      }
    }

    /* ---- the door field's height at rest, from the first frame of a cold load ---- */
    if (!ONLY_LIST.length || ONLY_LIST.some((o) => o.startsWith('cold'))) {
      for (const locale of ['en', 'pl']) {
        for (const [A, route] of COLD_ROUTES) {
          const held = await pageFor(width, { fresh: true, tag: `cold-${locale}` });
          const { page } = held;
          await page.addInitScript(() => {
            window.__field = [];
            const t0 = performance.now();
            const tick = () => {
              const f = document.querySelector('[data-screen-field], [data-home-field]');
              if (f) window.__field.push({ t: Math.round(performance.now() - t0), height: Math.round(f.getBoundingClientRect().height * 10) / 10 });
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
          await page.evaluate((l) => localStorage.setItem('PARAGLIDE_LOCALE', l), locale);
          await boot(page, route);
          await page.evaluate(() => (window.__field = []));
          await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3200);
          const series = await page.evaluate(() => window.__field);
          const jumps = findHeightJumps(series);
          const r = { geometry: { overspill: [], teleports: [], pops: [] }, ink: { bad: 0, frames: 0, worst: { deepest: 0, at: 0 } }, jumps };
          const name = `cold ${locale} ${A} field height`;
          results.push({ width, name, run: 0, ...r });
          log(width, name, 0, r, ` [${series.length} samples, ${series.at(0)?.height}px to ${series.at(-1)?.height}px]`);
        }
      }
    }
  }
} finally {
  const bad = results.filter((r) => failed(r) || r.jumps?.length);
  console.log(`\n${results.length} runs, ${bad.length} with findings`);
  if (JSON_OUT) await writeFile(resolve(JSON_OUT), JSON.stringify(results, null, 2));
  await browser.close();
  await app.close();
  if (bad.length && !REPORT) process.exitCode = 1;
}
