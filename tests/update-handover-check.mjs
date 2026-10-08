import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchChromium, createReporter } from './browser-harness.mjs';

const server = await createServer({ configFile: 'tests/update-handover/vite.config.ts', server: { port: 0 } });
await server.listen();
const base = `http://localhost:${server.httpServer.address().port}`;
const browser = await launchChromium();
const { block, ok, finish } = createReporter();

try {
  await block('cold schema refusal discovers a waiting release', 3, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    try {
      await page.goto(`${base}/recovery.html?seed`);
      await page.waitForSelector('body[data-ready="true"]', { state: 'attached' });
      await page.evaluate(() => window.recoverySeed.offer());
      await page.goto(`${base}/recovery.html`);
      await page.waitForSelector('[data-schema-too-new]');
      const before = await page.evaluate(() => window.recovery.state());
      assert.equal(before.status, 'schema-too-new');
      assert.equal(before.statuses.includes('ready'), false);
      assert.equal(before.statuses.includes('needs-setup'), false);
      assert.equal(before.registerCalls, 0);
      assert.equal(before.updateReady, false);
      assert.equal(before.waiting, true);
      assert.equal(before.journalReads, 0);
      ok('cold refusal leaves registration unwatched and journal unread');
      const reloaded = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 10000 });
      await page.locator('[data-look-for-newer]').click();
      await reloaded;
      await page.waitForSelector('body[data-ready="true"]');
      const checkpoint = await page.evaluate(() => window.recovery.checkpoint());
      assert.equal(checkpoint.registerCalls, 1);
      assert.equal(checkpoint.takeovers, 1);
      ok('explicit recovery acquires registration and real worker takes over');
      assert.equal(checkpoint.status, 'schema-too-new');
      assert.equal(checkpoint.journalReads, 0);
      ok('handover reloads without reading incompatible journal');
    } finally {
      await context.close();
    }
  });
  for (const ordering of ['takeover', 'timeout']) {
    for (const fails of [false, true]) {
      const label = `${ordering}: ${fails ? 'failure recovery' : 'saved entry survives reload'}`;
      await block(label, fails ? 6 : 5, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
    page.setDefaultTimeout(10000);
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error('Probe error:', error.message); });
        try {
          await page.goto(base);
          await page.waitForSelector('body[data-ready="true"]');
          await page.evaluate(() => window.handover.offer());
          await page.evaluate(() => window.handover.apply());
          await page.evaluate(fails => window.handover.hold(fails), fails);
          await page.locator('#draft').fill('Handover entry');
          await page.locator('#save').click();
          await page.waitForSelector('body[data-write-held="true"]');
          if (ordering === 'takeover') {
            await page.request.get(`${base}/activation-release`);
            await page.waitForFunction(() => window.handover.state().takeovers === 1);
          } else {
            await page.waitForTimeout(5200);
            assert.equal((await page.evaluate(() => window.handover.state())).takeovers, 0);
          }
          assert.equal((await page.evaluate(() => window.handover.state())).reloads, 0);
          assert.equal((await page.evaluate(() => window.handover.state())).busy, true);
          ok(`${label}: reload remains outside held public write`);

          const reloaded = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
          if (fails) {
            await page.evaluate(() => window.handover.finish());
            assert.equal(await page.evaluate(() => window.handover.applied()), false);
            const state = await page.evaluate(() => window.handover.state());
            assert.equal(state.failed, true);
            assert.equal(state.draft, 'Handover entry');
            assert.equal(state.reloads, 0);
            assert.match(await page.locator('#outcome').textContent(), /held journal write failed/);
            ok(`${label}: original rejection reaches save UI and draft stays available`);
            assert.equal((await page.evaluate(() => window.handover.entries())).length, 0);
            ok(`${label}: failed transaction leaves no entry`);

            await page.evaluate(() => window.handover.hold(false));
            await page.locator('#save').click();
            await page.waitForSelector('body[data-write-held="true"]');
            await page.evaluate(() => window.handover.finish());
            await page.evaluate(() => window.handover.apply());
          } else await page.evaluate(() => { void window.handover.finish(); });

          await reloaded;
          await page.waitForSelector('body[data-ready="true"]');
          const checkpoint = await page.evaluate(() => window.handover.checkpoint());
          assert.equal(checkpoint.busy, false);
          assert.equal(checkpoint.saved, true);
          assert.equal(checkpoint.draft, '');
          ok(`${label}: save success runs before reload`);
          const entries = await page.evaluate(() => window.handover.entries());
          assert.equal(entries.length, 1);
          assert.equal(entries[0].note, 'Handover entry');
          ok(`${label}: encrypted journal reopens with committed note`);
          if (!fails) {
            assert.equal(checkpoint.failed, false);
            ok(`${label}: success follows normal caller behavior`);
          }
          assert.deepEqual(errors, []);
          ok(`${label}: no uncaught page errors`);
        } finally {
          await page.request.get(`${base}/activation-release`).catch(() => {});
          await context.close();
        }
      });
    }
  }
  await block('write already running before update request', 3, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    try {
      await page.goto(base);
      await page.waitForSelector('body[data-ready="true"]');
      await page.evaluate(() => window.handover.offer());
      await page.evaluate(() => window.handover.hold(false));
      await page.locator('#draft').fill('Earlier write');
      await page.locator('#save').click();
      await page.waitForSelector('body[data-write-held="true"]');
      await page.evaluate(() => window.handover.apply());
      assert.equal(await page.evaluate(() => window.handover.applied()), false);
      assert.equal((await page.evaluate(() => window.handover.state())).reloads, 0);
      ok('busy request refuses activation and reload');
      await page.evaluate(() => window.handover.finish());
      assert.equal((await page.evaluate(() => window.handover.entries()))[0].note, 'Earlier write');
      ok('refused update leaves public save intact');
      const reloaded = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
      await page.evaluate(() => window.handover.apply());
      await page.request.get(`${base}/activation-release`);
      await reloaded;
      await page.waitForSelector('body[data-ready="true"]');
      assert.equal((await page.evaluate(() => window.handover.entries()))[0].note, 'Earlier write');
      ok('explicit retry applies and saved entry persists');
    } finally {
      await page.request.get(`${base}/activation-release`).catch(() => {});
      await context.close();
    }
  });
} finally {
  await browser.close();
  await server.close();
}
finish('Update handover regression passed');
