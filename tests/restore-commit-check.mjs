import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const root = process.cwd();
const server = await createServer({
  configFile: resolve('tests/browser-tier/browser-tier.vite.config.ts'),
  server: { port: 0, watch: null },
  plugins: [{
    name: 'restore-commit-probe',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/restore-commit') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Restore commit probe</title>');
      });
    }
  }]
});
await server.listen();
const browser = await launchChromium();
const { block, ok, finish } = createReporter();

try {
  for (const fault of ['lost-response', 'worker-error', 'rollback', 'none']) {
    await block(`restore commit: ${fault}`, 4, async () => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(new URL('/restore-commit', server.resolvedUrls.local[0]).href);
        const result = await page.evaluate(async ({ root, fault }) => {
          const load = path => import(`/@fs${root}/src/lib/${path}`);
          const [
            { createEncryptedWebSqlite }, { migrateJournal }, { openJournal },
            { encryptedFileStore }, { opfsPhotoFiles }, { journalSession },
            { sessionDriver }, { sweepOrphanPhotos }
          ] = await Promise.all([
            load('data/sqlite/mc-driver.ts'), load('data/sqlite/boot.ts'),
            load('data/journal/journal.ts'), load('data/photos/encrypted-file-store.ts'),
            load('data/photos/opfs-file-store.ts'), load('stores/journal-session.ts'),
            load('data/live/sessionDriver.ts'), load('data/journal/photos.ts')
          ]);
          const key = crypto.getRandomValues(new Uint8Array(32));
          const sqlite = createEncryptedWebSqlite('restore-commit.sqlite3', key);
          await migrateJournal(sqlite.driver, sqlite.fileOps);
          const files = encryptedFileStore(opfsPhotoFiles(), key);
          let restoring = Promise.resolve();
          const session = journalSession({
            suspend: () => restoring.catch(() => {}),
            open: async () => { throw new Error('unexpected reopen'); },
            release() {}, prewarm() {}
          });
          session.adopt(key, sqlite.driver);
          const journal = openJournal(sessionDriver(session.connection), files);
          await journal.reconcileBuiltIns();
          const bytes = text => new TextEncoder().encode(text);
          await journal.entries.upsertEntry({
            epochDay: 20000, mood: 4, note: 'synthetic preserved note',
            attachPhotos: [{ full: bytes('synthetic full photo'), thumb: bytes('synthetic thumb') }]
          });
          const before = await journal.archive.snapshot();
          const originals = await Promise.all(before.files.map(async ({ name }) => ({
            name, bytes: await before.readFile(name)
          })));
          if (fault === 'rollback') {
            await sqlite.driver.exec(`CREATE TRIGGER reject_restore BEFORE INSERT ON entry
              BEGIN SELECT RAISE(ABORT, 'synthetic restore failure'); END`);
          }

          // Observe the real transaction result before changing its delivery.
          const post = Worker.prototype.postMessage;
          let committed;
          const commitReply = new Promise(resolve => { committed = resolve; });
          Worker.prototype.postMessage = function (message, ...args) {
            const expected = fault === 'rollback' ? 'ROLLBACK' : 'COMMIT';
            if (message.op === 'exec' && message.args.sql === expected) {
              Worker.prototype.postMessage = post;
              const receive = this.onmessage;
              this.onmessage = event => {
                if (event.data.id !== message.id) return receive.call(this, event);
                this.onmessage = receive;
                committed(event.data);
                if (fault === 'worker-error') {
                  this.dispatchEvent(new ErrorEvent('error', { message: 'synthetic worker crash after COMMIT' }));
                } else if (fault === 'rollback' || fault === 'none') {
                  receive.call(this, event);
                }
              };
            }
            return post.call(this, message, ...args);
          };
          restoring = journal.archive.replace({
            journal: before.journal, fileCount: originals.length,
            files: (async function* () { yield* originals; })()
          });
          const outcome = restoring.then(() => null, error => error.message);
          const reply = await Promise.race([
            commitReply,
            new Promise((_, reject) => setTimeout(() => reject(new Error('transaction result not observed')), 15000))
          ]);
          const started = performance.now();
          await Promise.race([
            session.lock().then(() => outcome),
            new Promise((_, reject) => setTimeout(() => reject(new Error('restore did not settle after lock')), 10000))
          ]);
          const lockMilliseconds = performance.now() - started;
          const error = await outcome;
          const reopened = createEncryptedWebSqlite('restore-commit.sqlite3', key);
          try {
            await migrateJournal(reopened.driver, reopened.fileOps);
            const saved = openJournal(reopened.driver, files);
            async function read() {
              const snapshot = await saved.archive.snapshot();
              return {
                note: snapshot.journal.entries[0].note,
                mood: snapshot.journal.entries[0].mood,
                names: snapshot.files.map(({ name }) => name).sort(),
                bytes: (await Promise.all(snapshot.files.map(async ({ name }) =>
                  new TextDecoder().decode(await snapshot.readFile(name))))).sort()
              };
            }
            const beforeSweep = await read();
            await sweepOrphanPhotos(reopened.driver, files);
            return {
              reply, error, lockMilliseconds, beforeSweep, afterSweep: await read(),
              originals: originals.map(({ name }) => name), disk: (await files.list()).sort()
            };
          } finally { await reopened.driver.close(); }
        }, { root, fault });
        assert.equal(result.reply.ok, true);
        if (fault === 'none') assert.equal(result.error, null);
        else assert.match(result.error, {
          'lost-response': /disposed/,
          'worker-error': /synthetic worker crash after COMMIT/,
          rollback: /synthetic restore failure/
        }[fault]);
        ok('restore reports the expected result after the real transaction finishes');
        assert.ok(result.lockMilliseconds < 7500, `lock took ${result.lockMilliseconds}ms`);
        ok('lock disposal remains bounded');
        assert.equal(result.beforeSweep.note, 'synthetic preserved note');
        assert.equal(result.beforeSweep.mood, 4);
        assert.deepEqual(result.beforeSweep.bytes, ['synthetic full photo', 'synthetic thumb']);
        assert.ok(result.beforeSweep.names.every(name => result.originals.includes(name) === (fault === 'rollback')));
        ok('reopening retains the expected rows and attachment bytes');
        assert.deepEqual(result.afterSweep, result.beforeSweep);
        assert.deepEqual(result.disk, result.afterSweep.names);
        ok('the orphan sweep removes only files without committed owners');
      } finally { await context.close(); }
    });
  }
} finally { await browser.close(); await server.close(); }
finish('Restore commit regression passed');
