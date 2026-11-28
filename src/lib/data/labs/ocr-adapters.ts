/**
 * Production adapter factories for the OCR state machine.
 * Separated from ocr-machine.ts so the machine stays platform-free and
 * testable in isolation.
 */
import { isAndroid } from '../../platform';
import { androidPhotos } from '../photos/android-bridge';
import { androidPickedBytes } from '../photos/picker';
import { chooseFiles } from '../fileDialog';
import { refuseLargePhoto, PhotoTooLargeError } from '../photos/limits';
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
           its own. */
        try {
          if (source === 'camera') {
            const { token } = await androidPhotos.captureImage();
            return token ? await androidPickedBytes(token) : null;
          }
          // One image: the lab reads one page, so ask the picker for one.
          const { tokens } = await androidPhotos.pickImages({ multiple: false });
          return tokens.length ? await androidPickedBytes(tokens[0]) : null;
        } catch (error) {
          // The native side refuses a file over the photo ceiling before it
          // hands out a token; the machine words that like any unreadable page.
          if (error instanceof Error && error.message.includes('too-large')) throw new PhotoTooLargeError();
          throw error;
        }
      }

      const [file] = await chooseFiles('image/*', {
        multiple: false,
        capture: source === 'camera' ? 'environment' : undefined
      });
      if (!file) return null;
      // By the size on disk, before any of it is read.
      refuseLargePhoto(file.size);
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
