/* Renders and measurements for redesign ticket 40, the body map's figure.

   Only what the ticket changed: the figure alone, cropped to the figure, in
   the four data states that have to look different from one another. A
   review page of whole screens across a half-done redesign is unreviewable
   (Alicja, ticket 07's sign-off), so the route itself appears here only
   where the ticket changed the whole of it - the control area, where four
   pickers became one.

   Three things come out of one run:

   - **shots/**: each scene cropped to its figure, per theme, plus the
     control-area crop off the real route, and **sheet.html**, which is the
     two themes of each scene beside each other for sign-off.
   - **contrast.json**: rule 11 measured rather than asserted. Every piece of
     type the figure draws, walked against its own resolved ground. A body
     region's fill is a `color-mix` that `getComputedStyle` hands back
     unresolved as `oklab(...)`, so every ground here is painted into a
     canvas and read back as pixels rather than parsed out of a string.
   - **mixed.json**: the mixed mark measured against its own fill at every
     step of the ramp, in both themes, and each shape's edge measured
     against the card behind it. "Legible in both themes and at the palest
     fill" is the one claim on this screen a render cannot settle, since the
     ends of the ramp are where a mark has least to work with.

   Run: node tests/body-map-gallery.mjs [--out <abs dir>] [--palette trans]
   Default out is .claude/ticket40, which is gitignored and durable.

   Phase 11 ticket 47 redrew what this shoots - the figure is one silhouette
   and a panel is a band of it, clipped - and the probes below follow the
   elements that carries: a panel's fill and its hairline are one rect, and
   the picked edge is a pass of its own over every fill. */
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const outDir = resolve(flag('out', resolve(here, '../.claude/ticket40')));
const palette = flag('palette', 'trans');
const THEMES = ['light', 'dark'];
const SCENES = ['empty', 'single', 'mixed', 'saturated'];

await mkdir(`${outDir}/shots`, { recursive: true });

const server = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await server.listen();
const port = server.config.server.port;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(`http://localhost:${port}/body-map.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-scene-figure="empty"] .region-art', { state: 'attached', timeout: 20000 });

const dress = async (theme) => {
  await page.evaluate(
    ([p, t]) => {
      document.documentElement.dataset.palette = p;
      document.documentElement.dataset.theme = t;
    },
    [palette, theme]
  );
  // Past every transition on the page; what is captured is the resting state.
  await page.waitForTimeout(500);
};

/* The colour arithmetic both probes below need, written once. Painting a
   value into a canvas rather than parsing it is the whole point: a fill on
   this screen is a color-mix, which getComputedStyle hands back unresolved
   as oklab(...), so a regex colour parser skips exactly the elements this
   ticket added. */
const COLOUR = `
  const paint = (value) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1
  });
  const lum = ({ r, g, b }) => {
    const ch = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const ratio = (fg, bg) => {
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
`;

/* The contrast walk's own reader. Two things make a naive one lie here, and
   both are in the memory of earlier passes on this repo:

   - `getComputedStyle` hands back `color-mix(...)` unresolved as
     `oklab(...)` on a tinted ground, so a regex colour parser skips exactly
     the elements this ticket added. Painting the value into a canvas and
     reading the pixel back is what resolves it.
   - a region's ground is a *sibling* rather than an ancestor - the shapes
     are absolutely positioned over one another - so walking up the tree for
     the first opaque background finds the card, not the fill underneath.
     The figure is the special case: a shape's own fill is its ground. */
const WALK = `(() => {
  ${COLOUR}

  /* The ground under an element: its own background where it has an opaque
     one, otherwise composited down from its ancestors. A shape's fill is
     its own background, which is the case the generic walk gets wrong. */
  const groundOf = (el) => {
    let stack = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = paint(getComputedStyle(node).backgroundColor);
      if (bg.a === 0) continue;
      stack.push(bg);
      if (bg.a === 1) break;
    }
    stack.push(paint(getComputedStyle(document.body).backgroundColor || '#ffffff'));
    return stack.reduceRight((under, top) => over(top, under));
  };

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  const out = [];
  for (const el of document.querySelectorAll('[data-scene] *')) {
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!text || !visible(el)) continue;
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const fg = paint(style.color);
    const bg = groundOf(el);
    out.push({
      scene: el.closest('[data-scene]').dataset.scene,
      selector: el.className || el.tagName.toLowerCase(),
      text: el.textContent.trim().slice(0, 40),
      size,
      weight,
      large,
      floor: large ? 3 : 4.5,
      ratio: Number(ratio(fg.a < 1 ? over(fg, bg) : fg, bg).toFixed(2))
    });
  }
  return out;
})()`;

/* The mixed mark against its own fill, at every step of the ramp, and the
   shape's edge against the ground outside it. Two different pairs on
   purpose: a mark sits *on* the fill and has to be read off it, while an
   edge separates the shape from what is behind it and is read against
   that. Measuring the edge against the fill - which is what the first pass
   here did - reports a failure that is not one and misses the one that is.

   The fill is a color-mix, which getComputedStyle hands back unresolved as
   oklab(...), so every colour goes through a canvas rather than a regex. */
const MIXED = `(() => {
  ${COLOUR}

  const out = [];
  /* The figure is an SVG: a region is a <g> carrying the ramp's fill and
     ink as custom properties, with its rects taking them. Read the group
     for the colours and one of its rects for the stroke. */
  for (const el of document.querySelectorAll('[data-region-art], .region-pill')) {
    const s = getComputedStyle(el);
    const scene = el.closest('[data-scene]').dataset.scene;
    const card = getComputedStyle(el.closest('[data-scene-figure]')).backgroundColor;
    const declared = s.getPropertyValue('--region-fill').trim();
    const fill = declared || card;
    const onFigure = el.hasAttribute('data-region-art');
    /* On the figure a panel is a band of the silhouette clipped to it, and
       its own outline is the hairline that parts it from its neighbours; in
       the cluster it is still the swatch and its border. */
    const drawn = onFigure ? el.querySelector('.region-tile') : el.querySelector('.region-swatch');
    const drawnStyle = getComputedStyle(drawn);
    const edge = onFigure ? drawnStyle.stroke : drawnStyle.borderTopColor;
    out.push({
      scene,
      region: onFigure ? el.dataset.regionArt : el.dataset.region,
      level: Number(el.dataset.regionLevel),
      mixed: onFigure
        ? el.querySelector('[data-region-mixed]') !== null
        : drawn.classList.contains('is-mixed'),
      marked: onFigure
        ? el.querySelector('[data-region-mixed]') !== null
        : getComputedStyle(drawn, '::after').content !== 'none',
      markVsFill: Number(
        ratio(
          paint(s.getPropertyValue('--region-ink').trim() || getComputedStyle(document.body).color),
          paint(fill)
        ).toFixed(2)
      ),
      /* What has to be perceivable is the boundary of a region that has
         nothing logged, since that is the shape standing for "never" - a
         ramp step is a chart mark and answers to no ratio (ADR-0012, and
         roles.ts's own note on the fill). So an unfilled shape is measured
         by its outline against the card and a filled one by its fill. */
      shapeVsCard: Number(
        ratio(paint(Number(el.dataset.regionLevel) === 0 ? edge : fill), paint(card)).toFixed(2)
      )
    });
  }
  return out;
})()`;

const contrast = [];
const mixed = [];

for (const theme of THEMES) {
  await dress(theme);
  await page.screenshot({ path: `${outDir}/shots/figure-all-${theme}.png`, fullPage: true });
  for (const scene of SCENES) {
    const box = page.locator(`[data-scene-figure="${scene}"]`);
    await box.screenshot({ path: `${outDir}/shots/figure-${scene}-${theme}.png` });
  }
  contrast.push(...(await page.evaluate(WALK)).map((row) => ({ theme, ...row })));
  mixed.push(...(await page.evaluate(MIXED)).map((row) => ({ theme, ...row })));
}

/* Selection, shot rather than described: the picked panel's edge and fill
   against a neighbour's, so the two channels can be told apart on a still.
   In both themes, because the edge is --text and the fill is a ramp step,
   and the pair swaps which of them is the darker of the two. */
await page.locator('[data-scene-figure="saturated"] [data-region="hips_waist"]').click();
for (const theme of THEMES) {
  await dress(theme);
  await page
    .locator('[data-scene-figure="saturated"]')
    .screenshot({ path: `${outDir}/shots/figure-selected-${theme}.png` });
}

await writeFile(`${outDir}/contrast.json`, JSON.stringify(contrast, null, 2));
await writeFile(`${outDir}/mixed.json`, JSON.stringify(mixed, null, 2));

/* One page to look through rather than a list of file names: each scene's
   two themes beside each other, in the order the states have to be told
   apart in. */
const SHEET = [
  ['empty', 'Nothing logged in this range. One body, its parts named by hairlines, nothing painted.'],
  ['single', 'One region, one faint reading. The pale end of the ramp against the scene above it.'],
  ['mixed', 'Both ways in the range, at both ends of the ramp. Two bars on a panel say mixed.'],
  ['saturated', 'Every region deep on the ramp, where a mark and an edge have least to work with.'],
  ['selected', 'A region picked: an ink edge round its own band, and no dimming of the others.']
];
await writeFile(
  `${outDir}/sheet.html`,
  `<!doctype html><meta charset="utf-8"><title>the body map's figure</title>
<style>
  body { margin: 0; padding: 32px; background: #14181c; color: #e8f1f7;
         font: 15px/1.5 system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.lead { margin: 0 0 32px; color: #9db4c3; max-width: 60ch; }
  section { margin-bottom: 40px; }
  h2 { font-size: 17px; margin: 0 0 2px; }
  p { margin: 0 0 12px; color: #9db4c3; max-width: 70ch; }
  .pair { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
  img { width: 360px; border-radius: 6px; }
</style>
<h1>The body map's figure, redrawn</h1>
<p class="lead">Palette ${palette}, light and dark, cropped to the figure and its card.
Nothing else on the route changed.</p>
${SHEET.map(
  ([key, said]) => `<section><h2>${key}</h2><p>${said}</p><div class="pair">${THEMES.map(
    (theme) => `<img src="shots/figure-${key}-${theme}.png" alt="${key}, ${theme}">`
  ).join('')}</div></section>`
).join('\n')}
`
);

const failures = contrast.filter((row) => row.ratio < row.floor);
console.log(`type walked: ${contrast.length} pieces, ${failures.length} under rule 11's floor`);
for (const row of failures) {
  console.log(`  FAIL ${row.theme}/${row.scene} "${row.text}" ${row.size}px ${row.ratio}:1 < ${row.floor}:1`);
}
const marked = mixed.filter((row) => row.mixed);
const worst = marked.reduce((low, row) => (row.markVsFill < low.markVsFill ? row : low), marked[0]);
console.log(`mixed shapes: ${marked.length}, all marked: ${marked.every((r) => r.marked)}`);
if (worst) {
  console.log(
    `  weakest mixed mark: ${worst.theme}/${worst.scene} ${worst.region} level ${worst.level} at ${worst.markVsFill}:1 against its own fill`
  );
}
const strayMarks = mixed.filter((row) => !row.mixed && row.marked);
console.log(`unmixed shapes wrongly marked: ${strayMarks.length}`);
const weakEdges = mixed.filter((row) => row.level === 0 && row.shapeVsCard < 3);
console.log(`unfilled shapes under 3:1 against the card: ${weakEdges.length}`);
for (const row of weakEdges) {
  console.log(`  FAIL ${row.theme}/${row.scene} ${row.region} at ${row.shapeVsCard}:1`);
}
const faintest = mixed
  .filter((row) => row.level === 1)
  .reduce((low, row) => (low && low.shapeVsCard < row.shapeVsCard ? low : row), null);
if (faintest) {
  console.log(
    `faintest fill: ${faintest.theme}/${faintest.scene} ${faintest.region} at ${faintest.shapeVsCard}:1 against the card, against an unfilled shape's outline at 3:1 or better`
  );
}
if (errors.length) console.log('page errors:', errors);

await browser.close();
await server.close();
console.log(`\n${outDir}`);
