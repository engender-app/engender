/* Real Archive Replace crash and locale checks. Each case owns a temporary
   persistent Chromium profile and kills only its recorded browser process.
   No worker, SQL transaction or preference classifier is reimplemented. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { createReporter, launchPersistentChromium, setAppLanguage } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/restore-preferences-vite',
  define: { __DEMO__: 'false' },
  server: { port: 0, watch: null }
});
await server.listen();
const origin = server.resolvedUrls.local[0];
const { block, ok, finish } = createReporter();
const seed = 3204;
const publicationOnly = process.argv.includes('--publication-only');

async function ready(page) {
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
}
async function initialize(context, language = 'en') {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(new URL('settings', origin).href);
  await page.waitForSelector('[data-app-root][data-boot="needs-setup"]', { timeout: 60000 });
  assert.equal(await page.evaluate(async () => {
    const { submitAccessModeSetup } = await import('/src/lib/stores/boot.svelte.ts');
    return submitAccessModeSetup('device-bound', '');
  }), 'ok');
  await ready(page);
  await page.evaluate(async ({ seed, language }) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { prefs, setPreferenceDurably } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { setLocale } = await import('/src/lib/paraglide/runtime.js');
    const bytes = value => new TextEncoder().encode(value);
    await bootState.journal.entries.upsertEntry({
      epochDay: 19999, mood: 2, note: `Original synthetic entry ${seed}`,
      attachPhotos: [{ full: bytes('synthetic full photo'), thumb: bytes('synthetic thumb') }]
    });
    for (const [key, value] of Object.entries({
      onboarded: true, name: `Original synthetic name ${seed}`, language,
      lockAfter: 'restart', checkInEnabled: false
    })) await setPreferenceDurably(key, value);
    setLocale(language, { reload: false });
    window.originalPreferences = { ...prefs };
  }, { seed, language });
  await page.goto(new URL('settings', origin).href);
  await ready(page);
  await page.waitForSelector('[data-list-row="language"]');
  return page;
}
async function prepare(page, language = 'pl') {
  await page.evaluate(async ({ seed, language }) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { packArchive } = await import('/src/lib/data/archive/pack.ts');
    const { collect } = await import('/src/lib/data/archive/container.ts');
    const { portablePreferences } = await import('/src/lib/data/archive/payload.ts');
    const snapshot = await journal.archive.snapshot();
    const incoming = structuredClone(snapshot.journal);
    incoming.entries[0].epochDay = 20000;
    incoming.entries[0].note = `Incoming synthetic entry ${seed}`;
    const preferences = portablePreferences(prefs);
    preferences.name = `Incoming synthetic name ${seed}`;
    preferences.language = language;
    window.incomingArchive = await collect(packArchive({ ...snapshot, journal: incoming, preferences }, 'synthetic archive password'));
  }, { seed, language });
}
async function restore(page, mode = 'replace', fault = null) {
  await page.evaluate(async ({ mode, fault }) => {
    const { runRestore } = await import('/src/lib/data/journal/restoreFlow.ts');
    if (fault) {
      const post = Worker.prototype.postMessage;
      let committed = false;
      Worker.prototype.postMessage = function(message, ...args) {
        const sql = message.args?.sql;
        if (fault === 'post-commit-read-refusal') {
          if (committed && message.op === 'query' && sql === 'SELECT key, value FROM pref') {
            localStorage.setItem('restore-proof-refused', 'true');
            queueMicrotask(() => this.onmessage({ data: { id: message.id, ok: false, error: 'synthetic post-commit read refusal' } }));
            return;
          }
          if (message.op === 'exec' && sql === 'COMMIT') {
            const receive = this.onmessage;
            this.onmessage = event => {
              if (event.data.id !== message.id) return receive.call(this, event);
              this.onmessage = receive;
              committed = event.data.ok;
              localStorage.setItem('restore-proof-committed', String(committed));
              receive.call(this, event);
            };
          }
        }
        if (fault === 'hold-preference-read' && message.op === 'query' && sql === 'SELECT key, value FROM pref') {
          Worker.prototype.postMessage = post;
          const receive = this.onmessage;
          this.onmessage = event => {
            if (event.data.id !== message.id) return receive.call(this, event);
            this.onmessage = receive;
            window.restorePaused = { fault, committed: false };
            window.releasePreferenceRead = () => receive.call(this, event);
          };
        }
        const preference = message.op === 'run' && /INSERT INTO pref/.test(sql ?? '');
        const stop = (fault === 'before-preferences' && preference && message.args.params[0] === 'name') ||
          (fault === 'between-preferences' && preference && message.args.params[0] === 'language') ||
          (fault === 'before-commit' && message.op === 'exec' && sql === 'COMMIT');
        if (stop) {
          Worker.prototype.postMessage = post;
          window.restorePaused = { fault, sql, key: message.args.params?.[0], committed: false };
          return;
        }
        if (fault === 'after-commit' && message.op === 'exec' && sql === 'COMMIT') {
          Worker.prototype.postMessage = post;
          const receive = this.onmessage;
          this.onmessage = event => {
            if (event.data.id !== message.id) return receive.call(this, event);
            this.onmessage = receive;
            window.restorePaused = { fault, committed: event.data.ok, projection: localStorage.getItem('PARAGLIDE_LOCALE') };
          };
        }
        return post.call(this, message, ...args);
      };
    }
    const archive = window.incomingArchive;
    window.restoreResult = null;
    void runRestore({ name: 'synthetic.ttbackup', bytes: async function*() { yield archive; } },
      'synthetic archive password', mode, () => {}).then(result => {
        window.restoreResult = result;
        localStorage.setItem('restore-proof-result', JSON.stringify(result));
      });
  }, { mode, fault });
}
async function evidence(page) {
  return page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { getLocale } = await import('/src/lib/paraglide/runtime.js');
    const snapshot = await journal.archive.snapshot();
    return {
      entries: snapshot.journal.entries.map(({ note, epochDay }) => ({ note, epochDay })),
      name: prefs.name, language: prefs.language, lockAfter: prefs.lockAfter,
      locale: getLocale(), html: document.documentElement.lang,
      files: (await Promise.all(snapshot.files.map(async ({ name }) =>
        new TextDecoder().decode(await snapshot.readFile(name))))).sort()
    };
  });
}
async function stable(page, language, name) {
  await page.waitForFunction(async ({ language, name }) => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    return document.querySelector('[data-list-row="language"]') &&
      document.documentElement.lang === language && prefs.name === name;
  }, { language, name }, { timeout: 60000 });
}
function pair(result, incoming, preference = 'pl', locale = preference) {
  const prefix = incoming ? 'Incoming' : 'Original';
  assert.deepEqual(result.entries, [{ note: `${prefix} synthetic entry ${seed}`, epochDay: incoming ? 20000 : 19999 }]);
  assert.equal(result.name, `${prefix} synthetic name ${seed}`);
  assert.equal(result.language, incoming ? preference : 'en');
  assert.equal(result.locale, incoming ? locale : 'en');
  assert.equal(result.html, result.locale);
  assert.equal(result.lockAfter, 'restart');
  assert.deepEqual(result.files, ['synthetic full photo', 'synthetic thumb']);
}

try {
  for (const fault of publicationOnly ? [] : ['before-preferences', 'between-preferences', 'before-commit', 'after-commit']) {
    await block(`Replace kill ${seed}: ${fault}`, 3, async () => {
      const profile = await mkdtemp(join(tmpdir(), 'engender-restore-prefs-'));
      let context;
      try {
        context = await launchPersistentChromium(profile, { locale: 'en-US', serviceWorkers: 'block' });
        const page = await initialize(context);
        await prepare(page);
        await restore(page, 'replace', fault);
        await page.waitForFunction(() => window.restorePaused);
        const pause = await page.evaluate(() => window.restorePaused);
        assert.equal(pause.fault, fault);
        assert.equal(pause.committed, fault === 'after-commit');
        if (fault === 'after-commit') assert.equal(pause.projection, 'en');
        ok('real worker reaches the named boundary before locale activation');
        const session = await context.browser().newBrowserCDPSession();
        const { processInfo } = await session.send('SystemInfo.getProcessInfo');
        const pid = processInfo.find(process => process.type === 'browser')?.id;
        assert.ok(Number.isInteger(pid) && pid > 1);
        console.log(`Owned Chromium PID ${pid}; profile ${profile}`);
        const closed = new Promise(resolve => context.once('close', resolve));
        process.kill(pid, 'SIGKILL');
        await closed;
        context = await launchPersistentChromium(profile, { locale: 'en-US', serviceWorkers: 'block' });
        const reopened = await context.newPage();
        await reopened.goto(new URL('settings', origin).href);
        const incoming = fault === 'after-commit';
        if (incoming) await reopened.waitForEvent('load');
        await ready(reopened);
        await stable(reopened, incoming ? 'pl' : 'en', `${incoming ? 'Incoming' : 'Original'} synthetic name ${seed}`);
        pair(await evidence(reopened), incoming);
        ok('actual cold boot keeps one complete rows/preferences pair and locale');
        await reopened.reload();
        await ready(reopened);
        pair(await evidence(reopened), incoming);
        ok('second reopen preserves encrypted attachment bytes and device-local timing');
      } finally { await context?.close().catch(() => {}); await rm(profile, { recursive: true, force: true }); }
    });
  }
  for (const [destination, restored, browserLocale, expected] of publicationOnly ? [] : [
    ['en', 'pl', 'en-US', 'pl'], ['pl', 'en', 'pl-PL', 'en'],
    ['pl', 'system', 'en-US', 'en'], ['en', 'system', 'pl-PL', 'pl']
  ]) {
    await block(`Replace locale ${destination} -> ${restored}/${browserLocale}`, 3, async () => {
      const profile = await mkdtemp(join(tmpdir(), 'engender-restore-locale-'));
      const context = await launchPersistentChromium(profile, { locale: browserLocale, serviceWorkers: 'block' });
      try {
        const page = await initialize(context, destination);
        await prepare(page, restored);
        const switched = page.waitForEvent('load');
        await restore(page);
        await switched;
        await ready(page);
        await stable(page, expected, `Incoming synthetic name ${seed}`);
        pair(await evidence(page), true, restored, expected);
        assert.ok((await page.locator('[data-list-row="language"]').innerText()).includes(
          restored === 'pl' ? 'Polski' : restored === 'en' ? 'English' : expected === 'pl' ? 'Systemowy' : 'System'));
        ok('Language row, persisted choice and rendered locale agree');
        assert.equal(await page.evaluate(async () => {
          const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          const { packArchive, openArchive } = await import('/src/lib/data/archive/pack.ts');
          const { portablePreferences } = await import('/src/lib/data/archive/payload.ts');
          const { collect } = await import('/src/lib/data/archive/container.ts');
          const snapshot = await journal.archive.snapshot();
          const bytes = await collect(packArchive({ ...snapshot, preferences: portablePreferences(prefs) }, 'synthetic re-export password'));
          const opened = await openArchive((async function*() { yield bytes; })(), 'synthetic re-export password');
          for await (const file of opened.files) if (!(await snapshot.readFile(file.name)).every((byte, i) => byte === file.bytes[i])) return false;
          return opened.payload.preferences.name === prefs.name && opened.payload.preferences.language === prefs.language &&
            opened.payload.journal.entries[0].note === snapshot.journal.entries[0].note;
        }), true);
        ok('healthy export decrypts to the restored rows, preferences and attachment bytes');
        await page.reload();
        await ready(page);
        pair(await evidence(page), true, restored, expected);
        ok('healthy reopen retains the same complete pair');
      } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
    });
  }
  await block('post-COMMIT preference reads cannot refuse a committed Replace', 2, async () => {
    const profile = await mkdtemp(join(tmpdir(), 'engender-restore-publication-'));
    const context = await launchPersistentChromium(profile, { locale: 'en-US', serviceWorkers: 'block' });
    try {
      const page = await initialize(context);
      await prepare(page);
      await restore(page, 'replace', 'post-commit-read-refusal');
      await page.waitForFunction(() => localStorage.getItem('restore-proof-result'));
      const result = await page.evaluate(() => ({
        committed: localStorage.getItem('restore-proof-committed'),
        refused: localStorage.getItem('restore-proof-refused'),
        outcome: JSON.parse(localStorage.getItem('restore-proof-result'))
      }));
      assert.equal(result.committed, 'true');
      assert.deepEqual(result.outcome, { ok: true });
      assert.equal(result.refused, null);
      ok('successful COMMIT stays successful without any post-commit preference SQL');
      await page.waitForLoadState('networkidle');
      await ready(page);
      pair(await evidence(page), true);
      ok('committed rows, preference mirror and restored locale activate together');
    } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  });
  for (const successor of ['lock', 'new-attach', 'later-write']) {
    await block(`held preference snapshot: ${successor}`, 2, async () => {
      const profile = await mkdtemp(join(tmpdir(), 'engender-restore-ownership-'));
      const context = await launchPersistentChromium(profile, { locale: 'en-US', serviceWorkers: 'block' });
      try {
        const page = await initialize(context);
        await prepare(page);
        await restore(page, 'replace', 'hold-preference-read');
        await page.waitForFunction(() => window.restorePaused);
        const before = await page.evaluate(() => localStorage.getItem('engender-boot-prefs'));
        await page.evaluate(async ({ successor, seed }) => {
          const { attachPreferences, detachPreferences, setPreferenceDurably, prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          if (successor === 'lock') await detachPreferences();
          else if (successor === 'later-write') {
            window.laterPreferenceWrite = setPreferenceDurably('language', 'en');
          } else {
            const values = { ...prefs, name: `New owner ${seed}`, language: 'en' };
            await attachPreferences({ all: () => values, set: async () => {}, openedEmpty: () => false,
              prepareCommittedValues() { throw new Error('late old snapshot reached new owner'); } });
          }
          window.releasePreferenceRead();
        }, { successor, seed });
        await page.waitForFunction(() => window.restoreResult);
        assert.deepEqual(await page.evaluate(() => window.restoreResult), { ok: true });
        ok('held authoritative read commits without publishing into a superseding owner');
        const after = await page.evaluate(async () => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          return { name: prefs.name, language: prefs.language, html: document.documentElement.lang,
            mirror: localStorage.getItem('engender-boot-prefs') };
        });
        assert.equal(after.name, successor === 'lock' ? `Original synthetic name ${seed}` : successor === 'later-write' ? `Incoming synthetic name ${seed}` : `New owner ${seed}`);
        assert.equal(after.language, 'en');
        assert.equal(after.html, 'en');
        assert.equal(after.mirror, before);
        ok('late values, boot mirror and locale all respect attachment ownership');
      } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
    });
  }
  await block('Merge preference control and Settings language durability', 3, async () => {
    const profile = await mkdtemp(join(tmpdir(), 'engender-restore-merge-'));
    const context = await launchPersistentChromium(profile, { locale: 'en-US', serviceWorkers: 'block' });
    try {
      const page = await initialize(context);
      await prepare(page);
      await restore(page, 'merge');
      await page.waitForFunction(() => window.restoreResult);
      assert.deepEqual(await page.evaluate(() => window.restoreResult), { ok: true });
      pair(await evidence(page), false);
      ok('Merge retains destination rows, preferences and locale');
      for (const locale of ['pl', 'en']) {
        await setAppLanguage(page, locale);
        await page.reload();
        await ready(page);
        const saved = await evidence(page);
        assert.equal(saved.language, locale);
        assert.equal(saved.locale, locale);
        assert.equal(saved.name, `Original synthetic name ${seed}`);
        assert.equal(saved.entries[0].note, `Original synthetic entry ${seed}`);
        ok(`Settings persists ${locale} before its reload and retains the journal`);
      }
    } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  });
} finally { await server.close(); }
finish('Restore preference regression passed');
