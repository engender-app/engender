import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const source = `/@fs${resolve(import.meta.dirname, '../src/lib')}`;

/** Use the released baseline and an old page's schema ceiling, while retaining
 * the real boot, session, migration runner and encrypted OPFS driver. */
function schema88Page() {
  return {
    name: 'warm-schema-88-page',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('/data/sqlite/schema-version.ts')) return 'export const LATEST_SCHEMA_VERSION = 88;';
      if (id.endsWith('/data/sqlite/migrations.ts')) return `
        import { BASELINE_SCHEMA } from './schema.ts';
        export const migrations = [{ version: 88, sql: BASELINE_SCHEMA, baseline: true }];
      `;
    }
  };
}

export async function verifyWarmSchema() {
  const browser = await launchChromium();
  const outcomes = [];
  try {
    for (const ceiling of [88, null]) {
      const server = await createServer({
        configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'),
        cacheDir: `.svelte-kit/warm-schema-${ceiling ?? 'current'}`,
        plugins: ceiling === 88 ? [schema88Page()] : [],
        server: { port: 0, watch: null }
      });
      await server.listen();
      try {
        for (const mode of ['unlock', 'navigation']) {
          const context = await browser.newContext();
          const page = await context.newPage();
          try {
            await page.goto(new URL('/cold-unlock.html', server.resolvedUrls.local[0]).href);
            await page.evaluate(async (source) => {
              window.fixtureBoot = await import(`${source}/stores/boot.svelte.ts`);
              fixtureBoot.startBoot();
            }, source);
            await page.waitForFunction(() => fixtureBoot.bootState.status === 'needs-setup');
            assert.equal(await page.evaluate(() => fixtureBoot.submitAccessModeSetup('passphrase', 'synthetic-warm-schema')), 'ok');
            await page.waitForFunction(() => fixtureBoot.bootState.status === 'ready');
            const key = await page.evaluate(async () => {
              window.fixtureJournal = fixtureBoot.bootState.journal;
              window.fixtureEntry = await fixtureJournal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Synthetic warm schema' });
              return Array.from(await fixtureBoot.journalDataKey());
            });
            const suspend = async () => {
              if (mode === 'unlock') await page.evaluate(() => fixtureBoot.closeJournalForLock());
              else {
                await page.evaluate(() => {
                  fixtureBoot.watchBrowserSession();
                  dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
                });
                await page.waitForFunction(() => fixtureBoot.bootState.journal === null);
              }
            };
            const changeVersion = async (increment) => page.evaluate(async ({ source, key, increment }) => {
              const { createEncryptedWebSqlite } = await import(`${source}/data/sqlite/mc-driver.ts`);
              const sqlite = createEncryptedWebSqlite('engender.sqlite3', new Uint8Array(key));
              try {
                const before = await sqlite.driver.getUserVersion();
                if (increment) await sqlite.driver.setUserVersion(before + 1);
                return before;
              } finally { await sqlite.driver.close(); }
            }, { source, key, increment });
            await suspend();
            // A second real connection proves the retained page released OPFS.
            const originalSchema = await changeVersion(false);
            if (ceiling !== null) assert.equal(originalSchema, ceiling);
            const resume = async () => {
              if (mode === 'unlock') return page.evaluate(async (key) => {
                try { await fixtureBoot.reopenJournalAfterUnlock(new Uint8Array(key)); return null; }
                catch (error) { return error.name; }
              }, key);
              await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
              await page.waitForFunction(() => !fixtureBoot.browserSession.recovering);
              return null;
            };
            await resume();
            assert.equal(await page.evaluate(() => fixtureBoot.bootState.journal.entries.getEntry(fixtureEntry).then((row) => row.note)), 'Synthetic warm schema');
            await page.evaluate(() => fixtureBoot.bootState.journal.entries.upsertEntry({ epochDay: 20001, mood: 4, note: 'Current schema return works' }));
            await suspend();
            await changeVersion(true);
            await page.evaluate(() => {
              window.fixtureReads = [];
              const post = Worker.prototype.postMessage;
              Worker.prototype.postMessage = function (message, ...args) {
                const sql = message.args?.sql ?? '';
                if (/SELECT key, value FROM pref|FROM gender_dimension ORDER BY id/.test(sql)) fixtureReads.push(sql);
                return post.call(this, message, ...args);
              };
            });
            const refused = await resume();
            if (mode === 'unlock') assert.equal(refused, 'SchemaTooNewError');
            assert.deepEqual(await page.evaluate(async () => ({
              status: fixtureBoot.bootState.status,
              journal: fixtureBoot.bootState.journal,
              key: await Promise.race([fixtureBoot.journalDataKey().then(() => 'available'), new Promise((r) => setTimeout(() => r('blocked'), 100))]),
              reads: fixtureReads
            })), { status: 'schema-too-new', journal: null, key: 'blocked', reads: [] });
            await page.evaluate(() => {
              window.fixtureWrite = 'pending';
              void fixtureJournal.entries.upsertEntry({ epochDay: 20002, mood: 5, note: 'Refused old-page write' })
                .then(() => { fixtureWrite = 'committed'; }, () => { fixtureWrite = 'refused'; });
            });
            const remaining = await page.evaluate(async ({ source, key }) => {
              const { createEncryptedWebSqlite } = await import(`${source}/data/sqlite/mc-driver.ts`);
              const { migrateJournal } = await import(`${source}/data/sqlite/boot.ts`);
              const sqlite = createEncryptedWebSqlite('engender.sqlite3', new Uint8Array(key));
              try {
                let cold;
                try { await migrateJournal(sqlite.driver, sqlite.fileOps); } catch (error) { cold = error.name; }
                return { cold, version: await sqlite.driver.getUserVersion(), rows: await sqlite.driver.query('SELECT note FROM entry ORDER BY epoch_day') };
              } finally { await sqlite.driver.close(); }
            }, { source, key });
            assert.deepEqual(remaining, { cold: 'SchemaTooNewError', version: originalSchema + 1, rows: [{ note: 'Synthetic warm schema' }, { note: 'Current schema return works' }] });
            assert.notEqual(await page.evaluate(() => fixtureWrite), 'committed');
            outcomes.push({ mode, originalSchema, refused: 'schema-too-new', privateReads: 0, preservedRows: 2 });
          } finally { await context.close(); }
        }
        if (ceiling === null) {
          const context = await browser.newContext();
          const page = await context.newPage();
          try {
            await page.goto(new URL('/cold-unlock.html', server.resolvedUrls.local[0]).href);
            const key = await page.evaluate(async (source) => {
              const { setupJournalPassphrase } = await import(`${source}/data/journal-passphrase.ts`);
              const { createJournalSqlite, journalPhotoFiles } = await import(`${source}/stores/journal-ports.ts`);
              const { BASELINE_SCHEMA } = await import(`${source}/data/sqlite/schema.ts`);
              const { openJournal } = await import(`${source}/data/journal/journal.ts`);
              const key = await setupJournalPassphrase('synthetic-warm-upgrade');
              const sqlite = createJournalSqlite(key);
              try {
                await sqlite.driver.exec(BASELINE_SCHEMA);
                await sqlite.driver.setUserVersion(88);
                const journal = openJournal(sqlite.driver, journalPhotoFiles(key));
                await journal.reconcileBuiltIns();
                await journal.entries.upsertEntry({ epochDay: 20000, mood: 3, note: 'Released baseline preserved' });
              } finally { await sqlite.driver.close(); }
              window.fixtureBoot = await import(`${source}/stores/boot.svelte.ts`);
              fixtureBoot.startBoot();
              return Array.from(key);
            }, source);
            await page.waitForFunction(() => fixtureBoot.bootState.status === 'needs-unlock');
            await page.evaluate(() => fixtureBoot.submitPassphraseUnlock('synthetic-warm-upgrade'));
            await page.waitForFunction(() => fixtureBoot.bootState.status === 'ready');
            await page.evaluate(() => fixtureBoot.closeJournalForLock());
            const before = await page.evaluate(async ({ source, key }) => {
              const { createJournalSqlite } = await import(`${source}/stores/journal-ports.ts`);
              const sqlite = createJournalSqlite(new Uint8Array(key));
              try {
                await sqlite.fileOps.restorePreMigrationCopy();
              } finally { await sqlite.driver.close(); }
              const restored = createJournalSqlite(new Uint8Array(key));
              try { return await restored.driver.getUserVersion(); }
              finally { await restored.driver.close(); }
            }, { source, key });
            assert.equal(before, 88);
            await page.evaluate((key) => fixtureBoot.reopenJournalAfterUnlock(new Uint8Array(key)), key);
            const upgraded = await page.evaluate(async (source) => {
              const { getActiveDriver } = await import(`${source}/stores/journal-ports.ts`);
              const { LATEST_SCHEMA_VERSION } = await import(`${source}/data/sqlite/schema-version.ts`);
              return {
                ready: fixtureBoot.bootState.status,
                version: await getActiveDriver().getUserVersion(),
                expected: LATEST_SCHEMA_VERSION,
                notes: (await fixtureBoot.bootState.journal.entries.entriesForDay(20000)).map((row) => row.note)
              };
            }, source);
            assert.equal(upgraded.version, upgraded.expected);
            assert.equal(upgraded.ready, 'ready');
            assert.deepEqual(upgraded.notes, ['Released baseline preserved']);
            outcomes.push({ mode: 'supported-upgrade', originalSchema: 88, prepared: upgraded.version, preservedRows: 1 });
          } finally { await context.close(); }
        }
      } finally { await server.close(); }
    }
  } finally { await browser.close(); }
  return outcomes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await verifyWarmSchema());
}
