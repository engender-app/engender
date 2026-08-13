import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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

for (const file of files) {
  const from = resolve(root, file.from);
  const to = resolve(root, file.to);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}

console.log('Prepared local Tesseract assets in static/tesseract');
