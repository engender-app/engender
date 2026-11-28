/* Trash Restore admits one write, says when it fails, and collapses the row
   it restored. Drives trash-restore-probe.ts with
   real clicks and keys, and reads the rows' boxes on every animation frame
   so a row leaving in one frame, or the rows under it jumping, fails here
   rather than on a recording. Runs in the browser tier; run directly for
   the focused check, with --dump <dir> to keep the frame samples. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FAILED = "Couldn’t restore this entry.";
const RESTORED = 'Entry restored';

export async function trashRestore(browser, origin, motion = 'reduce', dump) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const results = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pass = (label) => { results.push(label); console.log('PASS', motion, label); };
  try {
    await page.goto(`${origin}/trash-restore.html`);
    await page.waitForSelector('body[data-ready]', { state: 'attached' });
    const probe = (name, ...args) => page.evaluate(([name, args]) => window.trashRestore[name](...args), [name, args]);
    const show = async (count) => {
      const { ids } = await probe('show', { motion, count });
      await page.waitForSelector(`[data-restore-entry="${ids[0]}"]`);
      await page.waitForFunction(() => window.trashRestore.settled());
      return ids;
    };
    const restore = (id) => page.locator(`[data-restore-entry="${id}"]`);
    const gone = (id) => page.waitForSelector(`[data-restore-entry="${id}"]`, { state: 'detached' });
    const press = async (id) => { await restore(id).focus(); await restore(id).press('Enter'); };
    // Settled, and then a few more frames, so the sampler has seen the
    // layout after the last change rather than stopping on it.
    const settle = async () => {
      await page.waitForFunction(() => window.trashRestore.settled());
      await page.evaluate(() => new Promise((done) => { let n = 0; const next = () => (++n > 5 ? done() : requestAnimationFrame(next)); requestAnimationFrame(next); }));
    };
    const focusedOn = (selector) => page.waitForFunction((selector) => document.activeElement?.matches(selector), selector, { timeout: 3000 });

    // A held write and a second tap: one write admitted, then the row goes.
    let ids = await show(2);
    await probe('setMode', 'hold');
    await restore(ids[0]).dblclick();
    await page.waitForFunction(() => window.trashRestore.calls() > 0);
    await page.keyboard.press('Enter');
    assert.equal(await probe('calls'), 1, 'a second tap while the restore is held writes nothing');
    assert.equal(await restore(ids[0]).count(), 1, 'the row stays while its restore is held');
    await probe('release');
    await gone(ids[0]);
    assert.equal(await probe('calls'), 1);
    assert.deepEqual((await probe('toasts')).map((t) => t.message), [RESTORED]);
    pass('held restore admits one write');

    // A refused write: the row stays, the failure is said, retry works.
    ids = await show(2);
    await probe('setMode', 'fail');
    await press(ids[0]);
    await page.waitForFunction((message) => window.trashRestore.toasts().some((t) => t.message === message), FAILED);
    assert.deepEqual(await probe('toasts'), [{ message: FAILED, kind: 'failed' }]);
    assert.deepEqual((await probe('trashed')).sort(), [...ids].sort(), 'nothing left the trash');
    assert.equal(await restore(ids[0]).count(), 1, 'the row stays after a failed restore');
    assert.equal(await restore(ids[0]).isDisabled(), false, 'the button is ready for a retry');
    assert.ok(await restore(ids[0]).evaluate((node) => node === document.activeElement), 'focus stays on the failed row');
    pass('failed restore keeps the row and says so');
    await probe('setMode', 'land');
    await page.keyboard.press('Enter');
    await gone(ids[0]);
    await focusedOn(`[data-restore-entry="${ids[1]}"]`);
    assert.deepEqual(await probe('trashed'), [ids[1]]);
    pass('retry restores and focuses the next row');

    // A landed restore in the middle of three: the row gives its height
    // back and the row under it travels up with it.
    ids = await show(3);
    const [above, leaving, below] = ids;
    await probe('sample');
    await press(leaving);
    await gone(leaving);
    await settle();
    let frames = await probe('stop');
    if (dump) await writeFile(resolve(dump, `trash-middle-${motion}.json`), JSON.stringify(frames, null, 1));
    const start = frames[0].rows[leaving];
    const travelling = frames.filter((f) => f.rows[leaving] && f.rows[leaving].height > 1 && f.rows[leaving].height < start.height - 1);
    const lastSeen = frames.filter((f) => f.rows[leaving]).at(-1).rows[leaving];
    const belowTops = frames.map((f) => f.rows[below].top);
    const travel = belowTops[0] - belowTops.at(-1);
    const steps = belowTops.slice(1).map((top, i) => belowTops[i] - top);
    assert.ok(Math.abs(travel - start.height) < 1, `the row below ends where the restored row began (${travel} vs ${start.height})`);
    assert.ok(frames.every((f) => Math.abs(f.rows[above].top - frames[0].rows[above].top) < 0.5), 'the row above stays put');
    if (motion === 'full') {
      assert.ok(travelling.length >= 8, `the row collapses over several frames (${travelling.length} in between)`);
      assert.ok(lastSeen.height < 1, `the row leaves the DOM only once it has no height (${lastSeen.height})`);
      assert.ok(Math.max(...steps) < travel / 3, `no frame moves the row below by a third of its travel (largest ${Math.max(...steps).toFixed(1)} of ${travel})`);
      pass(`restored row collapses over ${travelling.length} frames`);
    } else {
      assert.equal(travelling.length, 0, 'reduced motion cuts the row instead of collapsing it');
      pass('reduced motion removes the restored row in one step');
    }
    await focusedOn(`[data-restore-entry="${below}"]`);
    pass('focus moves to the next row');

    // The last row: the list gives way to the empty state.
    ids = await show(1);
    await probe('sample');
    await press(ids[0]);
    await page.waitForSelector('.empty-state');
    await settle();
    frames = await probe('stop');
    if (dump) await writeFile(resolve(dump, `trash-last-${motion}.json`), JSON.stringify(frames, null, 1));
    const clipTop = (b) => Number(/^inset\(([\d.e-]+)px/.exec(b.clip)?.[1] ?? 0);
    const swap = frames.filter((f) => f.empty);
    const listFrames = swap.filter((f) => f.list);
    const shown = swap.map((f) => f.empty.height - clipTop(f.empty));
    if (motion === 'full') {
      assert.ok(listFrames.length >= 8, `the list closes over several frames after the empty state arrives (${listFrames.length})`);
      assert.ok(listFrames.at(-1).list.height < 1, `the list leaves the DOM only once it has no height (${listFrames.at(-1).list.height})`);
      assert.ok(shown[0] < swap[0].empty.height / 3, `the empty state is not painted whole on its first frame (${shown[0].toFixed(1)} of ${swap[0].empty.height})`);
      assert.ok(shown.slice(1).every((h, i) => h >= shown[i] - 0.5), 'the empty state only ever uncovers more of itself');
      assert.ok(listFrames.every((f) => f.empty.top + clipTop(f.empty) >= f.list.bottom - 0.5), 'the uncovered empty state never overlaps the closing list');
      pass(`last restore closes the list over ${listFrames.length} frames while the empty state uncovers`);
    } else {
      assert.equal(listFrames.length, 0, 'reduced motion swaps the list for the empty state in one step');
      assert.ok(shown.every((h) => Math.abs(h - swap[0].empty.height) < 0.5), 'reduced motion paints the empty state whole');
      pass('reduced motion swaps the list for the empty state in one step');
    }
    await focusedOn('h1');
    pass('last restore focuses the heading');

    assert.deepEqual(errors, []);
    return results;
  } finally {
    await page.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createServer } = await import('vite');
  const { launchChromium } = await import('../browser-harness.mjs');
  const dumpAt = process.argv.indexOf('--dump');
  const dump = dumpAt > 0 ? process.argv[dumpAt + 1] : undefined;
  const server = await createServer({ configFile: resolve(import.meta.dirname, 'browser-tier.vite.config.ts'), server: { port: 0, watch: null } });
  await server.listen();
  const browser = await launchChromium();
  try {
    for (const motion of ['reduce', 'full']) console.log(motion, await trashRestore(browser, `http://localhost:${server.config.server.port}`, motion, dump));
  } finally {
    await browser.close();
    await server.close();
  }
}
