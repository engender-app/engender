/* Rewrites the generated block of src/app.html's first frame: one rule per
   palette, ground and sun, read out of src/lib/theme/palettes.css. See
   src/lib/theme/splash.ts for why it is generated. Run after a palette is
   added or a ground changes: npm run render:splash. tests/splash.test.ts is
   what fails if the run was forgotten. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPLASH_BEGIN, SPLASH_END, readSplashPalettes, splashBlock } from '../src/lib/theme/splash.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(REPO, 'src/app.html');
const html = readFileSync(HTML, 'utf8');
const start = html.indexOf(SPLASH_BEGIN);
const end = html.indexOf(SPLASH_END);
if (start === -1 || end === -1) throw new Error('src/app.html has no splash markers');
const block = splashBlock(readSplashPalettes(readFileSync(join(REPO, 'src/lib/theme/palettes.css'), 'utf8')));
writeFileSync(HTML, html.slice(0, start) + block + html.slice(end + SPLASH_END.length));
console.log('src/app.html: splash block written');
