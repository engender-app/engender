/* An era's name on the milestone rail stays clear of the dots on its band
   (last-audit UI 51, audit U43).

   The demo journal's "Full time" era ends today, so its band runs from the
   compressed gap row to the today row, and the today dot sits near its
   bottom. The band was lengthened for the name as a whole, the dot took
   20px of it, and the last letter ran 0.3px into the dot's ring at 390 and
   1280px. Painted, the ring cut the bottom off the "e".

   What it holds, on the demo journal at 390px (light and dark, English and
   Polish, text at 100% and 200%), at the 195px that 200% zoom leaves of a
   phone, and at 1280px:

   - every era name is drawn whole: its text lies inside the stretch it was
     placed in and inside its band, so nothing is clipped;
   - no name comes within 3px of any dot's ring on the rail, measured on the
     text's own box, which is never smaller than its ink;
   - the band just beside a ring holds no ink from a name next to it, read
     from the pixels at 2x, so the check does not rest on layout alone;
   - no band drawn later covers another band's name;
   - every band still covers rows of its era, "Full time" still runs
     through the today row, and a press on its name opens that era.

   Fails on d03441fe (the 0.3px overlap, and ink in the strip above the
   today ring). Run with `node tests/milestone-era-label-clear.mjs`. */
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, setAppLanguage, settlePage } from './browser-harness.mjs';

const CASES = [
  { width: 390, height: 844, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' },
  { width: 390, height: 844, theme: 'light', text: 200 },
  { width: 195, height: 422, theme: 'light' },
  { width: 1280, height: 900, theme: 'light' },
  { width: 390, height: 844, theme: 'light', locale: 'pl' },
  { width: 195, height: 422, theme: 'dark', locale: 'pl' }
];
const RING_PX = 4;
const MIN_CLEARANCE = 3;
/** Text boxes come back in fractional pixels; what a containment check
    forgives for rounding. */
const SLACK = 0.5;
/** Summed RGB distance from the band's own fill above which a pixel is ink. */
const INK = 90;

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launchChromium();
const failures = [];

/** The rail at rest: every band, name and dot where it was 600ms ago. */
async function untilRailSettles(page) {
  await page.locator('[data-tl-era] .tl-era-name').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  let last = '';
  let since = Date.now();
  for (;;) {
    const now = await page.evaluate(() =>
      JSON.stringify(
        [...document.querySelectorAll('[data-milestone-rail] [data-tl-era], [data-milestone-rail] .tl-era-name, [data-milestone-rail] .tl-dot')].map((el) => {
          const r = el.getBoundingClientRect();
          return [r.top, r.bottom];
        })
      )
    );
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= 600) return;
    await page.waitForTimeout(100);
  }
}

/** Rail geometry relative to the rail's own top, so scrolling between reads
    moves nothing. */
function readRail() {
  const rail = document.querySelector('[data-milestone-rail]');
  const origin = rail.getBoundingClientRect().top;
  const box = (r) => ({ top: r.top - origin, bottom: r.bottom - origin, left: r.left, right: r.right });
  const dots = [...rail.querySelectorAll('.tl-dot')].map((dot, index) => ({
    index,
    today: dot.classList.contains('is-today'),
    ...box(dot.getBoundingClientRect())
  }));
  const bands = [...rail.querySelectorAll('[data-tl-era]')].map((band) => {
    const name = band.querySelector('.tl-era-name');
    const range = document.createRange();
    range.selectNodeContents(name);
    return {
      name: name.textContent,
      band: box(band.getBoundingClientRect()),
      stretch: box(name.getBoundingClientRect()),
      text: box(range.getBoundingClientRect()),
      fill: getComputedStyle(band).backgroundColor
    };
  });
  const rows = [...rail.querySelectorAll('[data-tl-item], [data-tl-gap], [data-tl-today]')].map((row) => ({
    today: row.hasAttribute('data-tl-today'),
    ...box(row.getBoundingClientRect())
  }));
  return { dots, bands, rows };
}

/** Pixels further than INK from `fill` in the band beside dot `index`'s
    ring, on the side `above` names, read from a 2x screenshot decoded in
    the page. The strip is the 1.5px that ends 0.75px short of the ring, so
    the ring's own antialiased edge, which a fractional position can put in
    the next device row, is never read as ink. */
async function inkBesideRing(page, index, above, band) {
  const strip = await page.evaluate(
    ({ index, above }) => {
      const dot = document.querySelectorAll('[data-milestone-rail] .tl-dot')[index];
      dot.scrollIntoView({ block: 'center' });
      const r = dot.getBoundingClientRect();
      return { y: above ? r.top - 4 - 2.25 : r.bottom + 4 + 0.75 };
    },
    { index, above }
  );
  const png = await page.screenshot({ clip: { x: band.band.left + 2, y: strip.y, width: band.band.right - band.band.left - 4, height: 1.5 }, scale: 'device' });
  return page.evaluate(
    async ({ data, fill, threshold }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const px = ctx.getImageData(0, 0, image.width, image.height).data;
      const [r, g, b] = fill.match(/\d+(\.\d+)?/g).map(Number);
      let ink = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) > threshold) ink += 1;
      }
      return ink;
    },
    { data: png.toString('base64'), fill: band.fill, threshold: INK }
  );
}

try {
  for (const c of CASES) {
    const label = `${c.width}px ${c.theme}${c.locale ? ` ${c.locale}` : ''}${c.text ? ` text ${c.text}%` : ''}`;
    const fail = (message) => {
      failures.push(`${label}: ${message}`);
      console.error(`  - ${message}`);
    };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    /* The language is chosen at 390px: at 195 the demo bar wraps taller
       than the viewport until settlePage hides it, and setAppLanguage
       waits for a visible app. */
    if (c.locale) {
      await settlePage(page, base, 'settings', c.theme);
      await setAppLanguage(page, c.locale);
    }
    await page.setViewportSize({ width: c.width, height: c.height });
    await settlePage(page, base, 'transition/milestones', c.theme);
    if (c.text) await page.evaluate((t) => (document.documentElement.style.fontSize = `${t}%`), c.text);
    await untilRailSettles(page);

    const { dots, bands, rows } = await page.evaluate(readRail);
    if (bands.length !== 3) fail(`expected the demo journal's three era bands, found ${bands.length}`);
    const summary = [];

    for (const [index, band] of bands.entries()) {
      const { text, stretch } = band;
      if (text.top < stretch.top - SLACK || text.bottom > stretch.bottom + SLACK)
        fail(`"${band.name}" is ${(text.bottom - text.top).toFixed(1)}px long in a ${(stretch.bottom - stretch.top).toFixed(1)}px stretch, so it is clipped`);
      if (text.top < band.band.top - SLACK || text.bottom > band.band.bottom + SLACK)
        fail(`"${band.name}" runs out of its band (${text.top.toFixed(1)}-${text.bottom.toFixed(1)} in ${band.band.top.toFixed(1)}-${band.band.bottom.toFixed(1)})`);

      let nearest = Infinity;
      for (const dot of dots) {
        if (dot.right + RING_PX <= text.left || dot.left - RING_PX >= text.right) continue;
        const ringTop = dot.top - RING_PX;
        const ringBottom = dot.bottom + RING_PX;
        const above = text.bottom <= ringTop + SLACK;
        const clearance = above ? ringTop - text.bottom : text.top - ringBottom;
        nearest = Math.min(nearest, clearance);
        const which = dot.today ? 'today' : 'milestone';
        if (clearance < MIN_CLEARANCE) fail(`"${band.name}" comes ${clearance.toFixed(2)}px from the ${which} dot's ring (needs ${MIN_CLEARANCE})`);
        if (clearance > 10) continue;
        const ink = await inkBesideRing(page, dot.index, above, band);
        if (ink > 0) fail(`${ink} device pixels of "${band.name}" sit in the band just beside the ${which} dot's ring`);
      }
      summary.push(`${band.name} ${(text.bottom - text.top).toFixed(1)}px, ${nearest.toFixed(1)}px from a ring`);

      for (const later of bands.slice(index + 1)) {
        if (later.band.top < text.bottom && later.band.bottom > text.top)
          fail(`"${later.name}" is drawn over "${band.name}"'s name`);
      }

      const inside = rows.filter((row) => row.top >= band.band.top - SLACK && row.bottom <= band.band.bottom + SLACK);
      if (inside.length === 0) fail(`"${band.name}" covers none of its rows`);
      if (band.name === 'Full time' && !inside.some((row) => row.today)) fail('"Full time" no longer runs through the today row');
    }

    // A press on the name still opens its era.
    await page.locator('[data-tl-era]', { hasText: 'Full time' }).locator('.tl-era-name').click();
    await page.locator('#era-name').waitFor();
    const opened = await page.locator('#era-name').inputValue();
    if (opened !== 'Full time') fail(`a press on "Full time" opened "${opened}"`);

    if (errors.length) fail(`page errors: ${errors.join('; ')}`);
    console.log(`${failures.some((f) => f.startsWith(`${label}:`)) ? 'FAIL' : 'ok  '} ${label}: ${summary.join('; ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('PASS milestone-era-label-clear');
