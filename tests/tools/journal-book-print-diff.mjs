/* Dispatch beforeprint, wait for file-store photos, then emulate print.
   Record visible trimmed text and data-book-* boxes relative to the
   printed root in document order. Compare JSON for the same range across
   builds. Vite preview serves the current directory.

   node tests/tools/journal-book-print-diff.mjs --tag after --out /abs/dir
   node -e "process.chdir('/path/to/before'); process.argv.push('--','--tag','before','--out','/abs/dir'); import('/abs/tests/tools/journal-book-print-diff.mjs')" */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from '../browser-harness.mjs';

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
