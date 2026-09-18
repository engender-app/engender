import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

export async function verifyCareSpineLinks() {
  const server = await createServer({
    server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
  });
  await server.listen();
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  async function visit(href) {
    await page.evaluate((targetHref) => {
      const link = document.createElement('a');
      link.href = targetHref;
      link.id = 'care-test-link';
      link.textContent = 'Go';
      document.querySelector('#care-test-link')?.remove();
      document.body.append(link);
    }, href);
    await page.locator('#care-test-link').click();
    await page.evaluate(() => document.querySelector('#care-test-link')?.remove());
  }

  try {
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
    }

    // Seed test data: 3 concurrent regimens, doses, and a lab result
    const fixture = await page.evaluate(async () => {
      const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
      const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
      const today = todayEpochDay();

      // Regimen 1: Estradiol (started 100 days ago, last dose 5 days ago, daily)
      const estradiolEpisodeId = await j.regimen.upsertEpisode({
        drug: 'Estradiol',
        ester: 'Valerate',
        dose: 2,
        doseUnit: 'mg',
        route: 'oral',
        interval: 'daily',
        startEpochDay: today - 100,
        endEpochDay: null,
        endReason: null
      });
      await j.doses.upsertSchedule({
        episodeId: estradiolEpisodeId,
        recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay: 1,
        doseAmounts: [{ dose: 2, doseUnit: 'mg' }],
        autoLogFromEpochDay: null
      });
      const estradiolDoseId = await j.doses.upsertDose({
        drug: 'Estradiol',
        timestamp: startOfDayTimestamp(today - 5) + 36000000,
        route: 'oral',
        dose: 2,
        doseUnit: 'mg',
        status: 'taken'
      });

      // Old dose for Estradiol: 120 days ago (prior to current 90-day window)
      const oldDoseId = await j.doses.upsertDose({
        drug: 'Estradiol',
        timestamp: startOfDayTimestamp(today - 120) + 36000000,
        route: 'oral',
        dose: 2,
        doseUnit: 'mg',
        status: 'taken'
      });

      // Regimen 2: Progesterone (started 50 days ago, last dose 2 days ago, daily)
      const progesteroneEpisodeId = await j.regimen.upsertEpisode({
        drug: 'Progesterone',
        ester: null,
        dose: 100,
        doseUnit: 'mg',
        route: 'oral',
        interval: 'daily',
        startEpochDay: today - 50,
        endEpochDay: null,
        endReason: null
      });
      await j.doses.upsertSchedule({
        episodeId: progesteroneEpisodeId,
        recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay: 1,
        doseAmounts: [{ dose: 100, doseUnit: 'mg' }],
        autoLogFromEpochDay: null
      });
      const progesteroneDoseId = await j.doses.upsertDose({
        drug: 'Progesterone',
        timestamp: startOfDayTimestamp(today - 2) + 36000000,
        route: 'oral',
        dose: 100,
        doseUnit: 'mg',
        status: 'taken'
      });

      // Regimen 3: Sertraline (started 30 days ago, last dose 1 day ago, daily)
      const sertralineEpisodeId = await j.regimen.upsertEpisode({
        drug: 'Sertraline',
        ester: null,
        dose: 50,
        doseUnit: 'mg',
        route: 'oral',
        interval: 'daily',
        startEpochDay: today - 30,
        endEpochDay: null,
        endReason: null
      });
      await j.doses.upsertSchedule({
        episodeId: sertralineEpisodeId,
        recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay: 1,
        doseAmounts: [{ dose: 50, doseUnit: 'mg' }],
        autoLogFromEpochDay: null
      });
      const sertralineDoseId = await j.doses.upsertDose({
        drug: 'Sertraline',
        timestamp: startOfDayTimestamp(today - 1) + 36000000,
        route: 'oral',
        dose: 50,
        doseUnit: 'mg',
        status: 'taken'
      });

      // Lab result: Estradiol 150 pg/mL on today - 15
      const labId = await j.labs.upsertResult({
        analyte: 'Estradiol',
        epochDay: today - 15,
        time: '09:00',
        value: 150,
        unit: 'pg/mL'
      });

      return {
        today,
        estradiolDoseId,
        oldDoseId,
        progesteroneDoseId,
        sertralineDoseId,
        labId
      };
    });

    // 1. Visit /care and verify 3 lanes
    await visit('/care');
    await page.waitForSelector('[data-care-rail]');
    const lanes = page.locator('.care-lane');
    assert.equal(await lanes.count(), 3, '3 lanes rendered for 3 concurrent regimens');

    const estradiolLane = page.locator('#care-lane-Estradiol');
    const progesteroneLane = page.locator('#care-lane-Progesterone');
    const sertralineLane = page.locator('#care-lane-Sertraline');
    assert.equal(await estradiolLane.count(), 1, 'Estradiol lane exists');
    assert.equal(await progesteroneLane.count(), 1, 'Progesterone lane exists');
    assert.equal(await sertralineLane.count(), 1, 'Sertraline lane exists');

    // 2. Test lastDose mark on Estradiol lane:
    // Tapping it opens recorded dose in /care/doses with target highlight.
    // Must NOT open the new-dose editor modal (historical marks never read as recommended dose).
    const estradiolLastDoseMark = estradiolLane.locator('a.care-mark[data-care-mark="lastDose"]');
    assert.equal(await estradiolLastDoseMark.count(), 1, 'Estradiol has lastDose mark');
    await estradiolLastDoseMark.click();
    await page.waitForURL('**/care/doses**');

    // Verify URL carries drug and dose
    const dosesUrl = new URL(page.url());
    assert.equal(dosesUrl.searchParams.get('drug'), 'Estradiol');
    assert.equal(dosesUrl.searchParams.get('lane'), 'Estradiol');
    assert.equal(dosesUrl.searchParams.get('dose'), fixture.estradiolDoseId);

    // Verify target dose row is highlighted
    const targetDose = page.locator(`.rows-divide.is-target-dose [data-dose="${fixture.estradiolDoseId}"]`);
    await targetDose.waitFor({ timeout: 5000 });

    // Verify add modal is NOT open
    assert.equal(await page.locator('[data-record-sheet]').count(), 0, 'new dose modal not open');

    // Tap Back, verify return to /care with source lane preserved
    await page.locator('[data-screen-back]').click();
    await page.waitForURL('**/care**');
    assert.equal(await estradiolLane.evaluate((el) => el.classList.contains('is-source-lane')), true, 'source lane highlighted');

    // 3. Test nextDose mark on Progesterone lane:
    // Tapping nextDose opens schedule view for that specific drug and slot date.
    const progNextDoseMark = progesteroneLane.locator('a.care-mark[data-care-mark="nextDose"]');
    assert.equal(await progNextDoseMark.count(), 1, 'Progesterone has nextDose mark');
    await progNextDoseMark.click();
    await page.waitForURL('**/care/doses**');

    const schedUrl = new URL(page.url());
    assert.equal(schedUrl.searchParams.get('view'), 'schedule');
    assert.equal(schedUrl.searchParams.get('drug'), 'Progesterone');
    assert.equal(schedUrl.searchParams.get('lane'), 'Progesterone');

    // Verify schedule view shows Progesterone
    await page.waitForSelector('[data-slot]');
    const targetSlot = page.locator('.rows-divide.is-target-slot');
    assert.equal(await targetSlot.count(), 1, 'target slot row is highlighted');

    // Tap Back, verify return to /care with Progesterone lane highlighted
    await page.locator('[data-screen-back]').click();
    await page.waitForURL('**/care**');
    assert.equal(await progesteroneLane.evaluate((el) => el.classList.contains('is-source-lane')), true, 'Progesterone source lane highlighted');

    // 4. Test labDraw mark on shared head:
    // Tapping lab mark opens /care/labs with analyte set to Estradiol and row highlighted.
    const labMark = page.locator('.care-head a.care-mark[data-care-mark="labDraw"]');
    assert.equal(await labMark.count(), 1, 'Head has labDraw mark');
    await labMark.click();
    await page.waitForURL('**/care/labs**');

    const labsUrl = new URL(page.url());
    assert.equal(labsUrl.searchParams.get('lab'), fixture.labId);
    assert.equal(labsUrl.searchParams.get('returnTo'), '/care');

    // Verify target lab row highlighted
    const targetLab = page.locator(`button.kit-row.is-target-lab[data-lab-result="${fixture.labId}"]`);
    await targetLab.waitFor({ timeout: 5000 });

    // Tap Back, verify return to /care
    await page.locator('[data-screen-back]').click();
    await page.waitForURL('**/care**');

    // 5. Test window expansion for historical dose older than 90 days:
    await visit(`/care/doses?date=${fixture.today - 120}&dose=${fixture.oldDoseId}&drug=Estradiol`);
    const oldTargetDose = page.locator(`.rows-divide.is-target-dose [data-dose="${fixture.oldDoseId}"]`);
    await oldTargetDose.waitFor({ timeout: 5000 });
    assert.equal(await oldTargetDose.count(), 1, 'old dose revealed and highlighted after window expansion');

    // 6. Test missing / deleted facts produce explicit unavailable state:
    // 6a: Deleted/non-existent dose in log view
    await visit('/care/doses?date=20000&drug=Estradiol&dose=00000000-0000-0000-0000-000000000000');
    await page.waitForSelector('[data-dose-unavailable]');
    assert.equal(await page.locator('[data-dose-unavailable]').count(), 1, 'data-dose-unavailable shown');

    // 6b: Unavailable slot date in schedule view
    await visit('/care/doses?view=schedule&date=10000&drug=Estradiol');
    await page.waitForSelector('[data-slot-unavailable]');
    assert.equal(await page.locator('[data-slot-unavailable]').count(), 1, 'data-slot-unavailable shown');

    // 6c: Deleted/non-existent lab in labs view
    await visit('/care/labs?date=20000&lab=00000000-0000-0000-0000-000000000000');
    await page.waitForSelector('[data-lab-unavailable]');
    assert.equal(await page.locator('[data-lab-unavailable]').count(), 1, 'data-lab-unavailable shown');

    assert.equal(errors.length, 0, `errors: ${errors.join(', ')}`);
    console.log('PASS Care spine links: concurrent regimens, facts, window expansion, return navigation, and unavailable states');
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('care-spine-links.mjs')) {
  verifyCareSpineLinks().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
