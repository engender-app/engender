import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

// Hosting-only output, after the PWA asset list has been generated. Native
// builds use npm run build and never copy these transport files into the APK.
if (!readFileSync('build/index.html', 'utf8').includes('data-demo-prewarm')) {
  throw new Error('Demo compression requires a VITE_DEMO=1 build');
}
const root = 'build/_app/immutable';
const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.(js|css|wasm)$/.test(file))
  .map((file) => join(root, file));
let total = 0;
for (const file of ['build/index.html', ...files]) {
  const compressed = brotliCompressSync(readFileSync(file), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
  });
  writeFileSync(`${file}.br`, compressed);
  total += compressed.length;
}
console.log(`Demo hosting compression: ${files.length + 1} sidecars, ${total} bytes`);
