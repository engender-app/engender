import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { afterEach, test, vi } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { dayonePreview } from './dayone';
import { daylioBackupPreview } from './daylioBackup';
import { transTracksPreview } from './transtracks';

const failure = vi.hoisted(() => ({ calls: 0, at: 0, error: null as Error | null }));
vi.mock('fflate', async importOriginal => {
  const actual = await importOriginal<typeof import('fflate')>();
  return {
    ...actual,
    unzipSync(bytes: Uint8Array, options: import('fflate').UnzipOptions) {
      if (++failure.calls === failure.at) throw failure.error;
      return actual.unzipSync(bytes, options);
    }
  };
});
afterEach(() => { failure.calls = 0; failure.at = 0; failure.error = null; vi.restoreAllMocks(); });

const naming = { tagLabels: () => [] };
const payloads = {
  dayone: { metadata: { version: '1.0' }, entries: [] },
  daylio: { metadata: { platform: 'android' }, customMoods: [], dayEntries: [] },
  transtracks: { photos: [], milestones: [] }
};

for (const kind of ['dayone', 'daylio', 'transtracks'] as const) {
  for (const at of [1, 2]) {
    for (const error of [new Error('unexpected infrastructure failure'),
      Object.assign(new Error('unexpected decoder lifecycle failure'), { code: 4 }),
      new RangeError('Array buffer allocation failed')]) {
      test(`${kind} preserves ${error.message} during ${at === 1 ? 'opening' : 'member read'}`, async () => {
        const json = JSON.stringify(payloads[kind]);
        const name = kind === 'dayone' ? 'Journal.json' : kind === 'daylio' ? 'backup.daylio' : 'data.json';
        const bytes = zipSync({ [name]: strToU8(kind === 'daylio' ? Buffer.from(json).toString('base64') : json) });
        // StreamFinished is a caller/stream lifecycle error, not corrupt input.
        failure.at = at;
        failure.error = error;
        const preview = kind === 'dayone' ? dayonePreview(bytes, emptyArchiveJournal(), naming)
          : kind === 'daylio' ? daylioBackupPreview(bytes, emptyArchiveJournal(), naming)
          : transTracksPreview(bytes, emptyArchiveJournal());
        await assert.rejects(preview, observed => observed === error);
      });
    }
  }
}

const zipPayload = (kind: keyof typeof payloads, json: string) => zipSync({
  [kind === 'dayone' ? 'Journal.json' : kind === 'daylio' ? 'backup.daylio' : 'data.json']:
    strToU8(kind === 'daylio' ? Buffer.from(json).toString('base64') : json)
});
const preview = (kind: keyof typeof payloads, bytes: Uint8Array) => kind === 'dayone'
  ? dayonePreview(bytes, emptyArchiveJournal(), naming)
  : kind === 'daylio' ? daylioBackupPreview(bytes, emptyArchiveJournal(), naming)
  : transTracksPreview(bytes, emptyArchiveJournal());

for (const kind of ['dayone', 'daylio', 'transtracks'] as const) {
  test(`${kind} preserves unexpected JSON parser failure`, async () => {
    const json = JSON.stringify(payloads[kind]);
    const bytes = zipPayload(kind, json);
    const error = new Error('unexpected JSON parser failure');
    const parse = JSON.parse;
    vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
      if (text === json) throw error;
      return parse(text, reviver);
    });
    await assert.rejects(preview(kind, bytes), observed => observed === error);
  });
}

test('Day One preserves unexpected rich-text parser failure', async () => {
  const richText = '{"contents":[]}';
  const bytes = zipPayload('dayone', JSON.stringify({ metadata: { version: '1.0' }, entries: [{
    uuid: '5E2B69750D5248378592CC8DAE174009', creationDate: '2026-01-15T14:30:00Z',
    timeZone: 'UTC', text: '', richText
  }] }));
  const error = new Error('unexpected rich-text parser failure');
  const parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === richText) throw error;
    return parse(text, reviver);
  });
  await assert.rejects(preview('dayone', bytes), observed => observed === error);
});

test('Day One preserves unexpected calendar infrastructure failure', async () => {
  const bytes = zipPayload('dayone', JSON.stringify({ metadata: { version: '1.0' }, entries: [{
    uuid: '5E2B69750D5248378592CC8DAE174009', creationDate: '2026-01-15T14:30:00Z',
    timeZone: 'UTC', text: 'synthetic'
  }] }));
  const error = new Error('calendar infrastructure unavailable');
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () { throw error; });
  await assert.rejects(preview('dayone', bytes), observed => observed === error);
});

test('Daylio preserves base64 decoder infrastructure failure', async () => {
  const bytes = zipPayload('daylio', JSON.stringify(payloads.daylio));
  const error = new Error('base64 infrastructure unavailable');
  vi.spyOn(globalThis, 'atob').mockImplementation(() => { throw error; });
  await assert.rejects(preview('daylio', bytes), observed => observed === error);
});

test('Daylio preserves allocation failure while decoding base64', async () => {
  const bytes = zipPayload('daylio', JSON.stringify(payloads.daylio));
  const error = new RangeError('Array buffer allocation failed');
  vi.spyOn(Uint8Array, 'from').mockImplementation(() => { throw error; });
  await assert.rejects(preview('daylio', bytes), observed => observed === error);
});

test('Daylio preserves UTF-8 decoder infrastructure failure', async () => {
  const bytes = zipPayload('daylio', JSON.stringify(payloads.daylio));
  const error = new Error('UTF-8 infrastructure unavailable');
  const decode = TextDecoder.prototype.decode;
  vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation(function (this: TextDecoder, input, options) {
    if (this.fatal) throw error;
    return decode.call(this, input, options);
  });
  await assert.rejects(preview('daylio', bytes), observed => observed === error);
});

test('Day One preserves failures while formatting a valid calendar date', async () => {
  const bytes = zipPayload('dayone', JSON.stringify({ metadata: { version: '1.0' }, entries: [{
    uuid: '5E2B69750D5248378592CC8DAE174009', creationDate: '2026-01-15T14:30:00Z',
    timeZone: 'UTC', text: 'synthetic'
  }] }));
  const error = new RangeError('calendar infrastructure unavailable');
  vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockImplementation(() => { throw error; });
  await assert.rejects(preview('dayone', bytes), observed => observed === error);
});

test('Daylio preserves unexpected optional metadata parser failure', async () => {
  const metadata = '{"Name":"synthetic.mp3"}';
  const bytes = zipPayload('daylio', JSON.stringify({ ...payloads.daylio,
    assets: [{ id: 1, checksum: 'synthetic', android_metadata: metadata }]
  }));
  const error = new Error('optional metadata parser unavailable');
  const parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === metadata) throw error;
    return parse(text, reviver);
  });
  await assert.rejects(preview('daylio', bytes), observed => observed === error);
});
