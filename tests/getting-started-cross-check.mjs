/* Real-browser check for ux-carpet ticket 288: Home's Getting started rows
   cross themselves off once the thing they suggest has been done.

   What it holds, sampling every animation frame (requestAnimationFrame, not
   a fixed wait):
   - day one, nothing done: no row is crossed and `more` has no check at all;
   - a row that becomes done while Home is on screen crosses: the check and
     the old icon each pass through intermediate opacities, never both absent
     or both fully present in a frame, and the strike draws in over several
     frames rather than appearing at full width in one;
   - a row that is already done on a cold arrival is crossed in the first
     frame it exists and never animates;
   - a row that became done while Home was off screen crosses on the way back,
     and one that was already shown crossed does not;
   - the done state is announced, the row stays in place and still links,
     and deleting the last record un-crosses it.

   Run against a dev server (no build needed):
     node tests/getting-started-cross-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { JUMP_FIRST_RUN_EXPRESSION, WALK_FIRST_RUN_FINISH_EXPRESSION } from './yank-sweep-core.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/getting-started-cross-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const base = server.resolvedUrls.local[0];

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

const ROW = (key) => `[data-getting-started] [data-list-row="${key}"]`;

/* The page-side half, installed as text before any of the app's scripts: the
   app's CSP refuses eval, so a function handed to evaluate cannot build
   another. `__probeRow` reads one row's animated properties off the real
   computed style; `__sampleRow` runs it on every frame; `__coldRow` starts
   sampling from the document's first frame. */
await page.addInitScript(() => {
  window.__probeRow = (key) => {
    const row = document.querySelector(`[data-getting-started] [data-list-row="${key}"]`);
    if (!row) return null;
    const glyphs = row.querySelectorAll('.start-glyph');
    const op = (el) => (el ? +getComputedStyle(el).opacity : null);
    const title = row.querySelector('.kit-row-title > span');
    const t = title ? getComputedStyle(title, '::after').transform : 'none';
    const strike = t === 'none' ? 0 : +(t.match(/[\d.-]+/g) || [0])[0];
    return { icon: op(glyphs[0]), check: glyphs[1] ? op(glyphs[1]) : null, strike, done: row.hasAttribute('data-done') };
  };
  window.__sampleRow = (key, ms) =>
    new Promise((resolve) => {
      const out = [];
      const start = performance.now();
      const tick = () => {
        out.push({ at: Math.round(performance.now() - start), ...(window.__probeRow(key) ?? { missing: true }) });
        if (performance.now() - start < ms) requestAnimationFrame(tick);
        else resolve(out);
      };
      requestAnimationFrame(tick);
    });
  window.__cold = [];
  const cold = () => {
    const row = window.__probeRow('letters');
    if (row) window.__cold.push(row);
    if (window.__cold.length < 40) requestAnimationFrame(cold);
  };
  requestAnimationFrame(cold);
});

/** Every frame from now for `ms`, running `act` right after sampling starts. */
async function sample(key, ms, act) {
  const run = page.evaluate(({ key, ms }) => window.__sampleRow(key, ms), { key, ms });
  try {
    await act?.();
  } catch (error) {
    run.catch(() => {});
    throw error;
  }
  return (await run).filter((f) => !f.missing);
}

/** The app's own journal, reached through the module the page already holds.
    Named operations, because evaluate cannot build code from a string. */
const write = (op) =>
  page.evaluate(async (op) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    if (op === 'addLetter') return journal.letters.addLetter({ epochDay: 20000, text: 'hello', unlockEpochDay: 20100 });
    if (op === 'addEpisode')
      return journal.regimen.upsertEpisode({
        drug: 'estradiol', ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily',
        startEpochDay: 20000, endEpochDay: null, endReason: null
      });
    if (op === 'deleteLetters') {
      for (const letter of await journal.letters.getLetters(10)) await journal.letters.deleteLetter(letter.id);
    }
  }, op);

/** Frames strictly between a series' first and last values. */
const between = (frames, prop) => {
  const v = frames.map((f) => f[prop]);
  const lo = Math.min(v[0], v[v.length - 1]);
  const hi = Math.max(v[0], v[v.length - 1]);
  return v.filter((x) => x > lo + 1e-3 && x < hi - 1e-3).length;
};

function expectCrossingDrawn(frames, label) {
  assert(frames.length > 5, `${label}: sampled ${frames.length} frames`);
  assert(between(frames, 'check') >= 2, `${label}: the check passes through at least two intermediate opacities`);
  assert(between(frames, 'icon') >= 2, `${label}: the icon passes through at least two intermediate opacities`);
  assert(between(frames, 'strike') >= 2, `${label}: the strike draws over at least two frames`);
  for (const f of frames) {
    assert(!(f.icon < 0.03 && f.check < 0.03), `${label}: frame ${f.at}ms has neither the icon nor the check`);
    assert(!(f.icon > 0.97 && f.check > 0.97), `${label}: frame ${f.at}ms has both the icon and the check`);
  }
  for (let i = 1; i < frames.length; i++)
    assert(
      frames[i].strike - frames[i - 1].strike < 0.6,
      `${label}: the strike jumps ${frames[i - 1].strike} to ${frames[i].strike} in one frame`
    );
  const last = frames[frames.length - 1];
  assert(last.check > 0.99 && last.icon < 0.01 && last.strike > 0.99, `${label}: it ends crossed (${JSON.stringify(last)})`);
}

try {
  /* Vite reloads a page the first time a route pulls in dependencies it has
     not bundled yet, and the demo journal lives in memory, so a reload on
     the milestones route mid-test drops the episode the test just wrote.
     Visit that route once first, so its dependencies are bundled before
     anything is written. */
  await page.goto(`${base}transition/milestones`, { waitUntil: 'networkidle' });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  // The dev build opens on the 266-entry demo persona; day one is the demo
  // bar's first-run jump, walked to its end.
  await page.evaluate(JUMP_FIRST_RUN_EXPRESSION);
  await page.evaluate(WALK_FIRST_RUN_FINISH_EXPRESSION);
  await page.waitForSelector('[data-getting-started]');

  /* An offer whose area is already pinned is left out (phase 14 ticket 18),
     and day one's default pins include milestones and care. Pinned there,
     Milestones and Care are not offered a second time. This check needs
     all five rows, so it pins only tryouts and comes back to Home. */
  const offered = await page.$$eval('[data-getting-started] [data-list-row]', (rows) => rows.map((r) => r.dataset.listRow));
  assert.deepEqual(offered, ['letters', 'photos', 'more'], 'the default pins are not offered again');
  console.log('PASS day one leaves out the offers its default pins already show');
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.pinnedRows = ['tryouts'];
  });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-getting-started]');

  // Day one: five rows, nothing crossed, `more` has no check to cross to.
  const keys = await page.$$eval('[data-getting-started] [data-list-row]', (rows) => rows.map((r) => r.dataset.listRow));
  assert.deepEqual(keys, ['milestones', 'regimen', 'letters', 'photos', 'more']);
  assert.equal(await page.locator('[data-getting-started] [data-done]').count(), 0, 'day one crosses nothing');
  assert.equal(await page.locator(`${ROW('more')} .start-check`).count(), 0, 'more has no check');
  console.log('PASS day one: five rows, none crossed');

  // A row that becomes done while Home is on screen crosses.
  const live = await sample('letters', 800, () => write('addLetter'));
  expectCrossingDrawn(live, 'letters while Home is up');
  assert.equal(await page.locator(ROW('letters')).getAttribute('data-done'), 'true');
  assert.match(await page.locator(ROW('letters')).innerText(), /Done/, 'the done state is announced in text');
  assert.ok(await page.locator(ROW('letters')).getAttribute('href'), 'a crossed row is still a link');
  assert.deepEqual(
    await page.$$eval('[data-getting-started] [data-list-row]', (rows) => rows.map((r) => r.dataset.listRow)),
    keys,
    'crossing does not reorder'
  );
  assert.equal(await page.locator(`${ROW('more')}[data-done]`).count(), 0, 'more is never crossed');
  console.log('PASS crossing on screen:', live.length, 'frames, last', JSON.stringify(live.at(-1)));

  // Cold arrival with the letter already there: crossed in its first frame.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector(`${ROW('letters')}[data-done]`);
  await page.waitForTimeout(600);
  const cold = await page.evaluate(() => window.__cold);
  assert(cold.length > 3, 'the cold arrival was sampled');
  assert.deepEqual(
    [cold[0].check, cold[0].icon, cold[0].strike],
    [1, 0, 1],
    `the first frame is already crossed ${JSON.stringify(cold[0])}`
  );
  assert(cold.every((f) => f.check === 1 && f.icon === 0 && f.strike === 1), 'a cold arrival never animates');
  console.log('PASS cold arrival: crossed from the first frame,', cold.length, 'frames, no motion');

  // Done while Home was off screen: crosses on the way back; the shown one does not.
  await page.locator(ROW('milestones')).click();
  await page.waitForURL(/transition\/milestones/);
  await write('addEpisode');
  const back = await sample('regimen', 900, () => page.goBack());
  await page.waitForSelector(`${ROW('regimen')}[data-done]`);
  expectCrossingDrawn(back.slice(back.findIndex((f) => f.check !== null && f.icon !== null)), 'regimen done while away');
  const shown = await page.evaluate(() => window.__probeRow('letters'));
  assert(shown.check === 1 && shown.strike === 1, 'the letter, shown crossed before, stays crossed');
  console.log('PASS returning: regimen crosses on arrival, letters does not re-animate');

  // Un-cross.
  await write('deleteLetters');
  await page.waitForSelector(`${ROW('letters')}:not([data-done])`);
  console.log('PASS deleting the last letter un-crosses the row');

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS Getting started crossing check');
} finally {
  await browser.close();
  await server.close();
}
