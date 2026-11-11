/* An unlock's flag, checked on the real gates (tester-report-02 ticket 07).

   The gates fixture (tests/browser-tier/gates.html) mounts the real gate
   components against the app's own stylesheets and moves `bootState` the
   way boot does; this drives it across every palette in both themes, with
   disguise on and off, for each drawing a demo build can show
   (`?gateFlag=`), and holds:

   - Disguise: no unlock draws any of the flag. The field's paint has no
     image, nothing of the mark is in the tree, and no pixel of the field is
     a stripe colour the neutral field does not itself contain.
   - Without disguise every unlock draws the drawing asked for, and only an
     unlock: the gates that are not unlocks keep their painted titles.
   - The screen's accessible name is unchanged: a level-one heading named
     with the wordmark, or the decoy's name under disguise.
   - Focus order is the same with the flag as without it, and no unlock
     scrolls at 360x568.

   Run: node tests/gate-flag-check.mjs   (no build needed) */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, createReporter } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OPTIONS = ['stripes', 'mark', 'stripes-wordmark', 'sun'];
const UNLOCKS = ['unlock-pin', 'unlock-passphrase', 'unlock-biometric', 'session-pin', 'session-passphrase', 'session-biometric', 'android-key'];
const NOT_UNLOCKS = ['access-choice', 'legacy-refused', 'android-key-no-lock', 'android-key-invalidated', 'device-recovery', 'schema-too-new', 'recovery-entry'];
const { ok, fail, finish } = createReporter();
const check = (name, pass, detail) => (pass ? ok(name) : fail(name, detail));

/* The demo switch is the only way to reach the three drawings that are not
   the default, so the fixture is served with the demo flag on. */
const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 },
  define: { __DEMO__: 'true' },
  logLevel: 'error'
});
await server.listen();
const origin = `http://localhost:${server.config.server.port}`;
const browser = await launchChromium();
const prefsModule = `/@fs${resolve(here, '../src/lib/data/prefs/store.svelte.ts')}`;

async function open(option, size = { width: 360, height: 640 }) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/gates.html?gateFlag=${option}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-gates-ready]', { state: 'attached' });
  page.errors = errors;
  return page;
}
const select = async (page, label, value) => {
  await page.selectOption(`select[aria-label="${label}"]`, value);
  /* A scene mounts its gate a tick or an await later (the recovery scenes
     write a key to OPFS first). */
  if (label === 'Scene') await page.waitForSelector('[data-gate-field]', { timeout: 10000 });
  await page.waitForTimeout(60);
  await settle(page);
};
/** Disguise on or off, then wait for the gate to settle: one title left (a
    changed title is keyed, so the old one plays its way out) and no finite
    animation running. */
async function disguise(page, on) {
  await page.evaluate(async ([on, mod]) => { (await import(mod)).prefs.disguise = on; }, [on, prefsModule]);
  await settle(page);
}
const settle = (page) => page.waitForFunction(() =>
  document.querySelectorAll('[data-gate-frame] h1').length === 1 &&
  document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  null, { timeout: 5000 });

/** What the gate on screen is drawing, read off the DOM and the pixels. */
function read(page) {
  return page.evaluate(async () => {
    const frame = document.querySelector('[data-gate-frame]');
    const field = frame?.querySelector('[data-gate-field]');
    const paint = field?.querySelector('[data-field-blind]');
    const title = frame?.querySelector('h1');
    const root = getComputedStyle(document.documentElement);
    const stripes = root.getPropertyValue('--motif-stripes').split(',').map((s) => s.trim()).filter(Boolean);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgb = (c) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const box = field.getBoundingClientRect();
    /* The field's pixels, from a capture of the paint and what is on it. */
    const style = getComputedStyle(paint);
    return {
      flag: frame.dataset.gateFlag ?? null,
      paintImage: style.backgroundImage,
      paintColour: rgb(style.backgroundColor),
      mark: !!frame.querySelector('.gate-mark, .mark'),
      stripes: stripes.map(hex),
      surface2: rgb(getComputedStyle(document.body).getPropertyValue('color')),
      title: title?.textContent.trim() ?? null,
      titleHidden: !!title?.classList.contains('visually-hidden'),
      box: { x: box.x, y: Math.max(0, box.y), width: box.width, height: box.height }
    };
  });
}

/** Every colour in the field band, from a screenshot of it. */
async function fieldColours(page, box) {
  const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: Math.max(1, box.height) } });
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, img.width, img.height).data;
    const seen = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen.entries()].map(([k, n]) => [k.split(',').map(Number), n]);
  }, png.toString('base64'));
}
const near = (a, b, t = 6) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= t;

async function tabOrder(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('[data-gate-frame] :is(button, a[href], input, [tabindex]:not([tabindex="-1"]))')];
    return all.filter((el) => !el.disabled && el.getClientRects().length).map((el) => el.dataset.key ?? el.textContent.trim().slice(0, 24) ?? el.tagName);
  });
}

try {
  for (const option of OPTIONS) {
    const page = await open(option);
    for (const palette of PALETTES) {
      await select(page, 'Palette', palette);
      for (const theme of ['light', 'dark']) {
        await select(page, 'Theme', theme);
        /* Every unlock on the default flag; two of them, one at a cold start
           and one mid-session, on the other fifteen. */
        for (const scene of palette === 'trans' ? UNLOCKS : ['unlock-pin', 'session-passphrase']) {
          await select(page, 'Scene', scene);
          const at = `${option} ${palette}/${theme} ${scene}`;
          await disguise(page, true);
          const hidden = await read(page);
          const leaked = [];
          if (hidden.flag) leaked.push(`data-gate-flag=${hidden.flag}`);
          if (hidden.paintImage !== 'none') leaked.push(`paint ${hidden.paintImage.slice(0, 60)}`);
          if (hidden.mark) leaked.push('the mark is in the tree');
          /* A stripe colour is a leak unless the neutral field's own colour
             or the title's ink is that colour too. */
          const own = [hidden.paintColour];
          const colours = await fieldColours(page, hidden.box);
          const inks = colours.filter(([c, n]) => n > 40 && !near(c, hidden.paintColour, 24)).map(([c]) => c);
          for (const stripe of hidden.stripes) {
            if (own.some((c) => near(c, stripe)) || inks.some((c) => near(c, stripe))) continue;
            /* Half a percent of the field: a stripe band is a fifth of it and
               the smallest ring of the mark several hundred pixels, while the
               title's antialiasing can pass through a grey stripe's value on
               a pixel or two. */
            const total = colours.reduce((sum, [, n]) => sum + n, 0);
            const painted = colours.filter(([c]) => near(c, stripe, 4)).reduce((sum, [, n]) => sum + n, 0);
            if (painted >= total * 0.005) leaked.push(`stripe rgb(${stripe}) painted on ${painted} of ${total}px`);
          }
          check(`${at}: disguise draws none of the flag`, leaked.length === 0, leaked.join('; '));
          check(`${at}: disguise keeps the decoy's name painted`, !!hidden.title && hidden.title !== 'engender' && !hidden.titleHidden, JSON.stringify(hidden.title));

          await disguise(page, false);
          const shown = await read(page);
          check(`${at}: an unlock draws the flag`, shown.flag === option && shown.paintImage !== 'none' || (option === 'mark' && shown.flag === 'mark' && shown.mark), `flag=${shown.flag} image=${shown.paintImage.slice(0, 40)}`);
          const heading = await page.getByRole('heading', { level: 1, name: 'engender', exact: true }).count();
          check(`${at}: the accessible name is still the wordmark`, heading === 1 && shown.title === 'engender', `headings=${heading} title=${shown.title}`);
        }
        if (palette !== 'trans') continue;
        for (const scene of NOT_UNLOCKS) {
          await select(page, 'Scene', scene);
          const r = await read(page);
          check(`${option} trans/${theme} ${scene}: not an unlock, keeps its title`, !r.flag && r.paintImage === 'none' && !r.titleHidden && !!r.title && r.title !== 'engender', JSON.stringify({ flag: r.flag, title: r.title, hidden: r.titleHidden }));
        }
      }
    }
    /* Focus order with the flag against the same gate without it. */
    await select(page, 'Palette', 'trans');
    for (const scene of ['unlock-pin', 'unlock-passphrase', 'session-pin']) {
      await select(page, 'Scene', scene);
      await disguise(page, true);
      const without = await tabOrder(page);
      await disguise(page, false);
      const withFlag = await tabOrder(page);
      check(`${option} ${scene}: focus order unchanged`, JSON.stringify(without) === JSON.stringify(withFlag), `${without} vs ${withFlag}`);
    }
    check(`${option}: no page errors`, page.errors.length === 0, page.errors.join('; '));
    await page.close();

    const short = await open(option, { width: 360, height: 568 });
    for (const scene of UNLOCKS) {
      await select(short, 'Scene', scene);
      const overflow = await short.evaluate(() => {
        const frame = document.querySelector('.screen-gate');
        const pageEl = document.querySelector('.gate-page');
        return { frame: frame.scrollHeight - frame.clientHeight, page: pageEl.scrollHeight - pageEl.clientHeight };
      });
      check(`${option} ${scene} 360x568: nothing scrolls`, overflow.frame <= 1 && overflow.page <= 1, JSON.stringify(overflow));
    }
    await short.close();
  }
} finally {
  await browser.close();
  await server.close();
}
finish('gate-flag-check: every check passed');
