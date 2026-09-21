/* The tryout form and the current experiment (phase 11 pre-production UI/UX
   ticket 43), against the built demo app in a real browser.

   Three things a source grep cannot answer, so they are answered here:

   1. What a screen reader is handed for a field whose help used to live
      inside its label. The audit read the end-date field's name as
      "EndedLeave blank if there is no end date." - one string, because the
      hint was a span inside the <label> and Svelte trimmed the space in
      front of it. The name and the description are separate elements now,
      so this reads both back off the DOM the way a screen reader would.

   2. Whether the overflow affordance on the kind picker is legible, which
      is not the same question as whether it is in the DOM. The chevron was
      present, positioned, visible and painted on top of a clipped label, so
      at 390px the control rendered "Garme>e" and the mark was mush. The
      check is a pixel one: crop the chevron's own box twice, once as
      shipped and once with every segment label hidden, and the two crops
      have to match - which is exactly the promise the control's own comment
      makes ("a fixed hint that never depends on how a neighbouring label
      happens to break").

   3. That all six kinds are reachable at 320px by keyboard and by touch,
      and that creating, saving and reopening a tryout still keeps what was
      typed.

   Run: VITE_DEMO=1 npm run build && node tests/tryout-form-check.mjs
        (npm run test:tryout-form does both) */
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium, settlePage, fillDate } from './browser-harness.mjs';
import { decodePng } from './png-decode.mjs';

const gallery = process.argv.includes('--gallery');
const out = resolve(process.env.TRYOUT_FORM_SHOTS ?? '.claude/tryout-form-shots');
await mkdir(out, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const errors = [];

/** The six kinds, in the order the form lists them. */
const KINDS = ['name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step'];

/** What a screen reader would announce for a field: its accessible name
    from the label pointing at it, and its description from whatever
    aria-describedby names. */
const fieldReading = (page, selector) =>
  page.evaluate((sel) => {
    const field = document.querySelector(sel);
    if (!field) return null;
    const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
    const described = (field.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? null);
    return { name: label?.textContent?.trim() ?? null, described };
  }, selector);

/** The pixels inside one element's own box. */
async function crop(page, selector) {
  const buffer = await page.locator(selector).first().screenshot();
  const png = decodePng(buffer);
  return { width: png.width, height: png.height, pixels: png.pixels };
}

const differingFraction = (a, b) => {
  assert.equal(a.width, b.width, 'crops differ in width');
  assert.equal(a.height, b.height, 'crops differ in height');
  let differing = 0;
  for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) differing++;
  return differing / a.pixels.length;
};

try {
  for (const language of ['en', 'pl']) {
    for (const width of [320, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 844 },
        hasTouch: true,
        deviceScaleFactor: 2
      });
      page.on('pageerror', (error) => errors.push(error.stack));
      await page.addInitScript((lang) => localStorage.setItem('PARAGLIDE_LOCALE', lang), language);
      await settlePage(page, base, '/transition/tryouts/new', 'light');
      await page.waitForSelector('#tr-label');

      // 1. One name, one description, and the description is not the name.
      const end = await fieldReading(page, '#tr-end');
      assert.ok(end, 'the end-date field is on the new-tryout form');
      assert.ok(end.name && end.name.length > 0, 'the end-date field has a label');
      assert.equal(end.described.length, 1, 'the end-date field is described by exactly one element');
      assert.ok(end.described[0], 'the end-date field\'s description resolves to real text');
      assert.ok(
        !end.name.includes(end.described[0]),
        `the help is not inside the name: "${end.name}"`
      );
      /* The name is one clause. The defect this ticket fixes made it a
         clause and a sentence with no space between them. */
      assert.ok(!/[.]/.test(end.name), `the end-date field's name is a label, not a sentence: "${end.name}"`);

      for (const selector of ['#tr-label', '#tr-start', '#tr-end']) {
        const read = await fieldReading(page, selector);
        assert.ok(read?.name, `${selector} has a label of its own`);
      }

      // 2. Every kind reachable, and the overflow mark legible.
      const track = page.locator('[role="radiogroup"]').first();
      const overflow = await page.evaluate(() => {
        const group = document.querySelector('[role="radiogroup"]');
        return {
          scrolls: group.scrollWidth > group.clientWidth + 1,
          hint: Boolean(document.querySelector('.segmented-hint'))
        };
      });
      assert.ok(overflow.scrolls, 'six kind labels overflow a phone-width track');
      assert.ok(overflow.hint, 'an overflowing kind picker shows its chevron');

      const shipped = await crop(page, '.segmented-hint svg');
      await page.addStyleTag({ content: '.segmented .segment { visibility: hidden; }' });
      const alone = await crop(page, '.segmented-hint svg');
      const polluted = differingFraction(shipped, alone);
      assert.ok(
        polluted < 0.01,
        `the chevron is drawn on the track, not on a clipped label (${(polluted * 100).toFixed(1)}% of its pixels change when the labels are hidden)`
      );
      await page.evaluate(() => document.querySelectorAll('style').forEach((s) => {
        if (s.textContent.includes('.segmented .segment { visibility: hidden; }')) s.remove();
      }));

      // Touch: every segment clears the product's 48px floor, and a tap on
      // one selects that one rather than a neighbour.
      for (const kind of KINDS) {
        const segment = page.locator(`[data-segment="${kind}"]`);
        await segment.scrollIntoViewIfNeeded();
        const box = await segment.boundingBox();
        assert.ok(box.height >= 48, `${kind} is ${box.height}px tall`);
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        assert.equal(
          await segment.getAttribute('aria-checked'),
          'true',
          `tapping ${kind} selects ${kind}`
        );
      }

      // Keyboard: arrows walk the whole set and carry each one into view.
      await page.locator(`[data-segment="${KINDS[0]}"]`).focus();
      for (const kind of KINDS.slice(1)) {
        await page.keyboard.press('ArrowRight');
        const inView = await page.evaluate((want) => {
          const group = document.querySelector('[role="radiogroup"]');
          const focused = document.activeElement;
          if (focused?.dataset.segment !== want) return 'focus did not move';
          const box = focused.getBoundingClientRect();
          const strip = group.getBoundingClientRect();
          return box.left >= strip.left - 1 && box.right <= strip.right + 1 ? true : 'out of view';
        }, kind);
        assert.equal(inView, true, `ArrowRight reaches ${kind} and shows it (${inView})`);
        assert.equal(await page.locator(`[data-segment="${kind}"]`).getAttribute('aria-checked'), 'true');
      }

      // 3. At 200% text the name and its help are still two readable lines.
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      const stacked = await page.evaluate(() => {
        const label = document.querySelector('label[for="tr-end"]').getBoundingClientRect();
        const hint = document.getElementById('tr-end-hint').getBoundingClientRect();
        return hint.top >= label.bottom - 1;
      });
      assert.ok(stacked, 'the help sits under the label at 200% text rather than running into it');
      if (gallery) await page.screenshot({ path: `${out}/form-${language}-${width}-text200.png` });
      await page.evaluate(() => (document.documentElement.style.fontSize = ''));

      // 4. Creating, saving and reopening keeps the record.
      await page.locator(`[data-segment="style"]`).click();
      await page.fill('#tr-label', 'Shorter hair');
      await fillDate(page, '#tr-start', '2026-03-03');
      await page.locator('[data-save-tryout]').click();
      await page.waitForFunction(() => !location.pathname.endsWith('/new'));
      const saved = page.url();
      await page.locator('#tr-feeling-note').fill('a note');
      const noteField = await fieldReading(page, '#tr-feeling-note');
      assert.ok(noteField?.name, 'the felt-sense note carries a label of its own');

      await settlePage(page, base, '/transition/tryouts', 'light');
      await settlePage(page, base, new URL(saved).pathname, 'light');
      await page.waitForSelector('#tr-label');
      assert.equal(await page.inputValue('#tr-label'), 'Shorter hair', 'reopening keeps the name');
      assert.equal(await page.inputValue('#tr-start'), '2026-03-03', 'reopening keeps the start date');
      assert.equal(
        await page.locator('[data-segment="style"]').getAttribute('aria-checked'),
        'true',
        'reopening keeps the kind'
      );
      /* Cancelling: the form's own way out is the header's back control,
         and leaving without saving must not write a second record. */
      await settlePage(page, base, '/transition/tryouts/new', 'light');
      await page.fill('#tr-label', 'Never saved');
      await page.locator('[data-screen-back]').click();
      await page.waitForSelector('[data-tryout]');
      const names = await page.locator('[data-tryout] .tc-name, [data-tryout] .list-row-title').allTextContents();
      assert.ok(!names.some((n) => n.includes('Never saved')), 'leaving the form without saving writes nothing');

      await page.close();
      console.log(`PASS ${language} ${width}px: one label and one help, six kinds reachable, chevron legible, record kept`);
    }
  }
  assert.deepEqual(errors, [], 'no browser errors');
} finally {
  await browser.close();
  await app.httpServer.close();
}
