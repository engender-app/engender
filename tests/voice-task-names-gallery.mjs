/* The voice screen's task chooser, before and after ticket 44 renamed it.

   What the ticket is: "Record" made a benchmark and "Recordings" held the
   voice memos an entry owns, two names one word apart on the same control,
   with nothing on it saying that one of the two produces figures to set
   beside each other and the other keeps audio. The shots here are of that
   control and of the line under it, cropped to the top of the screen -
   nothing else on `/voice` changed, so nothing else is photographed.

   Both languages and two widths, because the Polish names are longer than
   the English ones ("Moje nagrania") and the control scrolls rather than
   shrinking: 320px is the narrowest the app supports and 390px is the
   reference phone. The default palette in light and dark, which is what a
   sign-off page is.

   Run against a built demo app, once per side of the comparison:
     VITE_DEMO=1 npm run build && node tests/voice-task-names-gallery.mjs before
     (restore the ticket's own copy)
     VITE_DEMO=1 npm run build && node tests/voice-task-names-gallery.mjs after
   Vite's preview() caches the built document per process, so the two tags
   cannot share one run. Shots land in .claude/ticket-44-shots, gitignored
   and durable. */
import { preview } from 'vite';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tag = process.argv[2] ?? 'after';
const outDir = resolve(process.argv[3] ?? resolve(here, '../.claude/ticket-44-shots'));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

async function openPage(width) {
  return browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
}

async function settle(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

/* Seed first, dress second: every demo jump replays the demo preferences
   over the palette and theme, so a theme picked before one is thrown away. */
async function dress(page, theme, locale) {
  await settle(page, '/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  if (locale === 'pl') {
    await page.locator('[data-segment="pl"]').click();
    /* The document language the app publishes, rather than a label read off
       the navigation: a label is a string this ticket could itself change,
       and `lang` is the thing that has to follow the choice anyway. */
    await page.waitForFunction(() => document.documentElement.lang === 'pl', null, { timeout: 8000 });
  }
}

/** The chooser and whatever sits under it, down to the first thing the tab
    itself draws. Cropped rather than full-page: the rest of `/voice` is
    what it was. */
async function shootChooser(page, name) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.querySelector('.demo-bar')?.remove();
  });
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => {
    const strip = document.querySelector('[data-segmented="voice-tab"]');
    const part = strip.closest('.screen-part');
    const rect = part.getBoundingClientRect();
    return { bottom: rect.bottom };
  });
  await page.screenshot({
    path: `${outDir}/${name}.png`,
    clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(box.bottom) + 24 }
  });
  shots.push(name);
}

for (const width of [320, 390]) {
  for (const locale of ['en', 'pl']) {
    for (const theme of ['light', 'dark']) {
      const page = await openPage(width);
      await dress(page, theme, locale);
      await settle(page, '/voice');
      await page.waitForSelector('[data-vb-passage]');
      await shootChooser(page, `${tag}-chooser-${width}-${locale}-${theme}`);
      /* The last tab picked, at the width where the strip has to scroll to
         show it: the pill has to land on the whole label rather than on the
         share of the track the segment would otherwise have been given. */
      if (width === 320 && theme === 'light') {
        await page.locator('[data-segment="recordings"]').click();
        await page.waitForTimeout(600);
        await shootChooser(page, `${tag}-chooser-${width}-${locale}-${theme}-on-recordings`);
      }
      await page.close();
    }
  }
}

/* The same chooser once benchmarks exist. "Fill every feature" writes six of
   them, which is the state the first-use line is not for: the screen has the
   answer on it by then, and the names carry the rest. */
{
  const page = await openPage(390);
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  /* The jump navigates to /more when the seeding finishes, whatever screen
     the harness is on by then, so waiting on that URL is what "done" means
     here. Dressing comes after it for the same reason: the fill writes the
     demo preferences back over the palette and theme. */
  await page.waitForURL('**/more', { timeout: 120000 });
  await dress(page, 'light', 'en');
  await settle(page, '/voice');
  await page.waitForSelector('[data-vb-passage]');
  await shootChooser(page, `${tag}-chooser-390-en-light-with-benchmarks`);
  await page.close();
}

/* The one other surface the compact rule change reaches: the roadmap's four
   tracks, whose last label was being clipped at 320px before it and which
   scrolls now. Not part of the voice screen, and here because a shared
   control changed underneath it. */
{
  const page = await openPage(320);
  await dress(page, 'light', 'en');
  await settle(page, '/transition/roadmap');
  await page.waitForSelector('[data-segmented="roadmap-track"]');
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.querySelector('.demo-bar')?.remove();
  });
  await page.waitForTimeout(400);
  const strip = await page.locator('[data-segmented="roadmap-track"]').boundingBox();
  await page.screenshot({
    path: `${outDir}/${tag}-roadmap-tracks-320-en-light.png`,
    clip: { x: 0, y: Math.max(0, strip.y - 16), width: 320, height: strip.height + 32 }
  });
  shots.push('roadmap');
  await page.close();
}

await app.httpServer.close();
await browser.close();

/* Sorted by what each shot is of rather than by its tag, so the before and
   the after of one state sit next to each other on the page. */
const files = (await readdir(outDir))
  .filter((f) => f.endsWith('.png'))
  .sort((a, b) => a.replace(/^[a-z]+-/, '').localeCompare(b.replace(/^[a-z]+-/, '')) || a.localeCompare(b));
await writeFile(
  `${outDir}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Ticket 44 - voice task names</title>
<style>body{background:#111;color:#eee;font:14px/1.5 system-ui;margin:0;padding:24px}
h1{font-size:18px}figure{margin:0 0 28px}figcaption{margin:6px 0;color:#aaa}
img{max-width:100%;border:1px solid #333;background:#000;image-rendering:-webkit-optimize-contrast}
.pair{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}</style>
<h1>Ticket 44: the voice screen's task chooser</h1>
<div class="pair">
${files.map((f) => `<figure><img src="${f}" alt="${f}"><figcaption>${f.replace(/\.png$/, '')}</figcaption></figure>`).join('\n')}
</div>`
);
console.log(`${shots.length} shots in ${outDir}`);
