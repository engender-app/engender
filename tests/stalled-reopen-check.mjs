import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { createReporter, launchBrowser, newCapabilityContext } from './browser-harness.mjs';

const server = await createServer({
  server: { port: 0, watch: null, fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
  plugins: [{ name: 'reopen-no-watch', configResolved(config) { config.server.watch = null; } }]
});
await server.listen();
const browser = await launchBrowser();
const { block, ok, finish } = createReporter();
const visibility = (page, value) => page.evaluate(value => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, value);
async function unlock(page) {
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
}

try {
  for (const phase of ['compatibility', 'preferences', 'reference']) {
    await block(`cancel stalled ${phase} preparation`, 5, async () => {
      const context = await newCapabilityContext(browser);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
        if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
        await page.evaluate(async () => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          prefs.lockAfter = 'immediately';
          const groups = await journal.tags.getTagGroups();
          await journal.tags.addTag(groups[0].key, 'Synthetic reopen fixture');
        });
        await visibility(page, 'hidden');
        await page.waitForSelector('[data-applock]');
        await visibility(page, 'visible');
        await page.evaluate(phase => {
          const post = Worker.prototype.postMessage;
          const terminate = Worker.prototype.terminate;
          Worker.prototype.terminate = function (...args) {
            if (this === window.heldOpeningWorker) window.openingDisposed = true;
            return terminate.apply(this, args);
          };
          Worker.prototype.postMessage = function (message, ...args) {
            const sql = message.args?.sql ?? '';
            const matches = phase === 'compatibility' ? sql === 'PRAGMA user_version'
              : phase === 'preferences' ? sql === 'SELECT key, value FROM pref'
                : sql.includes('FROM gender_dimension ORDER BY id');
            if (message.op === 'query' && matches) {
              Worker.prototype.postMessage = post;
              window.heldOpeningWorker = this;
              const receive = this.onmessage;
              this.onmessage = event => {
                if (event.data.id !== message.id) return receive.call(this, event);
                this.onmessage = receive;
                window.openingReplyHeld = event.data.ok;
                window.releaseOpeningReply = () => receive.call(this, event);
              };
            }
            return post.call(this, message, ...args);
          };
        }, phase);
        await unlock(page);
        await page.waitForFunction(() => window.openingReplyHeld === true);
        ok('held a successful reply from the real private database');
        await visibility(page, 'hidden');
        await page.waitForFunction(() => window.openingDisposed === true, undefined, { timeout: 7500 });
        await page.waitForFunction(() => document.querySelector('[data-session-submit]')?.disabled === false);
        assert.equal(await page.locator('[data-applock]').count(), 1);
        const published = await page.evaluate(async () => {
          const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
          return !!bootState.journal;
        });
        assert.equal(published, false);
        ok('the later lock disposes the opening worker and settles the cancelled form');
        await visibility(page, 'visible');
        await unlock(page);
        await page.waitForSelector('[data-applock]', { state: 'detached', timeout: 30000 });
        const recovered = await page.evaluate(async () => {
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          return (await journal.tags.getTagGroups()).flatMap(group => group.tags).some(tag => tag.label === 'Synthetic reopen fixture');
        });
        assert.equal(recovered, true);
        ok('fresh authentication recovers the committed journal without a reload');
        await page.evaluate(() => window.releaseOpeningReply());
        const afterLateReply = await page.evaluate(async () => {
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          const { prefs, flushPreferences } = await import('/src/lib/data/prefs/store.svelte.ts');
          const groups = await journal.tags.getTagGroups();
          await journal.tags.addTag(groups[0].key, 'Synthetic write after late reply');
          prefs.lockAfter = 'immediately';
          await flushPreferences();
          return (await journal.tags.getTagGroups()).flatMap(group => group.tags).some(tag => tag.label === 'Synthetic write after late reply');
        });
        assert.equal(afterLateReply, true);
        assert.equal(await page.locator('[data-applock]').count(), 0);
        ok('a late old reply cannot clear the newer session or prevent writes');
        assert.deepEqual(errors, []);
        ok('no uncaught errors escape cancellation or retry');
      } finally { await context.close(); }
    });
  }
} finally { await browser.close(); await server.close(); }
finish('Stalled reopen regression passed');
