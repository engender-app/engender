import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeCatalogue } from '../scripts/catalogue.mjs';
import { createStringsServer, readStrings, writeReviews, writeString } from '../scripts/strings.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'strings-'));
  roots.push(root);
  mkdirSync(join(root, 'messages'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'docs/agents'), { recursive: true });
  writeFileSync(join(root, 'docs/agents/copy-coverage-50.json'), JSON.stringify({
    greeting: { owner: 38 }, readings: { owner: 39 }
  }));
  const en = {
    $schema: 'schema', greeting: 'Hello', missing: 'Only English', orphan: 'Unused',
    readings: [{ declarations: ['input count'], selectors: ['countPlural'], match: {
      'countPlural=one': 'One reading', 'countPlural=other': '{count} readings'
    } }]
  };
  const pl = {
    $schema: 'schema', greeting: 'Dzień dobry', orphan: 'Zapisałaś',
    readings: [{ declarations: ['input count'], selectors: ['countPlural'], match: {
      'countPlural=one': 'Jeden odczyt', 'countPlural=few': '{count} odczyty',
      'countPlural=many': '{count} odczytów', 'countPlural=other': '{count} odczytu'
    } }]
  };
  writeFileSync(join(root, 'messages/en.json'), serializeCatalogue(en));
  writeFileSync(join(root, 'messages/pl.json'), serializeCatalogue(pl));
  writeFileSync(join(root, 'src/page.ts'), 'm.greeting();\nmessages.readings({count: 2});\nm.greeting();\n');
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  commit(root, 'Initial catalogues');
  return root;
}

function commit(root: string, message: string) {
  execFileSync('git', ['-C', root, 'add', 'src', 'messages']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', message]);
}

function plainEdit(text = 'Welcome', previous = 'Hello') {
  return { locale: 'en', key: 'greeting', variant: null, form: null, previous, text };
}

describe('strings read/write', () => {
  it('groups keys by their copy review theme and keeps unmapped keys visible', () => {
    expect(readStrings(fixture()).map(({ key, theme }) => ({ key, theme }))).toEqual([
      { key: 'greeting', theme: 'Journal, day, search and readback' },
      { key: 'missing', theme: 'Unassigned copy' },
      { key: 'orphan', theme: 'Unassigned copy' },
      { key: 'readings', theme: 'Body, care and health' }
    ]);
  });

  it('has no changed keys on main', () => {
    expect(readStrings(fixture()).filter((row) => row.change)).toEqual([]);
  });

  it('marks added, changed and removed keys against main with both old and new locales', () => {
    const root = fixture();
    execFileSync('git', ['-C', root, 'checkout', '-qb', 'copy-review']);
    for (const locale of ['en', 'pl']) {
      const file = join(root, `messages/${locale}.json`);
      const catalogue = JSON.parse(readFileSync(file, 'utf8'));
      catalogue.added = locale === 'en' ? 'New text' : 'Nowy tekst';
      catalogue.greeting = locale === 'en' ? 'Welcome' : 'Witaj';
      delete catalogue.orphan;
      writeFileSync(file, serializeCatalogue(catalogue));
    }
    commit(root, 'Change copy');
    const changes = readStrings(root).filter((row) => row.change);
    expect(changes.map(({ key, change, en, pl, previous }) => ({ key, change, en, pl, previous }))).toEqual([
      { key: 'added', change: 'added', en: 'New text', pl: 'Nowy tekst', previous: { en: null, pl: null } },
      { key: 'greeting', change: 'changed', en: 'Welcome', pl: 'Witaj', previous: { en: 'Hello', pl: 'Dzień dobry' } },
      { key: 'orphan', change: 'removed', en: null, pl: null, previous: { en: 'Unused', pl: 'Zapisałaś' } }
    ]);
  });

  it('uses the merge-base rather than later main changes and includes unsaved edits', () => {
    const root = fixture();
    execFileSync('git', ['-C', root, 'branch', 'copy-review']);
    writeString(root, plainEdit('Main text'));
    commit(root, 'Change main copy');
    execFileSync('git', ['-C', root, 'checkout', '-q', 'copy-review']);
    expect(readStrings(root).filter((row) => row.change)).toEqual([]);
    writeString(root, plainEdit('Branch text'));
    const greeting = readStrings(root).find((row) => row.key === 'greeting')!;
    expect(greeting.change).toBe('changed');
    expect(greeting.en).toBe('Branch text');
    expect(greeting.previous).toEqual({ en: 'Hello', pl: 'Dzień dobry' });
  });

  it('reads disk values, declared plural forms, findings and every source location', () => {
    const root = fixture();
    const rows = readStrings(root);
    expect(rows.map((row) => row.key)).toEqual(['greeting', 'missing', 'orphan', 'readings']);
    const greeting = rows.find((row) => row.key === 'greeting')!;
    expect(greeting.pl).toBe('Dzień dobry');
    expect(greeting.sites).toEqual([1, 3].map((line) => ({
      file: 'src/page.ts', line, href: `vscode://file${root}/src/page.ts:${line}`
    })));
    expect(greeting.findings).toEqual([]);
    expect(Object.keys(rows.find((row) => row.key === 'readings')!.pl[0].match)).toEqual([
      'countPlural=one', 'countPlural=few', 'countPlural=many', 'countPlural=other'
    ]);
    expect(rows.find((row) => row.key === 'missing')!.findings).toContain('missing is missing from messages/pl.json');
    expect(rows.find((row) => row.key === 'orphan')!.findings).toEqual([
      'orphan genders the reader: "Zapisałaś" in messages/pl.json',
      'orphan is in the catalogues but nothing calls m.orphan or messages.orphan'
    ]);
    const plFile = join(root, 'messages/pl.json');
    const pl = JSON.parse(readFileSync(plFile, 'utf8'));
    pl.greeting = 'Witaj';
    writeFileSync(plFile, serializeCatalogue(pl));
    expect(readStrings(root).find((row) => row.key === 'greeting')!.pl).toBe('Witaj');
  });

  it('writes one plain value and one Polish few form, changing one line each', () => {
    const root = fixture();
    const enFile = join(root, 'messages/en.json');
    const plFile = join(root, 'messages/pl.json');
    const enBefore = readFileSync(enFile, 'utf8');
    const plBefore = readFileSync(plFile, 'utf8');
    writeString(root, plainEdit());
    expect(readFileSync(enFile, 'utf8')).toBe(enBefore.replace('"greeting": "Hello"', '"greeting": "Welcome"'));
    expect(readFileSync(plFile, 'utf8')).toBe(plBefore);
    writeString(root, { locale: 'pl', key: 'readings', variant: 0, form: 'countPlural=few',
      previous: '{count} odczyty', text: 'Odczyty: {count}' });
    expect(readFileSync(plFile, 'utf8')).toBe(plBefore.replace(
      '"countPlural=few": "{count} odczyty"', '"countPlural=few": "Odczyty: {count}"'
    ));
    expect(readFileSync(enFile, 'utf8')).toBe(enBefore.replace('"greeting": "Hello"', '"greeting": "Welcome"'));
    const changes = readStrings(root).filter((row) => row.change);
    expect(changes.map(({ key, change }) => ({ key, change }))).toEqual([
      { key: 'greeting', change: 'changed' }, { key: 'readings', change: 'changed' }
    ]);
    const readings = changes.find((row) => row.key === 'readings')!;
    expect(readings.previous.pl[0].match['countPlural=few']).toBe('{count} odczyty');
    expect(readings.pl[0].match['countPlural=few']).toBe('Odczyty: {count}');
  });

  it('preserves independent edits and rejects a stale same-field save', () => {
    const root = fixture();
    writeString(root, plainEdit());
    writeString(root, { ...plainEdit(), key: 'missing', previous: 'Only English', text: 'Still English' });
    expect(() => writeString(root, plainEdit('Stale'))).toThrow('Value changed on disk');
    const en = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8'));
    expect(en.greeting).toBe('Welcome');
    expect(en.missing).toBe('Still English');
  });

  it.each([
    { locale: '../pl' }, { key: '$schema' }, { key: 'new_key' }, { key: '__proto__' },
    { text: null }, { previous: null }, { variant: 0 },
    { key: 'readings', variant: 0, form: 'countPlural=few' },
    { key: 'readings', variant: -1, form: 'countPlural=one' }
  ])('rejects invalid edits without changing bytes: %j', (edit) => {
    const root = fixture();
    const before = readFileSync(join(root, 'messages/en.json'), 'utf8');
    expect(() => writeString(root, { ...plainEdit(), ...edit })).toThrow();
    expect(readFileSync(join(root, 'messages/en.json'), 'utf8')).toBe(before);
  });

  it('reports temporary gendered Polish text through the shared check', () => {
    const root = fixture();
    writeString(root, { locale: 'pl', key: 'greeting', variant: null, form: null,
      previous: 'Dzień dobry', text: 'Zapisałaś' });
    expect(readStrings(root).find((row) => row.key === 'greeting')!.findings).toEqual([
      'greeting genders the reader: "Zapisałaś" in messages/pl.json'
    ]);
  });
});

describe('strings HTTP server', () => {
  it('serves without an app build, saves locally and rejects foreign origins and invalid requests', async () => {
    const root = fixture();
    const server = createStringsServer(root);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing server address');
      const url = `http://127.0.0.1:${address.port}`;
      const page = await fetch(url);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>Message catalogues</title>');
      expect(page.headers.get('cache-control')).toBe('no-store');
      const rows = await (await fetch(`${url}/api/strings`)).json();
      expect(rows.find((row: { key: string }) => row.key === 'greeting').pl).toBe('Dzień dobry');
      expect(rows.filter((row: { change: string | null }) => row.change)).toEqual([]);
      const patch = (body: string, headers: Record<string, string> = {}) => fetch(`${url}/api/strings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body
      });
      expect((await patch(JSON.stringify(plainEdit()), { Origin: 'https://example.com' })).status).toBe(403);
      const foreignHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        get(`${url}/api/strings`, { headers: { Host: 'example.com' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        }).on('error', reject);
      });
      expect(foreignHostStatus).toBe(403);
      expect((await patch(JSON.stringify(plainEdit()), { 'Content-Type': 'text/plain' })).status).toBe(415);
      expect((await patch('{')).status).toBe(400);
      expect((await patch(JSON.stringify(plainEdit()), { Origin: url })).status).toBe(204);
      expect((await patch(JSON.stringify(plainEdit('Stale')))).status).toBe(409);
      expect(JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8')).greeting).toBe('Welcome');
      const body = Buffer.from(JSON.stringify({ ...plainEdit(), locale: 'pl', previous: 'Dzień dobry', text: 'Miłego dnia' }));
      const split = body.indexOf(Buffer.from('ł')) + 1;
      const saved = await new Promise<number | undefined>((resolve, reject) => {
        const outgoing = request(`${url}/api/strings`, { method: 'PATCH', headers: {
          'Content-Type': 'application/json', 'Content-Length': body.length
        } }, (response) => { response.resume(); resolve(response.statusCode); });
        outgoing.on('error', reject);
        outgoing.write(body.subarray(0, split));
        setTimeout(() => outgoing.end(body.subarray(split)), 25);
      });
      expect(saved).toBe(204);
      expect(JSON.parse(readFileSync(join(root, 'messages/pl.json'), 'utf8')).greeting).toBe('Miłego dnia');
      const updated = await (await fetch(`${url}/api/strings`)).json();
      expect(updated.find((row: { key: string }) => row.key === 'greeting')).toMatchObject({
        change: 'changed', pl: 'Miłego dnia', previous: { en: 'Hello', pl: 'Dzień dobry' }
      });
      const review = { reviewed: true, keys: updated.filter((row: { key: string }) => row.key === 'greeting') };
      const reviewPatch = (body: unknown, origin = url) => fetch(`${url}/api/reviews`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body)
      });
      expect((await reviewPatch(review, 'https://example.com')).status).toBe(403);
      expect((await reviewPatch(review)).status).toBe(204);
      expect(readStrings(root).find((row) => row.key === 'greeting')?.reviewed).toBe(true);
      expect((await reviewPatch({ ...review, keys: [{ ...review.keys[0], pl: 'Stale' }] })).status).toBe(409);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

describe('copy review memory', () => {
  it('persists a group and individual unchecking without changing catalogues', () => {
    const root = fixture();
    const before = ['en', 'pl'].map((locale) => readFileSync(join(root, `messages/${locale}.json`), 'utf8'));
    const keys = readStrings(root).filter((row) => ['greeting', 'readings'].includes(row.key));
    writeReviews(root, { keys, reviewed: true });
    expect(readStrings(root).filter((row) => row.reviewed).map((row) => row.key)).toEqual(['greeting', 'readings']);
    writeReviews(root, { keys: keys.slice(0, 1), reviewed: false });
    expect(readStrings(root).filter((row) => row.reviewed).map((row) => row.key)).toEqual(['readings']);
    expect(['en', 'pl'].map((locale) => readFileSync(join(root, `messages/${locale}.json`), 'utf8'))).toEqual(before);
    expect(JSON.parse(readFileSync(join(root, '.scratch/copy-review.json'), 'utf8')).readings).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reopens only changed copy, including English and Polish plural forms', () => {
    const root = fixture();
    writeReviews(root, { keys: readStrings(root), reviewed: true });
    writeString(root, plainEdit());
    writeString(root, { locale: 'pl', key: 'readings', variant: 0, form: 'countPlural=few',
      previous: '{count} odczyty', text: 'Odczyty: {count}' });
    expect(readStrings(root).filter((row) => !row.reviewed).map((row) => row.key)).toEqual(['greeting', 'readings']);
  });

  it('rejects stale group approval without partly saving it or losing prior progress', () => {
    const root = fixture();
    const keys = readStrings(root);
    writeReviews(root, { keys: keys.filter((row) => row.key === 'missing'), reviewed: true });
    const before = readFileSync(join(root, '.scratch/copy-review.json'), 'utf8');
    writeString(root, { ...plainEdit(), key: 'orphan', previous: 'Unused', text: 'Changed outside the editor' });
    expect(() => writeReviews(root, { keys, reviewed: true })).toThrow('Copy changed for orphan');
    expect(readFileSync(join(root, '.scratch/copy-review.json'), 'utf8')).toBe(before);
  });

  it.each([null, {}, { reviewed: true, keys: [] }, { reviewed: 'yes', keys: [] },
    { reviewed: true, keys: [null] }, { reviewed: true, keys: [{ key: '__proto__' }] },
    { reviewed: true, keys: [{ key: '$schema' }] }, { reviewed: true, keys: [{ key: 'unknown' }] }
  ])('rejects invalid review requests: %j', (review) => {
    const root = fixture();
    expect(() => writeReviews(root, review)).toThrow();
    expect(readStrings(root).some((row) => row.reviewed)).toBe(false);
  });

  it('reports damaged review memory rather than silently discarding it', () => {
    const root = fixture();
    mkdirSync(join(root, '.scratch'));
    writeFileSync(join(root, '.scratch/copy-review.json'), '{broken');
    expect(() => readStrings(root)).toThrow();
  });
});

describe('copy outside the catalogues', () => {
  const files: Record<string, string> = {
    'android/app/src/main/res/values/strings.xml': `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">engender</string>
    <!-- a comment -->
    <string name="widget_title">Log the moment</string>
    <string-array name="widget_labels">
        <item>Misgendered</item>
        <item>Correctly gendered</item>
    </string-array>
</resources>
`,
    'android/app/src/main/res/values-pl/strings.xml': `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="widget_title">Zapisz moment</string>
    <string-array name="widget_labels">
        <item>Misgenderowanie</item>
        <item>Właściwe formy</item>
    </string-array>
</resources>
`,
    'static/manifest.webmanifest': `{
  "name": "engender",
  "description": "Your journal is stored on this device.",
  "icons": [{ "src": "/i.svg" }],
  "shortcuts": [{ "name": "New entry", "short_name": "New entry", "url": "/entry" }]
}
`,
    'static/manifest-pl.webmanifest': `{
  "name": "engender",
  "description": "Dziennik jest zapisany na tym urządzeniu.",
  "icons": [{ "src": "/i.svg" }],
  "shortcuts": [{ "name": "Nowy wpis", "short_name": "Nowy wpis", "url": "/entry" }]
}
`,
    'fastlane/metadata/android/en-US/title.txt': 'engender: mood journal\n',
    'fastlane/metadata/android/pl-PL/title.txt': 'engender: dziennik tranzycji\n',
    'fastlane/metadata/android/en-US/changelogs/7.txt': 'First release.\n',
    'fastlane/metadata/android/pl-PL/changelogs/7.txt': 'Pierwsza wersja.\n',
    'docs/privacy-policy.en.md': '# Privacy policy\n\nNothing leaves the device.\nNot even crash reports.\n\n## Contact\n',
    'docs/privacy-policy.pl.md': '# Polityka prywatności\n\nNic nie opuszcza urządzenia.\nNawet raporty awarii.\n\n## Kontakt\n'
  };

  function sources() {
    const root = fixture();
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), text);
    }
    execFileSync('git', ['-C', root, 'add', '-A']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Add copy outside the catalogues']);
    return root;
  }

  const outside = (root: string) => readStrings(root).filter((row) => row.key.includes(':'));
  const edit = (key: string, locale: 'en' | 'pl', previous: string, text: string) =>
    ({ locale, key, variant: null, form: null, previous, text });

  it('pairs every translated value with its English, by source, with a link to both files', () => {
    const root = sources();
    const rows = outside(root);
    expect(rows.map(({ key, theme, en, pl }) => ({ key, theme, en, pl }))).toEqual([
      { key: 'android:widget_labels.1', theme: 'Android, store and web install', en: 'Misgendered', pl: 'Misgenderowanie' },
      { key: 'android:widget_labels.2', theme: 'Android, store and web install', en: 'Correctly gendered', pl: 'Właściwe formy' },
      { key: 'android:widget_title', theme: 'Android, store and web install', en: 'Log the moment', pl: 'Zapisz moment' },
      { key: 'manifest:description', theme: 'Android, store and web install', en: 'Your journal is stored on this device.', pl: 'Dziennik jest zapisany na tym urządzeniu.' },
      { key: 'manifest:name', theme: 'Android, store and web install', en: 'engender', pl: 'engender' },
      { key: 'manifest:shortcuts.1.name', theme: 'Android, store and web install', en: 'New entry', pl: 'Nowy wpis' },
      { key: 'manifest:shortcuts.1.short_name', theme: 'Android, store and web install', en: 'New entry', pl: 'Nowy wpis' },
      { key: 'privacy:01', theme: 'Privacy policy', en: '# Privacy policy', pl: '# Polityka prywatności' },
      { key: 'privacy:02', theme: 'Privacy policy', en: 'Nothing leaves the device.\nNot even crash reports.', pl: 'Nic nie opuszcza urządzenia.\nNawet raporty awarii.' },
      { key: 'privacy:03', theme: 'Privacy policy', en: '## Contact', pl: '## Kontakt' },
      { key: 'store:changelogs/7', theme: 'Android, store and web install', en: 'First release.', pl: 'Pierwsza wersja.' },
      { key: 'store:title', theme: 'Android, store and web install', en: 'engender: mood journal', pl: 'engender: dziennik tranzycji' }
    ]);
    expect(rows.every((row) => row.change === null && !row.reviewed && row.findings.length === 0)).toBe(true);
    expect(rows.find((row) => row.key === 'privacy:02')!.sites).toEqual([
      { file: 'docs/privacy-policy.en.md', line: 3, href: `vscode://file${root}/docs/privacy-policy.en.md:3` },
      { file: 'docs/privacy-policy.pl.md', line: 3, href: `vscode://file${root}/docs/privacy-policy.pl.md:3` }
    ]);
  });

  it('writes each value back into its own file and leaves every other byte alone', () => {
    const root = sources();
    writeString(root, edit('android:widget_title', 'pl', 'Zapisz moment', "Zapisz chwilę & to, co 'ważne'"));
    writeString(root, edit('android:widget_labels.2', 'pl', 'Właściwe formy', 'Dobre zaimki'));
    writeString(root, edit('manifest:shortcuts.1.name', 'pl', 'Nowy wpis', 'Dodaj „wpis”'));
    writeString(root, edit('store:title', 'en', 'engender: mood journal', 'engender: transition journal'));
    writeString(root, edit('privacy:02', 'pl', 'Nic nie opuszcza urządzenia.\nNawet raporty awarii.', 'Nic nie wychodzi poza urządzenie.'));
    const read = (file: string) => readFileSync(join(root, file), 'utf8');
    expect(read('android/app/src/main/res/values-pl/strings.xml')).toBe(files['android/app/src/main/res/values-pl/strings.xml']
      .replace('>Zapisz moment<', ">Zapisz chwilę &amp; to, co \\'ważne\\'<").replace('Właściwe formy', 'Dobre zaimki'));
    expect(read('static/manifest-pl.webmanifest')).toBe(files['static/manifest-pl.webmanifest']
      .replace('"name": "Nowy wpis"', '"name": "Dodaj „wpis”"'));
    expect(read('fastlane/metadata/android/en-US/title.txt')).toBe('engender: transition journal\n');
    expect(read('docs/privacy-policy.pl.md')).toBe(files['docs/privacy-policy.pl.md']
      .replace('Nic nie opuszcza urządzenia.\nNawet raporty awarii.', 'Nic nie wychodzi poza urządzenie.'));
    const title = outside(root).find((row) => row.key === 'android:widget_title')!;
    expect(title.pl).toBe("Zapisz chwilę & to, co 'ważne'");
    expect(title.change).toBe('changed');
    expect(title.previous).toEqual({ en: 'Log the moment', pl: 'Zapisz moment' });
  });

  it.each([
    edit('android:widget_title', 'pl', 'Stale', 'X'),
    edit('android:app_name', 'pl', 'engender', 'X'),
    edit('android:nothing', 'en', 'X', 'Y'),
    edit('store:../../secret', 'en', 'X', 'Y'),
    edit('privacy:99', 'en', 'X', 'Y'),
    { ...edit('store:title', 'en', 'engender: mood journal', 'X'), variant: 0 },
    edit('privacy:02', 'en', 'Nothing leaves the device.\nNot even crash reports.', 'Two\n\nparagraphs')
  ])('refuses %j without touching any file', (bad) => {
    const root = sources();
    const before = Object.keys(files).map((file) => readFileSync(join(root, file), 'utf8'));
    expect(() => writeString(root, bad)).toThrow();
    expect(Object.keys(files).map((file) => readFileSync(join(root, file), 'utf8'))).toEqual(before);
  });

  it('round-trips Android escapes, skips untranslatable strings and locks markup', () => {
    const root = sources();
    const pl = 'android/app/src/main/res/values-pl/strings.xml';
    const file = join(root, pl);
    writeFileSync(file, readFileSync(file, 'utf8').replace('</resources>',
      '    <string name="fixed" translatable="false">x</string>\n    <string name="bold">Ala <b>ma</b> kota</string>\n' +
      '    <string name="escaped">A\\nB \\u0041 &quot;q&quot;</string>\n</resources>'));
    const rows = outside(root);
    expect(rows.some((row) => row.key === 'android:fixed')).toBe(false);
    expect(rows.find((row) => row.key === 'android:escaped')!.pl).toBe('A\nB A "q"');
    expect(rows.find((row) => row.key === 'android:bold')!.findings).toContain('android:bold: This string holds markup. Edit it in the file.');
    expect(() => writeString(root, edit('android:bold', 'pl', 'Ala <b>ma</b> kota', 'X'))).toThrow('markup');
    const typed = '@home\nline two \\ end';
    writeString(root, edit('android:widget_title', 'pl', 'Zapisz moment', typed));
    expect(readFileSync(file, 'utf8')).toContain('>\\@home\\nline two \\\\ end<');
    expect(outside(root).find((row) => row.key === 'android:widget_title')!.pl).toBe(typed);
  });

  it('names manifest fields by their JSON path, whatever the key order', () => {
    const root = sources();
    writeFileSync(join(root, 'static/manifest-pl.webmanifest'), `{
  "shortcuts": [{ "short_name": "Nowy", "name": "Nowy wpis", "url": "/entry" }],
  "share_target": { "params": { "name": "tytuł" } },
  "description": "Opis",
  "name": "engender"
}
`);
    const rows = outside(root).filter((row) => row.key.startsWith('manifest:'));
    expect(rows.map(({ key, en, pl }) => ({ key, en, pl }))).toEqual([
      { key: 'manifest:description', en: 'Your journal is stored on this device.', pl: 'Opis' },
      { key: 'manifest:name', en: 'engender', pl: 'engender' },
      { key: 'manifest:shortcuts.1.name', en: 'New entry', pl: 'Nowy wpis' },
      { key: 'manifest:shortcuts.1.short_name', en: 'New entry', pl: 'Nowy' }
    ]);
    writeString(root, edit('manifest:name', 'pl', 'engender', 'Notatki'));
    expect(readFileSync(join(root, 'static/manifest-pl.webmanifest'), 'utf8')).toContain('"params": { "name": "tytuł" }');
    expect(readFileSync(join(root, 'static/manifest-pl.webmanifest'), 'utf8')).toContain('"name": "Notatki"\n}');
  });

  it('lists English with no Polish, store text over Play limits and policies that stopped pairing', () => {
    const root = sources();
    writeFileSync(join(root, 'fastlane/metadata/android/en-US/changelogs/8.txt'), 'Second release.\n');
    writeFileSync(join(root, 'fastlane/metadata/android/pl-PL/title.txt'), 'engender: dziennik tranzycji i więcej\n');
    writeFileSync(join(root, 'docs/privacy-policy.en.md'), files['docs/privacy-policy.en.md'] + '\nA new paragraph.\n');
    const rows = outside(root);
    expect(rows.find((row) => row.key === 'store:changelogs/8')).toMatchObject({
      en: 'Second release.', pl: null,
      findings: ['store:changelogs/8 is missing from fastlane/metadata/android/pl-PL/changelogs/8.txt']
    });
    expect(rows.find((row) => row.key === 'store:title')!.findings).toEqual([
      'store:title is 37 characters in fastlane/metadata/android/pl-PL/title.txt; Play allows 30'
    ]);
    expect(rows.find((row) => row.key === 'privacy:01')!.findings).toEqual([
      'docs/privacy-policy.en.md has 4 paragraphs and docs/privacy-policy.pl.md has 3, so pairs after the difference are off'
    ]);
  });

  it('treats a whitespace-only line as a paragraph break', () => {
    const root = sources();
    writeFileSync(join(root, 'docs/privacy-policy.pl.md'), '# Polityka\n   \nAkapit.\n');
    expect(outside(root).filter((row) => row.key.startsWith('privacy:')).map((row) => row.pl)).toEqual(['# Polityka', 'Akapit.', null]);
    writeString(root, edit('privacy:02', 'pl', 'Akapit.', 'Inny akapit.'));
    expect(readFileSync(join(root, 'docs/privacy-policy.pl.md'), 'utf8')).toBe('# Polityka\n   \nInny akapit.\n');
  });

  it('remembers a review of outside copy and reopens it when the text changes', () => {
    const root = sources();
    writeReviews(root, { reviewed: true, keys: outside(root).filter((row) => row.key.startsWith('store:')) });
    expect(outside(root).filter((row) => row.reviewed).map((row) => row.key)).toEqual(['store:changelogs/7', 'store:title']);
    writeString(root, edit('store:title', 'pl', 'engender: dziennik tranzycji', 'engender: dziennik'));
    expect(outside(root).filter((row) => row.reviewed).map((row) => row.key)).toEqual(['store:changelogs/7']);
  });
});
