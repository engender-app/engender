import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import legacy from './legacy-ocr-assets.json';
import { retainedOcr, retainPreviousOcr } from './retained-ocr';

function store(entries: Record<string, Record<string, string | Uint8Array>>) {
  const contents = new Map(Object.entries(entries).map(([name, rows]) => [name, new Map(Object.entries(rows))]));
  return {
    keys: async () => [...contents.keys()],
    delete: async (name: string) => contents.delete(name),
    open: async (name: string) => {
      const rows = contents.get(name)!;
      return {
        keys: async () => [...rows.keys()].map(path => new Request('https://journal.example' + path)),
        delete: async (request: Request) => rows.delete(new URL(request.url).pathname),
        match: async (request: Request) => {
          const body = rows.get(new URL(request.url).pathname);
          return body === undefined ? undefined : new Response(body as BodyInit);
        }
      };
    }
  } as unknown as CacheStorage;
}

const library = new Uint8Array(gunzipSync(readFileSync('scripts/vendor/legacy-ocr/pre21-tesseract.js.gz')));

describe('retained OCR', () => {
  test('keeps the exact legacy library and models while dropping unrelated old shell bytes', async () => {
    const caches = store({ 'engender-shell-old': { [legacy[0].path]: library,
      '/tesseract/lang-data/eng.traineddata.gz': 'old model', '/_app/immutable/chunks/other.js': 'other' },
      'engender-shell-current': { '/': 'current' }, foreign: { '/unrelated': 'foreign' } });
    await retainPreviousOcr(caches, 'engender-shell-current', '');
    expect((await (await caches.open('engender-shell-old')).keys()).map(request => new URL(request.url).pathname))
      .toEqual([legacy[0].path, '/tesseract/lang-data/eng.traineddata.gz']);
    expect(await caches.keys()).toEqual(['engender-shell-old', 'engender-shell-current', 'foreign']);
    const response = await retainedOcr(caches, 'engender-shell-current', new Request('https://journal.example' + legacy[0].path), '');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(library);
    expect(await retainedOcr(caches, 'engender-shell-current', new Request('https://journal.example/unrelated'), '')).toBeUndefined();
  });

  test('reclaims a shell whose compatibility URLs already belong to the current shell', async () => {
    const caches = store({ 'engender-shell-old': {
      [legacy[0].path]: library, '/tesseract/generation/worker.js': 'immutable OCR', '/_app/immutable/chunks/other.js': 'old'
    }, 'engender-shell-current': { [legacy[0].path]: library, '/tesseract/generation/worker.js': 'immutable OCR' } });
    await retainPreviousOcr(caches, 'engender-shell-current', '');
    expect(await caches.keys()).toEqual(['engender-shell-current']);
  });

  test('does not keep changed bytes under the legacy URL', async () => {
    const caches = store({ 'engender-shell-old': { [legacy[0].path]: 'different library' } });
    await retainPreviousOcr(caches, 'engender-shell-current', '');
    expect(await caches.keys()).toEqual([]);
  });
});
