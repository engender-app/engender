/* Wear session duration keeps what is typed into it (last-audit UI 01).

   The backfill duration field bound its number through a getter that
   handed back a string, so every keystroke after a decimal point or a
   minus sign rewrote the field under the caret: 72.5 hours saved as 572,
   -3 read 3. Typed one key at a time here, the way a person types; `fill`
   sets the whole value at once and never showed it. The reminder hours
   field shares the binding but renders only on Android;
   tests/node/journal/number-field-bindings.test.ts holds that one to the same rule.

   Run: node tests/guards/wear-entry-check.mjs (dev server, no build needed). */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/wear-entry-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const duration = () => page.locator('#wear-duration');
const save = () => page.locator('[data-save-wear-session]');

async function openBackfill() {
  await page.locator('[data-add]').click();
  const backfill = page.locator('[data-segmented="language"] [data-segment="backfill"]');
  await backfill.waitFor();
  if ((await backfill.getAttribute('aria-checked')) !== 'true') await backfill.click();
  await duration().waitFor();
}

async function sessions() {
  return page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return (await bootState.journal.wearSessions.getSessions(0, 999999)).map(({ id, durationMs }) => ({ id, durationMs }));
  });
}

try {
  await page.goto(`${server.resolvedUrls.local[0]}body/wear`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.goto(`${server.resolvedUrls.local[0]}body/wear`, { waitUntil: 'networkidle' });
  }
  await page.evaluate(() => { document.querySelector('.demo-bar').style.display = 'none'; });

  await openBackfill();
  await duration().pressSequentially('-', { delay: 20 });
  assert.equal(await save().isDisabled(), true, 'a lone minus is not a duration yet');
  await duration().pressSequentially('3', { delay: 20 });
  assert.equal(await duration().inputValue(), '-3', 'typing -3 keeps its minus');
  assert.equal(await save().isDisabled(), true, 'a negative duration is still refused');
  await duration().fill('');
  assert.equal(await save().isDisabled(), true, 'an empty duration is refused');
  await page.locator('[data-close-record]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS duration keeps an intermediate minus while typing; empty and negative durations stay refused');

  for (const [typed, durationMs] of [['72.5', 261_000_000], ['0.5', 1_800_000], ['12.75', 45_900_000], ['2', 7_200_000]]) {
    const before = new Set((await sessions()).map(({ id }) => id));
    await openBackfill();
    await duration().pressSequentially(typed, { delay: 20 });
    assert.equal(await duration().inputValue(), typed, `typing ${typed} key by key keeps it`);
    assert.equal(await duration().evaluate((el) => el.validity.valid), true, `${typed} is a valid value for the field itself, not a step mismatch`);
    await save().click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    const added = (await sessions()).filter(({ id }) => !before.has(id));
    assert.deepEqual(added.map((session) => session.durationMs), [durationMs], `${typed} hours saved as ${durationMs}ms`);
    await page.locator(`[data-wear-session="${added[0].id}"]`).click();
    assert.equal(await duration().inputValue(), typed, `${typed} reopens as typed`);
    await page.locator('[data-close-record]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    await page.evaluate(async (id) => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      await bootState.journal.wearSessions.deleteSession(id);
    }, added[0].id);
  }
  console.log('PASS duration typed key by key keeps decimals, is natively valid, saves the hours typed and reopens as typed');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
