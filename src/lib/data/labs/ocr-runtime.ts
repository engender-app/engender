import { OCR_ASSET_PREFIX } from '../../pwa/ocr-assets.generated';

/** The library and the files it loads share one content-addressed directory.
    Kept out of the bundler so retained pages do not import a newer library. */
export async function loadOcrRuntime(): Promise<typeof import('tesseract.js')> {
  return (await import(/* @vite-ignore */ `${OCR_ASSET_PREFIX}tesseract.esm.min.js`)).default;
}
