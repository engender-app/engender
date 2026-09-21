/* Bakes the sign-off page for phase 11 pre-production UI/UX ticket 50: the
   three in-app crops become one self-contained HTML file, and the two icon
   plates are rasterised here, straight out of the repo.

   In the repo rather than in a session scratchpad because a scratchpad under
   /tmp/claude-* is deleted when the process exits, and a review page nobody
   can rebuild is a screenshot of an argument rather than the argument. The
   crops come from one committed script:

     node tests/mark-50-gallery.mjs before
     node tests/mark-50-gallery.mjs after

   The icons are rasterised at their real sizes and then blown up with
   smoothing off, rather than drawn large. Scaling an SVG up is not a
   magnifier: it shows what the drawing is, not what 16 pixels do to it,
   which is a finding ticket 38's round three paid for once already.

   'before' is read out of the base commit rather than kept as a copy.

   Run: node tests/mark-50-signoff-page.mjs [outFile]
   Default outFile is .claude/mark-50-signoff.html, which is gitignored. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shotsDir = resolve(root, '.claude/mark-50-shots');
const outFile = resolve(process.argv[2] ?? resolve(root, '.claude/mark-50-signoff.html'));
const BASE_COMMIT = 'f73ccf0f';

const git = (args) =>
  new Promise((done, fail) => {
    let out = '';
    const child = spawn('git', args, { cwd: root });
    child.stdout.on('data', (d) => (out += d));
    child.on('exit', (code) => (code === 0 ? done(out) : fail(new Error(`git ${args.join(' ')} exited ${code}`))));
  });

const dataUrl = async (file) =>
  `data:image/png;base64,${(await readFile(resolve(shotsDir, `${file}.png`))).toString('base64')}`;

/** The two faces of each icon: what main shipped, and what this branch
    generates. The favicon was one file and is eight now, so 'after' is the
    default palette's, which is what a fresh tab wears. */
const ICONS = {
  favicon: {
    before: () => git(['show', `${BASE_COMMIT}:static/favicon.svg`]),
    after: () => readFile(resolve(root, 'static/favicon-trans.svg'), 'utf8')
  },
  launcher: {
    before: () => git(['show', `${BASE_COMMIT}:static/icons/icon-maskable.svg`]),
    after: () => readFile(resolve(root, 'static/icons/icon-maskable.svg'), 'utf8')
  }
};

const FAVICON_SIZES = [16, 32, 48, 64];
const MASKS = [
  { name: 'square', radius: '0' },
  { name: 'squircle', radius: '24%' },
  { name: 'circle', radius: '50%' }
];

const browser = await launchChromium();
/* Device scale 1, so one CSS pixel in a shot is one real pixel of the icon.
   Anything else and the plate is a magnified render again. */
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** Rasterise an SVG at exactly `size` real pixels, by laying it out in a box
    that size and photographing the box.

    Not canvas plus drawImage: an SVG's own width and height attributes are
    what Chromium rasterises at before drawImage scales the result, so a 512
    unit file drawn into a 96 unit canvas comes out as a 512 unit drawing
    with its edges thrown away, and a file carrying no width at all comes out
    somewhere else again. Laying it out is the only way to ask the question
    this plate is asking, which is what the drawing does at 16 pixels.
    Scaling an SVG up is not a magnifier, and scaling one down is not a
    reduction. */
async function raster(svgSource, size) {
  await page.setViewportSize({ width: Math.max(size, 64), height: Math.max(size, 64) });
  await page.setContent(
    `<body style="margin:0"><div id="t" style="width:${size}px;height:${size}px;line-height:0">${svgSource}</div></body>`
  );
  /* The element's own attributes, set here rather than edited into the
     source text: the first width= in these files belongs to the tile's
     ground rect as often as to the <svg>, and a regex that took the wrong
     one deleted a stripe from the before column without erroring. */
  await page.locator('#t svg').evaluate((node) => {
    node.setAttribute('width', '100%');
    node.setAttribute('height', '100%');
    node.style.display = 'block';
  });
  return `data:image/png;base64,${(await page.locator('#t').screenshot()).toString('base64')}`;
}

const favicons = {};
const launchers = {};
for (const column of ['before', 'after']) {
  const favicon = await ICONS.favicon[column]();
  favicons[column] = {};
  for (const size of FAVICON_SIZES) favicons[column][size] = await raster(favicon, size);
  launchers[column] = await raster(await ICONS.launcher[column](), 192);
}
await browser.close();

const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const pair = async (key, note) => `
  <section>
    <h2>${escape(note.title)}</h2>
    <p>${note.body}</p>
    <div class="pair">
      <figure><figcaption>before</figcaption><img src="${await dataUrl(`${key}-before`)}" alt=""></figure>
      <figure><figcaption>after</figcaption><img src="${await dataUrl(`${key}-after`)}" alt=""></figure>
    </div>
  </section>`;

const faviconPlate = `
  <section>
    <h2>The tab icon, at the sizes a browser actually asks for</h2>
    <p>Rasterised at 16, 32, 48 and 64 and then blown up four times with smoothing off, so this is
       what the pixels do rather than what the drawing is. At 16 the stack is a smear and that was
       accepted rather than worked around: one rule, one shape, and the flag's hue still reads.
       Eight of these ship now, one per palette, and a running tab follows whichever flag is on.</p>
    <div class="pair">
      ${['before', 'after']
        .map(
          (column) => `<figure><figcaption>${column}</figcaption><div class="sizes">${FAVICON_SIZES.map(
            (size) =>
              `<span><img class="pixels" style="width:${size * 4}px;height:${size * 4}px" src="${favicons[column][size]}" alt=""><em>${size}px</em></span>`
          ).join('')}</div></figure>`
        )
        .join('')}
    </div>
  </section>`;

const launcherPlate = `
  <section>
    <h2>The launcher tile, under the three masks a home screen uses</h2>
    <p>The launcher picks its own mask, so a file cannot know which shape will be cut out of it. The
       black edge is not optional, so the whole stroked tile sits inside the circle every mask keeps -
       Android guarantees the central 72dp of 108, and a 50 unit tile with its corners clears it. The
       ground runs to all four corners behind it. What it costs is size: the sun is half what it is on
       the install tile, with white around it. Eight of these ship, one per flag, and the home screen
       follows the palette from the next cold start.</p>
    <div class="pair">
      ${['before', 'after']
        .map(
          (column) => `<figure><figcaption>${column}</figcaption><div class="sizes">${MASKS.map(
            (mask) =>
              `<span><img style="width:96px;height:96px;border-radius:${mask.radius}" src="${launchers[column]}" alt=""><em>${mask.name}</em></span>`
          ).join('')}</div></figure>`
        )
        .join('')}
    </div>
  </section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket 50 - the app wears its mark</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 32px 20px 96px; max-width: 1100px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 40px 0 6px; }
  p { margin: 0 0 16px; max-width: 72ch; color: #444; }
  @media (prefers-color-scheme: dark) { p { color: #b9b9b9; } body { background: #131316; color: #eee; } }
  .lede { font-size: 17px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  figure { margin: 0; }
  figcaption { font: 600 12px/1 system-ui; letter-spacing: .06em; text-transform: uppercase; opacity: .55; margin-bottom: 8px; }
  figure > img { width: 100%; height: auto; border: 1px solid rgba(128,128,128,.35); border-radius: 6px; }
  .sizes { display: flex; gap: 20px; align-items: flex-end; flex-wrap: wrap; }
  .sizes span { display: grid; gap: 6px; justify-items: center; }
  .sizes em { font: 11px/1 system-ui; font-style: normal; opacity: .55; }
  .pixels { image-rendering: pixelated; }
  .sizes img { background: #fff; }
  ul { max-width: 72ch; color: #444; }
  @media (prefers-color-scheme: dark) { ul { color: #b9b9b9; } }
</style></head>
<body>
  <h1>The app wears its mark</h1>
  <p class="lede">Phase 11 pre-production UI/UX ticket 50. Trans palette, light and dark, and only the
     surfaces this ticket changed. The name is lower case now - engender, not enGender - everywhere it
     is written: the wordmark, the tab title, the launcher label, the install manifest, the release
     title and both message catalogues.</p>

  <h2>What is not here, and why</h2>
  <ul>
    <li><strong>Home's header.</strong> Your call: the sun in the corner is already the mark, and a
        second one beside the wordmark is the same drawing twice.</li>
    <li><strong>Onboarding's welcome.</strong> Same reason - the sun is already on that screen, where
        it doubles as the step meter.</li>
    <li><strong>Every other screen.</strong> Not the nav, not a screen header, not the tab title.</li>
    <li><strong>Under disguise all of it is absent</strong>, leaving the name in type.</li>
  </ul>

  <h2>The white glitch at the corners</h2>
  <p>Fixed, and the cause was compositing rather than geometry: Chromium antialiases a clip path per
     element, so the white ground kept a boundary of its own at the silhouette that the edge stroked
     inside the same clip could not cover - partial white plus partial ink is lighter than ink. The
     clip now stops on the edge's centre line and the edge is drawn outside it, so the mark has one
     antialiased boundary. Measured on the diagonal out of the corner at 512px on a dark page, the
     pixel across the edge was rgb(58,87,99) against a ground of rgb(34,37,44); it is rgb(17,19,23)
     now, which is what ink blending into a dark page is supposed to look like.
     <code>npm run test:mark-edge</code> walks out of the mark at four sizes, four corners and four
     edges, and fails on anything brighter than the page.</p>

  ${await pair('about-light', {
    title: 'About, light',
    body: 'The icon, in the flag this person picked: the white tile and its black edge, because what the row shows is the app\'s own icon beside its own name and version. The edge is not optional anywhere the drawing has an outside.'
  })}
  ${await pair('about-dark', {
    title: 'About, dark',
    body: 'The same tile on the dark ground. Every band keeps the flag\'s own hex and the black seam is what separates them, including the white one - and the tile\'s own edge is the same line, so nothing in the drawing meets the page without one.'
  })}
  ${await pair('summary-print', {
    title: 'The clinician summary, on paper',
    body: 'The full lockup, mark and name, inset from the corner - this is the one printed surface that goes to a stranger, so it says in words what produced it. One shot rather than two: app.css\'s print block overrides the palette to black on white, so paper is paper whichever theme the app is wearing. The mono mark is four rings whatever the flag is. The words of the heading under it stay hidden when the profile card repeats them; the lockup is the part the card does not repeat.'
  })}
  ${await pair('book-print', {
    title: 'The journal book\'s cover',
    body: 'The same lockup. This one is a keepsake rather than a document, and it says the name for the same reason: a book somebody is still holding in ten years has nothing else on it to say where it came from.'
  })}
  ${faviconPlate}
  ${launcherPlate}
</body></html>`;

await writeFile(outFile, html);
process.stdout.write(`${outFile}\n`);
