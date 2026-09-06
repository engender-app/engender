/* The vendored runtime assets that have to sit in static/ under a name the
   app can ask for, rather than reach the browser through the bundler.

   Two libraries need it, for the same reason and with opposite consequences
   in the shell. Tesseract loads its worker, its core and its language data
   by URL, and shell-assets.ts carves that whole directory out of the
   precache (ADR-0021) because most first visits never open the lab
   scanner. pdf.js loads the fourteen standard PDF fonts the same way -
   a document that names Helvetica ships no Helvetica with it - and those
   stay in the shell: they are 800 KB, not 50 MB, and a document viewer
   that only works online would be the wrong half of the trade (ADR-0065).

   Its cmaps are deliberately not here. They are what a CJK document needs
   and they are 1.7 MB of the same, which ADR-0065 leaves out of scope. */
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();

const files = [
  {
    from: 'node_modules/tesseract.js/dist/worker.min.js',
    to: 'static/tesseract/worker.min.js'
  },
  {
    from: 'node_modules/tesseract.js-core/tesseract-core.wasm.js',
    to: 'static/tesseract/tesseract-core.wasm.js'
  },
  {
    from: 'node_modules/tesseract.js-core/tesseract-core.wasm',
    to: 'static/tesseract/tesseract-core.wasm'
  },
  {
    from: 'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz',
    to: 'static/tesseract/lang-data/eng.traineddata.gz'
  },
  {
    from: 'node_modules/@tesseract.js-data/pol/4.0.0/pol.traineddata.gz',
    to: 'static/tesseract/lang-data/pol.traineddata.gz'
  }
];

/* Copied as a directory rather than named file by file: the set is
   pdf.js's to decide, the two LICENSE files in it belong beside the fonts
   they cover, and a release that pinned a version shipping a fifteenth
   face should ship it rather than fail to draw it. */
const PDF_FONTS = 'node_modules/pdfjs-dist/standard_fonts';
for (const name of await readdir(resolve(root, PDF_FONTS))) {
  files.push({ from: join(PDF_FONTS, name), to: `static/pdf-fonts/${name}` });
}

for (const file of files) {
  const from = resolve(root, file.from);
  const to = resolve(root, file.to);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}

console.log('Prepared local Tesseract assets in static/tesseract, and pdf.js standard fonts in static/pdf-fonts');
