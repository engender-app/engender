/* Screenshots of what phase 10 redesign ticket 43 changed, and nothing else
   (Alicja, 2026-09-07: a review page shows the things the ticket touched,
   not the whole app again; 2026-09-14: the default palette, light and dark,
   and nothing else - the eight-palette cross product is
   palette-contrast.test.ts's business).

   What changed is where the milestone rail is drawn. Before: a screen of
   its own at /timeline, reached from the Look back door, with the list of
   the same milestones one door away on Transition. After: one screen, the
   rail over the list, and /timeline a 307 into it.

   So the shots are crops of the rail and of the list, before and after, and
   two states the rail has to be right in: today between a mark behind it
   and a hollow mark ahead of it, and today at the head of a rail whose
   milestones are all still ahead - the defect ticket 23 fixed, which this
   merge must not reintroduce.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/milestones-gallery.mjs [outDir]
   Default outDir is .claude/milestone-shots/after. BEFORE=1 shoots the two
   screens as they were, so the same script can be pointed at a build of the
   commit before this ticket. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const before = process.env.BEFORE === '1';
const outDir = resolve(process.argv[2] ?? `.claude/milestone-shots/${before ? 'before' : 'after'}`);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const width = 390;

const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });

async function open(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    /* Headless Chromium draws a classic scrollbar gutter beside the scroll
       region; a phone draws an overlay one over the content. Hidden for the
       shot so the field's right edge is the screen's, as it is on a device. */
    if (!document.getElementById('ms-shot-css')) {
      const style = document.createElement('style');
      style.id = 'ms-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
  await page.waitForTimeout(500);
}

/** The whole document, with the viewport grown to the scroll region's height
    so nothing is clipped and every element rect is a page coordinate (the
    app does not scroll its document; `[data-app-scroll-region]` does). */
async function grow() {
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width, height: tall });
  await page.waitForTimeout(150);
}

/** A crop from the top of one element to the bottom of another, with a
    little of the page either side so an edge is visible as an edge. A
    selector may end in `@n` to mean the nth match, negative from the end. */
async function crop(name, fromSel, toSel = fromSel) {
  await grow();
  const box = await page.evaluate(
    ([from, to]) => {
      const pick = (spec) => {
        const [sel, at] = spec.split('@');
        const all = [...document.querySelectorAll(sel)];
        if (at === undefined) return all[0];
        const n = Number(at);
        return n < 0 ? all[all.length + n] : all[n];
      };
      const first = pick(from);
      const last = pick(to);
      if (!first || !last) return null;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      return { top: a.top, bottom: b.bottom };
    },
    [fromSel, toSel]
  );
  if (!box) {
    console.log(`skip ${name}: ${fromSel} or ${toSel} is not on the screen`);
    await page.setViewportSize({ width, height: 844 });
    return;
  }
  const top = Math.max(0, Math.floor(box.top) - 10);
  const height = Math.min(Math.ceil(box.bottom - top) + 12, 4000);
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: 0, y: top, width, height } });
  shots.push(name);
  await page.setViewportSize({ width, height: 844 });
}

/** The default palette in one theme, which is all a sign-off page shows. */
async function wear(theme) {
  await open('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  await page.waitForTimeout(400);
}

const SCREEN = before ? '/timeline' : '/transition/milestones';

for (const theme of ['light', 'dark']) {
  await wear(theme);

  /* 1. What the screen opens on. Before, two screens opened on two
        different things: /timeline on the rail and /transition/milestones
        on the list. After, one screen opens on the rail with the list
        under it (DIRECTION.md rule 16). */
  await open(SCREEN);
  await crop(`opens-${theme}`, '[data-screen-header]', '[data-tl-item]@2');

  /* 2. Today, between a mark behind it and a mark ahead of it. The hollow
        dot is the whole of what says "ahead" - no colour carries a verdict
        (ADR-0012). */
  await crop(`today-${theme}`, '[data-tl-item]@-3', '[data-tl-item]@-1');

  /* 3. The list, which is where a milestone is opened, edited or deleted.
        Before it was the whole of the other screen; after it is what runs
        under the rail, with a heading over it. */
  await open(before ? '/transition/milestones' : SCREEN);
  await crop(
    `list-${theme}`,
    before ? '[data-list-card]' : '[data-section-heading]',
    '[data-milestone]@2'
  );
}

if (!before) {
  /* 4. A journal whose milestones are all still ahead draws today at the
        head of the rail. That is the defect phase 5 ticket 23 fixed - the
        marker used to be inserted only between two milestones, so a rail of
        nothing but the future had no present on it - and the merge must not
        bring it back. Driven through the list's own delete, which also
        shows that deleting from the merged screen still works. */
  await wear('light');
  await open('/transition/milestones');
  for (let guard = 0; guard < 12; guard += 1) {
    const past = page.locator('[data-tl-item]:not(.is-future)').first();
    if (!(await past.count())) break;
    const id = await past.getAttribute('data-tl-item');
    await page.locator(`[data-milestone="${id}"] .kit-row-action, [data-milestone="${id}"] button[aria-label^="Delete"]`).first().click();
    await page.locator('[data-sheet] button:has-text("Delete milestone")').last().click();
    await page.waitForSelector(`[data-tl-item="${id}"]`, { state: 'detached' });
    await page.waitForTimeout(500);
  }
  await crop('all-ahead-light', '[data-screen-header]', '[data-tl-item]@1');
}

await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);
