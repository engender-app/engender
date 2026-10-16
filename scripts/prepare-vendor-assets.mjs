/* OCR installs as one immutable generation. Recognition still loads the
   library only when requested. PDF fonts remain in the shell (ADR-0065). */
import { mkdir, copyFile, readdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import './patch-sqlite-wasm.mjs';

const root = process.cwd();
const ocr = [
  ['tesseract.js/dist/tesseract.esm.min.js', 'tesseract.esm.min.js'],
  ['tesseract.js/dist/tesseract.min.js.LICENSE.txt', 'tesseract.min.js.LICENSE.txt'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js/dist/worker.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt'],
  ['tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core.wasm.js'],
  ['tesseract.js-core/tesseract-core.wasm', 'tesseract-core.wasm'],
  ['@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'lang-data/eng.traineddata'],
  ['@tesseract.js-data/pol/4.0.0/pol.traineddata.gz', 'lang-data/pol.traineddata']
];
const hash = createHash('sha256');
for (const [from, name] of ocr) {
  hash.update(name + '\0');
  hash.update(createHash('sha256').update(await readFile(resolve(root, 'node_modules', from))).digest());
}
const generation = hash.digest('hex');
const prefix = `/tesseract/${generation}/`;
const legacyRuntime = JSON.parse(await readFile(resolve(root, 'src/lib/pwa/legacy-ocr-assets.json'), 'utf8'));
const legacyBytes = gunzipSync(await readFile(resolve(root, 'scripts/vendor/legacy-ocr/pre21-tesseract.js.gz')));
if (createHash('sha256').update(legacyBytes).digest('hex') !== legacyRuntime[0].sha256) throw new Error('Legacy OCR fixture hash mismatch');
const legacyTarget = resolve(root, 'static' + legacyRuntime[0].path);
await mkdir(dirname(legacyTarget), { recursive: true });
await writeFile(legacyTarget, legacyBytes);
await rm(resolve(root, 'static/tesseract'), { recursive: true, force: true });
async function copy(from, to) {
  const target = resolve(root, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, from), target);
}
for (const [from, name] of ocr) {
  await copy(`node_modules/${from}`, `static${prefix}${name}`);
  // Root paths serve pre-generation pages. Release preparation freezes these
  // bytes from the previous release; they are not downloaded by new installs.
  if (!name.startsWith('tesseract.esm') && !name.endsWith('LICENSE.txt')) {
    await copy(`node_modules/${from}`, `static/tesseract/${name}`);
  }
}
await mkdir(resolve(root, 'src/lib/pwa'), { recursive: true });
await writeFile(resolve(root, 'src/lib/pwa/ocr-assets.generated.ts'),
  `// Written by prepare-vendor-assets.mjs.\nexport const OCR_ASSET_PREFIX = ${JSON.stringify(prefix)};\n`);
await writeFile(resolve(root, 'static/tesseract/assets.json'),
  JSON.stringify({ generation, assets: ocr.map(([, name]) => prefix + name),
    legacyRuntime }, null, 2) + '\n');

const fonts = 'node_modules/pdfjs-dist/standard_fonts';
for (const name of await readdir(resolve(root, fonts))) {
  await copy(join(fonts, name), `static/pdf-fonts/${name}`);
}
console.log(`Prepared OCR generation ${generation} and local PDF fonts`);
