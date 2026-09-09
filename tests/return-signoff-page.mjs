/* Bakes the sign-off page for redesign ticket 35: the crops and the
   flipbook bundle become one self-contained HTML file, small enough to
   publish as a review artifact.

   In the repo rather than in a session scratchpad because a scratchpad
   under /tmp/claude-* is deleted when the process exits, and a review page
   nobody can rebuild is a screenshot of an argument rather than the
   argument. Everything it reads is produced by three committed scripts:

     VITE_DEMO=1 npm run build
     node tests/return-signoff-crops.mjs .claude/return-crops-after
     node tests/return-motion-gallery.mjs
     node tests/panel-motion-flipbook.mjs .claude/return-flipbook.json \
       --crop 0,844 --motion 420 \
       after=.claude/return-motion before=.claude/return-motion-before

   and the same two shot scripts run with a detached worktree of main as cwd
   for the `-before` halves (vite preview serves the cwd's build, so a
   before/after pair needs two checkouts rather than two builds in one).

   `return-signoff-crops.mjs` takes `--before` and runs against main as it
   stands, because the elements it crops have names on both sides. The
   before *flipbook* does not: the motion recorder drives the offer's
   `data-coming-back-yes`/`-no`, which exist only after this ticket, so the
   before frames were taken with a copy of it carrying main's own handles
   (the notice's action and dismiss) in the detached worktree. That copy is
   deliberately not committed - it stops being runnable the moment this
   branch merges and main is this code - so the before column of the page
   is evidence with a date on it rather than something a later session can
   regenerate.

   Run: node tests/return-signoff-page.mjs [outFile]
   Default outFile is .claude/return-signoff.html, which is gitignored. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outFile = resolve(process.argv[2] ?? resolve(root, '.claude/return-signoff.html'));

/** key -> [file, target CSS width, jpeg quality]. The whole screens carry
    more pixels than they need at review size; the crops are read closely,
    so they keep more. */
const STILLS = {
  screen: ['screen.png', 390, 0.72],
  empty: ['empty.png', 390, 0.72],
  field: ['field.png', 390, 0.82],
  list: ['list.png', 390, 0.82],
  offer: ['offer.png', 390, 0.86],
  foot: ['foot.png', 390, 0.86],
  sheetFoot: ['sheet-foot.png', 390, 0.86],
  screenPl: ['screen-pl.png', 390, 0.72],
  offerPl: ['offer-pl.png', 390, 0.86]
};

const browser = await launchChromium();
const page = await browser.newPage();

/** Scales and re-encodes one PNG in the one runtime already on hand that
    can - a canvas in the browser this repo already drives - and hands back
    a data URI, since the page has to be self-contained. */
async function encode(bytes, width, quality) {
  return page.evaluate(
    async ({ b64, width, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const scale = Math.min(1, width / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    },
    { b64: bytes.toString('base64'), width, quality }
  );
}

const stills = {};
let bytes = 0;
for (const [key, [file, width, quality]] of Object.entries(STILLS)) {
  stills[key] = {};
  for (const [side, dir] of [
    ['before', resolve(root, '.claude/return-crops-before')],
    ['after', resolve(root, '.claude/return-crops-after')]
  ]) {
    try {
      const uri = await encode(await readFile(resolve(dir, file)), width, quality);
      stills[key][side] = uri;
      bytes += uri.length;
    } catch {
      /* A side that was never shot is a side the page leaves out, which is
         what the foot's `before` would be if main had had one. */
      console.log(`skip ${side}/${file}`);
    }
  }
}
await browser.close();

const flip = JSON.parse(await readFile(resolve(root, '.claude/return-flipbook.json'), 'utf8'));
const template = await readFile(resolve(here, 'return-signoff-page.html'), 'utf8');
/* Counted before substituting, because `String.replace` with a string
   pattern takes the *first* match and says nothing about the rest. The
   token was once mentioned a second time in the template's own opening
   comment, so 5.6MB of data URIs went into that comment and the script kept
   an unsubstituted literal - a syntax error, and a published page that drew
   none of its images while looking structurally fine on disk. */
const token = '__PAYLOAD__';
const found = template.split(token).length - 1;
if (found !== 1) {
  throw new Error(`the template must name ${token} exactly once; found ${found}`);
}
/* A replacer function, not a string: a data URI can hold `$&` and a plain
   string replacement would expand it. */
const payload = JSON.stringify({ stills, flip });
const html = template.replace(token, () => payload);
await writeFile(outFile, html);
console.log(`stills ${(bytes / 1e6).toFixed(2)}MB · page ${(html.length / 1e6).toFixed(2)}MB → ${outFile}`);
