/* Ticket 258: sample each painted frame of three suggestion shuffles. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { PALETTES } from './palettes.mjs';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/milestone-shuffle-vite',
  server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();

async function shuffle(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const slots = () => [...document.querySelectorAll('.template-slot')];
    const read = () => ({
      height: document.querySelector('[data-sheet]')?.getBoundingClientRect().height,
      slots: slots().map((slot) => ({
        y: slot.getBoundingClientRect().y,
        height: slot.getBoundingClientRect().height,
        rows: [...slot.querySelectorAll('[data-template]')].map((row) => ({
          key: row.getAttribute('data-template'),
          y: row.getBoundingClientRect().y,
          opacity: Number(getComputedStyle(row.parentElement).opacity)
        }))
      }))
    });
    const frames = [read()];
    document.querySelector('[data-shuffle]').click();
    const start = performance.now();
    function sample() {
      frames.push(read());
      if (performance.now() - start < 260) requestAnimationFrame(sample);
      else resolve(frames);
    }
    requestAnimationFrame(sample);
  }));
}

try {
  for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'no-preference' });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const base = server.resolvedUrls.local[0];
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
    await page.evaluate(async (value) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.theme = value;
    }, theme);
    await page.goto(`${base}transition/milestones`, { waitUntil: 'networkidle' });
    await page.locator('[data-add]').click();
    await page.locator('[data-shuffle]').waitFor();
    await page.waitForTimeout(600);

    for (let tap = 0; tap < 3; tap++) {
      const frames = await shuffle(page);
      const first = frames[0];
      const last = frames.at(-1);
      assert.equal(first.slots.length, 3);
      assert.equal(last.slots.length, 3);
      for (const frame of frames) {
        assert.equal(frame.slots.length, 3);
        assert.ok(Math.abs(frame.height - first.height) < 0.5, `sheet height changed: ${width} ${theme} tap ${tap}`);
        frame.slots.forEach((slot, i) => {
          assert.ok(Math.abs(slot.y - first.slots[i].y) < 0.5, `slot jumped: ${width} ${theme} tap ${tap}, ${first.slots[i].y} to ${slot.y}`);
          assert.ok(Math.abs(slot.height - first.slots[i].height) < 0.5, `slot height changed: ${width} ${theme} tap ${tap}, ${first.slots[i].height} to ${slot.height}`);
          slot.rows.forEach((row) => assert.ok(Math.abs(row.y - slot.y) < 0.5));
        });
      }
      for (let i = 0; i < 3; i++) {
        const oldKey = first.slots[i].rows[0].key;
        const newKey = last.slots[i].rows[0].key;
        if (oldKey === newKey) continue;
        for (const key of [oldKey, newKey]) {
          const opacity = frames.flatMap((frame) => frame.slots[i].rows)
            .filter((row) => row.key === key).map((row) => row.opacity);
          assert.ok(opacity.some((value) => value > 0.01 && value < 0.99),
            `${key} cut at full opacity: ${width} ${theme} tap ${tap}`);
        }
      }
      const before = first.slots.map((slot) => slot.rows[0].key);
      const after = last.slots.map((slot) => slot.rows[0].key);
      for (const key of before.filter((value) => after.includes(value))) {
        assert.equal(after.indexOf(key), before.indexOf(key), `survivor moved: ${width} ${theme} tap ${tap}`);
      }
    }
    const beforeReentry = await page.locator('.template-slot [data-template]').evaluateAll(
      (rows) => rows.map((row) => row.getAttribute('data-template'))
    );
    await page.evaluate(() => document.querySelector('[data-add]').click());
    await page.waitForTimeout(260);
    const afterReentry = await page.locator('.template-slot [data-template]').evaluateAll(
      (rows) => rows.map((row) => row.getAttribute('data-template'))
    );
    for (const key of beforeReentry.filter((value) => afterReentry.includes(value))) {
      assert.equal(afterReentry.indexOf(key), beforeReentry.indexOf(key), `re-entry moved ${key}: ${width} ${theme}`);
    }
    if (width === 390 && process.argv.includes('--gallery')) {
      await mkdir('.claude/ticket-258-shots', { recursive: true });
      for (const palette of PALETTES) {
        await page.evaluate(async (value) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = value;
        }, palette);
        await page.screenshot({ path: `.claude/ticket-258-shots/${palette}-${theme}.png` });
      }
    }
    assert.deepEqual(errors, [], `page errors: ${width} ${theme}`);
    console.log(`PASS milestone shuffle: ${width}px ${theme}, 3 taps`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
