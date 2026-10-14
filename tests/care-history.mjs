import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { launchPersistentBrowser } from './browser-harness.mjs';

// Closed profiles expose history and session files that an incognito context cannot test.
async function profileHits(profile, canary) {
  const needles = [canary, encodeURIComponent(canary), canary.replaceAll(' ', '+')]
    .flatMap((value) => [Buffer.from(value), Buffer.from(value, 'utf16le')]);
  const overlap = Math.max(...needles.map((needle) => needle.length));
  const hits = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        let tail = Buffer.alloc(0);
        for await (const chunk of createReadStream(path)) {
          const bytes = Buffer.concat([tail, chunk]);
          if (needles.some((needle) => bytes.includes(needle))) {
            hits.push(path.slice(profile.length + 1));
            break;
          }
          tail = bytes.subarray(-overlap);
        }
      }
    }
  }
  await walk(profile);
  return hits;
}

const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox'];
const server = await createServer({
  server: { port: 0, watch: null },
  plugins: [{ name: 'care-history-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const base = server.resolvedUrls.local[0];
const previousEngine = process.env.BROWSER_ENGINE;
try {
  for (const engine of engines) {
    process.env.BROWSER_ENGINE = engine;
    const canary = `Care history canary ${randomUUID()}`;
    const profile = await mkdtemp(join(tmpdir(), `engender-care-history-${engine}-`));
    let context;
    try {
      context = await launchPersistentBrowser(profile, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const version = context.browser()?.version() ?? 'unknown';
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
      const fixture = await page.evaluate(async (drug) => {
        const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
        const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.theme = 'dark';
        const today = todayEpochDay();
        const episodeId = await j.regimen.upsertEpisode({ drug, ester: null, dose: 100, doseUnit: 'mcg',
          route: 'patch', interval: 'weekly', startEpochDay: today - 14, endEpochDay: null, endReason: null });
        await j.doses.upsertSchedule({ episodeId, recurrence: { kind: 'everyNDays', everyNDays: 7 },
          dosesPerDay: 1, doseAmounts: [{ dose: 100, doseUnit: 'mcg' }], autoLogFromEpochDay: null });
        const doseId = await j.doses.upsertDose({ drug, timestamp: startOfDayTimestamp(today - 1) + 12 * 3600000,
          route: 'patch', dose: 100, doseUnit: 'mcg', applicationSite: 'abdomen' });
        const labId = await j.labs.upsertResult({ analyte: 'Estradiol', epochDay: today - 2, time: '09:00', value: 150, unit: 'pg/mL' });
        return { episodeId, doseId, labId, today };
      }, canary);
      // Use an ordinary app link rather than constructing a medication URL in the probe.
      await page.evaluate(() => {
        const link = document.createElement('a'); link.href = '/care'; link.id = 'care-history-entry';
        link.textContent = 'Care'; document.body.append(link);
      });
      await page.locator('#care-history-entry').click();
      await page.waitForSelector('[data-care-rail]');
      const lane = page.locator(`[data-care-lane="${canary}"]`);
      const assertPrivateUrl = () => {
        const url = new URL(page.url());
        assert.equal(url.searchParams.has('drug'), false);
        assert.equal(url.searchParams.has('lane'), false);
        assert.equal(decodeURIComponent(url.href).includes(canary), false);
      };
      await lane.locator('a[data-care-mark="lastDose"]').click();
      await page.waitForURL('**/care/doses**');
      assertPrivateUrl();
      assert.equal(new URL(page.url()).searchParams.get('episode'), fixture.episodeId);
      await page.locator(`[data-dose-target] [data-dose="${fixture.doseId}"]`).waitFor();
      await page.locator('[data-screen-back]').click();
      await page.locator(`[data-care-lane="${canary}"].is-source-lane`).waitFor();
      await lane.locator('a[data-care-mark="nextDose"]').click();
      await page.waitForURL('**/care/doses**');
      assertPrivateUrl();
      assert.equal(new URL(page.url()).searchParams.get('date'), String(fixture.today + 7));
      await page.locator('.screen-part p', { hasText: canary }).waitFor();
      await page.locator('[data-screen-back]').click();
      await page.locator(`[data-care-lane="${canary}"].is-source-lane`).waitFor();
      await page.locator(`[data-care-log="${canary}"]`).click();
      await page.locator('[data-close-record]').waitFor();
      await page.waitForURL((url) => url.pathname === '/care/doses' && !url.searchParams.has('add'));
      assertPrivateUrl();
      assert.ok((await page.locator('[data-sheet]').last().textContent()).includes(canary), 'Log keeps the chosen drug in the editor');
      await page.locator('[data-close-record]').click();
      await page.locator('[data-screen-back]').click();
      await page.locator(`[data-care-lane="${canary}"].is-source-lane`).waitFor();
      await page.locator('.care-head a[data-care-mark="labDraw"]').click();
      await page.waitForURL('**/care/labs**');
      assertPrivateUrl();
      await page.locator(`[data-lab-result="${fixture.labId}"].is-target-lab`).waitFor();
      const backHref = await page.locator('[data-screen-back]').getAttribute('href');
      assert.equal(new URL(backHref, base).searchParams.get('date'), String(fixture.today - 2));
      await page.locator('[data-screen-back]').click();
      await page.waitForSelector('[data-care-rail]');
      assertPrivateUrl();
      assert.deepEqual(errors, []);
      await context.close(); context = null;
      assert.deepEqual(await profileHits(profile, canary), [], `${engine}: journal text survived in the closed browser profile`);
      console.log(`PASS ${engine} ${version}: real Care marks, Log and Back preserve context; closed profile contains no canary`);
    } finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }

    // Positive control uses the former URL shape, proving the profile scan detects the original leak.
    const control = await mkdtemp(join(tmpdir(), `engender-care-history-control-${engine}-`));
    let controlContext;
    try {
      controlContext = await launchPersistentBrowser(control);
      const page = await controlContext.newPage();
      await page.route('http://engender.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>History control</title>' }));
      await page.goto('http://engender.test/care');
      await page.evaluate((drug) => history.pushState({}, '', `/care/doses?add=1&drug=${encodeURIComponent(drug)}`), canary);
      await page.goto('http://engender.test/more');
      await controlContext.close(); controlContext = null;
      const hits = await profileHits(control, canary);
      assert.ok(hits.length > 0, `${engine}: profile control did not detect the former drug URL`);
      console.log(`PASS ${engine}: former URL positive control detected in ${hits.length} profile file(s)`);
    } finally {
      await controlContext?.close();
      await rm(control, { recursive: true, force: true });
    }
  }
} finally {
  if (previousEngine === undefined) delete process.env.BROWSER_ENGINE;
  else process.env.BROWSER_ENGINE = previousEngine;
  await server.close();
}
