/* What the two Look back galleries (redesign ticket 11) share beyond the
   usual boot-and-dress scaffolding: how the demo journal gets its eras, and
   which milestone mark a scene may tap.

   The demo persona writes no eras, and the rail is largely about them, so
   both scripts write three through the eras screen's own editor: one
   reaching back before the journal, one closed, one still running. Placed
   off the rail's own bounds, so they land wherever the persona's history
   is. `settle(page, path)` is the caller's own navigate-and-wait. */
import { fillDate } from './browser-harness.mjs';

const DAY_MS = 86400000;
const iso = (epochDay) => new Date(epochDay * DAY_MS).toISOString().slice(0, 10);

export async function seedEras(page, settle) {
  await settle(page, '/stats');
  await page.waitForSelector('[data-span-timeline]');
  const rail = await page.evaluate(() => {
    const el = document.querySelector('[data-span-timeline]');
    return { start: Number(el.dataset.railStart), today: Number(el.dataset.spanEnd) };
  });
  const cut1 = Math.max(rail.start + 30, rail.today - 700);
  const cut2 = Math.max(cut1 + 30, rail.today - 260);
  for (const era of [
    { name: 'Before I knew', start: null, end: cut1 },
    { name: 'First year', start: cut1 + 1, end: cut2 },
    { name: 'Since moving', start: cut2 + 1, end: null }
  ]) {
    await settle(page, '/transition/eras');
    await page.locator('[data-add]').click();
    await page.waitForSelector('input[name="era-name"]');
    await page.fill('input[name="era-name"]', era.name);
    await page.locator(`[data-segmented="era-start"] [data-segment="${era.start === null ? 'open' : 'day'}"]`).click();
    if (era.start !== null) {
      /* flatpickr swaps the field for its own and leaves the original
         hidden, so the wait is for attached rather than visible. */
      await page.waitForSelector('input[name="era-start"]', { state: 'attached' });
      await fillDate(page, 'input[name="era-start"]', iso(era.start));
    }
    await page.locator(`[data-segmented="era-end"] [data-segment="${era.end === null ? 'open' : 'day'}"]`).click();
    if (era.end !== null) {
      await page.waitForSelector('input[name="era-end"]', { state: 'attached' });
      await fillDate(page, 'input[name="era-end"]', iso(era.end));
    }
    await page.waitForTimeout(200);
    await page.locator('[data-save-era]').click();
    await page.waitForSelector('[data-save-era]', { state: 'detached', timeout: 10000 });
  }
}

/** The milestone mark farthest from either handle, as a locator: a mark
    under a handle's target is the handle's to drag, not a tap. */
export async function farMark(page) {
  const index = await page.evaluate(() => {
    const at = (el) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    };
    const handles = [...document.querySelectorAll('[data-span-handle]')].map(at);
    const marks = [...document.querySelectorAll('[data-span-milestone]')].map(at);
    let best = 0;
    let bestGap = -1;
    marks.forEach((x, i) => {
      const gap = Math.min(...handles.map((h) => Math.abs(h - x)));
      if (gap > bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    return best;
  });
  return page.locator('[data-span-milestone]').nth(index);
}
