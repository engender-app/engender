import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { launchPersistentBrowser } from './browser-harness.mjs';
import { makePdf } from './pdf-fixture.mjs';

const expectLeak = process.argv.includes('--expect-leak');
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const engines = requested.length ? requested : ['chromium', 'firefox'];
const server = await createServer({ cacheDir: '.svelte-kit/journal-field-profile-vite', optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.worker.mjs'] }, server: { port: 0, watch: null },
  plugins: [{ name: 'field-profile-no-watch', configResolved(config) { config.server.watch = null; } }] });
await server.listen();
const base = server.resolvedUrls.local[0];
const previousEngine = process.env.BROWSER_ENGINE;
try {
  for (const engine of engines) for (const field of ['entry', 'tag', 'document']) {
    process.env.BROWSER_ENGINE = engine;
    const profile = await mkdtemp(join(tmpdir(), `engender-field-${engine}-${field}-`));
    const canary = `Journalfield${field}${randomUUID().replaceAll('-', '')}`;
    const canaries = profile + '-canaries.json';
    let context;
    try {
      context = await launchPersistentBrowser(profile, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const version = context.browser()?.version() ?? 'unknown';
      const page = context.pages()[0] ?? await context.newPage();
      page.on('pageerror', (error) => console.error(`${engine}/${field} page error:`, error.message));
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
      async function visit(path) {
        await page.evaluate((path) => {
          const link = document.createElement('a'); link.href = path;
          document.body.append(link); link.click(); link.remove();
        }, path);
        await page.waitForURL((url) => url.pathname === path);
      }
      let selector;
      if (field === 'entry') {
        const today = await page.evaluate(async () => (await import('/src/lib/data/epochDay.ts')).todayEpochDay());
        await visit(`/entry/new/${today}`);
        selector = '#ed-note';
      } else if (field === 'tag') {
        await visit('/settings/tags');
        await page.locator('[data-disclosure-toggle]', { hasText: 'Emotions' }).first().click();
        await page.locator('[data-add-tag]').first().click();
        selector = '#newtag-input';
      } else {
        await visit('/media/documents');
        await page.locator('[data-documents-present-reading]').waitFor();
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-add]').click()]);
        await chooser.setFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf(['Field privacy fixture'])) });
        selector = '#document-title';
      }
      await page.locator(selector).waitFor();
      await page.locator(selector).fill('');
      await page.locator(selector).pressSequentially(canary, { delay: 5 });
      assert.equal(await page.locator(selector).inputValue(), canary);
      const autocomplete = await page.locator(selector).getAttribute('autocomplete');
      await page.waitForTimeout(1500); // Firefox's session serializer observes the typed field before shutdown.
      await context.close(); context = null;
      // Keep canaries outside the scanned profile so the scanner cannot find its own input.
      await writeFile(canaries + '.outside', JSON.stringify({ [field]: canary }));
      const output = execFileSync('python3', ['-I', '-B', resolve('tests/profile-canaries.py'), canaries + '.outside', profile], { encoding: 'utf8' });
      const lines = output.trim().split('\n').map((line) => JSON.parse(line));
      assert.ok(!lines.some((line) => line.error), 'profile scanner must not silently skip files');
      const summary = lines.find((line) => line.summary)?.summary;
      assert.ok(summary && Object.hasOwn(summary, field), 'scanner summary exists');
      const scanned = lines.find((line) => line.summary);
      assert.ok(scanned.files > 0 && scanned.bytes > 0, 'a profile scan cannot pass without reading files');
      // The scanner input is a sibling file, not inside the profile.
      assert.equal(expectLeak ? summary[field] > 0 : summary[field] === 0, true,
        `${engine}/${field}: expected ${expectLeak ? 'baseline leak' : 'no plaintext'}, got ${summary[field]} hits`);
      if (!expectLeak) assert.equal(autocomplete, 'off');
      console.log(`PASS ${engine} ${version}/${field}: autocomplete=${autocomplete}, closed-profile files=${scanned.files}, hits=${summary[field]}, ${expectLeak ? 'baseline leak detected' : 'protected'}`);
    } finally {
      await context?.close();
      await rm(canaries + '.outside', { force: true });
      await rm(profile, { recursive: true, force: true });
    }
  }
} finally {
  if (previousEngine === undefined) delete process.env.BROWSER_ENGINE;
  else process.env.BROWSER_ENGINE = previousEngine;
  await server.close();
}
