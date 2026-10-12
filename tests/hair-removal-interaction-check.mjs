import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium, settlePage, screencast, fillDate } from './browser-harness.mjs';
import { saveSceneCast } from './yank-sweep-core.mjs';

const out = '.claude/hair-removal-interaction-shots';
await mkdir(out, { recursive: true });
const server = await createServer({
  cacheDir: '.svelte-kit/hair-removal-interaction-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const errors = [];
const results = [];

async function navigate(page, path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}

async function settled(page) {
  await page.waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === 'running'));
}

const sessions = (page) => page.evaluate(async () => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  return journal.hairRemoval.getSessions();
});

try {
  for (const theme of ['light', 'dark']) for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    const profile = `${theme}-${reducedMotion}`;
    try {
      await settlePage(page, server.resolvedUrls.local[0], 'body/hair-removal', theme);
      assert.equal(await page.locator('html').getAttribute('data-a11y-motion'),
        reducedMotion === 'reduce' ? 'reduce' : 'normal', 'the motion mode reaches the app');
      const toggle = page.locator('[data-hair-removal-areas] [data-disclosure-toggle]');
      const scroll = page.locator('[data-app-scroll-region]');
      assert.equal((await sessions(page)).length, 0);
      await toggle.click();
      await page.locator('[data-recency="chin"]').click();
      assert.equal(await page.locator('#hair-removal-area').inputValue(), 'chin');
      await page.locator('#hair-removal-provider').fill('Hair removal continuity fixture');
      const past = new Date();
      past.setDate(past.getDate() - 10);
      await fillDate(page, '#hair-removal-date', `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`);
      await page.locator('[data-save-hair-removal-session]').click();
      await page.locator('[data-sheet]').waitFor({ state: 'detached' });
      await settled(page);
      const saved = await sessions(page);
      assert.equal(saved.length, 1, 'the first session saves once');
      assert.equal(saved[0].area, 'chin');
      assert.equal(saved[0].provider, 'Hair removal continuity fixture');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'save retains expanded regions');
      assert.match(await page.locator('[data-recency="chin"]').innerText(), /10 days/);
      await page.screenshot({ path: `${out}/${profile}-saved-expanded.png` });

      const legs = page.locator('[data-recency="legs"]');
      await legs.scrollIntoViewIfNeeded();
      const beforeScroll = await scroll.evaluate((el) => el.scrollTop);
      assert.ok(beforeScroll > 0, 'Back starts from a scrolled area');
      await legs.click();
      assert.equal(await page.locator('#hair-removal-area').inputValue(), 'legs');
      await settled(page);
      await page.keyboard.press('Escape');
      await page.locator('[data-sheet]').waitFor({ state: 'detached' });
      assert.equal(await scroll.evaluate((el) => el.scrollTop), beforeScroll, 'Back restores the area position');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal((await sessions(page)).length, 1, 'Back does not store an untouched draft');
      assert.equal(await legs.evaluate((el) => el === document.activeElement), true);
      await page.screenshot({ path: `${out}/${profile}-back-expanded.png` });

      await legs.click();
      await page.locator('[data-save-hair-removal-session]').click();
      await page.locator('[data-sheet]').waitFor({ state: 'detached' });
      await settled(page);
      const populated = await sessions(page);
      assert.equal(populated.length, 2, 'a populated journal stores one additional session');
      assert.ok(populated.some((session) => session.id === saved[0].id), 'the previous week remains stored');
      const added = populated.find((session) => session.id !== saved[0].id);
      assert.equal(added.area, 'legs');
      await page.locator(`[data-hair-removal-session="${added.id}"]`).waitFor();
      assert.equal(await page.locator(`[data-hair-removal-session="${saved[0].id}"]`).count(), 0, 'the latest week follows the newly saved session');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await page.screenshot({ path: `${out}/${profile}-populated-save.png` });

      await scroll.evaluate((el) => { el.scrollTop = 0; });
      await settled(page);
      const interrupted = await screencast(page, async (cast) => {
        await page.locator('[data-add]').click();
        await page.locator('[data-sheet]').waitFor();
        await page.waitForTimeout(40);
        await navigate(page, '/more');
        await page.locator('[data-sheet]').waitFor({ state: 'detached' });
        await settled(page);
        return cast;
      });
      const navigationEvidence = await saveSceneCast(interrupted, out, 'interrupted-navigation', profile);
      assert.equal(await page.locator('[data-hair-removal-session], [data-recency]').count(), 0);
      await navigate(page, '/body/hair-removal');
      await page.locator(`[data-hair-removal-session="${added.id}"]`).waitFor();
      assert.equal((await sessions(page)).length, 2, 'interrupted navigation preserves the saved session');
      await settled(page);

      const gated = await screencast(page, async (cast) => {
        await page.locator('[data-add]').click();
        await page.locator('[data-sheet]').waitFor();
        await page.locator('#hair-removal-provider').fill('Retained recovery draft');
        await page.waitForTimeout(40);
        const samples = await page.evaluate(async () => {
          const { browserSession } = await import('/src/lib/stores/boot.svelte.ts');
          browserSession.recovering = true;
          const samples = [];
          const start = performance.now();
          await new Promise((resolve) => {
            const tick = () => {
              samples.push({ ms: performance.now() - start,
                rootInert: document.querySelector('[data-app-root]').inert,
                rootVisibility: getComputedStyle(document.querySelector('[data-app-root]')).visibility,
                rootOpacity: getComputedStyle(document.querySelector('[data-app-root]')).opacity,
                rootStyle: document.querySelector('[data-app-root]').getAttribute('style'),
                rootTransition: getComputedStyle(document.querySelector('[data-app-root]')).transition,
                journalVisible: [...document.querySelectorAll('[data-sheet], [data-recency], [data-hair-removal-session]')]
                  .some((node) => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) });
              if (performance.now() - start < 450) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          return samples;
        });
        await scroll.waitFor({ state: 'hidden' });
        return { cast, samples };
      });
      const gateEvidence = await saveSceneCast(gated.cast, out, 'recovery-gate', profile);
      await writeFile(`${out}/${profile}-gate-samples.json`, JSON.stringify(gated.samples, null, 2));
      assert.ok(gated.samples.length > 1, 'the recovery gate is sampled across frames');
      assert.equal(gated.samples.some((sample) => sample.journalVisible), false, 'the gate hides content from its first frame');
      assert.equal(await page.locator('[data-nav-item]').count(), 0, 'the recovery gate hides navigation');
      assert.equal(await page.locator('[data-sheet], [data-recency], [data-hair-removal-session]')
        .evaluateAll((nodes) => nodes.some((node) => node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))), false,
      'no journal or editor content is visible over the recovery gate');
      await page.screenshot({ path: `${out}/${profile}-recovery-gate.png` });
      await page.evaluate(async () => {
        const { browserSession } = await import('/src/lib/stores/boot.svelte.ts');
        browserSession.recovering = false;
      });
      await scroll.waitFor({ state: 'visible' });
      await page.locator('[data-sheet]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#hair-removal-provider').inputValue(), 'Retained recovery draft', 'recovery retains unsaved form state');
      assert.equal((await sessions(page)).length, 2, 'recovery does not save the draft');
      assert.equal(await page.locator('[data-app-root]').evaluate((node) => node.inert), false, 'recovery releases the app');
      assert.equal(await page.locator('[data-app-root]').evaluate((node) => getComputedStyle(node).opacity), '1', 'recovery restores opacity without a transition');
      await page.screenshot({ path: `${out}/${profile}-recovery-restored.png` });
      results.push({ theme, reducedMotion, saved: [saved[0].id, added.id], beforeScroll, navigationEvidence, gateEvidence, gateSamples: gated.samples });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS hair-removal save, expanded regions, Back, interrupted navigation and recovery gate in both themes and motion modes');
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  await server.close();
}
