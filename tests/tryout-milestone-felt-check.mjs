/* What a tryout and a milestone say about how they felt (phase 15
   after-release ticket 15), against real routes on a dev server.

   1. Each row of a tryout's "How it's felt" log names the mood it holds,
      with its face, and keeps the day as the line under it. The rows used
      to be dates and nothing else.
   2. Adopting a name tryout with "use this name" on sets the app's name to
      the tryout's stored name, even after the milestone was renamed in the
      sheet and the label field holds an unsaved edit.
   3. On a milestone's anniversary, Milestones offers to record how it feels
      now; another milestone gets no offer; saving one hides the row and says
      it was saved, and the reading is stored on that milestone for today.

   Every block runs even when an earlier one fails, so one run against the
   old code shows each of the three red.

   Run: node tests/tryout-milestone-felt-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

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
    const { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } = await import('/src/lib/data/epochDay.ts');
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const today = todayEpochDay();
    prefs.name = 'Before';
    const tryoutId = await journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: today - 30, endEpochDay: null });
    await journal.feltSense.add({ tryoutId }, { epochDay: today - 20, mood: 2, note: null });
    await journal.feltSense.add({ tryoutId }, { epochDay: today - 10, mood: 5, note: 'At the bakery' });
    // Two years back on today's month and day, so today is its anniversary.
    const iso = dateInputValueFromEpochDay(today);
    const back = `${Number(iso.slice(0, 4)) - 2}${iso.slice(4)}`;
    const anniversaryId = await journal.milestones.upsertMilestone({ name: 'Started HRT', epochDay: epochDayFromDateInputValue(back) });
    const otherId = await journal.milestones.upsertMilestone({ name: 'Came out at work', epochDay: today - 40 });
    return { tryoutId, anniversaryId, otherId, today };
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
        face: el.querySelector('svg') !== null
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

  await block('the anniversary offer shows on its day, saves, says so and goes', async () => {
    // The adoption left an unsaved label edit behind, so leaving asks first.
    await page.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/transition/milestones';
      document.body.append(link);
      link.click();
      link.remove();
    });
    await page.locator('[data-discard-record]').click();
    await page.waitForURL('**/transition/milestones');
    const offer = page.locator(`[data-anniv-feeling="${seeded.anniversaryId}"]`);
    await offer.waitFor();
    assert.equal(await page.locator(`[data-anniv-feeling="${seeded.otherId}"]`).count(), 0, 'no offer off the anniversary');
    assert.match(await offer.innerText(), /Started HRT/);
    await offer.click();
    await page.locator('[data-save-feeling-offer]').waitFor();
    await page.locator('[data-sheet] [data-mood="4"]').click();
    await page.locator('[data-save-feeling-offer]').click();
    await offer.waitFor({ state: 'detached' });
    await page.getByRole('status').filter({ hasText: 'Saved for "Started HRT".' }).waitFor();
    const stored = await page.evaluate(async (id) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      return journal.feltSense.forMilestone(id);
    }, seeded.anniversaryId);
    assert.deepEqual(stored.map((f) => [f.epochDay, f.mood]), [[seeded.today, 4]]);
    // Answered today, so a second visit does not ask again.
    await navigate('/more');
    await navigate('/transition/milestones');
    await page.locator('[data-ms-log-toggle]').waitFor();
    assert.equal(await offer.count(), 0);
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
