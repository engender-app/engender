/* GD-029: pdf.js was called with no limit on the images it draws, so a PDF
   well under 25 MiB could declare a page-one image of billions of pixels
   and have the worker allocate for it while rendering.

   The two halves: pdf.js itself skips an image over `maxImageSize` (shown
   here against the real library, on a PDF built by hand), and openPdf()
   passes the budget to getDocument (shown against a stand-in). */

import { describe, expect, test, vi } from 'vitest';
import { PDF_DOCUMENT_BUDGET, MAX_IMAGE_PIXELS } from '../media/budget';

/** A one-page PDF whose page draws one image XObject of `width` x `height`
    with a single byte of data, i.e. a few hundred bytes declaring a
    decoded size of width * height. */
function pdfWithImage(width: number, height: number): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>',
    null, // content stream, below
    null // image stream, below
  ];
  const content = 'q 200 0 0 200 0 0 cm /Im0 Do Q';
  const body: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [];
  let length = body[0].length;
  const add = (text: string) => {
    body.push(text);
    length += text.length;
  };
  objects.forEach((object, i) => {
    offsets.push(length);
    if (i === 3) add(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    else if (i === 4) {
      add(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\u0000\nendstream\nendobj\n`);
    } else add(`${i + 1} 0 obj\n${object}\nendobj\n`);
  });
  const xref = length;
  add(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new TextEncoder().encode(body.join(''));
}

async function paintedImages(bytes: Uint8Array, options: object): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0, ...options }).promise;
  try {
    const page = await document.getPage(1);
    const { fnArray } = await page.getOperatorList();
    return fnArray.filter((op: number) => op === pdfjs.OPS.paintImageXObject).length;
  } finally {
    await document.destroy();
  }
}

describe('a PDF image over the pixel budget', () => {
  const over = pdfWithImage(30000, 30000); // 900 MP declared, a few hundred bytes of file

  test('is a few hundred bytes', () => {
    expect(over.length).toBeLessThan(1000);
  });

  test('is drawn when pdf.js is given no budget (the old call)', async () => {
    expect(await paintedImages(over, {})).toBe(1);
  });

  test('is skipped under the budget', async () => {
    expect(await paintedImages(over, PDF_DOCUMENT_BUDGET)).toBe(0);
  });

  test('an ordinary scan under the budget is still drawn', async () => {
    expect(await paintedImages(pdfWithImage(4960, 7016), PDF_DOCUMENT_BUDGET)).toBe(1);
  });

  test('a 600 dpi A3 scan and the budget edge are drawn', async () => {
    expect(await paintedImages(pdfWithImage(8268, 11693), PDF_DOCUMENT_BUDGET)).toBe(1);
    expect(await paintedImages(pdfWithImage(16384, 16384), PDF_DOCUMENT_BUDGET)).toBe(1);
    expect(PDF_DOCUMENT_BUDGET.maxImageSize).toBe(MAX_IMAGE_PIXELS);
  });
});

describe('openPdf', () => {
  test('hands pdf.js the budget', async () => {
    const getDocument = vi.fn(() => ({ promise: Promise.resolve({ numPages: 1, destroy: async () => {} }) }));
    vi.resetModules();
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument,
      PDFWorker: { fromPort: () => ({ destroy() {} }) }
    }));
    vi.stubGlobal('Worker', class { terminate() {} });
    vi.stubGlobal('navigator', {});
    const { openPdf } = await import('./pdf');
    await openPdf(new Uint8Array([1]));
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining(PDF_DOCUMENT_BUDGET));
    vi.unstubAllGlobals();
  });
});
