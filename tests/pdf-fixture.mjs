/* A real PDF, written by hand, for the suites that need one (phase 8
   features ticket 55).

   Small enough to read: a catalogue, a page tree, one Helvetica font
   object, and one content stream per page. The offsets in the xref table
   are counted rather than guessed, which is what makes it a file pdf.js
   will actually open rather than a header with bytes after it.

   Helvetica on purpose. It is one of the fourteen standard faces a PDF is
   allowed to name without carrying, so a page that draws its text at all
   is a page that found /pdf-fonts/ on the app's own origin - which is the
   whole of what the offline and zero-off-origin assertions are about.

   Shared by the browser tier and the walkthrough rather than checked in as
   a binary: a fixture whose bytes nobody can read is a fixture nobody can
   change. */

/**
 * @param {string[]} lines one page per line, drawn near the top of it
 * @returns {Uint8Array}
 */
export function makePdf(lines) {
  // 48pt, and black on the white the viewer fills behind it: the browser
  // tier reads pixels back to prove the glyphs were really drawn.
  return pdfFromStreams(lines.map((line) => `BT /F1 48 Tf 60 700 Td (${line}) Tj ET`));
}

/** A page that looks like paper somebody was handed, for the screenshots a
    sign-off is done on: a letterhead, a rule under it, a date, and body
    text as grey bars - legible as a page, unreadable as words, which is
    what a screenshot of somebody's diagnosis should be. The same shape
    documents-gallery.mjs draws for an imported scan, in PDF operators.
 * @param {{ head: string, day: string, note?: string }[]} pages
 */
export function makePaperPdf(pages) {
  return pdfFromStreams(
    pages.map(({ head, day, note }) => {
      const rules = Array.from(
        { length: 22 },
        (_, i) => `0.54 0.54 0.54 rg 60 ${700 - i * 26} ${520 - (i % 4) * 70} 8 re f`
      ).join('\n');
      return [
        '0.16 0.16 0.16 rg',
        `BT /F1 22 Tf 60 782 Td (${head}) Tj ET`,
        '60 770 475 2 re f',
        `BT /F1 14 Tf 60 742 Td (${day}) Tj ET`,
        rules,
        note ? `0.16 0.16 0.16 rg BT /F1 14 Tf 60 90 Td (${note}) Tj ET` : '',
        '0.16 0.16 0.16 rg 330 70 205 2 re f'
      ].join('\n');
    })
  );
}

/** Text a standard face can actually draw. The fourteen standard fonts are
    WinAnsi, which has no ą, ę, ł or ż, and a PDF that wanted them would
    need an embedded face and an encoding table - a lot of fixture for a
    letterhead nobody reads. So the diacritics come off here rather than
    landing as the wrong byte and drawing as something else entirely.
 * @param {string} text */
const winAnsi = (text) =>
  text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * The file itself, around one content stream per page.
 * @param {string[]} streams
 * @returns {Uint8Array}
 */
function pdfFromStreams(streams) {
  const objects = [];
  const pageIds = streams.map((_, i) => 4 + i * 2);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${streams.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  streams.forEach((raw, i) => {
    const stream = winAnsi(raw);
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** A file that says `%PDF-` and is nothing else: what the viewer's own
    "this app can't draw it" line exists for. */
export function makeUnreadablePdf() {
  const header = '%PDF-1.4\n';
  const bytes = new Uint8Array(2048).fill(0x20);
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  return bytes;
}
