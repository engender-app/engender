/* Walkable-flow tests (ticket 20's acceptance for tickets 01/07/08) against
   the real app, not a probe page - so this serves the app's own production
   build rather than sharing browser-tier/run.mjs's probe-page dev server.
   It's `vite preview`, like verify-build.mjs, not `vite dev`: the dev
   server's dependency re-optimization forces a full-page reload the first
   time it discovers a new dependency deep in boot() (SQLocal's worker,
   hash-wasm, ...), which raced every flow here and hung page.evaluate calls
   indefinitely. A built, static bundle has no such reload. Vite picks the
   port (falling back off its 5173 default if that's taken), so there's no
   port literal to keep in sync by hand. Run with `npm run test:walkthrough`
   - it builds first, with the demo bar compiled in (flow 13 drives its
   #demo-jump control), then serves that build. */
import { readFile } from 'node:fs/promises';
import { preview } from 'vite';
import { createReporter, launchChromium } from './browser-harness.mjs';

const { ok, fail, finish } = createReporter();

const server = await preview({ preview: { port: 0 } });
const address = server.httpServer.address();
const BASE = `http://localhost:${address.port}`;

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 440, height: 940 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/* Waits for the boot sequence, not just for the network to go quiet (ticket
   08). Opening OPFS, running migrations and - on a cold demo start - writing
   the persona all happen after the last request has landed, so `networkidle`
   returns mid-write. Reloading there interrupted the seed part-way through the
   persona's 150 days, and because those are written oldest-first, what went
   missing was the recent data the stats and calendar flows assert on. */
async function booted() {
  await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
}

async function fresh(path = '/') {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await booted();
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await booted();
}

async function typePin(digits) {
  for (const digit of digits) await page.locator(`[data-key="${digit}"]`).click();
}

async function expectNoHorizontalOverflow(selector) {
  const overflow = await page.locator(selector).evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth
  }));
  if (overflow.scrollWidth > overflow.clientWidth) {
    throw new Error(`${selector} overflowed: ${JSON.stringify(overflow)}`);
  }
}

/* RFC 4180, enough of it to read back what the plain export writes (ticket
   15): a quoted field can hold commas, newlines and doubled quotes, and
   splitting on commas would call every one of those a new column. */
function parseCsv(text) {
  const rows = [[]];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') (rows.at(-1).push(field), (field = ''));
    else if (c === '\n') (rows.at(-1).push(field), (field = ''), rows.push([]));
    else if (c !== '\r') field += c;
  }
  if (field || rows.at(-1).length) rows.at(-1).push(field);
  if (!rows.at(-1).length) rows.pop();
  return rows;
}

/* 1. quick log */
try {
  await fresh('/');
  const beforeCards = await page.locator('.entry-card').count();
  await page.locator('.quicklog .mood-btn[data-mood="4"]').click();
  await page.waitForSelector('#ed-note');
  await page.waitForSelector('.mood-picker:not(.is-compact) .mood-btn[data-mood="4"].is-selected');
  await page.locator('a.icon-btn[href="/"]').click();
  await page.waitForSelector('.entry-card');
  const afterCards = await page.locator('.entry-card').count();
  if (afterCards !== beforeCards) throw new Error(`home entry count changed: ${beforeCards} -> ${afterCards}`);
  ok('home quick mood opens an unsaved seeded editor');
} catch (e) { fail('quick log', e); }

/* 2. full entry flow via FAB */
try {
  await fresh('/');
  await page.locator('.nav-fab').click();
  await page.locator('[data-choose="today"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('.mood-picker .mood-btn[data-mood="5"]').click();
  await page.locator('.tag-chip:has-text("social euphoria")').first().click();
  await page.locator('#ed-note').fill('Playwright wrote this entry.');
  await page.locator('[data-save]').click();
  await page.waitForSelector('.entry-card .entry-note');
  const note = await page.locator('.entry-card .entry-note').first().textContent();
  if (!note.includes('Playwright')) throw new Error('new entry not first');
  ok('new entry chooser → editor → save → Home');
} catch (e) { fail('entry flow', e); }

/* 2b. mood-only save nudges */
try {
  await fresh('/');
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  const nudgeSwitch = page.locator('[data-entry-nudges] [role="switch"]');
  const setNudges = async (enabled) => {
    const expected = enabled ? 'true' : 'false';
    await nudgeSwitch.scrollIntoViewIfNeeded();
    if ((await nudgeSwitch.getAttribute('aria-checked')) !== expected) {
      await nudgeSwitch.click();
      await page.waitForFunction(
        (want) => document.querySelector('[data-entry-nudges] [role="switch"]')?.getAttribute('aria-checked') === want,
        expected
      );
    }
  };
  await setNudges(true);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();

  await page.locator('.quicklog .mood-btn[data-mood="2"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('.mood-picker:not(.is-compact) .mood-btn[data-mood="1"]').click();
  await page.locator('.mood-picker:not(.is-compact) .mood-btn[data-mood="2"]').click();
  await page.locator('[data-save]').click();
  // Waits for a toast whose own text is the save confirmation, not just
  // any new toast: the no-persistent-storage boot warning (boot.svelte.ts)
  // can already be on screen, so counting toasts or taking ".last()" before
  // the save toast lands can pick that one up instead and see no action.
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Saved')));
  const nudgeToast = page.locator('.toast', { hasText: 'Saved' }).last();
  if ((await nudgeToast.locator('.toast-action').count()) === 0) {
    throw new Error('nudge action missing while nudges are enabled');
  }

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await setNudges(false);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();

  await page.locator('.quicklog .mood-btn[data-mood="3"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('.mood-picker:not(.is-compact) .mood-btn[data-mood="1"]').click();
  await page.locator('.mood-picker:not(.is-compact) .mood-btn[data-mood="3"]').click();
  await page.locator('[data-save]').click();
  /* Ticket 09: counting toasts before/after used to race the earlier save's
     toast, which auto-dismisses on its own 4-second timer - whether it was
     still on screen when "before" was captured depended on exactly how much
     wall-clock time the preceding steps happened to take, not on nudges
     actually being quiet. Waiting for a Saved toast with no action present
     asserts the actual behavior under test instead of a timing accident. */
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.toast')].some(
      (t) => t.textContent.includes('Saved') && !t.querySelector('.toast-action')
    )
  );
  ok('mood-only save nudges when enabled and stays quiet when disabled');
} catch (e) { fail('nudge flow', e); }

/* 3. melt slider keyboard interaction */
try {
  await fresh('/entry/new/today');
  const thumb = page.locator('.melt-slider').first();
  await thumb.focus();
  await page.keyboard.press('ArrowRight');
  const out = await page.locator('.dim-value').first().textContent();
  if (out.trim() === '—') throw new Error('slider value did not update');
  ok('melt slider responds to keyboard');
} catch (e) { fail('melt slider', e); }

/* 4. calendar → day → add another */
try {
  await fresh('/calendar');
  await page.locator('.hm-cell.has-entries').first().click();
  await page.waitForSelector('.day-entry-row');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#ed-note');
  ok('calendar → day detail → add another');
} catch (e) { fail('calendar flow', e); }

/* 4b. day detail keeps entries separate and shows no day average */
try {
  await fresh('/entry/new/today');
  await page.locator('.mood-picker .mood-btn[data-mood="2"]').click();
  await page.locator('#ed-note').fill('Day detail proof A');
  await page.locator('[data-save]').click();
  await page.waitForSelector('.entry-card .entry-note');

  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('.mood-picker .mood-btn[data-mood="5"]').click();
  await page.locator('#ed-note').fill('Day detail proof B');
  await page.locator('[data-save]').click();
  await page.waitForSelector('.entry-card .entry-note');

  await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
  await booted();
  const notes = await page.locator('.day-entry-row .entry-note').allTextContents();
  if (!notes.includes('Day detail proof A') || !notes.includes('Day detail proof B')) {
    throw new Error('day detail did not keep separate entries');
  }
  if (await page.locator('.day-avg').count()) {
    throw new Error('day detail still shows a day-average block');
  }
  ok('day detail keeps separate entries and no average summary');
} catch (e) { fail('day detail truthfulness', e); }

/* 5. search */
try {
  await fresh('/search');
  await page.locator('#q').fill('coffee');
  await page.waitForSelector('.entry-card');
  /* A word that is only ever a built-in tag's label, never note text.
     Built-in tags are stored as keys now, so search has to match against
     the resolved wording or this finds nothing. */
  await page.locator('#q').fill('hopeful');
  await page.waitForSelector('.entry-card');
  ok('search matches note text and built-in tag labels');
} catch (e) { fail('search', e); }

/* 5b. structured search filters */
try {
  const NOTE_HIGH = 'ticket06-high-marker';

  await fresh('/entry/new/today');
  await page.locator('.mood-picker .mood-btn[data-mood="5"]').click();
  await page.locator('#ed-note').fill(NOTE_HIGH);
  await page.locator('[data-save]').click();
  await page.waitForSelector('.entry-card');

  await fresh('/search');
  await page.locator('[data-filter-toggle]').click();
  await page.locator('[data-filter-has-note]').click();
  await page.waitForSelector('[data-active-filter-chip]');
  await page.waitForSelector('.entry-card');

  await page.locator('#q').fill('ticket06');
  await page.waitForSelector('.entry-card');
  await page.locator('[data-filter-mood="1"]').click();
  await page.waitForTimeout(200);
  if ((await page.locator('.entry-card').count()) !== 0) throw new Error('mood mismatch still showed results');
  await page.locator('[data-filter-mood="1"]').click();
  await page.locator('[data-filter-mood="5"]').click();
  await page.waitForSelector('.entry-card');
  const pageText = (await page.locator('.screen').innerText()).toLowerCase();
  if (!pageText.includes('ticket06-high-marker')) throw new Error('mood match did not restore the expected result');

  const chipCount = await page.locator('[data-active-filter-chip]').count();
  if (chipCount < 2) throw new Error('active filter chips not shown');

  await page.locator('[data-filter-clear]').click();
  await page.locator('#q').fill('');
  if (await page.locator('[data-active-filter-chip]').count()) throw new Error('clear-all did not clear chips');
  const hint = await page.locator('.screen').innerText();
  if (!hint?.toLowerCase().includes('try') && !hint?.toLowerCase().includes('spróbuj')) {
    throw new Error('empty-criteria hint did not return after clear-all');
  }

  ok('structured search filters combine with text, show chips and clear-all');
} catch (e) { fail('structured search filters', e); }

/* 6. stats range + value list */
try {
  await fresh('/stats');
  await page.locator('[data-range="90"]').click();
  const title = await page.locator('.screen-title').textContent();
  if (!title.includes('90')) throw new Error('title: ' + title);
  await page.locator('.chart-card').first().click();
  await page.waitForSelector('.value-row');
  /* Tag insights name a built-in tag, so a blank title means the key never
     got resolved. */
  const insight = await page.locator('.list-group .row-title').first().textContent();
  if (!insight?.trim()) throw new Error('tag insight has no label');
  ok('stats range, value list and named tag insights');
} catch (e) { fail('stats', e); }

/* 6b. ticket 18's three view-only screens: chronological milestones with
   a compressed gap, thumbnail-backed photo comparison with both sides
   step-able, and the on-demand recap sequence with its Rive fallback. */
try {
  await fresh('/timeline');
  const milestoneNames = await page.locator('.tl-item:not(.tl-today) .tl-name').allTextContents();
  const expectedMilestones = [
    'Coming out to my parents',
    'HRT start',
    'First time presenting publicly',
    'Name-change hearing',
    'Voice workshop weekend'
  ];
  if (JSON.stringify(milestoneNames) !== JSON.stringify(expectedMilestones)) {
    throw new Error('milestones out of order: ' + JSON.stringify(milestoneNames));
  }
  if (!(await page.locator('.tl-gap').count())) throw new Error('the long milestone gap was not compressed');

  await fresh('/settings/photos');
  await page.waitForSelector('.photo-cell img');
  const thumbnailSrc = await page.locator('.photo-cell img').first().getAttribute('src');
  if (!thumbnailSrc?.startsWith('blob:')) throw new Error('the photo grid did not load stored thumbnails');
  const photoCells = page.locator('.photo-cell');
  if ((await photoCells.count()) < 4) throw new Error('not enough photos to exercise both compare controls');
  await photoCells.nth(0).click();
  await photoCells.nth(2).click();
  await page.locator('[data-compare]').click();
  const sides = page.locator('.compare-side');
  const gap = await page.locator('.compare-gap').textContent();
  if ((await sides.count()) !== 2 || !gap?.includes('apart')) throw new Error('compare dates or gap missing');
  const leftDate = sides.nth(0).locator('.compare-nav .small');
  const rightDate = sides.nth(1).locator('.compare-nav .small');
  const leftBefore = await leftDate.textContent();
  await sides.nth(0).getByRole('button', { name: 'Later photo' }).click();
  if ((await leftDate.textContent()) === leftBefore) throw new Error('the left photo did not move through time');
  const rightBefore = await rightDate.textContent();
  await sides.nth(1).getByRole('button', { name: 'Later photo' }).click();
  if ((await rightDate.textContent()) === rightBefore) throw new Error('the right photo did not move through time');

  await fresh('/recap');
  for (let i = 0; i < 7; i++) await page.locator('[data-next]').click();
  await page.waitForSelector('.rive-stage .confetti');
  if (await page.getByRole('button', { name: /share|export/i }).count()) throw new Error('recap is not view-only');
  await fresh('/recap?period=year');
  const yearTitle = await page.locator('.recap-title').textContent();
  const previousYear = await page.evaluate(() => new Date().getFullYear() - 1);
  if (yearTitle?.trim() !== `Your ${previousYear}`) throw new Error('year recap title: ' + yearTitle);
  ok('timeline, progress-photo compare and on-demand recap');
} catch (e) { fail('ticket 18 view-only screens', e); }

/* 6c. lab result CRUD and per-analyte chart */
try {
  await fresh('/settings/labs');
  if (!(await page.locator('.line-chart').count())) throw new Error('the selected analyte has no trend chart');

  await page.locator('[data-add]').click();
  await page.locator('#lab-analyte').selectOption('custom');
  await page.locator('#lab-custom-analyte').fill('SHBG');
  await page.locator('#lab-value').fill('61');
  await page.locator('#lab-unit').fill('nmol/L');
  await page.locator('#lab-note').fill('first result');
  await page.locator('[data-save-lab]').click();
  await page.waitForSelector('.segment:has-text("SHBG")');
  await page.locator('.segment:has-text("SHBG")').click();
  await page.waitForSelector('[data-lab-result]:has-text("61")');

  await page.locator('[data-lab-result]').first().click();
  await page.locator('#lab-value').fill('62');
  await page.locator('#lab-note').fill('corrected');
  await page.locator('[data-save-lab]').click();
  await page.waitForSelector('[data-lab-result]:has-text("62")');

  await page.locator('[data-lab-result]').first().click();
  await page.locator('[data-delete-lab]').click();
  await page.locator('[data-confirm-delete-lab]').click();
  await page.waitForSelector('.segment:has-text("SHBG")', { state: 'detached' });
  ok('lab result custom create, edit, delete and per-analyte chart');
} catch (e) { fail('lab results', e); }

/* 6d. a second unit for an analyte is a second trend, not a cliff in the
   first one (ticket 02). The persona's estradiol history is five results in
   pg/mL; one result in pmol/L is a number about 3.7 times larger, and the
   screen has to keep it off that line. */
try {
  await fresh('/settings/labs');
  await page.waitForSelector('[data-lab-series]');
  if ((await page.locator('[data-lab-series]').count()) !== 1) throw new Error('estradiol did not start as one series');
  const resultsBefore = await page.locator('[data-lab-result]').count();

  await page.locator('[data-add]').click();
  await page.locator('#lab-value').fill('612');
  await page.locator('#lab-unit').fill('pmol/L');
  await page.locator('[data-save-lab]').click();

  /* Named rather than "the newest toast": boot's persistent-storage notice is
     still on screen at this point. */
  await page.waitForSelector('.toast:has-text("own trend")');
  const notice = await page.locator('.toast', { hasText: 'own trend' }).textContent();
  if (/error|invalid|wrong|cannot/i.test(notice)) throw new Error('the notice reads as an error: ' + notice);

  const units = await page.locator('[data-lab-series] .series-unit').allTextContents();
  if (JSON.stringify(units) !== JSON.stringify(['pg/mL', 'pmol/L'])) throw new Error('series units: ' + JSON.stringify(units));
  /* One line, not two: the pmol/L series has a single result so far, and the
     pg/mL line still runs over its own five. */
  if ((await page.locator('.line-chart').count()) !== 1) throw new Error('the new unit was drawn into an existing line');
  if ((await page.locator('[data-lab-result]').count()) !== resultsBefore + 1) throw new Error('the list dropped a result');

  await page.locator('[data-lab-result]').first().click();
  await page.locator('[data-delete-lab]').click();
  await page.locator('[data-confirm-delete-lab]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-lab-series]').length === 1);
  ok('a second unit gets its own trend and a neutral notice');
} catch (e) { fail('lab unit series', e); }

/* 7. palette switch */
try {
  await fresh('/settings');
  await page.locator('[data-palette-pick="pansexual"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'pansexual');
  ok('palette switch recolours app');
} catch (e) { fail('palette', e); }

/* 8. language swap EN→PL (paraglide reload) */
try {
  await fresh('/settings');
  await page.locator('.segment:has-text("Polski")').click();
  await page.waitForFunction(() => document.querySelector('.nav-item .nav-label')?.textContent === 'Start', null, { timeout: 8000 });
  ok('language swap EN→PL via paraglide');
} catch (e) { fail('language', e); }

/* 8b. accessibility tuning persists and affects rendering on core screens */
try {
  await fresh('/settings');
  await page.getByRole('switch', { name: 'Text size boost' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.a11yTextSize === 'boost');

  await page.goto(BASE + '/search', { waitUntil: 'networkidle' });
  await booted();
  const boostedPx = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.body).fontSize));
  if (!(boostedPx > 16)) throw new Error('body font-size did not increase: ' + boostedPx);

  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  const stillBoosted = await page.evaluate(() => document.documentElement.dataset.a11yTextSize === 'boost');
  if (!stillBoosted) throw new Error('text-size boost did not persist after reload');
  ok('accessibility text-size boost persists and affects search rendering');
} catch (e) { fail('accessibility tuning', e); }

/* 9. milestone shuffle */
try {
  await fresh('/settings/milestones');
  const first = await page.locator('[data-template]').allTextContents();
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) {
    await page.locator('[data-shuffle]').click();
    changed = JSON.stringify(await page.locator('[data-template]').allTextContents()) !== JSON.stringify(first);
  }
  if (!changed) throw new Error('shuffle never changed');
  ok('milestone template shuffle');
} catch (e) { fail('shuffle', e); }

/* 10. custom dimension live preview */
try {
  await fresh('/settings/dimension');
  await page.locator('#cd-name').fill('Voice comfort');
  await page.waitForFunction(() => document.querySelector('.dim-name')?.textContent === 'Voice comfort');
  ok('custom dimension live preview');
} catch (e) { fail('custom dimension', e); }

/* 10b. Home's stale-backup notice (ticket 15, F21). Before the export
   flows below, because they are what stops the journal being stale: the
   demo persona's last backup is 34 days old, and the number in the notice
   is what proves the age was read as epoch millis rather than as an epoch
   day - the mix the demo store shipped, which would have read as decades. */
try {
  await fresh('/');
  const notice = page.locator('.notice-warn');
  await notice.waitFor();
  const said = await notice.textContent();
  if (!said.includes('34')) throw new Error(`the notice says: ${said.replace(/\s+/g, ' ').trim()}`);

  await notice.locator('.icon-btn').click();
  await notice.waitFor({ state: 'detached' });
  ok('the stale-backup notice reads 34 days and dismisses');
} catch (e) { fail('backup notice', e); }

/* 11. import: a file that is not an archive */
try {
  await fresh('/settings/export');
  /* A real file through a real dialog. It is not an archive, so the
     plaintext header refuses it before the password is put anywhere near a
     key derivation (ADR-0007) - and the screen says so instead of throwing. */
  page.once('filechooser', (chooser) =>
    chooser.setFiles({
      name: 'not-a-backup.ttbackup',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('this is not an archive')
    })
  );
  await page.locator('[data-pick-file]').click();
  await page.waitForFunction(() => document.querySelector('#picked-file')?.textContent.includes('not-a-backup'));
  await page.locator('#imp-pass').fill('wrongpass');
  await page.locator('[data-import]').click();
  /* The sentence, not just the alert: the screen words this from the error's
     `kind` now (ticket 23), so an alert alone would still pass if the wrong
     branch fired or the key went missing. */
  await page.waitForSelector('[role="alert"]:has-text("isn’t a Gender Diary backup file")');
  ok('a file that is not a backup is refused, in the words the catalogue gives');
} catch (e) { fail('export/import', e); }

/* 11b. the whole of F14 through the screen: export the demo journal, then
   import the file that came out of it. Merging your own backup is the one
   import whose outcome is knowable in advance - every row matches by
   identity, so a second copy of anything would be a bug (ticket 14). */
try {
  /* Home's own list of the last few days, counted off the DOM: if a merge
     inserted a second copy of anything, every one of those days would show
     twice the entries it did before. */
  const homeCards = async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await booted();
    await page.waitForSelector('.entry-card');
    return page.locator('.entry-card').count();
  };

  await fresh('/');
  const before = await homeCards();

  await page.goto(BASE + '/settings/export', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('#exp-pass').fill('walkthrough');
  await page.locator('[data-export]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('[data-confirm-export]').click()
  ]);
  const buffer = await readFile(await download.path());

  page.once('filechooser', (chooser) =>
    chooser.setFiles({ name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer })
  );
  await page.locator('[data-pick-file]').click();
  await page.locator('#imp-pass').fill('walkthrough');
  await page.locator('[data-import]').click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Merged')),
    null,
    { timeout: 120000 }
  );

  const after = await homeCards();
  if (after !== before) throw new Error(`Home went from ${before} entries to ${after} on merging its own backup`);
  ok(`export → import round trip through the screen, ${before} recent entries unchanged`);
} catch (e) { fail('archive round trip', e); }

/* 11c. the plain CSV export (ticket 15, F22): the warning it has to go
   through, and whether the file that comes out survives a note with a
   comma, a quote and a newline in it. Written through the editor rather
   than assumed of the demo persona, so the nastiest field in the file is
   one this test knows the exact text of. */
try {
  const NOTE = 'Told them my name, out loud.\nShe said "finally".';

  await fresh('/entry/new/today');
  // Mood is required to save (ticket 04): the fixture picks one before the
  // note, same as any real entry would need to.
  await page.locator('.mood-picker:not(.is-compact) .mood-btn[data-mood="3"]').click();
  await page.locator('#ed-note').fill(NOTE);
  await page.locator('[data-save]').click();
  await page.waitForSelector('.entry-card');

  await page.goto(BASE + '/settings/export', { waitUntil: 'networkidle' });
  await booted();

  /* Keyboard only, all the way. The warning is what stands between someone
     and an unencrypted copy of their journal, so the confirm must not be
     what the sheet hands the focus to: opening it and pressing Enter again
     has to produce nothing. */
  await page.locator('[data-plain="csv"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet .notice-danger');
  if (await page.evaluate(() => document.activeElement?.hasAttribute('data-confirm-plain'))) {
    throw new Error('the sheet opened with the confirm button under the cursor');
  }
  await page.keyboard.press('Enter');
  if (await page.waitForEvent('download', { timeout: 1500 }).catch(() => null)) {
    throw new Error('a second Enter wrote the file without the confirm');
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });

  await page.locator('[data-plain="csv"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sheet .notice-danger');
  await page.keyboard.press('Tab');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.keyboard.press('Enter')
  ]);
  if (!download.suggestedFilename().endsWith('.csv')) {
    throw new Error(`plain export downloaded ${download.suggestedFilename()}`);
  }

  const rows = parseCsv(await readFile(await download.path(), 'utf8'));
  const [header, ...entries] = rows;
  if (header[0] !== 'date' || header[1] !== 'time' || header[2] !== 'mood') throw new Error(`header is ${header}`);
  if (header.at(-2) !== 'tags' || header.at(-1) !== 'note') throw new Error(`header is ${header}`);
  // Every row the same width is what proves the quoting: an unescaped
  // comma or newline in a note shows up here as a row of the wrong shape.
  const ragged = entries.find((row) => row.length !== header.length);
  if (ragged) throw new Error(`a row has ${ragged.length} fields, not ${header.length}: ${ragged}`);
  if (!entries.some((row) => row.at(-1) === NOTE)) throw new Error('the note did not survive the round trip');

  // Backup health (F21): the plain path counts, so the screen it was
  // started from says so without a reload.
  await page.waitForFunction(() =>
    document.querySelector('.card.spread .row-subtitle')?.textContent.trim() === 'today'
  );
  ok(`plain CSV export behind the warning, ${entries.length} rows, notes intact`);
} catch (e) { fail('plain export', e); }

/* 12. app lock: the gate, the throttle, and the PIN that opens it (ticket 17) */
try {
  await fresh('/settings');
  await page.getByRole('switch', { name: 'App lock' }).click();
  await page.waitForSelector('.pin-pad');

  // Second thoughts on a chromeless screen: there has to be a way back.
  await page.locator('[data-cancel-setup]').click();
  await page.waitForSelector('.list-group');
  if ((await page.getByRole('switch', { name: 'App lock' }).getAttribute('aria-checked')) === 'true') {
    throw new Error('app lock switched itself on without a PIN');
  }

  await page.getByRole('switch', { name: 'App lock' }).click();
  await page.waitForSelector('.pin-pad');
  await typePin('1234');
  await typePin('1234');
  await page.waitForSelector('.list-group');

  /* With app lock ON, the localStorage mirror must not hold the hash: a
     4-digit hash in plaintext beside the encrypted journal would be an
     offline-guessable secret (ticket 09 moved it into the pref table). */
  const bootMirror = await page.evaluate(() => JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}'));
  if ('pinHash' in bootMirror) throw new Error('the PIN hash is in the plaintext boot mirror');

  /* A cold start, not a navigation: the gate has to be what renders once
     boot lands the real preferences - the demo build unlocks the journal
     passphrase itself, so the PIN gate is the first thing asked for. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  if (!(await page.locator('.applock').count())) throw new Error('no gate after a reload');
  if (await page.locator('.home-hello').count()) throw new Error('Home rendered behind the gate');

  await typePin('9999');
  await page.waitForSelector('[data-pin-status]:has-text("not right")');
  await typePin('9999');
  await page.waitForSelector('[data-pin-status]:has-text("Try again in")');
  if (await page.locator('.pin-key[data-key="1"]:not([disabled])').count()) {
    throw new Error('pad still accepting attempts during the wait');
  }

  await page.waitForSelector('.pin-key[data-key="1"]:not([disabled])', { timeout: 8000 });

  /* A reload is the cheapest thing a guesser can do, so the count has to
     outlive one. Forged rather than earned: waiting out a real doubling
     would make the assertion a race against the clock. */
  if (!(await page.evaluate(() => localStorage.getItem('gender-diary-pin-attempts')))) {
    throw new Error('the wrong-attempt count never reached storage');
  }
  await page.evaluate(() =>
    localStorage.setItem(
      'gender-diary-pin-attempts',
      JSON.stringify({ wrongAttempts: 6, acceptingFrom: Date.now() + 30000 })
    )
  );
  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-pin-status]:has-text("Try again in")');

  await page.evaluate(() => localStorage.removeItem('gender-diary-pin-attempts'));
  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  await typePin('1234');
  await page.waitForSelector('.home-hello');

  /* Off again, or every flow after this one meets the gate. In-app, not
     page.goto: a fresh load is a cold start, and a cold start locks. */
  await page.locator('.nav-item[href="/settings"]').click();
  await page.getByRole('switch', { name: 'App lock' }).click();
  /* The switch reads back off, and the hash may never appear in the
     localStorage mirror at all - ticket 09 moved it behind encryption, so
     the mirror is also asserted hash-free while the lock is ON above. */
  await page.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return !('pinHash' in boot) || boot.pinHash === null;
  });
  if ((await page.getByRole('switch', { name: 'App lock' }).getAttribute('aria-checked')) !== 'false') {
    throw new Error('app lock did not switch off');
  }
  ok('app lock gates a cold start, throttles wrong PINs, opens on the right one');
} catch (e) { fail('app lock', e); }

/* 13. onboarding end-to-end via demo jump */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  await page.locator('[data-next]').click();
  await page.locator('#ob-name').fill('Ola');
  await page.locator('[data-next]').click();

  const presetButtons = page.locator('[data-preset]');
  const presetNames = await presetButtons.locator('.row-title').allTextContents();
  const expectedPresetNames = [
    'Femininity',
    'Masculinity',
    'Fem + masc',
    'Fluid spectrum',
    'Agender axis',
    'Partly feminine',
    'Partly masculine',
    'Full spectrum'
  ];
  if (JSON.stringify(presetNames) !== JSON.stringify(expectedPresetNames)) {
    throw new Error('onboarding preset names: ' + JSON.stringify(presetNames));
  }
  if ((await presetButtons.count()) !== 8) throw new Error('onboarding preset count was not 8');
  await expectNoHorizontalOverflow('.app-viewport');

  await page.locator('[data-preset="p-nb"]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-tpl="hrt_start"]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-next]').click();
  await page.locator('[data-finish]').click();
  await page.waitForSelector('.home-hello');
  const greet = await page.locator('.home-hello').textContent();
  if (!greet.includes('Ola')) throw new Error('greeting: ' + greet);
  if ((await page.locator('.milestone-card').count()) < 1) throw new Error('no milestone on Home');
  ok('onboarding end-to-end');
} catch (e) { fail('onboarding', e); }

/* 13b. settings preset picker lists all built-ins at 390px and each pick persists */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/settings');
  await page.getByRole('button', { name: /Gender preset/i }).click();

  const picks = page.locator('[data-pick-preset]');
  const names = await picks.locator('.row-title').allTextContents();
  const expected = [
    ['p-btw', 'Femininity'],
    ['p-masc', 'Masculinity'],
    ['p-fem-masc', 'Fem + masc'],
    ['p-fluid', 'Fluid spectrum'],
    ['p-agender', 'Agender axis'],
    ['p-demi-fem', 'Partly feminine'],
    ['p-demi-masc', 'Partly masculine'],
    ['p-nb', 'Full spectrum']
  ];
  if (JSON.stringify(names) !== JSON.stringify(expected.map(([, label]) => label))) {
    throw new Error('settings preset names: ' + JSON.stringify(names));
  }
  if ((await picks.count()) !== expected.length) throw new Error('settings preset count was not 8');
  await expectNoHorizontalOverflow('.app-viewport');

  for (const [key, label] of expected) {
    await page.locator(`[data-pick-preset="${key}"]`).click();
    await page.waitForSelector(`[data-active-preset-name]:text-is("${label}")`);
    await page.getByRole('button', { name: /Gender preset/i }).click();
    await page.waitForSelector(`[data-pick-preset="${key}"][data-selected="true"]`);
  }
  ok('settings preset picker lists and persists all built-ins');
} catch (e) { fail('settings preset picker', e); }

/* 14. desktop: rail via container query at wide viewport */
try {
  await page.setViewportSize({ width: 1400, height: 980 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const railVisible = await page.locator('.rail-item').first().isVisible();
  const navVisible = await page.locator('.app-nav').isVisible();
  if (!railVisible || navVisible) throw new Error(`rail:${railVisible} nav:${navVisible}`);
  ok('desktop rail via container query');
} catch (e) { fail('desktop', e); }

/* 15. reminders web note at desktop */
try {
  await page.goto(BASE + '/settings/reminders', { waitUntil: 'networkidle' });
  const text = await page.textContent('.screen');
  if (!text.includes('Android app')) throw new Error('web note missing');
  ok('web reminders note');
} catch (e) { fail('reminders web', e); }

/* 16. preferences survive a reload and land before first paint (ticket 06) */
try {
  await page.setViewportSize({ width: 440, height: 940 });
  await fresh('/settings');
  await page.locator('[data-palette-pick="lesbian"]').click();
  await page.locator('.segment:has-text("Dark")').click();
  /* Disguise rides along, because it is the one of these where arriving late
     is a safety failure rather than a flicker: a tab that shows the flag for
     the length of a boot has told the room already (F24). */
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.keyboard.press('Escape');
  /* Waits on the mirror, not on the screen: the screen updates from the
     in-memory projection immediately, while the write to SQLite and the
     cache refresh behind it are a round-trip away. */
  await page.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.theme === 'dark' && boot.palette === 'lesbian' && boot.disguise === true;
  });

  /* Records the first time anything writes data-theme or the tab icon, and
     whether <body> existed yet. The pre-paint script sits in <head>, so it
     runs with no body at all; hydration cannot, which is what stops this
     passing if the stamping quietly moved back into the layout's $effect. */
  await page.addInitScript(() => {
    // Observes `document`, not `document.documentElement`: an init script
    // runs before the parser has created <html>, so there is no element to
    // hand the observer yet.
    new MutationObserver(() => {
      window.__firstStamp ??= { ...document.documentElement.dataset, hadBody: !!document.body };
      const icon = document.querySelector('link[rel="icon"]')?.getAttribute('href');
      if (icon?.includes('favicon-notes')) window.__firstIcon ??= { icon, hadBody: !!document.body };
      const manifest = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      if (manifest?.includes('manifest-notes')) {
        window.__firstManifest ??= { manifest, hadBody: !!document.body };
      }
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-theme', 'data-palette', 'href']
    });
  });
  await page.reload({ waitUntil: 'networkidle' });

  const first = await page.evaluate(() => window.__firstStamp);
  if (first?.theme !== 'dark' || first?.palette !== 'lesbian' || first.hadBody) {
    throw new Error('first stamp on <html>: ' + JSON.stringify(first));
  }
  const firstIcon = await page.evaluate(() => window.__firstIcon);
  if (!firstIcon || firstIcon.hadBody) {
    throw new Error('first disguised tab icon: ' + JSON.stringify(firstIcon));
  }
  /* The install identity has to be neutral before <body> too (ticket 25):
      a browser can query the manifest before hydration runs, and an install
      started off the real one carries the app's own name to the launcher. */
  const firstManifest = await page.evaluate(() => window.__firstManifest);
  if (!firstManifest || firstManifest.hadBody) {
    throw new Error('first disguised manifest: ' + JSON.stringify(firstManifest));
  }
  const installed = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').getAttribute('href');
    return { href, ...(await fetch(href).then((r) => r.json())) };
  });
  if (installed.name !== 'Notes' || /Gender|transition/i.test(JSON.stringify(installed))) {
    throw new Error('the disguised manifest as served: ' + JSON.stringify(installed));
  }

  /* Back off again, or every flow after this one meets a disguised app -
     the toggle outlives localStorage.clear(), it lives in SQLite. */
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.disguise === false;
  });
  const backToTheApp = await page.evaluate(() =>
    document.querySelector('link[rel="manifest"]').getAttribute('href')
  );
  if (backToTheApp.includes('-notes')) throw new Error('manifest after undisguising: ' + backToTheApp);
  ok('theme, palette, the disguised tab icon and the install identity land before first paint');
} catch (e) { fail('boot preferences', e); }

/* 17. built-in vocabulary is localized by key, not stored in English (ticket 05) */
try {
  await fresh('/entry/new/today');
  await page.waitForSelector('.tag-chip:has-text("social euphoria")');

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.locator('.segment:has-text("Polski")').click();
  await page.waitForFunction(() => document.querySelector('.nav-item .nav-label')?.textContent === 'Start', null, { timeout: 8000 });

  /* Same seeded tag, same row, different language - which only works if
     what was stored was the key and not the word. */
  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await page.waitForSelector('.tag-chip:has-text("euforia społeczna")', { timeout: 8000 });
  if (await page.locator('.tag-chip:has-text("social euphoria")').count()) {
    throw new Error('English label survived the language switch');
  }
  ok('built-in tags follow the language, so they were seeded as keys');
} catch (e) { fail('vocabulary localization', e); }

/* 18. lock on leave, quick exit, then the forgotten-PIN reset (ticket 17).
   Last, because the reset is the one flow that destroys the journal. */
try {
  await fresh('/settings/lock?setup=1');
  await typePin('1234');
  await typePin('1234');
  await page.waitForSelector('.list-group');
  await page.getByRole('button', { name: /Disguise/i }).click();

  /* Disguise owns the whole tab, icon included: the title alone still leaves
     a trans flag in the tab strip. Toggled back off afterwards so the flows
     below meet the app under its own name. */
  const favicon = () => page.evaluate(() => document.querySelector('link[rel="icon"]')?.getAttribute('href'));
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  if (!/favicon-notes\.svg$/.test(await favicon())) throw new Error('tab icon while disguised: ' + (await favicon()));
  /* Fetched, not just read off the attribute: an href the build does not
     serve leaves the flag in the tab and no attribute check would notice. */
  const served = await page.evaluate((href) => fetch(href).then((r) => r.status), await favicon());
  if (served !== 200) throw new Error('the disguised icon is not served: HTTP ' + served);
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Gender Diary', null, { timeout: 8000 });
  if (!/\/favicon\.svg$/.test(await favicon())) throw new Error('tab icon after undisguising: ' + (await favicon()));

  await page.getByRole('switch', { name: 'Lock on leave' }).click();
  await page.getByRole('switch', { name: 'Quick exit' }).click();

  /* A dispatched blur rather than a real one: headless Chromium has no
     second window to hand focus to, and what is under test is that the
     event the listener waits for locks the app. */
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForSelector('.applock');
  await typePin('1234');
  await page.waitForSelector('.list-group');

  /* Two fingers, dispatched rather than driven: page.touchscreen only has
     one. What is under test is the gesture the listeners are looking for,
     not the browser's touch pipeline. */
  await page.evaluate(() => {
    const at = (y) => [1, 2].map((id) => new Touch({ identifier: id, target: document.body, clientX: 100 + id * 20, clientY: y }));
    window.dispatchEvent(new TouchEvent('touchstart', { touches: at(100) }));
    window.dispatchEvent(new TouchEvent('touchmove', { touches: at(320) }));
  });
  await page.waitForSelector('[data-blank]');
  if ((await page.title()) !== 'New tab') throw new Error('tab title after quick exit: ' + (await page.title()));
  if (!/favicon-notes\.svg$/.test(await favicon())) throw new Error('tab icon after quick exit: ' + (await favicon()));

  await page.locator('[data-blank]').click();
  await page.waitForSelector('.applock');

  await page.locator('[data-forgot]').click();
  await page.locator('[data-confirm-reset]').click();
  /* The reset ends in a page load, and this page is already `ready` - so
     wait for the lock screen to go away with it, not for a boot state that
     is true before the wipe has even started. */
  await page.waitForSelector('.applock', { state: 'detached', timeout: 60000 });
  await booted();
  if (await page.locator('.applock').count()) throw new Error('still locked after the reset');
  const mirror = await page.evaluate(() => JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}'));
  if (mirror.pinHash) throw new Error('the PIN survived the reset');
  /* Home rather than onboarding, because this is the demo build: an empty
     preference table is what makes it seed the persona, and the wipe left
     one. In a production build the first-run gate (flow 13) is what a
     wiped device meets instead. */
  await page.waitForSelector('.home-hello');
  ok('lock on leave, quick exit blanks and locks, forgotten-PIN reset clears the lock');
} catch (e) { fail('lock on leave, quick exit and reset', e); }

/* 19. the About screen shows the version the build was given (ticket 01).

   The literal is written twice on purpose: package.json's test:walkthrough
   builds under GENDER_DIARY_VERSION=9.9.9-walkthrough, and this asks for
   that exact string back. Deriving it here - reading the environment, or
   calling the resolver - would make the assertion agree with itself and pass
   against a build that shipped anything at all. A version nobody can derive
   is the whole point, which is also why it is an obvious fake: this is the
   demo build, and it never ships. verify:build covers the other direction,
   where the version is the real one resolved from the checkout. */
try {
  await fresh('/settings');
  await page.locator('[data-about-open]').click();
  const shown = (await page.locator('[data-app-version]').innerText()).trim();
  if (shown !== '9.9.9-walkthrough') throw new Error(`About shows "${shown}"`);
  ok('About shows the exact version the build was given');
} catch (e) { fail('the version the build was given', e); }

if (errors.length) fail('no uncaught page errors', errors.slice(0, 6).join('; '));

const failures = finish('ALL FLOWS PASS');
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
