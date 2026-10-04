/* After a migration fails on the web, the journal from before it comes back
   (phase 12 ux-carpet ticket 219, ticket 04's safety net).

   boot() closes its driver when migrating fails, and closing the web driver
   terminates its worker. The two things the failure screen does next both
   went through that same connection: asking whether the pre-migration copy
   is usable, and putting it back. After ticket 215 a dead worker refuses
   rather than hangs, so the copy check answered "no copy" and the screen
   never offered the restore at all; before 215 it waited forever.

   The failure is forced in the real journal worker, wrapped on its way in:
   its first user_version answer is one lower than the truth, so the runner
   takes its pre-migration copy for real (VACUUM INTO) and then the first
   migration statement after the copy is refused. That is a migration failing
   after the copy exists, which is the case the restore exists for. The
   wrapper is dropped before Restore is pressed, so the recovery and the boot
   after it run on the stock worker.

   Right after the copy the wrapper also stamps the live file as schema 1,
   which this build cannot boot, so "the restored journal boots" can only be
   the copy coming back. A control run retries instead of restoring and has
   to fail, which is what shows the stamp landed.

   Checks: the failure screen offers the restore, pressing it reloads into a
   journal that boots, and the copy is cleaned up by that boot (the offer
   does not come back). Ticket 222 adds the interrupted restore (live file
   at schema 0 beside a readable copy, finished without asking) and a retry
   pressed in the frame its button appears, five times, against a slow one.

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/restore-previous-journal.mjs [--root <built tree>] */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, previewBuild } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--root');
const root = resolve(at >= 0 ? args[at + 1] : resolve(here, '..'));

const browser = await launchChromium();
const app = await previewBuild(root);
const base = `http://localhost:${app.httpServer.address().port}`;

let failures = 0;
const FAULT_RECEIPT = 'restore-previous-journal: refused migration SQL inside an opened transaction';
const check = (ok, line) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
  if (!ok) failures++;
};

/* Appended to the real worker module, after it has assigned its own
   onmessage. */
const failAMigration = (stamp) => `
;(() => {
  const handle = self.onmessage;
  const answer = self.postMessage.bind(self);
  const understated = new Set();
  const transactions = new Map();
  let copyRequest = null;
  let copied = false;
  let inTransaction = false;
  self.postMessage = (message, transfer) => {
    if (message.id === copyRequest) copied = message.ok;
    const transaction = transactions.get(message.id);
    if (transaction) {
      transactions.delete(message.id);
      if (message.ok) inTransaction = transaction === 'BEGIN';
    }
    if (understated.has(message.id) && message.ok && Array.isArray(message.result)) {
      understated.delete(message.id);
      message = { ...message, result: message.result.map((row) => ({ ...row, user_version: row.user_version - 1 })) };
    }
    answer(message, transfer);
  };
  self.onmessage = (event) => {
    const { id, op, args } = event.data;
    const sql = args && typeof args.sql === 'string' ? args.sql : '';
    if (op === 'exec' && /^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql.trim())) transactions.set(id, sql.trim().toUpperCase());
    if (op === 'query' && /user_version/i.test(sql) && !copied) understated.add(id);
    if (op === 'copyDatabaseFile') {
      copyRequest = id;
      handle(event);
      /* Marks the live file as the copy's opposite, outside any transaction
         so the failed migration's rollback cannot undo it: a journal on
         schema 1 cannot boot on this build. Only the copy can bring back
         one that does. Its answer goes to an id nothing waits on. */
      if (${stamp} !== null) handle({ data: { id: -1, op: 'exec', args: { sql: 'PRAGMA user_version = ${stamp}' } } });
      return;
    }
    if (copied && inTransaction && (op === 'exec' || op === 'run') && !/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql.trim())) {
      console.info(${JSON.stringify(FAULT_RECEIPT)});
      answer({ id, ok: false, error: 'forced migration failure (restore-previous-journal probe)' });
      return;
    }
    handle(event);
  };
})();
`;

const worker = /mc-worker-[^/]*\.js$/;
const wrapWith = (stamp) => async (route) => {
  const response = await route.fetch();
  await route.fulfill({ response, body: (await response.text()) + failAMigration(stamp) });
};

/** A fresh profile with a seeded demo journal, then a boot whose migration
    fails after its copy. `stamp` is the schema version written to the live
    file right after the copy, or null to leave it alone. With `retryAtOnce`
    the retry is pressed from inside the page the moment it exists. */
async function failedMigration(label, stamp = 1, retryAtOnce = false) {
  const wrap = wrapWith(stamp);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  let faultInjected = false;
  page.on('console', (message) => {
    if (message.text() === FAULT_RECEIPT) faultInjected = true;
  });
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  const bootOf = () => page.evaluate(() => document.querySelector('[data-app-root]')?.dataset.boot);
  const settled = (timeout = 60000) =>
    page
      .waitForFunction(() => ['ready', 'error'].includes(document.querySelector('[data-app-root]')?.dataset.boot ?? ''), null, {
        timeout
      })
      .catch(() => {});
  await page.goto(base + '/');
  await settled();
  check((await bootOf()) === 'ready', `${label}: the demo journal boots before anything is broken`);
  /* The worker-local demo preparation runs migrations without port messages.
     After seeding, use the capability fallback so the fault and recovery
     exercise the production migration path through the scoped driver. */
  await page.addInitScript(() => { delete window.OffscreenCanvas; });
  /* Once, when retrying at once: the failed boot's worker is the only one
     that should be wrapped, and the copy check's and the retry's are stock. */
  await context.route(worker, wrap, retryAtOnce ? { times: 1 } : undefined);
  if (retryAtOnce) {
    /* Unrouted as soon as the failed boot's requests are in, so the retry's
       worker is the stock one; pressed in the frame the button appears. */
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        const retry = document.querySelector('[data-retry-boot]');
        if (!retry || sessionStorage.getItem('retried')) return;
        sessionStorage.setItem('retried', '1');
        observer.disconnect();
        retry.click();
      }).observe(document, { childList: true, subtree: true });
    });
  }
  await page.reload();
  if (retryAtOnce) {
    await page.waitForFunction(() => sessionStorage.getItem('retried'), null, { timeout: 60000 }).catch(() => {});
    await page
      .waitForFunction(() => document.querySelector('[data-app-root]')?.dataset.boot === 'ready', null, { timeout: 30000 })
      .catch(() => {});
  } else {
    await settled();
  }
  check(faultInjected, `${label}: the probe rejects migration SQL inside an opened transaction`);
  if (retryAtOnce) return { context, page, bootOf, settled };
  check((await bootOf()) === 'error', `${label}: a migration that fails after its copy ends in the boot error (boot=${await bootOf()})`);
  await context.unroute(worker, wrap);
  return { context, page, bootOf, settled };
}

{
  const { context, page, bootOf, settled } = await failedMigration('control');
  await page.click('[data-retry-boot]');
  await page.waitForTimeout(500);
  await settled();
  check((await bootOf()) === 'error', `control: retrying instead of restoring cannot boot the stamped live file (boot=${await bootOf()})`);
  await context.close();
}

const { page, bootOf, settled } = await failedMigration('restore');
const offered = await page
  .waitForSelector('[data-restore-previous]', { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(offered, 'restore: the failure screen offers the journal from before the update');

if (offered) {
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }).catch(() => {}), page.click('[data-restore-previous]')]);
  await settled();
  check((await bootOf()) === 'ready', `restore: the restored journal boots (boot=${await bootOf()})`);
  check((await page.locator('[data-restore-failed]').count()) === 0, 'restore: no restore failure is reported');
  await page.reload();
  await settled();
  check(
    (await bootOf()) === 'ready' && (await page.locator('[data-restore-offer]').count()) === 0,
    'restore: the next boot is clean and offers nothing to restore'
  );
}

/* Ticket 222: a restore that was interrupted - the live file back at
   schema 0 with a readable copy beside it - is finished without asking.
   The runner throws InterruptedRestoreError from inside boot(), after which
   the driver is closed, so the restore has to run on a worker of its own
   (219). Stamped 0 here, and reloaded rather than retried: nothing is
   pressed, the next boot has to find it and put the copy back. */
{
  const { context, page, bootOf, settled } = await failedMigration('interrupted', 0);
  await page.reload();
  await settled();
  check((await bootOf()) === 'ready', `interrupted: the next boot finishes the restore by itself and boots (boot=${await bootOf()})`);
  await context.close();
}

/* Ticket 222: "Try opening again" pressed in the frame it appears, while
   the copy check's own worker may still hold the pool. It has to end where
   a slow retry does - the live file is untouched, so ready - on every run. */
const noticeOf = (page) => page.evaluate(() => document.querySelector('.notice-danger')?.innerText.replace(/\s+/g, ' ').slice(0, 140) ?? '');
{
  const { context, page, bootOf, settled } = await failedMigration('slow retry', null);
  await page.waitForTimeout(2000);
  await page.click('[data-retry-boot]');
  await page
    .waitForFunction(() => document.querySelector('[data-app-root]')?.dataset.boot === 'ready', null, { timeout: 30000 })
    .catch(() => {});
  check((await bootOf()) === 'ready', `slow retry: a retry pressed after the copy check boots (boot=${await bootOf()} ${await noticeOf(page)})`);
  await context.close();
}
for (let run = 1; run <= 5; run++) {
  const { context, page, bootOf } = await failedMigration(`fast retry ${run}`, null, true);
  check((await bootOf()) === 'ready', `fast retry ${run}: a retry pressed at once boots like a slow one (boot=${await bootOf()} ${await noticeOf(page)})`);
  await context.close();
}

await browser.close();
await new Promise((done) => app.httpServer.close(done));
process.exit(failures ? 1 : 0);
