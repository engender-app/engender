import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeCatalogue } from '../scripts/catalogue.mjs';
import { createStringsServer, readStrings, writeString } from '../scripts/strings.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'strings-'));
  roots.push(root);
  mkdirSync(join(root, 'messages'));
  mkdirSync(join(root, 'src'));
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
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', 'src']);
  return root;
}

function plainEdit(text = 'Welcome', previous = 'Hello') {
  return { locale: 'en', key: 'greeting', variant: null, form: null, previous, text };
}

describe('strings read/write', () => {
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
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
