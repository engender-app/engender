/* The production renderer, using the worker emitted by the supplied release.
   Loading this fixture does not construct a worker or open a document. */
import { openPdf } from '../../src/lib/data/documents/pdf';
import { makePdf } from '../pdf-fixture.mjs';

Object.assign(window, {
  async renderRetainedPdf() {
    const pdf = await openPdf(makePdf(['Retained document']));
    try {
      const bitmap = await pdf.page(1, 800);
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        let dark = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] < 128 && data[index + 1] < 128 && data[index + 2] < 128) dark++;
        }
        return { pages: pdf.pageCount, edge: Math.max(bitmap.width, bitmap.height), ink: dark / (bitmap.width * bitmap.height) };
      } finally { bitmap.close(); }
    } finally { pdf.close(); }
  }
});
