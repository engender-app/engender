import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { afterEach, test, vi } from 'vitest';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { daylioBackupPreview } from './daylioBackup';

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
  daylio: { metadata: { platform: 'android' }, customMoods: [], dayEntries: [] }
};

for (const kind of ['daylio'] as const) {
  for (const at of [1, 2]) {
    for (const error of [new Error('unexpected infrastructure failure'),
      Object.assign(new Error('unexpected decoder lifecycle failure'), { code: 4 }),
      new RangeError('Array buffer allocation failed')]) {
      test(`${kind} preserves ${error.message} during ${at === 1 ? 'opening' : 'member read'}`, async () => {
        const json = JSON.stringify(payloads[kind]);
        const name = 'backup.daylio';
        const bytes = zipSync({ [name]: strToU8(Buffer.from(json).toString('base64')) });
        // StreamFinished is a caller/stream lifecycle error, not corrupt input.
        failure.at = at;
        failure.error = error;
        const preview = daylioBackupPreview(bytes, emptyArchiveJournal(), naming);
        await assert.rejects(preview, observed => observed === error);
      });
    }
  }
}

const zipPayload = (json: string) => zipSync({ 'backup.daylio': strToU8(Buffer.from(json).toString('base64')) });
const preview = (bytes: Uint8Array) => daylioBackupPreview(bytes, emptyArchiveJournal(), naming);

test('daylio preserves unexpected JSON parser failure', async () => {
  const json = JSON.stringify(payloads.daylio);
  const bytes = zipPayload(json);
  const error = new Error('unexpected JSON parser failure');
  const parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === json) throw error;
    return parse(text, reviver);
  });
  await assert.rejects(preview(bytes), observed => observed === error);
});

test('Daylio preserves base64 decoder infrastructure failure', async () => {
  const bytes = zipPayload(JSON.stringify(payloads.daylio));
  const error = new Error('base64 infrastructure unavailable');
  vi.spyOn(globalThis, 'atob').mockImplementation(() => { throw error; });
  await assert.rejects(preview(bytes), observed => observed === error);
});

test('Daylio preserves allocation failure while decoding base64', async () => {
  const bytes = zipPayload(JSON.stringify(payloads.daylio));
  const error = new RangeError('Array buffer allocation failed');
  vi.spyOn(Uint8Array, 'from').mockImplementation(() => { throw error; });
  await assert.rejects(preview(bytes), observed => observed === error);
});

test('Daylio preserves UTF-8 decoder infrastructure failure', async () => {
  const bytes = zipPayload(JSON.stringify(payloads.daylio));
  const error = new Error('UTF-8 infrastructure unavailable');
  const decode = TextDecoder.prototype.decode;
  vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation(function (this: TextDecoder, input, options) {
    if (this.fatal) throw error;
    return decode.call(this, input, options);
  });
  await assert.rejects(preview(bytes), observed => observed === error);
});

test('Daylio preserves unexpected optional metadata parser failure', async () => {
  const metadata = '{"Name":"synthetic.mp3"}';
  const bytes = zipPayload(JSON.stringify({ ...payloads.daylio,
    assets: [{ id: 1, checksum: 'synthetic', android_metadata: metadata }]
  }));
  const error = new Error('optional metadata parser unavailable');
  const parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === metadata) throw error;
    return parse(text, reviver);
  });
  await assert.rejects(preview(bytes), observed => observed === error);
});
