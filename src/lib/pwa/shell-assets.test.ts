import { describe, expect, test } from 'vitest';
import { ON_DEMAND_PREFIX, splitShellAssets } from './shell-assets';

describe('splitShellAssets', () => {
  test('keeps the rest of static/ in the shell and takes the OCR set out of it', () => {
    const { shell, onDemand } = splitShellAssets(
      [
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/fonts/nunito-latin.woff2',
        '/tesseract/worker.min.js',
        '/tesseract/tesseract-core.wasm',
        '/tesseract/lang-data/pol.traineddata.gz'
      ],
      ''
    );

    expect(shell).toEqual(['/manifest.webmanifest', '/icons/icon-192.png', '/fonts/nunito-latin.woff2']);
    expect(onDemand).toEqual([
      '/tesseract/worker.min.js',
      '/tesseract/tesseract-core.wasm',
      '/tesseract/lang-data/pol.traineddata.gz'
    ]);
  });

  test('splits at the base the app is served under, not at the bare path', () => {
    const { shell, onDemand } = splitShellAssets(['/app/tesseract/worker.min.js', '/app/icons/icon-192.png'], '/app');

    expect(shell).toEqual(['/app/icons/icon-192.png']);
    expect(onDemand).toEqual(['/app/tesseract/worker.min.js']);
  });

  test('a path that only mentions the prefix further along stays in the shell', () => {
    const { shell, onDemand } = splitShellAssets(['/icons/tesseract/logo.png'], '');

    expect(shell).toEqual(['/icons/tesseract/logo.png']);
    expect(onDemand).toEqual([]);
  });

  test('the prefix is the directory the asset script writes into', () => {
    expect(ON_DEMAND_PREFIX).toBe('/tesseract/');
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
    const { shell, pdfWorker, unused } = splitShellAssets(paths, '');

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
    const { shell } = splitShellAssets(['/pdf-fonts/LiberationSans-Bold.ttf'], '');
    expect(shell).toEqual(['/pdf-fonts/LiberationSans-Bold.ttf']);
  });

  test('matches under the base too', () => {
    const { pdfWorker } = splitShellAssets(['/app/_app/immutable/workers/pdf-worker-X.js'], '/app');
    expect(pdfWorker).toEqual(['/app/_app/immutable/workers/pdf-worker-X.js']);
  });
});
