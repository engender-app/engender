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
   does not come back).

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/restore-previous-journal.mjs [--root <built tree>] */
import { preview } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf('--root');
const root = resolve(at >= 0 ? args[at + 1] : resolve(here, '..'));

const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

let failures = 0;
const check = (ok, line) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
  if (!ok) failures++;
};

/* Appended to the real worker module, after it has assigned its own
   onmessage. */
const FAIL_A_MIGRATION = `
;(() => {
  const handle = self.onmessage;
  const answer = self.postMessage.bind(self);
  const understated = new Set();
  let copied = false;
  self.postMessage = (message, transfer) => {
    if (understated.has(message.id) && message.ok && Array.isArray(message.result)) {
      understated.delete(message.id);
      message = { ...message, result: message.result.map((row) => ({ ...row, user_version: row.user_version - 1 })) };
    }
    answer(message, transfer);
  };
  self.onmessage = (event) => {
    const { id, op, args } = event.data;
    const sql = args && typeof args.sql === 'string' ? args.sql : '';
    if (op === 'query' && /user_version/i.test(sql) && !copied) understated.add(id);
    if (op === 'copyDatabaseFile') {
      copied = true;
      handle(event);
      /* Marks the live file as the copy's opposite, outside any transaction
         so the failed migration's rollback cannot undo it: a journal on
         schema 1 cannot boot on this build. Only the copy can bring back
         one that does. Its answer goes to an id nothing waits on. */
      handle({ data: { id: -1, op: 'exec', args: { sql: 'PRAGMA user_version = 1' } } });
      return;
    }
    if (copied && (op === 'exec' || op === 'run') && !/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql.trim())) {
      answer({ id, ok: false, error: 'forced migration failure (restore-previous-journal probe)' });
      return;
    }
    handle(event);
  };
})();
`;

const worker = /mc-worker-[^/]*\.js$/;
const wrap = async (route) => {
  const response = await route.fetch();
  await route.fulfill({ response, body: (await response.text()) + FAIL_A_MIGRATION });
};

/** A fresh profile with a seeded demo journal, then a boot whose migration
    fails after its copy. */
async function failedMigration(label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
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
  await context.route(worker, wrap);
  await page.reload();
  await settled();
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

await browser.close();
await new Promise((done) => app.httpServer.close(done));
process.exit(failures ? 1 : 0);
