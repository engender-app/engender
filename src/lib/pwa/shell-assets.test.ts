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
