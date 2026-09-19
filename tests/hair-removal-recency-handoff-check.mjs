/* The recency rows lead to their own area (pre-production UI/UX ticket 28).
   Real-browser half of the ticket's verification: the node tier reads the
   contract off the source (tests/hair-removal-recency-handoff.test.ts,
   ADR-0016); this one proves the three acceptance behaviours on the real
   screen - two areas with different histories open their own prefilled
   context, nothing saves until Save, and closing returns to the overview
   where it was. The custom-area fixture is rejected at the data seam: the
   closed vocabulary is the rule an imported key meets, so no custom row can
   ever join the overview.

   Run: node tests/hair-removal-recency-handoff-check.mjs
   (a throwaway dev server; screenshots land in
   .claude/hair-removal-recency-shots, gitignored). */

import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const outDir = '.claude/hair-removal-recency-shots';
await mkdir(outDir, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/hair-removal-recency-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce'
});
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

const count = () => page.evaluate(async () => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  return (await journal.hairRemoval.getSessions()).length;
});

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  // Fixture: two areas with different histories, one never used.
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const day = 24 * 60 * 60 * 1000;
    const today = Math.floor(Date.now() / day);
    await journal.hairRemoval.upsertSession({
      epochDay: today - 3, area: 'chin', method: 'laser', painRating: 2, cost: '', provider: 'Clinic A'
    });
    await journal.hairRemoval.upsertSession({
      epochDay: today - 30, area: 'legs', method: 'electrolysis', painRating: 4, cost: '', provider: ''
    });
  });
  assert.equal(await count(), 2, 'fixture seeded two sessions');

  // Custom-area fixture: the closed vocabulary rejects it at the data seam,
  // so the overview can never grow a row the current build cannot name.
  const rejection = await page.evaluate(async () => {
    try {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const day = 24 * 60 * 60 * 1000;
      const today = Math.floor(Date.now() / day);
      await journal.hairRemoval.upsertSession({
        epochDay: today - 1, area: 'nape_custom', method: 'laser', painRating: 1, cost: '', provider: ''
      });
      return null;
    } catch (err) {
      return String(err?.message ?? err);
    }
  });
  assert.match(rejection ?? '', /invalid hair-removal area/, 'a custom area key is rejected by the closed vocabulary');
  assert.equal(await count(), 2, 'the rejected custom area stored nothing');

  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/body/hair-removal';
    link.id = 'recency-test-link';
    link.textContent = 'Open';
    document.body.append(link);
  });
  await page.locator('#recency-test-link').click();
  await page.evaluate(() => document.querySelector('#recency-test-link')?.remove());
  await page.waitForURL((url) => url.pathname === '/body/hair-removal');
  await page.waitForSelector('[data-recency="chin"]');

  // The all-area overview is retained: one row per closed-vocabulary area,
  // and the untouched area still says nothing is logged.
  assert.equal(await page.locator('[data-recency]').count(), 10, 'all ten areas keep their recency row');
  assert.match(
    await page.locator('[data-recency="upper_lip"]').innerText(),
    /no sessions logged/i,
    'a never-used area keeps its no-sessions line'
  );

  // Area history, own context: the chin row opens the add-session form with
  // chin chosen, not chin's old session and not another area.
  await page.locator('[data-recency="chin"]').click();
  await page.waitForSelector('#hair-removal-area');
  assert.equal(await page.locator('#hair-removal-area').inputValue(), 'chin', 'the chin row prefills chin');
  await page.screenshot({ path: `${outDir}/01-chin-prefilled.png` });
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('#hair-removal-area', { state: 'detached' });

  // Nothing saved by opening and dismissing.
  assert.equal(await count(), 2, 'opening a recency row stores nothing');

  // Same proof on the second history, in the same overview position.
  await page.evaluate(() => window.scrollBy(0, 40));
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('[data-recency="legs"]').click();
  await page.waitForSelector('#hair-removal-area');
  assert.equal(await page.locator('#hair-removal-area').inputValue(), 'legs', 'the legs row prefills legs');
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('#hair-removal-area', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.scrollY), before, 'closing returns to the overview where it was');

  // Prefilled session: the save lands only when the person confirms it.
  await page.locator('[data-recency="chin"]').click();
  await page.waitForSelector('#hair-removal-area');
  await page.locator('#hair-removal-provider').fill('Clinic B');
  await page.screenshot({ path: `${outDir}/02-chin-before-save.png` });
  await page.locator('[data-save-hair-removal-session]').click();
  await page.waitForSelector('#hair-removal-area', { state: 'detached' });
  assert.equal(await count(), 3, 'the session saved once the person confirmed it');

  await page.screenshot({ path: `${outDir}/03-overview-after-save.png` });

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS hair-removal recency area handoff real-browser check');
} finally {
  await browser.close();
  await server.close();
}
