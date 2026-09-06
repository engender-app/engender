/**
 * Production adapter factories for the OCR state machine.
 * Separated from ocr-machine.ts so the machine stays platform-free and
 * testable in isolation.
 */
import { isAndroid } from '$lib/platform';
import { androidPhotos } from '$lib/data/photos/android-bridge';
import { androidPickedBytes } from '$lib/data/photos/picker';
import { chooseFiles } from '$lib/data/fileDialog';
import { tesseractLabOcrEngine } from './ocr-engine';
import type { OcrImageSource, OcrRecognizer } from './ocr-machine';

export function platformImageSource(): OcrImageSource {
  return {
    async pickImage(source) {
      if (isAndroid()) {
        /* The pickers in photos/picker.ts are not reused wholesale here -
           they return an array and apply the document ceiling, and this
           lab wants one image and reports its own failures - but the step
           that turns a pick's token into bytes is theirs, so the OCR lab
           takes the message channel rather than a second base64 decode of
           its own (phase 9 audit ticket 06). */
        if (source === 'camera') {
          const { token } = await androidPhotos.captureImage();
          return token ? androidPickedBytes(token) : null;
        }
        const { tokens } = await androidPhotos.pickImages();
        return tokens.length ? androidPickedBytes(tokens[0]) : null;
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
    async recognize(image, watch) {
      const result = await engine.recognize(image, watch);
      return result.data.text;
    }
  };
}
