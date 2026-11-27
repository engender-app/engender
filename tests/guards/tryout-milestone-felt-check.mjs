/* Check that tryout readings show the mood, face and date. Name adoption
   uses the stored tryout name even after edits to the milestone or draft.
   Run each case independently with node tests/guards/tryout-milestone-felt-check.mjs
   against a dev server. Milestone celebration has its own check. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/tryout-milestone-felt-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const failures = [];

async function block(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n  ${error.message.split('\n').join('\n  ')}`);
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persist = async () => true;
      navigator.storage.persisted = async () => true;
    }
  });

  async function navigate(path) {
    await page.evaluate((path) => {
      const link = document.createElement('a');
      link.href = path;
      document.body.append(link);
      link.click();
      link.remove();
    }, path);
    await page.waitForURL(`**${path}`);
  }

  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();

  const seeded = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const today = todayEpochDay();
    prefs.name = 'Before';
    const tryoutId = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: today - 30, endEpochDay: null });
    await journal.feltSense.add({ tryoutId }, { epochDay: today - 20, mood: 2, note: null });
    await journal.feltSense.add({ tryoutId }, { epochDay: today - 10, mood: 5, note: 'At the bakery' });
    return { tryoutId, today };
  });

  await block('each felt-sense row names its mood, with its face, and the day under it', async () => {
    await navigate(`/transition/tryouts/${seeded.tryoutId}`);
    const rows = page.locator('[data-feeling]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 2);
    const read = await rows.evaluateAll((els) =>
      els.map((el) => ({
        title: el.querySelector('[data-row-title]')?.textContent.trim(),
        sub: el.querySelector('.kit-row-sub')?.textContent.trim() ?? '',
        face: el.querySelector('svg.mood-face') !== null
      }))
    );
    assert.equal(read[0].title, 'great', JSON.stringify(read));
    assert.equal(read[1].title, 'bad', JSON.stringify(read));
    for (const row of read) {
      assert.ok(row.face, `a face beside ${row.title}`);
      assert.match(row.sub, /\d{4}/, `the day under ${row.title}`);
    }
  });

  await block('adopting with a renamed milestone sets the name in the app to the tryout name', async () => {
    if (!page.url().includes(seeded.tryoutId)) await navigate(`/transition/tryouts/${seeded.tryoutId}`);
    await page.locator('#tr-label').waitFor();
    await page.locator('#tr-label').fill('Unsaved edit');
    await page.locator('[data-adopt-tryout]').click();
    await page.locator('#adopt-milestone-name').fill('Started going by Alex');
    await page.locator('[data-confirm-adopt-milestone]').click();
    await page.locator('[data-adopt-tryout]').waitFor({ state: 'detached' });
    const after = await page.evaluate(async (tryoutId) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const milestone = (await journal.milestones.getMilestones()).find((mi) => mi.tryoutId === tryoutId);
      return { name: prefs.name, milestone: milestone?.name };
    }, seeded.tryoutId);
    assert.equal(after.milestone, 'Started going by Alex');
    assert.equal(after.name, 'Alex');
  });

  await block('no uncaught page errors', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failed: ${failures.join('; ')}`);
  process.exit(1);
}
