import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { launchChromium, previewBuild, settlePage, screencast } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, FILL_EVERY_FEATURE_EXPRESSION, prepareSceneExpression } from './yank-sweep-core.mjs';

const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const output = resolve(args[0] ?? '.claude/lookback-span-content');
const matrix = process.argv.includes('--matrix');
const browser = await launchChromium();
const app = await previewBuild(resolve(args[1] ?? process.cwd()));
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const base = `http://localhost:${app.httpServer.address().port}`;
  await settlePage(page, base, '/', 'light');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  const configs = ['light', 'dark'].map(theme => ({ theme, language: 'en', reduced: false, disguise: false, width: 390, name: theme }));
  if (matrix) for (const theme of ['light', 'dark']) for (const variant of [
    { language: 'pl', reduced: false, disguise: false, width: 390, name: 'pl' },
    { language: 'pl', reduced: true, disguise: false, width: 390, name: 'reduced' },
    { language: 'pl', reduced: false, disguise: true, width: 390, name: 'disguise' },
    { language: 'pl', reduced: false, disguise: true, width: 195, name: 'zoom' }
  ]) configs.push({ ...variant, theme, name: `${variant.name}-${theme}` });
  for (const { theme, language, reduced, disguise, width, name } of configs) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    if (await page.locator('html').getAttribute('lang') !== language) {
      await settlePage(page, base, '/settings', theme);
      await page.locator('[data-list-row="language"]').click();
      await page.locator(`[data-sheet] [data-segment="${language}"]`).click();
      await page.waitForFunction(lang => document.documentElement.lang === lang, language);
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
    const disguised = await page.evaluate(() => JSON.parse(localStorage.getItem('engender-boot-prefs') ?? '{}').disguise === true);
    if (disguised !== disguise) {
      await settlePage(page, base, '/settings', theme);
      await page.locator('[data-list-row="disguise"]').click();
      await page.locator('[data-sheet] button[role="switch"]').click();
      await page.waitForTimeout(300);
    }
    await settlePage(page, base, '/stats', theme);
    await page.waitForTimeout(1000);
    await page.evaluate(prepareSceneExpression({ name: 'span-offer-appear', act: '[data-span-band]', startTheme: theme }));
    await page.waitForTimeout(800);
    const span = await page.locator('[data-span-timeline]').evaluate(el => [el.dataset.spanStart, el.dataset.spanEnd]);
    assert.equal(span[0], span[1], 'probe starts from one day');
    assert.equal(await page.locator('[data-lookback-facts]').count(), 0, 'thin span omits summary facts');
    assert.equal(await page.locator('[data-lookback-read]').count(), 0, 'thin span omits Wrapped link');
    assert(await page.locator('[data-lookback-thin]').innerText(), 'thin span has explanation');
    const dir = resolve(output, name);
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: resolve(dir, 'before.png') });
    await screencast(page, async frames => {
      await page.evaluate(() => {
        window.__spanSamples = [];
        window.__spanStart = Date.now();
        const start = performance.now();
        const tick = () => {
          const at = performance.now() - start;
          const items = [...document.querySelectorAll('[data-lookback-fact], [data-reading], [data-lookback-thin], [data-lookback-read]')].map(el => {
            const box = el.getBoundingClientRect();
            const css = getComputedStyle(el);
            let opacity = Number(css.opacity);
            let left = box.left, right = box.right, top = box.top, bottom = box.bottom;
            const ancestors = [];
            for (let parent = el.parentElement; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent);
              const clip = parent.getBoundingClientRect();
              opacity *= Number(style.opacity);
              if (style.visibility === 'hidden') opacity = 0;
              if (['clip', 'hidden', 'auto', 'scroll'].includes(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
              if (['clip', 'hidden', 'auto', 'scroll'].includes(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
              if (style.overflow !== 'visible' || style.height !== 'auto') ancestors.push({ tag: parent.className, y: clip.y, height: clip.height, overflow: style.overflow });
            }
            return { visible: { x: left, y: top, width: Math.max(0, right-left), height: Math.max(0, bottom-top) }, ancestors, key: el.dataset.reading ?? (el.hasAttribute('data-lookback-fact') ? el.textContent.trim() : el.hasAttribute('data-lookback-thin') ? 'thin' : 'wrapped'), x: box.x, y: box.y, width: box.width, height: box.height, opacity, position: css.position, transform: css.transform, overflow: css.overflow, text: el.textContent.trim() };
          });
          window.__spanSamples.push({ at, items });
          if (at < 1000) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        document.querySelector('[data-span-band]').click();
      });
      await page.waitForTimeout(1200);
      const { samples, start } = await page.evaluate(() => ({ samples: window.__spanSamples, start: window.__spanStart }));
      assert(samples.length >= 20, 'probe collects at least twenty animation-frame samples');
      assert(frames.length >= 3, 'camera sees transition frames');
      assert(frames.every((frame, i) => i === 0 || frame.at >= frames[i - 1].at), 'camera timestamps are monotonic');
      const collisions = samples.flatMap(sample => sample.items.flatMap((a, i) => sample.items.slice(i + 1).filter(b => a.opacity > .15 && b.opacity > .15 && a.visible.y < 844 && b.visible.y < 844 && Math.min(a.visible.x+a.visible.width,b.visible.x+b.visible.width)-Math.max(a.visible.x,b.visible.x)>2 && Math.min(a.visible.y+a.visible.height,b.visible.y+b.visible.height)-Math.max(a.visible.y,b.visible.y)>2).map(b => ({ at: sample.at, a: a.key, b: b.key }))));
      await writeFile(resolve(dir, 'styles.json'), JSON.stringify(samples, null, 2));
      await writeFile(resolve(dir, 'collisions.json'), JSON.stringify(collisions, null, 2));
      await writeFile(resolve(dir, 'frames.json'), JSON.stringify(frames.map((f,i) => ({ frame:i, at:f.at-start })),null,2));
      for (const [i,frame] of frames.entries()) await writeFile(resolve(dir, `${String(i).padStart(3,'0')}-${Math.round(frame.at-start)}ms.png`), Buffer.from(frame.data,'base64'));
      console.log(`${collisions.length ? 'FAIL' : 'PASS'} ${name}: ${collisions.length} overlapping tile/fact/span samples`);
      failed ||= collisions.length > 0;
    });
    assert(await page.locator('[data-lookback-facts]').count(), 'populated span facts appear');
    assert(await page.locator('[data-lookback-readings]').evaluate(el => !el.closest('.read-group-members').classList.contains('is-held')), 'populated readings leave loading gate');
    assert(await page.locator('[data-era-offer]').count(), 'naming offer appears');
    assert.equal(await page.locator('[data-lookback-thin]').count(), 0, 'thin explanation leaves');
    const selected = await page.locator('[data-span-timeline]').evaluate(el => [Number(el.dataset.spanStart), Number(el.dataset.spanEnd)]);
    assert(selected[0] < selected[1], 'history band selects populated dates');
    const date = epoch => new Date(epoch * 86400000).toISOString().slice(0, 10);
    const wrapped = new URL(await page.locator('[data-lookback-read]').getAttribute('href'), base);
    assert.equal(wrapped.searchParams.get('from'), date(selected[0]));
    assert.equal(wrapped.searchParams.get('to'), date(selected[1]));
    assert.equal(await page.locator('[data-segmented="lookback-quick"] a').count(), 3, 'quick picks remain links');
    assert(await page.locator('[data-reading="words"] .kit-reading-head').textContent(), 'words live headline remains');
    assert(await page.locator('[data-reading="plane"]').getAttribute('href'), 'plane reading remains reachable');
    assert(await page.locator('[data-tile="wrapped"], [data-tile="on-this-day"]').count(), 'resurfacing cards remain');
    await page.screenshot({ path: resolve(dir, 'settled.png') });
    await page.locator('[data-reading="words"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(dir, 'readings.png') });
    assert(await page.locator('[data-reading="words"]').evaluate(el => el.getBoundingClientRect().height >= 48), 'reading meets touch floor');
    await writeFile(resolve(dir, 'state.json'), JSON.stringify({ theme, language, reduced, disguise, width, selected, wrapped: wrapped.pathname + wrapped.search }, null, 2));
    const startHandle = page.locator('[data-span-handle="start"]');
    assert(await startHandle.getAttribute('aria-label'), 'start slider has accessible name');
    await startHandle.focus();
    await startHandle.press('ArrowRight');
    await page.waitForTimeout(600);
    assert(Number(await page.locator('[data-span-timeline]').getAttribute('data-span-start')) > selected[0], 'ArrowRight advances by rail grain');
    assert(await startHandle.evaluate(el => el === document.activeElement), 'rail keeps keyboard focus');
    await startHandle.press('ArrowLeft');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('[data-span-timeline]').getAttribute('data-span-start'), String(selected[0]));
    await page.locator('[data-era-offer-dismiss]').click();
    await page.waitForTimeout(500);
  }
  if (matrix) {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['light', 'dark']) for (const palette of ['trans', 'nonbinary', 'genderfluid', 'bisexual', 'lesbian', 'pansexual', 'rainbow', 'agender', 'gaymen', 'genderqueer', 'intersex', 'asexual', 'demiboy', 'demigirl', 'trigender', 'polish']) {
      await settlePage(page, base, '/settings', theme);
      await page.locator(`[data-palette-pick="${palette}"]`).click();
      await page.waitForTimeout(450);
      await settlePage(page, base, '/stats', theme);
      await page.waitForTimeout(500);
      assert.equal(await page.locator('html').getAttribute('data-palette'), palette);
      assert(await page.locator('[data-lookback-read]').innerText());
      await page.screenshot({ path: resolve(output, `${palette}-${theme}.png`) });
    }
    console.log('PASS 16 palettes in light/dark, selected span remains readable');
  }
} finally {
  await browser.close();
  await new Promise(resolveClose => app.httpServer.close(resolveClose));
}
if (failed) process.exitCode = 1;
