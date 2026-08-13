/**
 * Production adapter factories for the OCR state machine.
 * Separated from ocr-machine.ts so the machine stays platform-free and
 * testable in isolation.
 */
import { isAndroid } from '$lib/platform';
import { androidPhotos } from '$lib/data/photos/android-bridge';
import { chooseFiles } from '$lib/data/fileDialog';
import { tesseractLabOcrEngine } from './ocr-engine';
import type { OcrImageSource, OcrRecognizer } from './ocr-machine';

export function platformImageSource(): OcrImageSource {
  return {
    async pickImage(source) {
      if (isAndroid()) {
        if (source === 'camera') {
          const { image } = await androidPhotos.captureImage();
          if (!image) return null;
          return Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
        }
        const { images } = await androidPhotos.pickImages();
        if (!images.length) return null;
        return Uint8Array.from(atob(images[0]), (c) => c.charCodeAt(0));
      }

      const [file] = await chooseFiles('image/*', {
        multiple: false,
        capture: source === 'camera' ? 'environment' : undefined
      });
      if (!file) return null;
      return new Uint8Array(await file.arrayBuffer());
    }
  };
}

export function tesseractOcrRecognizer(): OcrRecognizer {
  const engine = tesseractLabOcrEngine();
  return {
    async recognize(image) {
      const result = await engine.recognize(image);
      return result.data.text;
    }
  };
}
