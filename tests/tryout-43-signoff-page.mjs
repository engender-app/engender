/* Bakes the sign-off page for phase 11 pre-production UI/UX ticket 43: the
   before/after crops become one self-contained HTML file, small enough to
   open from anywhere.

   In the repo rather than in a session scratchpad because a scratchpad under
   /tmp/claude-* is deleted when the process exits, and a review page nobody
   can rebuild is a screenshot of an argument rather than the argument.
   Everything it reads is produced by one committed script:

     node tests/tryout-43-gallery.mjs before
     node tests/tryout-43-gallery.mjs after

   Run: node tests/tryout-43-signoff-page.mjs [outFile]
   Default outFile is .claude/tryout-43-signoff.html, which is gitignored. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = resolve(root, '.claude/tryout-43-shots');
const outFile = resolve(process.argv[2] ?? resolve(root, '.claude/tryout-43-signoff.html'));

/** One row of the page: the pair of crops, and what the pair is of. */
const ROWS = [
  {
    key: 'card-running',
    title: 'A running tryout',
    note: 'The day count was the 40px number on the stripe, which is the shape of a streak counter. The name is on the block now, the kind under it, and the length is a secondary line.'
  },
  {
    key: 'card-thin',
    title: 'A long name, and one with nothing recorded yet',
    note: 'The name wraps inside the plate instead of being squeezed into 150px beside a number. A tryout with no readings draws no arc and says so in words, which it already did.'
  },
  {
    key: 'rows-ended',
    title: 'The ended log, for contrast',
    note: 'Untouched by this ticket, and here because the acceptance is about the pair: an ended tryout is still a row with its kind, its range and how long it ran, and a running one is the card above them. One column, since both would be the same picture.',
    single: 'after'
  },
  {
    key: 'form-end',
    title: 'The end-date field',
    note: 'The help was a span inside the label, so a screen reader read the field’s name as "EndedLeave blank if there is no end date." It is its own paragraph now, pointed at by aria-describedby.'
  },
  {
    key: 'form-kinds',
    title: 'The kind picker’s overflowing edge',
    note: 'The chevron had no ground of its own and was drawn straight onto the clipped label: "Garme>e". The fade moved off the track and onto the chevron’s own background.'
  },
  {
    key: 'form-note',
    title: 'The felt-sense note',
    note: 'The one field on the screen with no label at all, only a placeholder that disappears the moment somebody types.'
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
    ${THEMES.map(
      (theme) => `<h3>${theme}</h3>${only ? single(key, theme, only) : pair(key, theme)}`
    ).join('\n    ')}
  </section>`
).join('\n  ');

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket 43 - tryout form and current state</title>
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
<h1>Tryout form and the current experiment</h1>
<p class="lede">Phase 11 pre-production UI/UX ticket 43. Trans palette, light and dark, 390px. Only what the ticket changed.</p>
${body}
</html>
`;

await writeFile(outFile, html);
console.log(`stills ${(bytes / 1e6).toFixed(2)}MB · page ${(html.length / 1e6).toFixed(2)}MB → ${outFile}`);
