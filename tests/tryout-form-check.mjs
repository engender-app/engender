/* The tryout form and the current experiment (phase 11 pre-production UI/UX
   ticket 43), against the built demo app in a real browser.

   Three things a source grep cannot answer, so they are answered here:

   1. What a screen reader is handed for a field whose help used to live
      inside its label. The audit read the end-date field's name as
      "EndedLeave blank if there is no end date." - one string, because the
      hint was a span inside the <label> and Svelte trimmed the space in
      front of it. The name and the description are separate elements now,
      so this reads both back off the DOM the way a screen reader would.

   2. Whether the kind picker keeps every label readable at phone widths.
      Phase 15 ticket 05 replaces the scrolling track with wrapping chips.
      Labels must fit inside their chips and the group without clipping.

   3. That all six kinds are reachable at 320px by keyboard and by touch,
      that creating, saving and reopening a tryout still keeps what was
      typed, and that the cards tell each other apart: a name far longer
      than the plate is wide stays inside the card, and a tryout nobody has
      recorded a feeling against says so rather than going blank.

   Run: VITE_DEMO=1 npm run build && node tests/tryout-form-check.mjs
        (npm run test:tryout-form does both) */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium, settlePage, fillDate } from './browser-harness.mjs';

const gallery = process.argv.includes('--gallery');
const out = resolve(process.env.TRYOUT_FORM_SHOTS ?? '.claude/tryout-form-shots');
await mkdir(out, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const errors = [];

/** Longer than the plate is wide at either width, so the name has to wrap
    inside it. */
const LONG_NAME = 'A name I have been turning over for a very long while now';

/** `tryout_felt_none`, which the card writes where the last reading would
    go when there is none. Read from the catalogues rather than hardcoded
    would mean importing the compiled runtime into a script that drives a
    built app; these two are the sentence the check is about. */
const NO_FEELING_YET = {
  en: 'No felt sense recorded yet',
  pl: 'Nie ma jeszcze zapisu odczuć'
};

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

      // 2. Every kind stays readable inside the wrapping picker.
      const track = page.locator('[data-choice-chips]').first();
      assert.equal(await track.locator('[role="radio"]').count(), KINDS.length);
      const labelsFit = await track.evaluate((group) => {
        const bounds = group.getBoundingClientRect();
        return group.scrollWidth <= group.clientWidth + 1 &&
          [...group.querySelectorAll('[role="radio"]')].every((chip) => {
            const box = chip.getBoundingClientRect();
            const label = document.createRange();
            label.selectNodeContents(chip);
            const text = label.getBoundingClientRect();
            return box.left >= bounds.left - 1 && box.right <= bounds.right + 1 &&
              box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1 &&
              text.left >= box.left - 1 && text.right <= box.right + 1 &&
              text.top >= box.top - 1 && text.bottom <= box.bottom + 1 &&
              chip.scrollWidth <= chip.clientWidth + 1;
          });
      });
      assert.ok(labelsFit, 'all six kind labels fit without clipping or horizontal scrolling');

      // Touch: every segment clears the product's 48px floor, and a tap on
      // one selects that one rather than a neighbour.
      for (const kind of KINDS) {
        const segment = page.locator(`[data-segment="${kind}"]`);
        await segment.scrollIntoViewIfNeeded();
        const box = await segment.boundingBox();
        const overlay = await segment.evaluate((el) => {
          const after = getComputedStyle(el, '::after');
          return after.content !== 'none' && after.position === 'absolute'
            ? { width: parseFloat(after.width) || 0, height: parseFloat(after.height) || 0 }
            : { width: 0, height: 0 };
        });
        const targetWidth = Math.max(box.width, overlay.width);
        const targetHeight = Math.max(box.height, overlay.height);
        assert.ok(targetWidth >= 48 && targetHeight >= 48,
          `${kind} touch target is ${targetWidth}x${targetHeight}px, requires 48px`);
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
      await page.fill('#tr-label', LONG_NAME);
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
      assert.equal(await page.inputValue('#tr-label'), LONG_NAME, 'reopening keeps the name');
      assert.equal(await page.inputValue('#tr-start'), '2026-03-03', 'reopening keeps the start date');
      assert.equal(
        await page.locator('[data-segment="style"]').getAttribute('aria-checked'),
        'true',
        'reopening keeps the kind'
      );
      /* The card for it: nothing has been recorded against this tryout yet,
         so the line that names the last reading says that in words rather
         than leaving the card with a gap where a fact goes - and the name,
         which is longer than the plate is wide, wraps inside the card
         rather than running out of it. */
      await settlePage(page, base, '/transition/tryouts', 'light');
      const card = page.locator(`[data-tryout-card]:has-text("${LONG_NAME}")`);
      await card.waitFor();
      assert.equal(
        (await card.locator('[data-tryout-latest]').textContent()).trim(),
        NO_FEELING_YET[language],
        'a tryout with no readings says so where the last one would go'
      );
      assert.equal(await card.locator('[data-tryout-felt]').count(), 0, 'and tallies no readings');
      const fits = await card.evaluate((el) => {
        const plate = el.querySelector('[data-tryout-reading]').getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return plate.right <= box.right + 1 && plate.left >= box.left - 1;
      });
      assert.ok(fits, 'a long name wraps inside its plate rather than past the card');

      /* Cancelling: the form's own way out is the header's back control,
         and leaving without saving must not write a second record. */
      await settlePage(page, base, '/transition/tryouts/new', 'light');
      await page.fill('#tr-label', 'Never saved');
      await page.locator('[data-screen-back]').click();
      await page.locator('[data-discard-record]').click();
      await page.waitForSelector('[data-tryout]');
      const names = await page.locator('[data-tryout]').allTextContents();
      assert.ok(!names.some((n) => n.includes('Never saved')), 'leaving the form without saving writes nothing');

      await page.close();
      console.log(`PASS ${language} ${width}px: one label and one help, six kinds readable and reachable, record kept`);
    }
  }
  assert.deepEqual(errors, [], 'no browser errors');
} finally {
  await browser.close();
  await app.httpServer.close();
}
