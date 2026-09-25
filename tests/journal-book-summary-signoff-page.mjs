/* Bakes the sign-off page for phase 12 final-audit ticket 20: the before and
   after crops become one self-contained HTML file, small enough to open from
   anywhere.

   In the repo rather than in a session scratchpad because a scratchpad under
   /tmp/claude-* is deleted when the process exits, and a review page nobody
   can rebuild is a screenshot of an argument rather than the argument.
   Everything it reads is produced by one committed script, run once per
   build (see its header for the before invocation):

     node tests/journal-book-summary-gallery.mjs --tag after --out <dir>
     node tests/journal-book-summary-gallery.mjs --tag before --out <dir>

   Run: node tests/journal-book-summary-signoff-page.mjs [outFile] [shotsDir]
   Defaults are .claude/journal-book-20-signoff.html and
   .claude/journal-book-20-shots, both gitignored. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outFile = resolve(process.argv[2] ?? resolve(root, '.claude/journal-book-20-signoff.html'));
const shots = resolve(process.argv[3] ?? resolve(root, '.claude/journal-book-20-shots'));

/** One row of the page: the pair of crops, and what the pair is of. */
const ROWS = [
  {
    key: 'counts',
    title: 'Under the last switch',
    note: 'The book used to start here: every entry of the chosen range, its mood word, its text and a full-bleed block per photo, which came to 27,059px on the default one year. What answers the seven switches now is the line they add up to, and the pages are behind the fold under it.'
  },
  {
    key: 'pages',
    title: 'The fold, opened',
    note: 'The same pages, in the same order, that printed before this ticket - and the same ones that print now, whether the fold is open or shut. The arrival opens its own height (disclose, reveal.ts); nothing appears at full size.',
    single: 'after'
  },
  {
    key: 'longer',
    title: 'Three years instead of one',
    note: 'The line names each part the book actually carries and leaves out the ones it does not, so a range that holds milestones says so. The screen is 1222px either way: it no longer grows with the range.',
    single: 'after'
  }
];

const THEMES = ['light', 'dark'];

const browser = await launchChromium();
const page = await browser.newPage();

/** Scales and re-encodes one PNG in the one runtime already on hand that can
    - a canvas in the browser this repo already drives - and hands back a data
    URI, since the page has to be self-contained. */
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
for (const { key } of ROWS) {
  for (const theme of THEMES) {
    for (const side of ['before', 'after']) {
      const file = resolve(shots, `${key}-${theme}-${side}.png`);
      try {
        const uri = await encode(await readFile(file), 390, 0.86);
        stills[`${key}-${theme}-${side}`] = uri;
        bytes += uri.length;
      } catch {
        console.log(`skip ${key}-${theme}-${side}`);
      }
    }
  }
}
await browser.close();

const esc = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const pair = (key, theme) => {
  const before = stills[`${key}-${theme}-before`];
  const after = stills[`${key}-${theme}-after`];
  return `<div class="pair">
      <figure><figcaption>before</figcaption>${before ? `<img alt="${esc(key)} before" src="${before}">` : '<p class="missing">not shot</p>'}</figure>
      <figure><figcaption>after</figcaption>${after ? `<img alt="${esc(key)} after" src="${after}">` : '<p class="missing">not shot</p>'}</figure>
    </div>`;
};

const single = (key, theme, side) => {
  const uri = stills[`${key}-${theme}-${side}`];
  return `<div class="pair one">
      <figure>${uri ? `<img alt="${esc(key)}" src="${uri}">` : '<p class="missing">not shot</p>'}</figure>
    </div>`;
};

const body = ROWS.map(
  ({ key, title, note, single: only }) => `<section>
    <h2>${esc(title)}</h2>
    <p class="note">${esc(note)}</p>
    ${THEMES.map((theme) => `<h3>${theme}</h3>${only ? single(key, theme, only) : pair(key, theme)}`).join('\n    ')}
  </section>`
).join('\n  ');

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket 20 - journal book shows a summary</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0 auto; padding: 24px 16px 64px; max-width: 900px;
         font: 16px/1.5 system-ui, sans-serif; color: #10202b; background: #f6f8fa; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 40px 0 4px; }
  h3 { font-size: 13px; text-transform: lowercase; color: #56707f; margin: 20px 0 6px; font-weight: 600; }
  p.lede, p.note { margin: 0 0 8px; color: #3d5666; }
  p.note { font-size: 14px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  figure { margin: 0; background: #fff; border: 1px solid #d8e0e6; border-radius: 8px; padding: 8px; }
  figcaption { font-size: 12px; color: #6b8494; margin-bottom: 6px; }
  img { width: 100%; height: auto; display: block; border-radius: 4px; }
  .missing { font-size: 13px; color: #96a8b4; }
  .pair.one { grid-template-columns: 1fr; max-width: 420px; }
  @media (max-width: 620px) { .pair { grid-template-columns: 1fr; } }
</style>
<h1>The journal book shows a summary, not the whole book</h1>
<p class="lede">Phase 12 final-audit ticket 20. Trans palette, light and dark, 390px, the demo journal with every feature filled. Only what the ticket changed.</p>
${body}
</html>
`;

await writeFile(outFile, html);
console.log(`stills ${(bytes / 1e6).toFixed(2)}MB · page ${(html.length / 1e6).toFixed(2)}MB → ${outFile}`);
