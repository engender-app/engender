import { describe, expect, test } from 'vitest';
import { OCR_ROOT, splitShellAssets } from './shell-assets';

const PREFIX = '/tesseract/' + 'a'.repeat(64) + '/';

describe('splitShellAssets', () => {
  test('installs the complete current OCR set without fetching legacy copies', () => {
    const current = ['tesseract.esm.min.js', 'worker.min.js', 'tesseract-core.wasm.js',
      'tesseract-core.wasm', 'lang-data/eng.traineddata', 'lang-data/pol.traineddata'].map(name => PREFIX + name);
    const { shell, unused } = splitShellAssets(['/icons/icon.png', ...current,
      '/tesseract/lang-data/eng.traineddata', '/tesseract/assets.json'], '', PREFIX);
    expect(shell).toEqual(['/icons/icon.png', ...current]);
    expect(unused).toEqual(['/tesseract/lang-data/eng.traineddata', '/tesseract/assets.json']);
  });

  test('uses the app base and does not confuse unrelated paths with OCR', () => {
    const { shell, unused } = splitShellAssets(['/app' + PREFIX + 'worker.min.js',
      '/app/tesseract/worker.min.js', '/app/icons/tesseract/logo.png'], '/app', PREFIX);
    expect(shell).toEqual(['/app' + PREFIX + 'worker.min.js', '/app/icons/tesseract/logo.png']);
    expect(unused).toEqual(['/app/tesseract/worker.min.js']);
    expect(OCR_ROOT).toBe('/tesseract/');
  });
});

describe('splitShellAssets, the two built files', () => {
  const paths = [
    '/_app/immutable/chunks/AbC123.js',
    '/_app/immutable/workers/mc-worker-akfwo7ds.js',
    '/_app/immutable/workers/pdf-worker-Kp7_pMCT.js',
    '/_app/immutable/workers/sqlite3-worker1-bundler-friendly-CrvDegEM.js',
    '/_app/immutable/workers/sqlite3-worker1-B2PgjPc4.js',
    '/pdf-fonts/LiberationSans-Regular.ttf'
  ];

  test('the PDF renderer is asked for, the promiser worker nobody constructs is not stored', () => {
    const { shell, pdfWorker, unused } = splitShellAssets(paths, '', PREFIX);

    expect(pdfWorker).toEqual(['/_app/immutable/workers/pdf-worker-Kp7_pMCT.js']);
    expect(unused).toEqual(['/_app/immutable/workers/sqlite3-worker1-bundler-friendly-CrvDegEM.js']);
    expect(shell).toEqual([
      '/_app/immutable/chunks/AbC123.js',
      '/_app/immutable/workers/mc-worker-akfwo7ds.js',
      '/_app/immutable/workers/sqlite3-worker1-B2PgjPc4.js',
      '/pdf-fonts/LiberationSans-Regular.ttf'
    ]);
  });

  test('the fonts stay in the shell (ADR-0065)', () => {
    const { shell } = splitShellAssets(['/pdf-fonts/LiberationSans-Bold.ttf'], '', PREFIX);
    expect(shell).toEqual(['/pdf-fonts/LiberationSans-Bold.ttf']);
  });

  test('matches under the base too', () => {
    const { pdfWorker } = splitShellAssets(['/app/_app/immutable/workers/pdf-worker-X.js'], '/app', PREFIX);
    expect(pdfWorker).toEqual(['/app/_app/immutable/workers/pdf-worker-X.js']);
  });
});
