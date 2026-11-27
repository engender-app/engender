/* Drive the real gate fixture across palettes, themes and disguise.
   Disguised unlocks use a neutral title field without sun or stripe
   pixels. Other unlocks show a still, unclipped sun. Non-unlock gates
   keep painted titles. Check the named h1, focus order and no scroll
   at 360x568.

   node tests/gate-flag-check.mjs
   Uses the dev server. */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, createReporter } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const UNLOCKS = ['unlock-pin', 'unlock-passphrase', 'unlock-biometric', 'session-pin', 'session-passphrase', 'session-biometric', 'android-key'];
const NOT_UNLOCKS = ['access-choice', 'legacy-refused', 'android-key-no-lock', 'android-key-invalidated', 'device-recovery', 'schema-too-new', 'recovery-entry'];
const { ok, fail, finish } = createReporter();
const check = (name, pass, detail) => (pass ? ok(name) : fail(name, detail));

/* The fixture's own build flag, so it renders as the app's demo would. */
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

async function open(size = { width: 390, height: 844 }) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}/gates.html`, { waitUntil: 'networkidle' });
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
    const rings = [...(frame.querySelectorAll('[data-flag-sun] > i') ?? [])];
    const ask = field.querySelector('.step-field-ask');
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const rgb = (c) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const box = field.getBoundingClientRect();
    /* The field's pixels, from a capture of the paint and what is on it. */
    const style = getComputedStyle(paint);
    return {
      sun: frame.hasAttribute('data-gate-sun'),
      rings: rings.length,
      ringsInPaint: rings.every((r) => !!r.closest('[data-field-blind]')),
      ringsMoving: rings.filter((r) => r.getAnimations().length > 0).length,
      askHeight: Math.round(ask.getBoundingClientRect().height),
      /* How far under the outer ring's lowest point the field's edge is: the
         ring's box is the whole circle, centred on the corner, and the edge
         is where the paint is clipped. Negative means the edge cuts it. */
      sunAir: rings.length
        ? Math.round(box.top + parseFloat(getComputedStyle(field.closest('.gate')).getPropertyValue('--blind-edge')) - rings[0].getBoundingClientRect().bottom)
        : null,
      paintColour: rgb(style.backgroundColor),
      mark: !!frame.querySelector('.mark'),
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
  const page = await open();
  for (const palette of PALETTES) {
    await select(page, 'Palette', palette);
    for (const theme of ['light', 'dark']) {
      await select(page, 'Theme', theme);
      /* Every unlock on the default flag; two of them, one at a cold start
         and one mid-session, on the other fifteen. */
      for (const scene of palette === 'trans' ? UNLOCKS : ['unlock-pin', 'session-passphrase']) {
        await select(page, 'Scene', scene);
        const at = `${palette}/${theme} ${scene}`;
        await disguise(page, true);
        const hidden = await read(page);
        const leaked = [];
        if (hidden.sun) leaked.push('data-gate-sun is set');
        if (hidden.rings) leaked.push(`${hidden.rings} sun rings in the tree`);
        if (hidden.mark) leaked.push('the mark is in the tree');
        if (hidden.askHeight !== 46) leaked.push(`the title's line is ${hidden.askHeight}px, not the base's 46`);
        /* A stripe colour is a leak unless the neutral field's own colour
           or the title's ink is that colour too. */
        const own = [hidden.paintColour];
        const colours = await fieldColours(page, hidden.box);
        const inks = colours.filter(([c, n]) => n > 40 && !near(c, hidden.paintColour, 24)).map(([c]) => c);
        for (const stripe of hidden.stripes) {
          if (own.some((c) => near(c, stripe)) || inks.some((c) => near(c, stripe))) continue;
          /* Half a percent of the field: the sun's smallest band is several
             hundred pixels, while the title's antialiasing can pass through a
             grey stripe's value on a pixel or two. */
          const total = colours.reduce((sum, [, n]) => sum + n, 0);
          const painted = colours.filter(([c]) => near(c, stripe, 4)).reduce((sum, [, n]) => sum + n, 0);
          if (painted >= total * 0.005) leaked.push(`stripe rgb(${stripe}) painted on ${painted} of ${total}px`);
        }
        check(`${at}: disguise draws none of the flag, at the base's height`, leaked.length === 0, leaked.join('; '));
        check(`${at}: disguise keeps the decoy's name painted`, !!hidden.title && hidden.title !== 'engender' && !hidden.titleHidden, JSON.stringify(hidden.title));

        await disguise(page, false);
        const shown = await read(page);
        const expected = palette === 'polish' ? 1 : shown.stripes.length;
        check(`${at}: an unlock draws Today's sun, still, in its blind`,
          shown.sun && shown.rings === expected && shown.ringsInPaint && shown.ringsMoving === 0,
          JSON.stringify({ sun: shown.sun, rings: shown.rings, expected, inPaint: shown.ringsInPaint, moving: shown.ringsMoving }));
        check(`${at}: the field's edge cuts no ring (8px of field or more under the sun)`, shown.sunAir >= 8, `air ${shown.sunAir}px`);
        const heading = await page.getByRole('heading', { level: 1, name: 'engender', exact: true }).count();
        check(`${at}: the accessible name is still the wordmark`, heading === 1 && shown.title === 'engender', `headings=${heading} title=${shown.title}`);
      }
      if (palette !== 'trans') continue;
      for (const scene of NOT_UNLOCKS) {
        await select(page, 'Scene', scene);
        const r = await read(page);
        check(`trans/${theme} ${scene}: not an unlock, keeps its title and draws no sun`, !r.sun && !r.rings && !r.titleHidden && !!r.title && r.title !== 'engender', JSON.stringify({ sun: r.sun, title: r.title, hidden: r.titleHidden, ask: r.askHeight }));
      }
    }
  }
  /* A gate arrives as a cut, so the sun's taller edge is where it rests from
     the first painted frame rather than growing there from the title's
     height. Read on the first animation frame after the gate mounts. */
  await select(page, 'Palette', 'trans');
  for (const scene of ['unlock-pin', 'session-pin', 'unlock-passphrase']) {
    await select(page, 'Scene', 'access-choice');
    await page.selectOption('select[aria-label="Scene"]', scene);
    const first = await page.evaluate(() => new Promise((done) => {
      const look = () => {
        const gate = document.querySelector('[data-gate-sun] .gate');
        if (!gate) return requestAnimationFrame(look);
        requestAnimationFrame(() => done(parseFloat(getComputedStyle(gate).getPropertyValue('--blind-edge'))));
      };
      look();
    }));
    await settle(page);
    const rest = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-gate-sun] .gate')).getPropertyValue('--blind-edge')));
    check(`${scene}: the sun's field arrives at its height, with no growth`, Math.abs(first - rest) <= 1, `first frame ${first}px, at rest ${rest}px`);
  }

  /* Focus order with the sun against the same gate without it. */
  await select(page, 'Palette', 'trans');
  for (const scene of ['unlock-pin', 'unlock-passphrase', 'session-pin']) {
    await select(page, 'Scene', scene);
    await disguise(page, true);
    const without = await tabOrder(page);
    await disguise(page, false);
    const withSun = await tabOrder(page);
    check(`${scene}: focus order unchanged`, JSON.stringify(without) === JSON.stringify(withSun), `${without} vs ${withSun}`);
  }
  check('no page errors', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  /* Desktop: Today's banner, the whole sun inside it. */
  {
    const wide = await open({ width: 1280, height: 800 });
    for (const scene of ['unlock-pin', 'session-pin']) {
      await select(wide, 'Scene', scene);
      const r = await read(wide);
      check(`${scene} 1280x800: the field's edge cuts no ring`, r.sunAir >= 8, `air ${r.sunAir}px`);
    }
    await wide.close();
  }

  /* The windows rule 14 names where the whole sun does not fit over the PIN
     pad, the tallest gate: the field gives the pad what it needs rather than
     scrolling, and stays taller than the title's line it replaced. */
  for (const [width, height] of [[360, 640], [360, 568], [320, 568]]) {
    const short = await open({ width, height });
    for (const scene of UNLOCKS) {
      await select(short, 'Scene', scene);
      const overflow = await short.evaluate(() => {
        const frame = document.querySelector('.screen-gate');
        const pageEl = document.querySelector('.gate-page');
        return { frame: frame.scrollHeight - frame.clientHeight, page: pageEl.scrollHeight - pageEl.clientHeight };
      });
      check(`${scene} ${width}x${height}: nothing scrolls`, overflow.frame <= 1 && overflow.page <= 1, JSON.stringify(overflow));
    }
    await select(short, 'Scene', 'unlock-pin');
    const r = await read(short);
    /* Given up only as far as the pad needs: the window less the page floor
       the stylesheet names, held between the title's line it replaced and
       the whole sun (its outer ring and 16px). */
    const expected = await short.evaluate((h) => {
      const frame = document.querySelector('[data-gate-sun]');
      const floor = parseFloat(getComputedStyle(frame).getPropertyValue('--gate-page-floor'));
      const ring = document.querySelector('[data-gate-sun] [data-flag-sun] > i').getBoundingClientRect().height / 2;
      const title = h < 640 ? 42 : 70;
      return Math.round(Math.min(ring + 16, Math.max(title, h - floor)));
    }, height);
    check(`unlock-pin ${width}x${height}: the field gives the pad only what it needs`, Math.abs(r.box.height - expected) <= 1 && r.box.height > (height < 640 ? 42 : 70), `field ${Math.round(r.box.height)}px, expected ${expected}px, sun air ${r.sunAir}px`);
    await short.close();
  }
} finally {
  await browser.close();
  await server.close();
}
finish('gate-flag-check: every check passed');
