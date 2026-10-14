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
      Worker.prototype.postMessage = function(message, ...args) {
        const sql = message.args?.sql;
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
      'synthetic archive password', mode, () => {}).then(result => { window.restoreResult = result; });
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
  for (const fault of ['before-preferences', 'between-preferences', 'before-commit', 'after-commit']) {
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
  for (const [destination, restored, browserLocale, expected] of [
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
  await block('preference projection ownership after Replace', 2, async () => {
    const profile = await mkdtemp(join(tmpdir(), 'engender-restore-ownership-'));
    const context = await launchPersistentChromium(profile, { locale: 'en-US', serviceWorkers: 'block' });
    try {
      const page = await initialize(context);
      const result = await page.evaluate(async () => {
        const { attachPreferences, detachPreferences, refreshPreferences, prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        const stored = { ...prefs };
        let complete;
        const old = { all: () => ({ ...stored, name: 'late old projection', language: 'pl' }),
          reload: () => new Promise(resolve => { complete = resolve; }), set: async () => {}, openedEmpty: () => false };
        await attachPreferences(old);
        const refreshing = refreshPreferences();
        await new Promise(resolve => queueMicrotask(resolve));
        await attachPreferences({ ...old, all: () => ({ ...stored, name: 'new owner', language: 'en' }) });
        complete();
        const reattached = { publish: await refreshing, name: prefs.name, language: prefs.language };
        await attachPreferences(old);
        const locking = refreshPreferences();
        await new Promise(resolve => queueMicrotask(resolve));
        await detachPreferences();
        complete();
        const detached = { publish: await locking, name: prefs.name, language: prefs.language };
        return { reattached, detached };
      });
      assert.deepEqual(result.reattached, { publish: false, name: 'new owner', language: 'en' });
      ok('a newer attachment prevents the late old refresh from publishing');
      assert.deepEqual(result.detached, { publish: false, name: 'late old projection', language: 'pl' });
      ok('detachment revokes publication while retaining the current lock-screen projection');
    } finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  });
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
