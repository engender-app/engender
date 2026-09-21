/* Selecting a fact on a timeline without precision tapping (phase 11 UI/UX
   ticket 25, first audit U4).

   The two surfaces the audit measured, checked the way it asked for: hit
   testing rather than bounding boxes alone, at 390px and at the 195px that
   200% zoom leaves of it, with a crowded history rather than a tidy one.

   What it holds:

   - every caption on the Care rail is a target at the product's 48px floor,
     and no two of them lie over each other;
   - a lane's name opens that drug's own block, by pointer and by keyboard,
     and lands the focus on it;
   - nothing on the Look back rail owns a point it does not draw - a
     milestone's target no longer covers the regimen band under it, and two
     milestones a few pixels apart no longer cover each other;
   - the list under the rail holds every fact with its exact dates, selects
     the same span the band on the rail selects, keeps the selection marked,
     and stays bounded on a journal with forty milestones;
   - the range handles still move the span, which the audit asked to be left
     alone.

   Run on its own with `npm run test:timeline-facts`; part of the
   browser tier's own run. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';

const PHONE = { width: 390, height: 844 };
/* What 200% zoom leaves of a 390px phone (tests/field-gallery.mjs's own
   convention). */
const ZOOMED = { width: 195, height: 422 };
const FLOOR = 48;
/* Chromium reports fractional pixels; a target 47.98px tall is at the
   floor. */
const SLACK = 0.5;

/** Every target's box in the scroll region's own coordinates, plus what a
    tap at its own centre actually reaches.

    Two passes on purpose. The boxes are taken in one layout so they can be
    compared with each other; the hit test then scrolls each target to the
    middle of the screen first, because `elementFromPoint` answers about the
    viewport and a rail's third lane is below the fold on a 422px screen. */
async function targets(page, selector) {
  return page.$$eval(selector, (els) => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    const offsetY = scroller ? scroller.scrollTop : 0;
    const offsetX = scroller ? scroller.scrollLeft : 0;
    const named = (el) =>
      el.dataset.careMark ??
      el.dataset.spanBand ??
      el.dataset.spanMilestone ??
      el.dataset.spanSurgery ??
      el.dataset.spanFact ??
      el.textContent?.trim().slice(0, 40) ??
      '';
    const boxes = els.map((el) => {
      const box = el.getBoundingClientRect();
      return { name: named(el), x: box.x + offsetX, y: box.y + offsetY, width: box.width, height: box.height };
    });
    return els.map((el, index) => {
      el.scrollIntoView({ block: 'center' });
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return {
        ...boxes[index],
        hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 40)}` : 'nothing',
        ownsItsCentre: hit === el || el.contains(hit)
      };
    });
  });
}

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function assertNoOverlap(boxes, what) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.equal(
        overlaps(boxes[i], boxes[j]),
        false,
        `${what}: "${boxes[i].name}" and "${boxes[j].name}" overlap (${JSON.stringify(boxes[i])} / ${JSON.stringify(boxes[j])})`
      );
    }
  }
}

const server = await createServer({
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const page = await browser.newPage({ viewport: PHONE, reducedMotion: 'reduce' });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await settlePage(page, base, '/care', 'light');

  /* A crowded history: two drugs running at once so the rail draws two
     lanes and two regimen bands in one row, a tryout over the same days, a
     surgery, and forty milestones - two of them a day apart, which is a few
     pixels on a rail of years. */
  const fixture = await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();

    await j.entries.upsertEntry({ epochDay: today - 900, mood: 4, note: 'The first day of the journal' });
    await j.entries.upsertEntry({ epochDay: today - 1, mood: 3, note: 'Yesterday' });

    /* No era is written: the demo journal the dev server boots already
       holds them, and a second one overlapping is refused by the area's own
       whole-table guard. */

    for (const drug of [
      { drug: 'Estradiol', ester: 'Valerate', dose: 2, unit: 'mg', from: 600 },
      { drug: 'Progesterone', ester: null, dose: 100, unit: 'mg', from: 300 }
    ]) {
      const episodeId = await j.regimen.upsertEpisode({
        drug: drug.drug,
        ester: drug.ester,
        dose: drug.dose,
        doseUnit: drug.unit,
        route: 'oral',
        interval: 'daily',
        startEpochDay: today - drug.from,
        endEpochDay: null,
        endReason: null
      });
      await j.doses.upsertSchedule({
        episodeId,
        recurrence: { kind: 'everyNDays', everyNDays: 1 },
        dosesPerDay: 1,
        doseAmounts: [{ dose: drug.dose, doseUnit: drug.unit }],
        autoLogFromEpochDay: null
      });
      await j.doses.upsertDose({
        drug: drug.drug,
        timestamp: startOfDayTimestamp(today - 2) + 36000000,
        route: 'oral',
        dose: drug.dose,
        doseUnit: drug.unit,
        status: 'taken'
      });
    }
    await j.labs.upsertResult({ analyte: 'Estradiol', epochDay: today - 20, time: '09:00', value: 150, unit: 'pg/mL' });

    const tryoutId = await j.tryouts.upsertTryout({
      kind: 'name',
      label: 'A name I am trying',
      startEpochDay: today - 500,
      endEpochDay: today - 420
    });
    const procedureId = await j.procedures.upsertProcedure({ name: 'A procedure', surgeryEpochDay: today - 200 });

    /* Forty milestones, evenly spread, and two of them consecutive days -
       the pair the old 36px-wide mark target could not tell apart. */
    const milestones = [];
    for (let i = 0; i < 40; i++) {
      milestones.push(
        await j.milestones.upsertMilestone({ name: `Milestone ${i + 1}`, epochDay: today - 850 + i * 20 })
      );
    }
    const crowdedDay = today - 850 + 20 * 20 + 1;
    milestones.push(await j.milestones.upsertMilestone({ name: 'The day after', epochDay: crowdedDay }));

    return { today, tryoutId, procedureId, milestones, crowdedDay, tryoutStart: today - 500, tryoutEnd: today - 420 };
  });

  /* ------------------------------------------------------------------ */
  /* Care: the captions and the lane's way down to its medication rows.   */
  /* ------------------------------------------------------------------ */
  for (const viewport of [PHONE, ZOOMED]) {
    await page.setViewportSize(viewport);
    await settlePage(page, base, '/care', 'light');
    await page.waitForSelector('[data-care-rail]');
    const at = `at ${viewport.width}px`;

    const captions = await targets(page, '.care-rail .care-mark');
    assert.ok(captions.length >= 4, `${at}: the rail draws its captions (${captions.length})`);
    for (const caption of captions) {
      assert.ok(
        caption.height >= FLOOR - SLACK,
        `${at}: caption "${caption.name}" is ${caption.height.toFixed(1)}px tall, under the ${FLOOR}px floor`
      );
      assert.ok(
        caption.width >= FLOOR - SLACK,
        `${at}: caption "${caption.name}" is ${caption.width.toFixed(1)}px wide, under the ${FLOOR}px floor`
      );
      assert.equal(
        caption.ownsItsCentre,
        true,
        `${at}: caption "${caption.name}" is not reached by a tap on itself (${JSON.stringify(caption)})`
      );
    }
    assertNoOverlap(captions, `${at}: care captions`);
  }

  await page.setViewportSize(PHONE);
  await settlePage(page, base, '/care', 'light');

  /* The lane's name is a target at the floor and opens that drug's block,
     with the focus on it - A14's identity intact, since the block is the
     one carrying this drug's route, dose and Log a dose. */
  const jump = page.locator('[data-care-lane-jump="Estradiol"]');
  const jumpBox = await jump.boundingBox();
  assert.ok(jumpBox.height >= FLOOR - SLACK, `the lane name is ${jumpBox.height.toFixed(1)}px tall`);
  await jump.click();
  const landed = await page.evaluate(() => {
    const block = document.activeElement?.closest('[data-care-regimen-block]');
    if (!block) return null;
    const box = block.getBoundingClientRect();
    return { drug: block.dataset.careRegimenBlock, inView: box.top >= 0 && box.top < window.innerHeight };
  });
  assert.deepEqual(landed, { drug: 'Estradiol', inView: true }, 'the lane name lands the focus on its own medication block');
  assert.equal(
    await page.locator('[data-care-regimen-block="Estradiol"] [data-care-log="Estradiol"]').count(),
    1,
    'the block it lands on is the one holding that drug’s Log a dose'
  );

  /* The same by keyboard: focus the second lane's name and press Enter. */
  await page.locator('[data-care-lane-jump="Progesterone"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement?.closest('[data-care-regimen-block]')?.dataset.careRegimenBlock),
    'Progesterone',
    'the keyboard reaches the same block'
  );

  /* ------------------------------------------------------------------ */
  /* Look back: the rail's targets, and the list beside it.               */
  /* ------------------------------------------------------------------ */
  for (const viewport of [PHONE, ZOOMED]) {
    await page.setViewportSize(viewport);
    await settlePage(page, base, '/stats', 'light');
    await page.waitForSelector('[data-span-timeline]');
    const at = `at ${viewport.width}px`;

    /* Who owns the middle of each band and each mark. Three answers are
       allowed and the rest are the defect this ticket is about:

       - itself, which is the point;
       - a range handle, which owns 48px at each end of the span by design
         and which the audit asked to be left exactly as it is;
       - another fact whose own drawing lies over it, which is two regimens
         running at once in one row, or two milestones a fortnight apart
         where a fortnight is three pixels. A drawing that overlaps is not
         an invisible region that does, and nothing a hit box can do
         separates them; the list under the rail is the way to the one
         underneath.

       What is left is the defect: a fact taken by something that does not
       draw where it took it, which is what the fixed 36x48px mark target
       did to every band and every neighbouring mark near it. */
    const owners = await page.evaluate(() => {
      const facts = [...document.querySelectorAll('[data-span-band], [data-span-milestone], [data-span-surgery]')];
      const overlaps = (a, b) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      return facts.map((el) => {
        el.scrollIntoView({ block: 'center' });
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const owner = hit?.closest('[data-span-band], [data-span-milestone], [data-span-surgery], [data-span-handle], [data-span-era]');
        const name = el.dataset.spanBand ?? el.dataset.spanMilestone ?? el.dataset.spanSurgery ?? '';
        if (!owner) return { name, owner: 'nothing' };
        if (owner === el) return { name, owner: 'self' };
        if (owner.dataset.spanHandle) return { name, owner: 'handle' };
        if (overlaps(box, owner.getBoundingClientRect())) return { name, owner: 'drawn over it' };
        return { name, owner: `${owner.dataset.spanBand ?? owner.dataset.spanMilestone ?? owner.dataset.spanSurgery ?? 'era'} (${owner.className})` };
      });
    });
    assert.ok(owners.length > 0, `${at}: the rail draws bands and marks`);
    const stolen = owners.filter((fact) => !['self', 'handle', 'drawn over it'].includes(fact.owner));
    assert.deepEqual(stolen, [], `${at}: no fact is taken by something that does not draw there`);
    console.log(
      `   ${at}: ${owners.filter((f) => f.owner === 'self').length} of ${owners.length} facts own their own middle` +
        ` (${owners.filter((f) => f.owner === 'drawn over it').length} under another drawing,` +
        ` ${owners.filter((f) => f.owner === 'handle').length} under a range handle)`
    );

    /* The old defect, directly: a point on the regimen band under a
       milestone's own x belongs to the band. */
    const underMark = await page.evaluate(() => {
      const band = document.querySelector('[data-span-band="regimen"]');
      if (!band) return 'no regimen band';
      band.scrollIntoView({ block: 'center' });
      const bandBox = band.getBoundingClientRect();
      const y = bandBox.y + bandBox.height / 2;
      /* A milestone standing over the band, and not at either end of it
         where the band's own neighbour or a handle would answer. */
      const mark = [...document.querySelectorAll('[data-span-milestone]')].find((el) => {
        const box = el.getBoundingClientRect();
        const x = box.x + box.width / 2;
        return x > bandBox.x + 16 && x < bandBox.x + bandBox.width - 16;
      });
      if (!mark) return 'no milestone over the band';
      const markBox = mark.getBoundingClientRect();
      const hit = document.elementFromPoint(markBox.x + markBox.width / 2, y);
      return hit?.dataset?.spanBand ?? hit?.dataset?.spanMilestone ?? hit?.tagName ?? 'nothing';
    });
    assert.equal(underMark, 'regimen', `${at}: the band under a milestone still takes its own taps`);
  }

  await page.setViewportSize(PHONE);
  await settlePage(page, base, '/stats', 'light');

  /* The list: every fact, its dates, and the span each one selects. */
  await page.locator('[data-span-facts-toggle]').click();
  await page.waitForSelector('[data-span-fact]');
  const kinds = await page.$$eval('[data-span-fact]', (els) => [...new Set(els.map((el) => el.dataset.spanFact))].sort());
  assert.deepEqual(kinds, ['era', 'milestone', 'regimen', 'surgery', 'tryout'], 'the list holds every kind the rail draws');

  /* Bounded before anything scrolls it: forty-one milestones and a handful
     of stretches, rendered a batch at a time. Asked first because the list
     grows as it is scrolled (ADR-0069) and the measuring below scrolls
     every row into view. */
  const shown = await page.locator('[data-span-fact]').count();
  assert.ok(shown <= 30, `the list renders one batch (${shown} rows) rather than every fact`);
  assert.equal(await page.locator('[data-batched-more="lookback-facts"]').count(), 1, 'and says how to see more');

  const rows = await targets(page, '[data-span-fact]');
  for (const row of rows) {
    assert.ok(row.height >= FLOOR - SLACK, `fact row "${row.name}" is ${row.height.toFixed(1)}px tall`);
  }
  assertNoOverlap(rows, 'fact rows');

  /* A stretch selects its own two days, without a drag. */
  const tryoutRow = page.locator('[data-span-fact="tryout"]').first();
  const tryoutText = await tryoutRow.innerText();
  assert.match(tryoutText, /A name I am trying/, 'the row names the tryout');
  assert.match(tryoutText, /\d{4}|\d+ \w+/, 'and writes its dates out');
  await tryoutRow.click();
  const spanAfterTryout = await page.evaluate(() => {
    const el = document.querySelector('[data-span-timeline]');
    return { start: Number(el.dataset.spanStart), end: Number(el.dataset.spanEnd) };
  });
  assert.deepEqual(
    spanAfterTryout,
    { start: fixture.tryoutStart, end: fixture.tryoutEnd },
    'the row selects the stretch the band selects'
  );

  /* And the row it selected says so, still, after the list is reopened. */
  assert.equal(
    await page.locator('[data-span-fact="tryout"][aria-current="true"]').count(),
    1,
    'the selected fact keeps its mark'
  );
  await page.locator('[data-span-facts-toggle]').click();
  await page.locator('[data-span-facts-toggle]').click();
  await page.waitForSelector('[data-span-fact]');
  assert.equal(
    await page.locator('[data-span-fact="tryout"][aria-current="true"]').count(),
    1,
    'and keeps it across a fold and an unfold'
  );

  /* A day selects the window ending on it, which is what its mark on the
     rail does. */
  const surgeryRow = page.locator('[data-span-fact="surgery"]').first();
  await surgeryRow.scrollIntoViewIfNeeded();
  await surgeryRow.click();
  const spanAfterDay = await page.evaluate(() => {
    const el = document.querySelector('[data-span-timeline]');
    return { start: Number(el.dataset.spanStart), end: Number(el.dataset.spanEnd) };
  });
  assert.equal(spanAfterDay.end, fixture.today - 200, 'the day fact ends the span on its own day');
  assert.equal(spanAfterDay.end - spanAfterDay.start + 1, 30, 'and opens the door’s own window behind it');

  /* By keyboard, end to end: the fold takes Enter, and so does a row. */
  const toggle = page.locator('[data-span-facts-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-span-fact]');
  await page.keyboard.press('Tab');
  const focusedRow = await page.evaluate(() => document.activeElement?.dataset?.spanFact ?? null);
  assert.ok(focusedRow, 'a Tab out of the fold lands on the first fact');
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('[data-span-fact][aria-current="true"]').count(),
    1,
    'and Enter selects it'
  );

  /* The handles the audit asked to be left alone still move the span. */
  const before = await page.evaluate(() => Number(document.querySelector('[data-span-timeline]').dataset.spanStart));
  await page.locator('[data-span-handle="start"]').focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(
    (was) => Number(document.querySelector('[data-span-timeline]').dataset.spanStart) < was,
    before
  );

  assert.equal(errors.length, 0, `errors: ${errors.join(', ')}`);
  console.log('PASS Timeline facts: care captions at the floor, lane jumps, rail targets that own only what they draw, and the fact list');
} finally {
  await browser.close();
  await server.close();
}
