/* Milestones: a celebration the person controls, against real routes on a dev server.

   1. The add sheet lists every milestone template, in one order, with no
      shuffle control.
   2. Creating a milestone asks for no felt-sense reading: it saves and says
      so, and the screen offers no anniversary reading either.
   3. The editor's "Celebrate it" switch is on for a new milestone, and
      turning it off is saved with the milestone.
   4. Today throws no confetti for an anniversary inside a muted era, and
      does once the era is unmuted.
   5. Today throws no confetti for a milestone set not to be celebrated, and
      does once it is set to be celebrated again.

   Every block runs even when an earlier one fails, so one run against the
   old code shows each of them red. A dev server is a demo build as far as
   `?celebrate=1` goes, so that half of the ticket is verify-build's.

   Run: node tests/milestone-celebration-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/milestone-celebration-vite',
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
    await page.waitForURL((url) => url.pathname === path);
  }

  /* Absence is only worth asserting once the reads that could put the
     celebration there have answered: Today's fold has revealed, and the
     celebration is held for the consent read, which answers in the same
     round. Two seconds of frames with no confetti after that, rather than
     one look. */
  async function celebrationOnToday() {
    await navigate('/');
    await page.locator('[data-home-log]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-read-reserve-hold]'));
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (await page.locator('.home-celebrate').count()) {
        return (await page.locator('.home-celebrate [data-notice="celebration"]').innerText()).trim();
      }
      await page.waitForTimeout(100);
    }
    return null;
  }

  /* The page's own journal, through the dev server's module graph. The
     app's CSP refuses eval, so each call is its own function rather than
     source text handed across. */
  const inPage = (fn, arg) => page.evaluate(fn, arg);
  const MODULES = { journal: '/src/lib/data/live/journal.svelte.ts', days: '/src/lib/data/epochDay.ts' };

  /* The dev server seeds a persona with milestones and eras of its own, so
     every Today block starts from none of either: a seeded era would
     refuse the overlapping one below, and a seeded milestone could land
     today. */
  async function clearMilestones() {
    await inPage(async (M) => {
      const { journal } = await import(M.journal);
      for (const mi of await journal.milestones.getMilestones()) await journal.milestones.deleteMilestone(mi.id);
      for (const era of await journal.eras.getEras()) await journal.eras.deleteEra(era.id);
    }, MODULES);
  }

  /* Each block starts on a fresh copy of the screen, so a sheet an earlier
     block left open on the old code does not fail the next one for it. */
  async function freshMilestones() {
    await page.goto(new URL('/transition/milestones', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    await page.locator('[data-add]').waitFor();
  }

  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();

  await block('the add sheet lists every template in one order, with no shuffle', async () => {
    await navigate('/transition/milestones');
    await page.locator('[data-add]').click();
    await page.locator('[data-template]').first().waitFor();
    const keys = await page.locator('[data-template]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-template')));
    assert.deepEqual(keys, [
      'hrt_start',
      'transition_start',
      'coming_out',
      'first_appointment',
      'name_change',
      'marker_change',
      'surgery',
      'first_public'
    ]);
    assert.equal(await page.locator('[data-shuffle]').count(), 0, 'no shuffle control');
    await page.keyboard.press('Escape');
    await page.locator('[data-template]').first().waitFor({ state: 'detached' });
  });

  await block('creating a milestone asks for no felt-sense reading, and saving says so', async () => {
    await freshMilestones();
    await page.locator('[data-add]').click();
    await page.locator('[data-own]').click();
    await page.locator('#ms-name').fill('Moved out');
    await page.locator('[data-save-milestone]').click();
    await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
    await page.locator('[data-save-milestone]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-save-feeling-offer]').count(), 0, 'no felt-sense sheet');
    assert.equal(await page.locator('[data-anniv-feeling]').count(), 0, 'no anniversary reading offered');
  });

  await block('the celebrate switch is on for a new milestone, and off is saved with it', async () => {
    await freshMilestones();
    await page.locator('[data-add]').click();
    await page.locator('[data-own]').click();
    await page.locator('#ms-name').fill('The hard one');
    const toggle = page.locator('[data-milestone-celebrate] [role="switch"]');
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await page.locator('[data-save-milestone]').click();
    await page.locator('[data-save-milestone]').waitFor({ state: 'detached' });
    const stored = await inPage(async (M) => {
      const { journal } = await import(M.journal);
      return (await journal.milestones.getMilestones()).filter((mi) => mi.name === 'The hard one').map((mi) => mi.celebrate);
    }, MODULES);
    assert.deepEqual(stored, [false]);
    await clearMilestones();
  });

  await block('an anniversary inside a muted era throws no confetti, and does once unmuted', async () => {
    await clearMilestones();
    const era = await inPage(async (M) => {
      const { journal } = await import(M.journal);
      const { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } = await import(M.days);
      const iso = dateInputValueFromEpochDay(todayEpochDay());
      const day = epochDayFromDateInputValue(`${Number(iso.slice(0, 4)) - 2}${iso.slice(4)}`);
      await journal.milestones.upsertMilestone({ name: 'Hospital', epochDay: day });
      const era = await journal.eras.upsertEra({ name: 'that year', startEpochDay: day - 30, endEpochDay: day + 30 });
      await journal.eraMutes.setEraMuted(era, true);
      return era;
    }, MODULES);
    assert.equal(await celebrationOnToday(), null, 'muted: no celebration');
    await inPage(async ([M, era]) => {
      const { journal } = await import(M.journal);
      await journal.eraMutes.setEraMuted(era, false);
    }, [MODULES, era]);
    assert.match((await celebrationOnToday()) ?? '', /Hospital/, 'unmuted: celebrated');
    await clearMilestones();
  });

  await block('a milestone set not to be celebrated throws no confetti, and does once set again', async () => {
    await clearMilestones();
    const id = await inPage(async (M) => {
      const { journal } = await import(M.journal);
      const { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } = await import(M.days);
      const iso = dateInputValueFromEpochDay(todayEpochDay());
      const day = epochDayFromDateInputValue(`${Number(iso.slice(0, 4)) - 3}${iso.slice(4)}`);
      return journal.milestones.upsertMilestone({ name: 'Came out', epochDay: day, celebrate: false });
    }, MODULES);
    assert.equal(await celebrationOnToday(), null, 'set not to celebrate: no celebration');
    await inPage(async ([M, id]) => {
      const { journal } = await import(M.journal);
      const mi = (await journal.milestones.getMilestones()).find((m) => m.id === id);
      await journal.milestones.upsertMilestone({ id, name: mi.name, epochDay: mi.epochDay, celebrate: true });
    }, [MODULES, id]);
    assert.match((await celebrationOnToday()) ?? '', /Came out/, 'set to celebrate: celebrated');
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
