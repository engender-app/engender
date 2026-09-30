/* Real-browser check for ux-carpet ticket 289: the entry editor's noticed-
   effects sheet follows the regimen, searches, and takes several effects.

   What it holds:
   - testosterone alone offers masculinizing and own effects, estradiol alone
     feminizing and own, both the union, a drug that is neither (progesterone)
     everything with no "show all" row; "show all" lifts the filter and the
     next opening is filtered again;
   - rows tick and untick, the sheet stays open, each chosen effect is a chip
     with its own remove button, and an effect already on the record shows
     ticked, dated and disabled;
   - sampling every animation frame, no row or heading is painted at its
     destination before it travelled there, and none leaves from full
     opacity in one frame - typing in the box, clearing it, and lifting the
     filter included.

   Run against a dev server (no build needed):
     node tests/noticed-effects-picker-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { JUMP_FIRST_RUN_EXPRESSION, WALK_FIRST_RUN_FINISH_EXPRESSION } from './yank-sweep-core.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/noticed-effects-picker-vite',
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

await page.addInitScript(() => {
  /* One frame of the sheet: every row and heading that exists, with what the
     eye would see of it. A row's wrapper is what collapses. */
  window.__frame = () => {
    const out = {};
    for (const el of document.querySelectorAll('.effect-group, .effect-group .rows-divide, .effect-none, [data-effect-show-all]')) {
      const row = el.querySelector(':scope > [data-list-row]');
      const key = row ? 'row:' + row.dataset.listRow : el.className.includes('effect-group') ? 'group:' + el.dataset.effectPickerGroup : el.hasAttribute('data-effect-show-all') ? 'show-all' : 'none';
      const target = el.hasAttribute('data-effect-show-all') ? el.parentElement : el;
      const style = getComputedStyle(target);
      // A short block arrives from above by clip-path and leaves by height,
      // so what is visible is the box less whatever the clip has hidden.
      const clipTop = parseFloat((style.clipPath.match(/inset\(([\d.]+)px/) ?? [0, 0])[1]);
      out[key] = { opacity: +style.opacity, height: Math.max(0, target.getBoundingClientRect().height - clipTop) };
    }
    return out;
  };
  window.__sampleSheet = (ms) =>
    new Promise((resolve) => {
      const frames = [];
      const start = performance.now();
      const tick = () => {
        frames.push({ at: Math.round(performance.now() - start), items: window.__frame() });
        if (performance.now() - start < ms) requestAnimationFrame(tick);
        else resolve(frames);
      };
      requestAnimationFrame(tick);
    });
});

/** Frames while `act` runs. */
async function sample(ms, act) {
  const run = page.evaluate((ms) => window.__sampleSheet(ms), ms);
  try {
    await act();
  } catch (error) {
    run.catch(() => {});
    throw error;
  }
  return run;
}

/** A row that appears must not be painted whole where it lands, and one that
    leaves must not go from visible to gone in one frame. */
function assertNoYank(frames, label) {
  const keys = new Set(frames.flatMap((f) => Object.keys(f.items)));
  for (const key of keys) {
    const series = frames.map((f) => f.items[key] ?? null);
    for (let i = 1; i < series.length; i++) {
      const [prev, cur] = [series[i - 1], series[i]];
      if (!prev && cur)
        assert(cur.opacity < 0.9 || cur.height < 8, `${label}: ${key} appears whole in one frame at ${frames[i].at}ms (${JSON.stringify(cur)})`);
      if (prev && !cur)
        assert(prev.opacity < 0.2 || prev.height < 8, `${label}: ${key} vanishes from ${JSON.stringify(prev)} in one frame at ${frames[i].at}ms`);
    }
  }
}

const write = (op, arg) =>
  page.evaluate(
    async ({ op, arg }) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
      const today = todayEpochDay();
      if (op === 'regimen') {
        for (const ep of await journal.regimen.getEpisodes())
          if (ep.endEpochDay == null || ep.endEpochDay >= today) await journal.regimen.endEpisode(ep.id, today - 1);
        for (const drug of arg)
          await journal.regimen.upsertEpisode({
            drug, ester: null, dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily',
            startEpochDay: today - 30, endEpochDay: null, endReason: null
          });
      }
      if (op === 'mark') await journal.personalEffects.upsertMarker({ effect: arg, firstNoticedEpochDay: today - 10 });
      if (op === 'clear') for (const m of await journal.personalEffects.getMarkers()) await journal.personalEffects.clearMarker(m.effect);
    },
    { op, arg }
  );

const catalogue = () =>
  page.evaluate(async () => {
    const { vocabulary } = await import('/src/lib/data/vocabulary/vocabulary.ts');
    return vocabulary.visiblePersonalEffectTypes.map((e) => ({ key: e.key, name: e.name, direction: e.direction, builtIn: e.builtIn }));
  });

const offered = () => page.$$eval('.effect-group [data-list-row]', (rows) => rows.map((r) => r.dataset.listRow));
const CHIP = '[data-contextual="hrt-effects"] .contextual-chip.press';

async function openSheet() {
  await page.locator(CHIP).click();
  await page.waitForSelector('[data-effect-search]');
  await page.waitForTimeout(500);
}
async function closeSheet() {
  await page.locator('[data-effect-done]').click();
  await page.waitForSelector('[data-effect-search]', { state: 'detached' });
}

const set = (keys) => [...keys].sort();

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.evaluate(JUMP_FIRST_RUN_EXPRESSION);
  await page.evaluate(WALK_FIRST_RUN_FINISH_EXPRESSION);
  await write('clear');
  const ownAdded = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return (await journal.personalEffects.addCustomEffectType('Crème rash')).key;
  });
  // The vocabulary mirror refreshes behind the write, so ask until it has it.
  let effects = await catalogue();
  for (let i = 0; i < 40 && !effects.some((e) => e.key === ownAdded); i++) {
    await page.waitForTimeout(100);
    effects = await catalogue();
  }
  assert(effects.some((e) => e.key === ownAdded), 'the own effect is in the catalogue');
  const keysWhere = (pred) => effects.filter(pred).map((e) => e.key);
  const fem = keysWhere((e) => e.direction === 'feminizing');
  const masc = keysWhere((e) => e.direction === 'masculinizing');
  const own = keysWhere((e) => e.direction === null);
  assert(fem.length > 5 && masc.length > 5 && own.length >= 1, 'the catalogue has both directions and an own effect');

  await write('regimen', ['Testosterone cypionate']);
  // A reload would reseed the demo journal and lose the regimen written above,
  // so the editor is reached the way a tap reaches it: SvelteKit's own link click.
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/entry/new/today';
    document.body.append(link);
    link.click();
  });
  await page.waitForURL(/entry\/new\/today/);
  await page.waitForSelector(CHIP).catch(async (e) => {
    await page.screenshot({ path: '/tmp/claude-1000/-home-alice--projekty-priv-gender-diary/787bf72c-d37e-4175-b485-375d59e7f4bc/scratchpad/editor.png' });
    throw e;
  });

  // Testosterone alone.
  await openSheet();
  assert.deepEqual(set(await offered()), set([...masc, ...own]), 'testosterone offers masculinizing and own effects');
  assert(await page.locator('[data-effect-show-all]').count(), 'a show-all row is offered');
  console.log('PASS testosterone:', masc.length, 'masculinizing +', own.length, 'own');

  // Show all, then the next opening is filtered again.
  const lifted = await sample(900, () => page.locator('[data-effect-show-all]').click());
  assertNoYank(lifted, 'show all');
  assert.deepEqual(set(await offered()), set(effects.map((e) => e.key)), 'show all offers everything');
  assert.equal(await page.locator('[data-effect-show-all]').count(), 0, 'the row goes once it has done its job');
  await closeSheet();
  await openSheet();
  assert.deepEqual(set(await offered()), set([...masc, ...own]), 'the next opening is filtered again');
  console.log('PASS show all lifts for one opening only;', lifted.length, 'frames, no yank');

  // Search: flat, folded, inside the filter, animated.
  const typed = await sample(900, () => page.locator('[data-effect-search]').pressSequentially('creme', { delay: 60 }));
  assertNoYank(typed, 'typing');
  assert.deepEqual(await offered(), [ownAdded], 'the query folds Crème to creme and keeps only that effect');
  assert.equal(await page.locator('.effect-group .section-heading, .effect-group h3').count(), 0, 'a search result has no heading');
  const cleared = await sample(900, () => page.locator('[data-effect-search-clear]').click());
  assertNoYank(cleared, 'clearing');
  assert.deepEqual(set(await offered()), set([...masc, ...own]), 'clearing brings the filtered list back');
  console.log('PASS search: flat, folded, in the filter;', typed.length + cleared.length, 'frames, no yank');

  // Several at once, and taking one back.
  const [a, b] = masc;
  await page.locator(`.effect-group [data-list-row="${a}"]`).click();
  await page.locator(`.effect-group [data-list-row="${b}"]`).click();
  assert.equal(await page.locator('[data-effect-search]').count(), 1, 'the sheet stays open');
  assert.equal(await page.locator(`.effect-group [data-list-row="${a}"]`).getAttribute('aria-checked'), 'true');
  await page.locator(`.effect-group [data-list-row="${b}"]`).click();
  assert.equal(await page.locator(`.effect-group [data-list-row="${b}"]`).getAttribute('aria-checked'), 'false', 'a chosen row unchecks');
  await page.locator(`.effect-group [data-list-row="${b}"]`).click();
  await closeSheet();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('[data-contextual="hrt-effects"] .effect-chip').count(), 2, 'one chip per chosen effect');
  await page.locator('[data-contextual="hrt-effects"] .effect-chip .icon-btn-inline').first().click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-contextual="hrt-effects"] .effect-chip').count(), 1, "a chip's x deselects it");
  console.log('PASS several at once: tick, untick, chips, chip remove');

  // Already on the record: ticked, dated, not toggleable.
  await write('mark', fem[0]);
  await write('regimen', ['Testosterone cypionate', 'Estradiol valerate']);
  await page.waitForTimeout(400);
  await openSheet();
  const recorded = page.locator(`.effect-group [data-list-row="${fem[0]}"]`);
  assert.equal(await recorded.getAttribute('aria-checked'), 'true', 'a recorded effect shows ticked');
  assert.match(await recorded.innerText(), /Noticed/, 'and dated');
  assert(await recorded.isDisabled(), 'and cannot be toggled');
  assert.deepEqual(set(await offered()), set(effects.map((e) => e.key)), 'both hormones offer both directions');
  assert.equal(await page.locator('[data-effect-show-all]').count(), 0, 'nothing hidden, no show-all row');
  await closeSheet();
  console.log('PASS recorded effect is ticked, dated and locked; both hormones offer both');

  // Estradiol alone, and a drug that is neither.
  await write('regimen', ['Estradiol valerate']);
  await page.waitForTimeout(400);
  await openSheet();
  assert.deepEqual(set(await offered()), set([...fem, ...own]), 'estradiol offers feminizing and own effects');
  await closeSheet();
  await write('regimen', ['Progesterone']);
  await page.waitForTimeout(400);
  await openSheet();
  assert.deepEqual(set(await offered()), set(effects.map((e) => e.key)), 'progesterone filters nothing');
  assert.equal(await page.locator('[data-effect-show-all]').count(), 0, 'and offers no show-all row');
  await closeSheet();
  console.log('PASS estradiol and progesterone');

  await write('clear');
  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS noticed-effects picker check');
} finally {
  await browser.close();
  await server.close();
}
