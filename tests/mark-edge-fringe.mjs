/* The mark's silhouette, in pixels (ticket 50).

   "why the fuck is there this small white glitch around the corners? this
   is supposed to be pixel perfect, its a logo for chrissake" - Alicja,
   2026-09-21, on the mark at 48px on a dark sheet.

   She was right and the cause is compositing rather than geometry. Drawn
   the obvious way, the tile has two antialiased boundaries on the same
   curve: the clip path's, and the outer half of an edge stroked inside it.
   Neither is wrong on its own and their coverage does not sum to one, so a
   sliver of the white ground escapes past the ink and reads as a pale halo,
   worst at the corners where the two curves disagree fastest. Measured on
   the diagonal out of the bottom-left corner at 96px on the app's dark
   surface, the pixel outside the ink came out at luma 44 against a ground
   of 37. It is 22 now - darker than the ground, which is what antialiasing
   black into a dark page is supposed to look like.

   What fixed it is in mark.ts: the edge is the clip path itself, stroked at
   twice the seam, so the clip throws the outer half away and the drawing
   has exactly one boundary.

   This is a rendered check rather than a source one because the defect was
   never in the source - every number was already right. Eight walks out of
   the mark's outside at four sizes, and any pixel brighter than the ground
   before the ink is a fringe.

   Run: node tests/mark-edge-fringe.mjs */
import { launchChromium } from './browser-harness.mjs';
import { decodePng } from './png-decode.mjs';
import { MARK_SEAM, markSvg } from '../src/lib/components/mark.ts';

/* A mid grey rather than the app's own surface: bright enough that ink
   antialiases downwards into it and white antialiases upwards, so a fringe
   cannot hide by matching the page. */
const GROUND = [0x22, 0x25, 0x2c];

/* Only sizes where the edge is at least a whole pixel: MARK_SEAM is 3 of
   100, so it is sub-pixel below 34 and there is no ink to walk up to - at
   16px the whole mark is a smear, which ticket 38 accepted rather than
   worked around. A walk that cannot find the ink would read the tile's own
   white interior as the outside and fail on a drawing that is fine. */
const SIZES = [48, 96, 192, 512].filter((size) => (size * MARK_SEAM) / 100 >= 1);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const groundLuma = luma(GROUND);

/* Trans, whose bottom left corner is the white ground with no band over it
   - the one place a sliver of escaped white is unambiguous. */
const STRIPES = ['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA'];

const browser = await launchChromium();
const page = await browser.newPage({ deviceScaleFactor: 1 });

let failures = 0;
const fail = (line) => {
  failures++;
  process.stdout.write(`FAIL ${line}\n`);
};
const ok = (line) => process.stdout.write(`PASS ${line}\n`);

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:rgb(${GROUND.join(',')})">`
    + `<div id="t" style="width:${size}px;height:${size}px;line-height:0">`
    + `${markSvg(STRIPES, 'tile', size)}</div></body>`
  );
  const png = decodePng(await page.locator('#t').screenshot());
  const { width, channels, pixels } = png;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return luma([pixels[i], pixels[i + 1], pixels[i + 2]]);
  };

  const last = size - 1;
  const mid = size >> 1;
  /* Four corners on their diagonals and four edges on their normals: the
     corners are where the fringe gathered, the edges are the control. */
  const walks = [
    ['corner TL', (s) => [s, s]],
    ['corner TR', (s) => [last - s, s]],
    ['corner BL', (s) => [s, last - s]],
    ['corner BR', (s) => [last - s, last - s]],
    ['edge top', (s) => [mid, s]],
    ['edge right', (s) => [last - s, mid]],
    ['edge bottom', (s) => [mid, last - s]],
    ['edge left', (s) => [s, mid]]
  ];

  for (const [name, step] of walks) {
    const outside = [];
    let foundInk = false;
    for (let s = 0; s <= mid; s++) {
      const value = at(...step(s));
      if (value < groundLuma - 5) {
        foundInk = true; // everything past it is inside the mark
        break;
      }
      outside.push(value);
    }
    if (!foundInk) {
      fail(`${size}px ${name}: never reached the ink, so the edge is not there at all`);
      continue;
    }
    /* +2 rather than +0: a rounding difference of one level is not a
       fringe, and the defect this catches was +7 and visible. */
    const bright = outside.filter((value) => value > groundLuma + 2);
    if (bright.length) {
      fail(`${size}px ${name}: ${bright.map((v) => v.toFixed(0)).join(', ')} over a ground of ${groundLuma.toFixed(0)}`);
    } else {
      ok(`${size}px ${name}: nothing brighter than the ground before the ink`);
    }
  }
}

await browser.close();
process.stdout.write(failures ? `\n${failures} FAILURE(S)\n` : '\nNo fringe at any corner, at any size.\n');
process.exitCode = failures ? 1 : 0;
