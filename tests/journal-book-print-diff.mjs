/* What the journal book actually prints, captured so two builds can be
   compared (phase 12 final-audit ticket 20).

   The ticket folds the pages away behind a disclosure that starts closed,
   and the one thing that may not change is the document: the acceptance
   asks for the printed output to be identical for the same range before and
   after. So this drives the real print path rather than reading the markup -
   it dispatches `beforeprint`, which is what the screen listens for, waits
   for the photos to come off the file store, switches the page to print
   media and then writes down everything that is still drawn.

   What is written down, in document order:

     text   every text run inside the app root that print media leaves
            visible, trimmed.
     boxes  every element carrying a `data-book-*` handle, with its position
            and size relative to the printed root.

   Run against a built tree in the current working directory:
     node tests/journal-book-print-diff.mjs --tag after --out /abs/dir
   `--tag before` wants the other checkout's build, and `vite preview` serves
   the cwd rather than any root it is handed, so run it with that checkout as
   the cwd (photo-grid-batching-gallery.mjs's own note):
     node -e "process.chdir('/path/to/before'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/journal-book-print-diff.mjs')"

   Then diff the two JSON files. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', '/tmp/journal-book-print'));
const VIEWPORT = { width: 390, height: 844 };

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await context.newPage();

const settle = async (path, { keepDemoBar = false } = {}) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (!keepDemoBar) {
    await page.evaluate(() => {
      document.querySelector('.demo-bar')?.remove();
      document.body.classList.remove('has-demo-bar');
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    });
  }
  await page.waitForTimeout(4000);
};

const capture = () =>
  page.evaluate(() => {
    const root = document.querySelector('[data-app-root]');
    const frame = root.getBoundingClientRect();
    const drawn = (node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const text = [];
    const boxes = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const said = child.textContent.trim();
          if (said) text.push(said);
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        if (!drawn(child)) continue;
        for (const name of child.getAttributeNames()) {
          if (!name.startsWith('data-book')) continue;
          const box = child.getBoundingClientRect();
          boxes.push({
            handle: `${name}=${child.getAttribute(name)}`,
            x: Math.round(box.x - frame.x),
            y: Math.round(box.y - frame.y),
            w: Math.round(box.width),
            h: Math.round(box.height)
          });
        }
        if (child.tagName === 'IMG') text.push(`[img ${Math.round(child.getBoundingClientRect().width)}px]`);
        walk(child);
      }
    };
    walk(root);
    return { text, boxes };
  });

try {
  await settle('/', { keepDemoBar: true });
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });

  await settle('/settings/journal-book');

  /* The real print path: the screen's own `beforeprint` listener is what
     puts the whole document on the page, whichever way the dialog was
     reached. On `main` it forces the chunked entry list to its full length;
     here it also opens the fold. */
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  /* The photos each answer their own read off the file store a frame or
     more later, on either build. */
  await page.waitForTimeout(6000);

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
  const printed = await capture();
  await page.emulateMedia({ media: 'screen' });

  await writeFile(`${outDir}/${tag}.json`, JSON.stringify(printed, null, 2) + '\n');
  console.log(
    JSON.stringify(
      { tag, out: `${outDir}/${tag}.json`, textRuns: printed.text.length, boxes: printed.boxes.length },
      null,
      2
    )
  );
} finally {
  await browser.close();
  await app.close();
}
