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

/* The date fields are DatePickers on flatpickr now: the visible field is
   flatpickr's altInput and the ISO value lives on the hidden original, so
   typing into the field is not how a date gets set. The picker instance
   hangs off the element; setDate with fireChange runs the same onChange a
   real pick runs. */
async function fillDate(page, selector, iso) {
  await page.evaluate(([sel, v]) => {
    const el = document.querySelector(sel);
    const fp = el?._flatpickr ?? el?.flatpickr;
    if (!fp) throw new Error(`no flatpickr instance on ${sel}`);
    fp.setDate(v, true);
  }, [selector, iso]);
}

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
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
}

async function fresh(path = '/') {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await booted();
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await booted();
}

/* A navigation that arrives late (32.1). Leaving onboarding used to land on
   Home and then be undone a moment afterwards by a goto the demo bar's
   first-run jump had issued before the walk started - so a flow that read the
   greeting and moved on passed inside the window.

   What this can and cannot see, because it is a race and saying so is the
   point: the late navigation arrives when the jump's journal clear ends,
   which is about 1.6s after the jump on this machine, and any walk through
   the flow here takes longer than that - so the arrival lands during the
   walk, where it is harmless, rather than inside this hold. It catches the
   defect on a device or a journal where the clear outlasts the walk, and it
   catches any other navigation that arrives after Home. The deterministic
   reproduction is a probe with the clear widened, not this suite. */
async function heldOnHome(what) {
  await page.waitForTimeout(2500);
  if (!page.url().endsWith('/')) throw new Error(`${what}: ${page.url()}`);
}

async function typePin(digits) {
  for (const digit of digits) await page.locator(`[data-key="${digit}"]`).click();
}

/** Mid-session re-entry in passphrase mode, which is what the demo journal
    is on: SessionUnlock re-derives with the same passphrase boot used. */
async function sessionPassphrase() {
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
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

/* A lab-slip-shaped PNG, drawn in the page itself rather than shipped as a
   fixture: large black text on white is what a phone photo of a printed
   slip approximates best, and the scanner has to run its real Tesseract
   engine against whatever comes out (ticket 44 - the sheet this feeds was
   the thing that could not be reached at all). */
async function labSlipImage(lines) {
  const dataUrl = await page.evaluate((lines) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 120 + lines.length * 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 56px sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 30, 90 + i * 90));
    return canvas.toDataURL('image/png');
  }, lines);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
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
  const beforeCards = await page.locator('[data-entry-card]').count();
  await page.locator('[data-mood="4"]').click();
  await page.waitForSelector('#ed-note');
  await page.waitForSelector('[data-mood="4"][aria-checked="true"]');
  await page.locator('[data-screen-back]').click();
  await page.waitForSelector('[data-entry-card]');
  const afterCards = await page.locator('[data-entry-card]').count();
  if (afterCards !== beforeCards) throw new Error(`home entry count changed: ${beforeCards} -> ${afterCards}`);
  ok('home quick mood opens an unsaved seeded editor');
} catch (e) { fail('quick log', e); }

/* 2. full entry flow via FAB */
try {
  await fresh('/');
  await page.locator('[data-nav-fab]').click();
  /* Today's entry is a mood now: "Today" was a row of its own until phase 5
     ticket 18 merged it into the mood row, because an entry cannot be saved
     without a mood and a blank one was a mood picker with an extra tap in
     front of it. Each of these flows sets its own mood in the editor
     afterwards, so what they prove is unchanged. */
  await page.locator('[data-fan-target="mood-3"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('[data-mood="5"]').click();
  await page.locator('[data-tag="g-soc-eu"]').click();
  await page.locator('#ed-note').fill('Playwright wrote this entry.');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-note]');
  const note = await page.locator('[data-entry-note]').first().textContent();
  if (!note.includes('Playwright')) throw new Error('new entry not first');
  ok('new entry chooser → editor → save → Home');
} catch (e) { fail('entry flow', e); }

/* 2b. mood-only save nudges, via the full editor. Ticket 13 gives the
   quick-log entry point its own unconditional scale prompt instead (see
   flow 24), so this preference's remaining domain is a mood-only save
   started from the full editor - the entry point ticket 13 explicitly
   leaves alone. */
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

  /* Straight to the unseeded editor, which is the state this flow is about.
     It used to get here through quick add's "Today", and phase 5 ticket 18
     merged that row into the mood row - so every entry quick add starts now
     carries a seedMood, and a seedMood is precisely what makes the editor
     offer the scale sheet *instead of* this nudge (EntryEditor.svelte). The
     flow's own note above already says its remaining domain is a mood-only
     save started from the full editor; this is that, with the one step that
     no longer produces it removed. */
  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('#ed-note');
  await page.locator('[data-mood="2"]').click();
  await page.locator('[data-save]').click();
  // Waits for a toast whose own kind is the save confirmation, not just
  // any new toast: the no-persistent-storage boot warning (boot.svelte.ts)
  // can already be on screen, so counting toasts or taking ".last()" before
  // the save toast lands can pick that one up instead and see no action.
  await page.waitForFunction(() => document.querySelectorAll('[data-toast-kind="saved"]').length > 0);
  const nudgeToast = page.locator('[data-toast-kind="saved"]').last();
  if ((await nudgeToast.locator('[data-toast-action]').count()) === 0) {
    throw new Error('nudge action missing while nudges are enabled');
  }

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await setNudges(false);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();

  /* Straight to the unseeded editor, which is the state this flow is about.
     It used to get here through quick add's "Today", and phase 5 ticket 18
     merged that row into the mood row - so every entry quick add starts now
     carries a seedMood, and a seedMood is precisely what makes the editor
     offer the scale sheet *instead of* this nudge (EntryEditor.svelte). The
     flow's own note above already says its remaining domain is a mood-only
     save started from the full editor; this is that, with the one step that
     no longer produces it removed. */
  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('#ed-note');
  await page.locator('[data-mood="3"]').click();
  await page.locator('[data-save]').click();
  /* Ticket 09: counting toasts before/after used to race the earlier save's
     toast, which auto-dismisses on its own 4-second timer - whether it was
     still on screen when "before" was captured depended on exactly how much
     wall-clock time the preceding steps happened to take, not on nudges
     actually being quiet. Waiting for a Saved toast with no action present
     asserts the actual behavior under test instead of a timing accident. */
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-toast-kind="saved"]')].some(
      (t) => !t.querySelector('[data-toast-action]')
    )
  );
  ok('mood-only save nudges when enabled and stays quiet when disabled');
} catch (e) { fail('nudge flow', e); }

/* 3. slider keyboard interaction */
try {
  await fresh('/entry/new/today');
  const thumb = page.locator('[data-slider]').first();
  await thumb.focus();
  // A number, not "anything but the unset marker": comparing against the
  // marker's wording made this pass for free the moment that copy changed.
  // Two presses rather than one for the same reason - one press only proves
  // the readout says something numeric, which it would whatever the step did
  // (phase 5 ticket 30 changed the step from 1 to 5 on a 0-100 scale and this
  // check could not have seen it).
  const readValue = async () => {
    const out = await page.locator('[data-dim-value]').first().textContent();
    const n = Number(out.trim());
    if (!Number.isFinite(n)) throw new Error('slider value is not a number: ' + JSON.stringify(out));
    return n;
  };
  await page.keyboard.press('ArrowRight');
  const first = await readValue();
  await page.keyboard.press('ArrowRight');
  const second = await readValue();
  const step = second - first;
  if (step <= 0) throw new Error(`arrow key did not advance the value: ${first} then ${second}`);
  // And it lands on a stop rather than walking off the ruler.
  if (first % step !== 0) throw new Error(`value ${first} is not on a stop of ${step}`);
  ok(`slider steps by ${step} on the keyboard and lands on a stop`);
} catch (e) { fail('slider', e); }

/* 3b. a slider you have let go of stays where you left it.

   Melt registers its window pointermove/pointerup pair inside its `root`
   getter, and read only from a template spread that pair is torn down and
   re-attached on every value change. A release landing before Svelte's next
   flush found no pointerup listener, melt's mouse-down flag is a plain field
   so nothing else ever cleared it, and the control then committed on every
   window pointermove for the rest of the screen's life. Measured on
   2026-08-25: one slider walked 20, 85, 90 with the button up, and two that
   had both been touched landed on one value. Slider.svelte reads the getter
   once, untracked, so the pair outlives the re-renders.

   Driven with the mouse rather than the keyboard on purpose - the flow above
   already covers the keyboard, and this defect only exists on the pointer
   path. */
try {
  await fresh('/entry/new/today');
  await page.waitForSelector('[data-slider]');
  const values = () =>
    page.locator('[data-slider]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-valuenow')));
  /* Centred in the viewport before it is measured. The editor's save bar and
     the nav are fixed over the bottom of the screen, so a slider that happens
     to sit under either of them takes the pointer nowhere and the drag reads
     as a control that did not move - which is this flow's failure message,
     for a screen that is only scrolled wrong. Where the sliders land depends
     on how tall everything above them is, so it is not a property this flow
     should be asserting on by accident. */
  const drag = async (index, fraction) => {
    const slider = page.locator('[data-slider]').nth(index);
    await slider.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  };

  const count = await page.locator('[data-slider]').count();
  if (count < 1) throw new Error('the editor drew no sliders');

  await drag(0, 0.2);
  const afterFirst = await values();

  // The button is up. Nothing on the screen may follow the pointer.
  const box = await page.locator('[data-slider]').first().boundingBox();
  await page.mouse.move(box.x + 20, box.y - 220);
  await page.mouse.move(box.x + 320, box.y - 220, { steps: 8 });
  await page.waitForTimeout(200);
  const afterWander = await values();
  if (JSON.stringify(afterFirst) !== JSON.stringify(afterWander)) {
    throw new Error(`a released slider followed the pointer: ${afterFirst} became ${afterWander}`);
  }

  if (count > 1) {
    await drag(1, 0.8);
    const both = await values();
    if (both[0] !== afterFirst[0]) {
      throw new Error(`dragging the second slider moved the first: ${afterFirst[0]} became ${both[0]}`);
    }
    if (both[0] === both[1]) throw new Error(`both sliders read ${both[0]}, so they are locked together`);
  }
  ok('a released slider stays put, and two sliders keep their own values');
} catch (e) { fail('sliders do not lock together', e); }

/* 3c. one entry straight to another, on the same route.

   /entry/[id] wraps the editor in {#key page.params.id} because SvelteKit
   reuses a route's component across a navigation between two parameter
   values, so anything read once from page.params keeps the first id it saw.
   The way that wrapper goes missing is somebody tidying it away as redundant
   structure, and no unit test can see its absence - only a client-side
   navigation from one entry to another can.

   The app offers no link from one entry to another, so the link is put there
   for the click. That is not a shortcut past the check: the bug lives in
   SvelteKit's interception of an <a> to the same route, which is exactly what
   this makes it do. A page.goto would be a reload and would prove nothing. */
try {
  await fresh('/search');
  await page.locator('[data-filter-toggle]').click();
  await page.waitForSelector('[data-sheet]');
  await page.locator('[data-filter-has-note]').click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.waitForSelector('[data-entry-card]');
  const hrefs = (
    await page.locator('[data-entry-card]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')))
  ).filter(Boolean);
  if (hrefs.length < 2) throw new Error(`only ${hrefs.length} entry link(s) to navigate between`);

  await page.goto(BASE + hrefs[0], { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('#ed-note');
  const first = await page.locator('#ed-note').inputValue();

  await page.locator('[data-screen-header]').evaluate((header, href) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = 'next entry';
    a.setAttribute('data-probe-next-entry', '');
    header.append(a);
  }, hrefs[1]);
  await page.locator('[data-probe-next-entry]').click();
  await page.waitForFunction((want) => location.pathname === want, hrefs[1], { timeout: 10000 });
  await page.waitForSelector('#ed-note');
  await page.waitForTimeout(600);
  const second = await page.locator('#ed-note').inputValue();
  if (first === second) {
    throw new Error(`entry to entry showed the same note twice: "${first.slice(0, 40)}"`);
  }
  ok('entry to entry remounts the editor rather than reusing stale params');
} catch (e) { fail('entry to entry', e); }

/* 4. calendar → day → add another */
try {
  await fresh('/calendar');
  await page.locator('[data-hm-cell-filled]').first().click();
  await page.waitForSelector('[data-entry-card]');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#ed-note');
  ok('calendar → day detail → add another');
} catch (e) { fail('calendar flow', e); }

/* 4b. day detail keeps entries separate and shows no day average */
try {
  await fresh('/entry/new/today');
  await page.locator('[data-mood="2"]').click();
  await page.locator('#ed-note').fill('Day detail proof A');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-note]');

  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-mood="5"]').click();
  await page.locator('#ed-note').fill('Day detail proof B');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-note]');

  await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
  await booted();
  const notes = await page.locator('[data-entry-card] [data-entry-note]').allTextContents();
  if (!notes.includes('Day detail proof A') || !notes.includes('Day detail proof B')) {
    throw new Error('day detail did not keep separate entries');
  }
  /* Used to also assert [data-day-average] absent here. No component has
     ever owned that handle - day detail (routes/day/[day]/+page.svelte)
     shows no day-average block and never has - so the assertion could not
     fail either way it went (ticket 01). Deleted rather than repointed. */
  ok('day detail keeps separate entries');
} catch (e) { fail('day detail truthfulness', e); }

/* 5. search */
try {
  await fresh('/search');
  await page.locator('#q').fill('coffee');
  await page.waitForSelector('[data-entry-card]');
  /* A word that is only ever a built-in tag's label, never note text.
     Built-in tags are stored as keys now, so search has to match against
     the resolved wording or this finds nothing. */
  await page.locator('#q').fill('hopeful');
  await page.waitForSelector('[data-entry-card]');
  ok('search matches note text and built-in tag labels');
} catch (e) { fail('search', e); }

/* 5b. structured search filters */
try {
  const NOTE_HIGH = 'ticket06-high-marker';

  await fresh('/entry/new/today');
  await page.locator('[data-mood="5"]').click();
  await page.locator('#ed-note').fill(NOTE_HIGH);
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-card]');

  await fresh('/search');
  /* The filters are a sheet since ticket 22, so setting one and reading the
     results are two moments rather than one: the panel used to push the hits
     off the screen, and now it covers them. Each pass opens it, changes one
     thing, and closes it before asserting on what came back. */
  const filter = async (handle) => {
    await page.locator('[data-filter-toggle]').click();
    await page.waitForSelector('[data-sheet]');
    for (const one of [].concat(handle)) await page.locator(one).click();
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
  };

  await filter('[data-filter-has-note]');
  await page.waitForSelector('[data-active-filter-chip]');
  await page.waitForSelector('[data-entry-card]');

  await page.locator('#q').fill('ticket06');
  await page.waitForSelector('[data-entry-card]');
  await filter('[data-filter-mood="1"]');
  await page.waitForTimeout(200);
  if ((await page.locator('[data-entry-card]').count()) !== 0) throw new Error('mood mismatch still showed results');
  await filter(['[data-filter-mood="1"]', '[data-filter-mood="5"]']);
  await page.waitForSelector('[data-entry-card]');
  const pageText = (await page.locator('[data-screen]').innerText()).toLowerCase();
  if (!pageText.includes('ticket06-high-marker')) throw new Error('mood match did not restore the expected result');

  const chipCount = await page.locator('[data-active-filter-chip]').count();
  if (chipCount < 2) throw new Error('active filter chips not shown');

  await page.locator('[data-filter-clear]').click();
  await page.locator('#q').fill('');
  if (await page.locator('[data-active-filter-chip]').count()) throw new Error('clear-all did not clear chips');
  const hint = await page.locator('[data-screen]').innerText();
  if (!hint?.toLowerCase().includes('try') && !hint?.toLowerCase().includes('spróbuj')) {
    throw new Error('empty-criteria hint did not return after clear-all');
  }

  ok('structured search filters combine with text, show chips and clear-all');
} catch (e) { fail('structured search filters', e); }

/* 5c. search reaches past entries (phase 5 deepening ticket 24).

   The registry itself is tested in the node tier; what only the real screen
   can show is the presentation half - searchHitRows.ts imports paraglide and
   $lib, neither of which resolves under vitest.config.ts, which is the same
   reason ticket 21's day composition is checked from the browser tier rather
   than in a unit test.

   Both queries are the demo persona's own text and neither is entry text: a
   milestone's name, and the provider on a lab result. */
try {
  await fresh('/search');

  await page.locator('#q').fill('workshop');
  await page.waitForSelector('[data-search-hit="milestones"]');
  const milestoneHit = page.locator('[data-search-hit="milestones"]').first();
  const href = await milestoneHit.getAttribute('href');
  if (href !== '/settings/milestones') throw new Error(`a milestone hit went to ${href}`);
  /* The ticket's own condition: a hit says what kind of thing it is. Read as
     "the row states two things" rather than by gripping the kit's own class
     or the label's wording (ADR-0029) - the excerpt on one line, the area it
     came from on the next. */
  const lines = (await milestoneHit.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error(`a hit did not say what kind of thing it is: ${JSON.stringify(lines)}`);

  await page.locator('#q').fill('diagnostyka');
  await page.waitForSelector('[data-search-hit="labResults"]');

  /* A word in no record at all still says so, rather than showing the
     entries' empty state over hits from somewhere else. */
  await page.locator('#q').fill('pierogi');
  await page.waitForTimeout(300);
  if (await page.locator('[data-search-hit]').count()) throw new Error('a word in no record still returned hits');

  ok('search reaches records outside entries, and every hit says its kind and where it goes');
} catch (e) { fail('search reaches past entries', e); }

/* 6. stats range + value list.

   The handles moved with ticket 23's rebuild: the range is the shared
   Segmented control's, the period is the header's subtitle rather than half
   of its title, the values open from their own control instead of by
   pressing a chart, and a tag insight is a bar rather than a list row. */
try {
  await fresh('/stats');
  await page.locator('[data-segment="90"]').click();
  const period = await page.locator('[data-screen-subtitle]').textContent();
  if (!period.includes('90')) throw new Error('period: ' + period);
  await page.locator('[data-values-open]').click();
  /* The sheet is the screen's own bar rows now: a row per day, the date
     naming it and the value on it as text. */
  await page.waitForSelector('[data-bar-row] [data-bar-value]');
  await page.locator('[data-sheet-scrim]').first().click();
  /* Tag insights name a built-in tag, so a blank label means the key never
     got resolved. */
  const insight = await page
    .locator('[data-chart-card="tag-insights"] [data-bar-name]')
    .first()
    .textContent();
  if (!insight?.trim()) throw new Error('tag insight has no label');
  /* Every scale gets a bar, including one nothing was logged against. */
  if (!(await page.locator('[data-chart-card="scales"] [data-bar-row]').count())) {
    throw new Error('no scale bars drawn');
  }
  /* Five mood steps, always. The columns this used to count became one
     ordered strip (phase 8 UX ticket 04, ADR-0058) and the rule survived
     the change of form intact: the sequence is what is being read, so a
     step nothing landed on holds its place at zero width rather than
     sliding the rest under the wrong part of the scale. */
  if ((await page.locator('[data-strip-step]').count()) !== 5) {
    throw new Error('the mood strip should always draw its five steps');
  }
  ok('stats range, value list, named tag insights and the scale bars');
} catch (e) { fail('stats', e); }

/* 6b. a second scale on the day-by-day chart (phase 6 ticket 12).

   The offer, the pick, and the two things that have to change together: the
   legend arrives to say which line is which, and the value gutter goes,
   because two metrics placed against their own ranges have no shared scale
   for it to be the ends of. Both are asserted on the resting state after the
   pick rather than on anything mid-tween. */
try {
  await fresh('/stats');
  const card = page.locator('[data-chart-card="day-by-day"]');
  if (!(await card.locator('[data-chart-scale]').count())) {
    throw new Error('one scale should print its value gutter');
  }
  await page.locator('[data-compare-open]').click();
  const picker = page.locator('[data-chart-picker="stats-compare"]');
  const values = await picker.locator('option').evaluateAll((options) =>
    options.map((option) => option.value).filter(Boolean)
  );
  if (!values.length) throw new Error('nothing offered as a second scale');
  await picker.selectOption(values[0]);
  await card.locator('[data-chart-legend]').waitFor();
  const named = await card.locator('[data-chart-legend]').textContent();
  if (!named?.trim()) throw new Error('the legend names neither line');
  if (await card.locator('[data-chart-scale]').count()) {
    throw new Error('two scales should print no value gutter');
  }
  /* And back off again, which is the picker's own first option: the
     comparison is something a person can put down. */
  await picker.selectOption('');
  await card.locator('[data-chart-scale]').waitFor();
  ok('a second scale joins the day-by-day chart and can be put down again');
} catch (e) { fail('a second scale on the day-by-day chart', e); }

/* 6b. ticket 18's three view-only screens: chronological milestones with
   a compressed gap, thumbnail-backed photo comparison with both sides
   step-able, and the on-demand recap sequence with its Rive fallback. */
try {
  await fresh('/timeline');
  const milestoneNames = await page.locator('[data-tl-name]').allTextContents();
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
  if (!(await page.locator('[data-tl-gap]').count())) throw new Error('the long milestone gap was not compressed');

  await fresh('/settings/photos');
  await page.waitForSelector('[data-photo-cell] img');
  const thumbnailSrc = await page.locator('[data-photo-cell] img').first().getAttribute('src');
  if (!thumbnailSrc?.startsWith('blob:')) throw new Error('the photo grid did not load stored thumbnails');
  const photoCells = page.locator('[data-photo-cell]');
  if ((await photoCells.count()) < 4) throw new Error('not enough photos to exercise both compare controls');
  await photoCells.nth(0).click();
  await photoCells.nth(2).click();
  // The mode control is a segmented Browse/Compare now (ticket 11), matching
  // the voice screen's own tabs - not the primary button this used to be.
  await page.locator('[data-segment="compare"]').click();
  const sides = page.locator('[data-compare-side]');
  const gap = await page.locator('[data-compare-gap]').textContent();
  if ((await sides.count()) !== 2 || !gap?.includes('apart')) throw new Error('compare dates or gap missing');
  const leftDate = page.locator('[data-compare-side="left"] [data-compare-date]');
  const rightDate = page.locator('[data-compare-side="right"] [data-compare-date]');
  const leftBefore = await leftDate.textContent();
  await page.locator('[data-compare-side="left"]').getByRole('button', { name: 'Later photo' }).click();
  if ((await leftDate.textContent()) === leftBefore) throw new Error('the left photo did not move through time');
  const rightBefore = await rightDate.textContent();
  await page.locator('[data-compare-side="right"]').getByRole('button', { name: 'Later photo' }).click();
  if ((await rightDate.textContent()) === rightBefore) throw new Error('the right photo did not move through time');

  /* The on-demand recap this flow used to step through is gone (ticket 23,
     spec 07): its period picker is a wrapped, and what used to be a
     carousel over a range is now /wrapped/range. Checked here rather than
     dropped, because "nothing links to the deleted route" is the half of
     that spec a unit test cannot see. */
  await fresh('/wrapped/range');
  await page.waitForSelector('[data-list-row="range-picker"]');
  await page.locator('[data-list-row="range-picker"]').click();
  await page.waitForSelector('[data-list-row="range-d90"]');
  await page.locator('[data-list-row="range-d90"]').click();
  await page.waitForFunction(() => location.search.includes('named=d90'));
  if (await page.getByRole('button', { name: /share|export/i }).count()) {
    throw new Error('a picked range is not shareable, since the share card is built from a cadence');
  }
  ok('timeline, progress-photo compare and the wrapped range that replaced recap');
} catch (e) { fail('ticket 18 view-only screens', e); }

/* 6c. lab result CRUD and per-analyte chart */
try {
  await fresh('/settings/labs');
  /* The kit's area chart, not LineChart: phase 5 UX ticket 25 moved the four
     charted feature screens onto the chart kit, and the handle moved with
     the component the way ticket 24's list-row handles did. */
  if (!(await page.locator('[data-chart="area"]').count())) throw new Error('the selected analyte has no trend chart');

  await page.locator('[data-add]').click();
  await page.locator('#lab-analyte').selectOption('custom');
  await page.locator('#lab-custom-analyte').fill('SHBG');
  await page.locator('#lab-value').fill('61');
  await page.locator('#lab-unit').fill('nmol/L');
  await page.locator('#lab-note').fill('first result');
  await page.locator('[data-save-lab]').click();
  await page.waitForSelector('[data-segment="SHBG"]');
  await page.locator('[data-segment="SHBG"]').click();
  await page.waitForSelector('[data-lab-result]:has-text("61")'); // text-under-test: the saved value itself

  await page.locator('[data-lab-result]').first().click();
  await page.locator('#lab-value').fill('62');
  await page.locator('#lab-note').fill('corrected');
  await page.locator('[data-save-lab]').click();
  await page.waitForSelector('[data-lab-result]:has-text("62")'); // text-under-test: the corrected value itself

  await page.locator('[data-lab-result]').first().click();
  await page.locator('[data-delete-lab]').click();
  await page.locator('[data-confirm-delete-lab]').click();
  await page.waitForSelector('[data-segment="SHBG"]', { state: 'detached' });
  ok('lab result custom create, edit, delete and per-analyte chart');
} catch (e) { fail('lab results', e); }

/* 6d. a second unit for an analyte is a second trend, not a cliff in the
   first one (ticket 02). The persona's estradiol history is five results in
   pg/mL; one result in pmol/L is a number about 3.7 times larger, and the
   screen has to keep it off that line. Estradiol picked explicitly rather
   than assumed as the screen's default (ticket 37 removed that default) -
   this step is about the pg/mL/pmol/L merge, not about which analyte opens
   the screen. */
try {
  await fresh('/settings/labs');
  await page.locator('[data-segment="estradiol"]').click();
  /* The "+" sheet now prefills from whichever analyte is on screen (ticket
     37), so the add below has to happen after the switch has actually
     reached that state - not just after aria-checked flips, which is
     synchronous and settles a query round-trip before the series/result
     list this test reads next actually catches up to the new analyte. */
  await page.waitForSelector('[data-segment="estradiol"][aria-checked="true"]');
  await page.waitForSelector('[data-series-unit]:has-text("pg/mL")'); // text-under-test: the persona's own estradiol unit, confirming the series list itself (not just the segment button) has caught up
  await page.waitForSelector('[data-lab-series]');
  if ((await page.locator('[data-lab-series]').count()) !== 1) throw new Error('estradiol did not start as one series');
  const resultsBefore = await page.locator('[data-lab-result]').count();

  await page.locator('[data-add]').click();
  await page.locator('#lab-value').fill('612');
  await page.locator('#lab-unit').fill('pmol/L');
  await page.locator('[data-save-lab]').click();

  /* Named rather than "the newest toast": boot's persistent-storage notice is
     still on screen at this point. */
  await page.waitForSelector('[data-toast-kind="lab-new-unit"]');
  const notice = await page.locator('[data-toast-kind="lab-new-unit"]').textContent();
  if (/error|invalid|wrong|cannot/i.test(notice)) throw new Error('the notice reads as an error: ' + notice);

  const units = await page.locator('[data-series-unit]').allTextContents();
  if (JSON.stringify(units) !== JSON.stringify(['pg/mL', 'pmol/L'])) throw new Error('series units: ' + JSON.stringify(units));
  /* One line, not two: the pmol/L series has a single result so far, and the
     pg/mL line still runs over its own five. */
  if ((await page.locator('[data-chart="area"]').count()) !== 1) throw new Error('the new unit was drawn into an existing line');
  if ((await page.locator('[data-lab-result]').count()) !== resultsBefore + 1) throw new Error('the list dropped a result');

  await page.locator('[data-lab-result]').first().click();
  await page.locator('[data-delete-lab]').click();
  await page.locator('[data-confirm-delete-lab]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-lab-series]').length === 1);
  ok('a second unit gets its own trend and a neutral notice');
} catch (e) { fail('lab unit series', e); }

/* 6e. the lab scanner, unreachable in a shipped build until ticket 44: the
   screen wrapped a factory-built OCR machine in $state(...), but the
   machine's own methods wrote to the object the factory closed over, never
   to the proxy the template read - so the sheet's `open` prop stayed false
   forever. ocr-machine.test.ts drove the machine directly and could not see
   it; only a page reading the state through the proxy can, which is what
   this flow is for. Picks a real slip image through a real file dialog and
   runs it through the app's own Tesseract engine - no mocks - because a
   mocked recognizer would prove the wiring works without proving the sheet
   that wiring lives in ever opens. */
try {
  await fresh('/settings/labs');
  await page.locator('[data-import-lab]').click();
  await page.waitForSelector('[data-ocr-state="picking"]');

  // The download notice phase 5 performance ticket 01 added: shipped, but
  // unverifiable in its own sheet until this ticket (see verify-build.mjs).
  const noticeText = await page.locator('[data-notice="labs-ocr-download"]').textContent();
  if (!noticeText || !noticeText.includes('21 MB')) {
    throw new Error(`download notice missing or reworded: ${noticeText}`);
  }

  const slip = await labSlipImage(['Date 2026-08-12', 'Estradiol 123.4 pg/mL']);
  page.once('filechooser', (chooser) => chooser.setFiles({ name: 'slip.png', mimeType: 'image/png', buffer: slip }));
  await page.locator('[data-ocr-pick="gallery"]').click();
  await page.waitForSelector('[data-ocr-state="recognizing"]');
  await page.waitForSelector('[data-ocr-state="review"], [data-ocr-state="no-rows"]', { timeout: 60000 });

  if (await page.locator('[data-ocr-state="no-rows"]').count()) {
    // A real OCR pass, so what the engine actually read is allowed to miss a
    // clean match; the no-rows path itself is exercised deterministically
    // below with a blank slip, so what matters here is that the sheet
    // reacted to the transition at all rather than sitting on "picking".
    await page.locator('[data-ocr-retry]').click();
    await page.waitForSelector('[data-ocr-state="picking"]');
    ok('the scanner opens, shows its download notice, and reacts through recognizing to no-rows on a real recognition pass');
  } else {
    // Rows in hand: overwritten with known values before saving, since the
    // point here is the review→save round trip, not grading Tesseract's
    // transcription of a canvas-rendered slip.
    await page.locator('[data-ocr-field="analyte"]').first().fill('estradiol');
    await page.locator('[data-ocr-field="value"]').first().fill('123.4');
    await page.locator('[data-ocr-field="unit"]').first().fill('pg/mL');
    await fillDate(page, '[data-ocr-field="date"]', '2026-08-12');

    // A blanked analyte first, so save-validation-failed renders too - the
    // sheet's own re-edit path, not just the machine's transition into it.
    await page.locator('[data-ocr-field="analyte"]').first().fill('');
    await page.locator('[data-ocr-save]').click();
    await page.waitForSelector('[data-ocr-state="save-validation-failed"]');

    await page.locator('[data-ocr-field="analyte"]').first().fill('estradiol');
    await page.locator('[data-ocr-save]').click();
    /* "saving" itself is not asserted: the local write it names can resolve
       inside a single Playwright poll, and how long it takes to lose that
       race depends on machine load this file has no control over - it was
       flaky under the full suite even though it held reliably alone. The
       toast below is what proves the save actually landed. */
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-toast]')].some((t) => t.textContent.includes('Imported'))
    );
    await page.waitForSelector('[data-ocr-state]', { state: 'detached' });
    ok('the scanner opens, shows its download notice, and a picked slip reaches review, save-validation-failed and saved in turn');
  }
} catch (e) { fail('lab scanner import (ticket 44)', e); }

/* 6f. no-rows, driven deterministically: a blank slip has nothing for the
   engine to read, so unlike 6e this does not depend on what Tesseract makes
   of rendered text. */
try {
  await fresh('/settings/labs');
  await page.locator('[data-import-lab]').click();
  await page.waitForSelector('[data-ocr-state="picking"]');

  const blank = await labSlipImage([]);
  page.once('filechooser', (chooser) => chooser.setFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank }));
  await page.locator('[data-ocr-pick="camera"]').click();
  await page.waitForSelector('[data-ocr-state="no-rows"]', { timeout: 60000 });

  await page.locator('[data-ocr-manual]').click();
  await page.waitForSelector('[data-ocr-state]', { state: 'detached' });
  await page.waitForSelector('#lab-analyte');
  ok('a blank slip lands in no-rows, and its manual-entry escape opens the regular editor');
} catch (e) { fail('lab scanner no-rows path', e); }

/* 7. palette switch */
try {
  await fresh('/settings');
  await page.locator('[data-palette-pick="pansexual"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'pansexual');
  ok('palette switch recolours app');
} catch (e) { fail('palette', e); }

/* 7b. mood preset switch (COL-001/ADR-0025): mood's own scale is picked
   independently of the palette above, and persists across a reload the
   same way the palette does. */
try {
  await fresh('/settings');
  const before = await page.evaluate(() => document.documentElement.dataset.moodPreset);
  if (before !== 'teal') throw new Error('default mood preset is not teal: ' + before);
  /* Switches to plum, not teal. The default was amber and this flow moved it
     to teal; the default is teal now (phase 5 ticket 31), and leaving the
     target alone would have had it clicking the preset it already had - the
     flow would pass whether or not the control worked. */
  await page.locator('[data-mood-preset-pick="plum"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.moodPreset === 'plum');
  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  if ((await page.evaluate(() => document.documentElement.dataset.moodPreset)) !== 'plum') {
    throw new Error('mood preset did not survive a reload');
  }
  ok('mood preset switch persists independently of the palette');
} catch (e) { fail('mood preset', e); }

/* 8. language swap EN→PL (paraglide reload) */
try {
  await fresh('/settings');
  await page.locator('[data-segment="pl"]').click();
  await page.waitForFunction(() => document.querySelector('[data-nav-item="home"] [data-nav-label]')?.textContent === 'Start', null, { timeout: 8000 });
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
  /* The templates are a sheet off the header now (phase 5 UX ticket 25):
     the screen opened on a picker for a fifteenth milestone rather than on
     the milestones. The shuffle went with them. */
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-shuffle]');
  const first = await page.locator('[data-template]').allTextContents();
  let changed = false;
  for (let i = 0; i < 6 && !changed; i++) {
    await page.locator('[data-shuffle]').click();
    changed = JSON.stringify(await page.locator('[data-template]').allTextContents()) !== JSON.stringify(first);
  }
  if (!changed) throw new Error('shuffle never changed');
  ok('milestone template shuffle');
} catch (e) { fail('shuffle', e); }

/* 10. custom scale: the live preview, then saving it, then finding it in the
   checklist looking like any built-in (phase 5 ticket 35) */
try {
  await fresh('/settings/dimension');
  await page.locator('#cd-name').fill('Voice comfort');
  await page.locator('#cd-low').fill('strained');
  await page.locator('#cd-high').fill('easy');
  await page.waitForFunction(() => document.querySelector('[data-dim-name]')?.textContent === 'Voice comfort');

  /* Saving a scale ticks it, which is the whole of what saving one does
     now: it used to also spawn a custom preset and switch to it. */
  await page.locator('[data-save]').click();
  await page.waitForURL(/\/settings$/);
  await page.getByRole('button', { name: /Gender scales/i }).click();

  /* A row like any other: ticked, and carrying a line about itself. A
     custom scale has no catalogue line, so it reads its own two ends
     back - which is why the endpoints above are filled in. */
  const custom = page.locator('[data-list-row^="scale-"][aria-checked="true"]').last();
  const customText = (await custom.textContent()).trim();
  if (!customText.startsWith('Voice comfort')) throw new Error('custom scale row: ' + customText);
  if (!customText.includes('strained') || !customText.includes('easy')) {
    throw new Error('custom scale row says nothing about its ends: ' + customText);
  }

  // And it reaches the entry screen like any built-in.
  await page.goto(BASE + '/entry/new', { waitUntil: 'networkidle' });
  await booted();
  const names = await page.locator('[data-dim-name]').allTextContents();
  if (!names.includes('Voice comfort')) throw new Error('editor scales: ' + JSON.stringify(names));
  ok('a custom scale previews, saves ticked, and appears like a built-in');
} catch (e) { fail('custom dimension', e); }

/* 10b. Home's stale-backup notice (ticket 15, F21). Before the export
   flows below, because they are what stops the journal being stale: the
   demo persona's last backup is 34 days old, and the number in the notice
   is what proves the age was read as epoch millis rather than as an epoch
   day - the mix the demo store shipped, which would have read as decades. */
try {
  await fresh('/');
  const notice = page.locator('[data-backup-notice]');
  await notice.waitFor();
  const said = await notice.textContent();
  if (!said.includes('34')) throw new Error(`the notice says: ${said.replace(/\s+/g, ' ').trim()}`);

  await notice.getByRole('button').click();
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
  /* The kind, not just the alert: the screen words this from the error's
     `kind` now (ticket 23), so an alert alone would still pass if the wrong
     branch fired or the key went missing. */
  await page.waitForSelector('[data-import-error="not-an-archive"]');
  ok('a file that is not a backup is refused, in the words the catalogue gives');
} catch (e) { fail('export/import', e); }

/* 11b. the whole of F14 through the screen: export the demo journal, then
   import the file that came out of it. Merging your own backup is the one
   import whose outcome is knowable in advance - every row matches by
   identity, so a second copy of anything would be a bug (ticket 14). */
try {
  /* Home's own list of the last few days, counted off the DOM: if a merge
     inserted a second copy of anything, every one of those days would show
     twice the entries it did before.

     And a day, uncapped, because Home alone stopped being able to answer
     this. Phase 5 ticket 21 caps what Home draws at five entries with the
     rest one tap away, so a merge that doubled the journal would leave that
     count sitting at five and this check would pass without checking
     anything. The day detail lists every entry of one day with no cap, so
     that is where a second copy of today shows up. Both, rather than the
     day alone: the pair is what says the duplication is neither on Home nor
     behind it. */
  const homeCards = async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await booted();
    await page.waitForSelector('[data-entry-card]');
    return page.locator('[data-entry-card]').count();
  };
  const todayRows = async () => {
    await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
    await booted();
    await page.waitForSelector('[data-entry-card]');
    return page.locator('[data-entry-card]').count();
  };

  await fresh('/');
  const before = await homeCards();
  const beforeToday = await todayRows();

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
    () => [...document.querySelectorAll('[data-toast]')].some((t) => t.textContent.includes('Merged')),
    null,
    { timeout: 120000 }
  );

  const after = await homeCards();
  if (after !== before) throw new Error(`Home went from ${before} entries to ${after} on merging its own backup`);
  const afterToday = await todayRows();
  if (afterToday !== beforeToday) {
    throw new Error(`today went from ${beforeToday} entries to ${afterToday} on merging its own backup`);
  }
  ok(`export → import round trip through the screen, ${before} recent entries and ${beforeToday} for today unchanged`);
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
  await page.locator('[data-mood="3"]').click();
  await page.locator('#ed-note').fill(NOTE);
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-card]');

  await page.goto(BASE + '/settings/export', { waitUntil: 'networkidle' });
  await booted();

  /* Keyboard only, all the way. The warning is what stands between someone
     and an unencrypted copy of their journal, so the confirm must not be
     what the sheet hands the focus to: opening it and pressing Enter again
     has to produce nothing. */
  await page.locator('[data-plain="csv"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
  if (await page.evaluate(() => document.activeElement?.hasAttribute('data-confirm-plain'))) {
    throw new Error('the sheet opened with the confirm button under the cursor');
  }
  await page.keyboard.press('Enter');
  if (await page.waitForEvent('download', { timeout: 1500 }).catch(() => null)) {
    throw new Error('a second Enter wrote the file without the confirm');
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });

  await page.locator('[data-plain="csv"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]');
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
  /* Found by its own row title rather than by position under .card. This
     assertion silently stopped running once ticket 28 split the single
     `card spread` element into a card wrapping four spread rows, because
     `.card.spread` wants both classes on one element and matched nothing,
     so the predicate could never settle and the flow died on the timeout.
     Position is the wrong anchor here for a second reason: the last-backup
     and last-verified rows both read "today", so a first-match selector
     that drifted onto the wrong row would pass while testing nothing. */
  /* Reached by its own handle rather than by layout position. This
     assertion went quiet for eight merges when ticket 28's card grew rows
     and the old `.card.spread` selector stopped matching; a data- handle
     survives both a restructure and a rewording of the row title. Absence
     is still named first, because a selector that resolves to nothing
     inside waitForFunction can only fail as an anonymous timeout. */
  const backupAgeCells = await page.locator('[data-backup-age]').count();
  if (backupAgeCells !== 1) {
    throw new Error(`expected one backup-age cell on the export screen, found ${backupAgeCells}`);
  }

  await page.waitForFunction(
    () => document.querySelector('[data-backup-age]')?.textContent.trim() === 'today'
  );

  ok(`plain CSV export behind the warning, ${entries.length} rows, notes intact`);
} catch (e) { fail('plain export', e); }


/* 13. onboarding end-to-end via demo jump (phase 5 ticket 26: seven steps -
   welcome, name, flag, scales, lock, check-in, finish) */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  await page.locator('[data-next]').click(); // welcome -> name
  await page.locator('#ob-name').fill('Ola');
  await page.locator('[data-next]').click(); // name -> flag

  /* The flag applies as it is picked, because the sun above it is what the
     step is for. Asserted on <html> rather than on any drawn pixel: the
     stamp is what every palette-aware surface in the app reads. */
  await page.locator('[data-palette-pick="nonbinary"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'nonbinary');
  await page.locator('[data-next]').click(); // flag -> scales

  /* Scales a person ticks, not eight presets a person picks (phase 5
     ticket 35). The names are the scales' own, and each row carries a line
     saying what it measures - which is the whole reason the checklist
     replaced the cards, so the subtitle is asserted rather than assumed.

     The built-ins are asserted by key and in order rather than against a
     row count: an earlier flow adds a custom scale to this journal, so a
     bare count folds "every built-in is offered" together with "how many
     custom ones exist today" and breaks on either. Custom rows are counted
     separately below and simply have to not be built-ins. */
  const scaleRows = page.locator('[data-list-row^="scale-"]');
  const scaleTexts = await scaleRows.allTextContents();
  const scaleKeys = (
    await scaleRows.evaluateAll((els) => els.map((el) => el.dataset.listRow.replace(/^scale-/, '')))
  );
  const expectedScales = [
    ['Dysphoria \u2194 euphoria', 'dysphoria and euphoria'],
    ['Femininity', 'not at all to very'],
    ['Masculinity', 'not at all to very'],
    ['Binary \u2194 nonbinary', 'binary and nonbinary'],
    ['Agender \u2194 gendered', 'strong sense of gender'],
    ['Unseen \u2194 recognised', 'read your gender'],
    ['Steady \u2194 shifting', 'steady sense of gender']
  ];
  const builtInKeys = [
    'euphoria_dysphoria',
    'femininity',
    'masculinity',
    'binary_nonbinary',
    'agender_gendered',
    'social_recognition',
    'gender_stability'
  ];
  const offeredBuiltIns = scaleKeys.filter((k) => builtInKeys.includes(k));
  if (offeredBuiltIns.join() !== builtInKeys.join()) {
    throw new Error('onboarding built-in scales, in order: ' + JSON.stringify(offeredBuiltIns));
  }
  if (scaleKeys.slice(0, builtInKeys.length).join() !== builtInKeys.join()) {
    throw new Error('built-ins do not lead the onboarding list: ' + JSON.stringify(scaleKeys));
  }
  expectedScales.forEach(([name, note], i) => {
    if (!scaleTexts[i].trim().startsWith(name)) {
      throw new Error(`onboarding scale ${i}: ${JSON.stringify(scaleTexts[i])}`);
    }
    if (!scaleTexts[i].includes(note)) {
      throw new Error(`onboarding scale ${i} has no line saying what it is: ${JSON.stringify(scaleTexts[i])}`);
    }
  });

  /* The default three arrive ticked and the other two do not, which is what
     "nothing is asked of somebody who agrees with the default" means on
     this screen. */
  const tickedOnArrival = await page.locator('[data-list-row^="scale-"][aria-checked="true"]').count();
  if (tickedOnArrival !== 3) throw new Error('scales ticked on arrival: ' + tickedOnArrival);

  await expectNoHorizontalOverflow('[data-app-viewport]');

  // Tick the two the default set leaves off, so what reaches the app is a
  // set this screen chose rather than the one it started with.
  await page.locator('[data-list-row="scale-binary_nonbinary"]').click();
  await page.locator('[data-list-row="scale-agender_gendered"]').click();
  await page.locator('[data-next]').click(); // scales -> lock
  await page.locator('[data-next]').click(); // lock -> check-in
  await page.locator('[data-next]').click(); // check-in -> finish
  await page.locator('[data-finish]').click();
  await page.waitForSelector('[data-home-hello]');
  const greet = await page.locator('[data-home-hello]').textContent();
  if (!greet.includes('Ola')) throw new Error('greeting: ' + greet);
  if (await page.evaluate(() => document.documentElement.dataset.palette) !== 'nonbinary') {
    throw new Error('the flag picked during onboarding did not survive into the app');
  }

  /* Held on Home rather than asserted and left (32.1), which is what this
     flow used to do inside the window the bounce lived in. */
  await heldOnHome('onboarding came back after finishing it');
  ok('onboarding end-to-end');
} catch (e) { fail('onboarding', e); }

/* 13a. every step can be left, and leaving keeps what was chosen so far
   (phase 5 ticket 26) */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  await page.locator('[data-next]').click(); // welcome -> name
  await page.locator('#ob-name').fill('Sam');
  /* Out from the second step, four steps short of the finish. The name that
     had been typed is kept, because leaving is not the same as cancelling. */
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  const leftGreet = await page.locator('[data-home-hello]').textContent();
  if (!leftGreet.includes('Sam')) throw new Error('leaving early lost the name: ' + leftGreet);

  /* The fastest way out of the flow, so this is the hold most likely to be
     running when a late navigation arrives (32.1). */
  await heldOnHome('leaving onboarding was undone by a late navigation');

  // And it counted as onboarded: a reload lands on Home, not back on step one.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-home-hello]');
  if (await page.locator('[data-next]').count()) throw new Error('onboarding came back after leaving it');
  ok('onboarding can be left from any step');
} catch (e) { fail('onboarding leave', e); }

/* 13b0. skipping the flag step puts back the flag that was showing when it
   was reached, rather than keeping whatever was tapped on the way through */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  const startingPalette = await page.evaluate(() => document.documentElement.dataset.palette);
  await page.locator('[data-next]').click(); // welcome -> name
  await page.locator('[data-next]').click(); // name -> flag
  await page.locator('[data-palette-pick="lesbian"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'lesbian');
  await page.locator('[data-skip-step]').click(); // flag skipped
  await page.waitForFunction(
    (want) => document.documentElement.dataset.palette === want,
    startingPalette
  );
  /* Out of the flow before the next case starts. `onboarded` lives in
     SQLite and fresh() only clears localStorage, so a run left standing
     mid-onboarding sends every screen after this one back to step one. */
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  ok('skipping the flag step restores the flag it was reached with');
} catch (e) { fail('onboarding flag skip', e); }

/* 13b. the settings scales sheet is the same list onboarding drew, and a
   tick is the change - there is no confirm on the sheet and never was
   (phase 5 ticket 35) */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/settings');
  await page.getByRole('button', { name: /Gender scales/i }).click();

  const rows = page.locator('[data-list-row^="scale-"]');
  /* Read off the row rather than a title element inside it: a row carries
     its name and its line in one node, and gripping the inner class would
     be gripping structure (ADR-0029, walkthrough-locators.test.ts). */
  const rowTexts = await rows.allTextContents();
  const expected = [
    ['euphoria_dysphoria', 'Dysphoria \u2194 euphoria'],
    ['femininity', 'Femininity'],
    ['masculinity', 'Masculinity'],
    ['binary_nonbinary', 'Binary \u2194 nonbinary'],
    ['agender_gendered', 'Agender \u2194 gendered'],
    ['social_recognition', 'Unseen \u2194 recognised'],
    ['gender_stability', 'Steady \u2194 shifting']
  ];
  expected.forEach(([, label], i) => {
    if (!rowTexts[i]?.trim().startsWith(label)) {
      throw new Error(`settings scale ${i}: ${JSON.stringify(rowTexts[i])}`);
    }
  });
  /* The built-ins lead and are all present; anything after them is a custom
     scale this journal picked up in an earlier flow. Asserted this way
     rather than as a row count for the reason the onboarding list gives. */
  const settingsKeys = await rows.evaluateAll((els) =>
    els.map((el) => el.dataset.listRow.replace(/^scale-/, ''))
  );
  const expectedKeys = expected.map(([key]) => key);
  if (settingsKeys.slice(0, expectedKeys.length).join() !== expectedKeys.join()) {
    throw new Error('settings built-in scales, in order: ' + JSON.stringify(settingsKeys));
  }
  if (settingsKeys.filter((k) => expectedKeys.includes(k)).length !== expectedKeys.length) {
    throw new Error('a built-in scale is offered twice: ' + JSON.stringify(settingsKeys));
  }
  await expectNoHorizontalOverflow('[data-app-viewport]');

  /* Ticking a scale writes it, and the row behind the sheet says so. What
     is asserted is that the summary changed, not what it now reads: this
     file's checks are copy literals often enough that a reworded string can
     make a flow pass for free, and the row's job here is to follow the set
     rather than to hold a particular sentence. */
  const summaryBefore = await page.locator('[data-list-row="scales"]').textContent();
  await page.locator('[data-list-row="scale-binary_nonbinary"]').click();
  await page.waitForSelector('[data-list-row="scale-binary_nonbinary"][aria-checked="true"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    (before) => document.querySelector('[data-list-row="scales"]')?.textContent !== before,
    summaryBefore
  );

  /* And what is ticked is what the entry screen offers, which is the whole
     claim the checklist makes. */
  await page.goto(BASE + '/entry/new', { waitUntil: 'networkidle' });
  await booted();
  const drawn = await page.locator('[data-dim-name]').count();
  if (drawn !== 4) throw new Error('the editor drew ' + drawn + ' scales for four ticked');

  /* Colour Home by one of the ticked scales first, so unticking it below
     has something to strand. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-chart-picker="home-metric"]').selectOption('femininity');
  await page.waitForFunction(
    () => document.querySelector('[data-chart-picker="home-metric"]')?.value === 'femininity'
  );

  /* Untick everything, and the editor says what it is rather than leaving
     a heading over nothing. A state somebody reaches by unticking five
     boxes, and it must not read as broken. */
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await page.getByRole('button', { name: /Gender scales/i }).click();
  for (const [key] of expected) {
    const ticked = page.locator(`[data-list-row="scale-${key}"][aria-checked="true"]`);
    if (await ticked.count()) await ticked.click();
  }
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/entry/new', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-no-scales]');
  if (await page.locator('[data-dim-name]').count()) {
    throw new Error('the editor drew a scale with none ticked');
  }

  /* And Home is back on mood rather than still coloured by a scale its own
     picker no longer offers. Read off the picker, which is where the two
     would visibly disagree. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  const metric = await page.locator('[data-chart-picker="home-metric"]').inputValue();
  if (metric !== 'mood') throw new Error('Home is still coloured by ' + metric + ' with nothing ticked');
  ok('settings scales sheet ticks through to the editor, empty included');
} catch (e) { fail('settings scales sheet', e); }

/* 13c. the first run arrives with the default set ticked, and Skip leaves
   it exactly as it was (tickets 28, 35) */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  await page.locator('[data-next]').click(); // welcome -> name
  await page.locator('#ob-name').fill('Robin');
  await page.locator('[data-next]').click(); // name -> flag
  await page.locator('[data-next]').click(); // flag -> scales

  /* Continue is never disabled here. Nothing ticked is a legitimate state
     and the default set is ticked on arrival anyway, so there is nothing
     this screen is waiting to be told. */
  if (!(await page.locator('[data-next]').isEnabled())) {
    throw new Error('the scales step made Continue wait for something');
  }
  // Untouched, then skipped: the stored default has to survive both.
  await page.locator('[data-skip-step]').click(); // scales -> lock
  await page.locator('[data-next]').click(); // lock -> check-in
  await page.locator('[data-next]').click(); // check-in -> finish
  await page.locator('[data-finish]').click();
  await page.waitForSelector('[data-home-hello]');

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await page.getByRole('button', { name: /Gender scales/i }).click();
  for (const key of ['euphoria_dysphoria', 'femininity', 'masculinity']) {
    await page.waitForSelector(`[data-list-row="scale-${key}"][aria-checked="true"]`);
  }
  for (const key of ['binary_nonbinary', 'agender_gendered']) {
    await page.waitForSelector(`[data-list-row="scale-${key}"][aria-checked="false"]`);
  }
  ok('skipping the scales step keeps the default set');
} catch (e) { fail('onboarding scales skip', e); }

/* 14. desktop: rail via container query at wide viewport */
try {
  await page.setViewportSize({ width: 1400, height: 980 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const railVisible = await page.locator('[data-rail-item]').first().isVisible();
  const navVisible = await page.locator('[data-app-nav]').isVisible();
  if (!railVisible || navVisible) throw new Error(`rail:${railVisible} nav:${navVisible}`);
  ok('desktop rail via container query');
} catch (e) { fail('desktop', e); }

/* 15. reminders web note at desktop */
try {
  await page.goto(BASE + '/settings/reminders', { waitUntil: 'networkidle' });
  const text = await page.textContent('[data-screen]');
  if (!text.includes('Android app')) throw new Error('web note missing');
  ok('web reminders note');
} catch (e) { fail('reminders web', e); }

/* 16. preferences survive a reload and land before first paint (ticket 06) */
try {
  await page.setViewportSize({ width: 440, height: 940 });
  await fresh('/settings');
  await page.locator('[data-palette-pick="lesbian"]').click();
  await page.locator('[data-segment="dark"]').click();
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
  await page.waitForSelector('[data-tag="g-soc-eu"]:has-text("social euphoria")'); // text-under-test: the English label

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.locator('[data-segment="pl"]').click();
  await page.waitForFunction(() => document.querySelector('[data-nav-item="home"] [data-nav-label]')?.textContent === 'Start', null, { timeout: 8000 });

  /* Same seeded tag, same row, different language - which only works if
     what was stored was the key and not the word. */
  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tag="g-soc-eu"]:has-text("euforia społeczna")', { timeout: 8000 }); // text-under-test: the Polish translation
  if (await page.locator('[data-tag="g-soc-eu"]', { hasText: 'social euphoria' }).count()) { // text-under-test: the stale English label
    throw new Error('English label survived the language switch');
  }
  ok('built-in tags follow the language, so they were seeded as keys');
} catch (e) { fail('vocabulary localization', e); }

/* 18. lock on leave, quick exit blank and disguised decoy (tickets 17, 30),
   then the forgotten-PIN reset.
   Last, because the reset is the one flow that destroys the journal. */
try {
  /* No PIN to set up first any more (ticket 53): mid-session locking now
     re-asks whatever opens the journal, and in the demo build that is the
     passphrase. So this flow drives the passphrase shape of the same screen,
     and the PIN shape is covered where the mode is changed, above. */
  await fresh('/settings');
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
  await page.waitForFunction(() => document.title === 'enGender', null, { timeout: 8000 });
  if (!/\/favicon\.svg$/.test(await favicon())) throw new Error('tab icon after undisguising: ' + (await favicon()));

  await page.getByRole('switch', { name: 'Lock on leave' }).click();
  await page.getByRole('switch', { name: 'Quick exit' }).click();

  /* A dispatched blur rather than a real one: headless Chromium has no
     second window to hand focus to, and what is under test is that the
     event the listener waits for locks the app. */
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForSelector('[data-applock]');
  await sessionPassphrase();
  await page.waitForSelector('[data-settings-list]');

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
  await page.waitForSelector('[data-applock]');

  /* Disguised, the same gesture shows the decoy notes screen instead of the
     blank (ticket 30), and the tab title matches what the page claims to be.
     Left on afterwards: the reset below wipes preferences, disguise included. */
  await sessionPassphrase();
  await page.waitForSelector('[data-settings-list]');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  /* The same dispatched two-finger gesture as above. */
  await page.evaluate(() => {
    const at = (y) => [1, 2].map((id) => new Touch({ identifier: id, target: document.body, clientX: 100 + id * 20, clientY: y }));
    window.dispatchEvent(new TouchEvent('touchstart', { touches: at(100) }));
    window.dispatchEvent(new TouchEvent('touchmove', { touches: at(320) }));
  });
  await page.waitForSelector('[data-decoy]');
  if (await page.locator('[data-blank]').count()) throw new Error('the blank showed alongside the decoy');
  if ((await page.title()) !== 'Notes') throw new Error('tab title over the decoy: ' + (await page.title()));
  const decoyText = await page.locator('[data-decoy]').innerText();
  /* A cut of decoy-copy.test.ts's GIVEAWAYS list, over the rendered screen
     rather than the catalogues - keep the two in step. */
  if (/gender|trans|journal|diary|dziennik|płe|tranzyc/i.test(decoyText)) {
    throw new Error('the decoy screen leaks the journal: ' + decoyText);
  }
  await page.locator('[data-decoy]').click();
  await page.waitForSelector('[data-applock]');

  await page.locator('[data-forgot]').click();
  await page.locator('[data-confirm-reset]').click();
  /* The reset ends in a page load, and this page is already `ready` - so
     wait for the lock screen to go away with it, not for a boot state that
     is true before the wipe has even started. */
  await page.waitForSelector('[data-applock]', { state: 'detached', timeout: 60000 });
  await booted();
  if (await page.locator('[data-applock]').count()) throw new Error('still locked after the reset');
  const mirror = await page.evaluate(() => JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}'));
  /* Not "the mirror is empty": the reload that finishes a reset boots, and
     boot writes the defaults back, so empty is never the resting state. What
     has to be gone is what was set before - and this flow left disguise on
     three lines up, which makes it the honest witness. */
  if (mirror.disguise !== false) {
    throw new Error('the pre-reset preferences survived the reset: ' + JSON.stringify(mirror));
  }
  /* Home rather than onboarding, because this is the demo build: an empty
     preference table is what makes it seed the persona, and the wipe left
     one. In a production build the first-run gate (flow 13) is what a
     wiped device meets instead. */
  await page.waitForSelector('[data-home-hello]');
  ok('lock on leave, quick exit blanks and locks, disguised quick exit shows the decoy, the reset clears the gate');
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
  /* Phase 5 ticket 24: the About row is a ListRow now, whose own handle is
     data-list-row="about" rather than a settings-specific attribute. */
  await page.locator('[data-list-row="about"]').click();
  const shown = (await page.locator('[data-app-version]').innerText()).trim();
  if (shown !== '9.9.9-walkthrough') throw new Error(`About shows "${shown}"`);
  ok('About shows the exact version the build was given');
} catch (e) { fail('the version the build was given', e); }

/* 20. wrapped (phase 4 features ticket 01): the Home card, both
   presentations, the entry floor and the Settings toggle.

   Last, and after the reset in flow 18 has put the persona back, because it
   writes five backdated entries into last June. The persona only covers the
   last 150 days plus a sparse backfill of the year before last (phase 5 UX
   ticket 23 - without it the one period /wrapped/year covers was empty by
   construction and the screen could not be reviewed at all). So the year has
   entries and the flow adds a handful more to a known month.

   The floor is asserted first, because it is worth proving before anything
   is rendered on top of it - and against a period that is genuinely thin
   rather than one that happens to be. A picked range can address any window,
   so it addresses one nobody could have logged in: the floor applying to
   those on the same terms as a completed cadence is one of spec 07's own
   acceptance boxes. */
try {
  const emptyWindow = await page.evaluate(() => {
    const day = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
    const start = Math.floor(Date.UTC(2019, 0, 1) / 86400000);
    return { from: day(start), to: day(start + 40) };
  });
  await fresh(`/wrapped/range?named=custom&from=${emptyWindow.from}&to=${emptyWindow.to}`);
  await page.waitForSelector('[data-wrapped-thin], [data-wrapped-stats]');
  if (!(await page.locator('[data-wrapped-thin]').count())) {
    throw new Error('a window nobody logged in should be below the entry floor');
  }
  if (await page.locator('[data-wrapped-stats]').count()) {
    throw new Error('a suppressed range still drew its figures');
  }

  const lastJune = await page.evaluate(() => Math.floor(Date.UTC(new Date().getFullYear() - 1, 5, 10) / 86400000));
  for (let offset = 0; offset < 5; offset++) {
    await fresh(`/entry/new/${lastJune + offset}`);
    await page.locator(`[data-mood="${2 + (offset % 3)}"]`).click();
    await page.locator('#ed-note').fill(`Last June, day ${offset + 1}`);
    await page.locator('[data-save]').click();
    // The editor lands on Home on every successful save.
    await page.waitForSelector('[data-home-hello]', { timeout: 10000 });
  }

  /* The yearly presentation: a cover, the year read month by month, and the
     figures as one run rather than the compact template's separate cards. */
  await fresh('/wrapped/year');
  if (await page.locator('[data-wrapped-thin]').count()) {
    throw new Error('the backfilled year should clear the entry floor');
  }
  await page.waitForSelector('[data-wrapped-cover-year]');
  const coverYear = (await page.locator('[data-wrapped-cover-year]').textContent())?.trim();
  const previousYear = await page.evaluate(() => String(new Date().getFullYear() - 1));
  if (coverYear !== previousYear) throw new Error('yearly wrapped cover shows ' + coverYear);
  /* Twelve months of days rather than twelve bars: the year is a cell per
     day on mood's own ramp now, and a month is a block of them. A silent
     month is still a block - a year with a quiet spring reads as one, and
     dropping its row would close the gap up. */
  const months = page.locator('[data-chart-card="wrapped-months"] [data-year-month]');
  if ((await months.count()) !== 12) {
    throw new Error('the year should read as twelve months, silent ones included');
  }
  const june = months.nth(5);
  if ((await june.locator('[data-year-cell]').count()) !== 30) {
    throw new Error('June should be thirty cells, one per day');
  }
  /* The five entries this flow wrote landed in June, and a day that carried a
     mood draws the picker's own face rather than an empty outline. */
  if ((await june.locator('[data-year-cell] svg').count()) < 5) {
    throw new Error('the month the entries went into drew no moods');
  }
  const yearCells = page.locator('[data-chart-card="wrapped-months"] [data-year-cell]');
  const dayCount = await page.evaluate(() => {
    const year = new Date().getFullYear() - 1;
    return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  });
  if ((await yearCells.count()) !== dayCount) {
    throw new Error(`the year should be ${dayCount} cells, found ` + (await yearCells.count()));
  }
  if (!(await page.locator('[data-wrapped-figure]').count())) throw new Error('the year has no figures');
  /* Structurally distinct, not the compact template scaled up: the stat
     tiles and per-question cards belong to the other presentation. */
  if (await page.locator('[data-wrapped-stat]').count()) throw new Error('yearly wrapped reused the compact stat tiles');

  /* The monthly presentation, on the same data seam and deliberately
     unalike: stat tiles and a card per question, no cover. */
  await fresh('/wrapped/month');
  await page.waitForSelector('[data-wrapped-stats]');
  if ((await page.locator('[data-wrapped-stat]').count()) < 2) throw new Error('the compact template has no stat tiles');
  if (await page.locator('[data-wrapped-cover]').count()) throw new Error('monthly wrapped reused the yearly cover');
  if (await page.getByRole('button', { name: /share|export/i }).count()) throw new Error('wrapped is not view-only');

  /* All three cadences reachable without typing a URL: Home offers one, and
     the switcher is what makes the other two anything but orphans (SH-001). */
  const tabs = page.locator('[data-segmented="wrapped-cadences"] a');
  /* Four: the three completed cadences plus the arbitrary range wrapped
     absorbed from recap (ticket 23, spec 07). */
  if ((await tabs.count()) !== 4) throw new Error('the cadence switcher offers ' + (await tabs.count()));
  await tabs.nth(2).click();
  await page.waitForSelector('[data-wrapped-cover-year]', { timeout: 15000 });
  const activeTab = await page
    .locator('[data-segmented="wrapped-cadences"] [aria-current="page"]')
    .getAttribute('href');
  if (activeTab !== '/wrapped/year') throw new Error('the switcher marks ' + activeTab + ' as current');

  await fresh('/wrapped/nonsense');
  if (!(await page.locator('[data-notice-title]').count())) throw new Error('an unknown cadence should say so');
  if (await page.locator('[data-segmented="wrapped-cadences"]').count()) {
    throw new Error('an unknown cadence still drew a switcher');
  }

  /* Home offers exactly one card, for whichever cadence is freshest today,
     and it links to that cadence's screen. */
  await fresh('/');
  const card = page.locator('[data-wrapped-card]');
  if ((await card.count()) !== 1) throw new Error('Home should offer one wrapped card, found ' + (await card.count()));
  const href = await card.getAttribute('href');
  if (!/^\/wrapped\/(week|month|year)$/.test(href ?? '')) throw new Error('the card links to ' + href);
  await card.click();
  await page.waitForSelector('[data-wrapped-title], [data-wrapped-cover-year]');

  /* The toggle turns the feature off rather than hiding the card: Home stops
     offering it, and the screen itself says so instead of rendering a
     wrapped nobody asked to keep computing. The toggle lives on the merged
     unprompted-registry screen (ticket 51, one screen since deepening
     ticket 09), one row down from Settings, in the Home column. */
  await fresh('/settings');
  if (await page.locator('[data-live-tile="wrapped"]').count()) {
    throw new Error('the wrapped toggle is still on the Tracking card');
  }
  await page.locator('[data-list-row="notifications"]').click();
  await page.waitForSelector('[data-live-tile="wrapped"]');
  await page.locator('[data-live-tile="wrapped"]').getByRole('switch').click();
  await fresh('/');
  if (await page.locator('[data-wrapped-card]').count()) throw new Error('the card survived the toggle');
  await fresh('/wrapped/week');
  if (await page.locator('[data-wrapped-stats], [data-wrapped-cover]').count()) {
    throw new Error('a wrapped still rendered with the feature turned off');
  }
  if (!(await page.locator('[data-notice-title]').count())) throw new Error('the off state explains nothing');

  await fresh('/settings');
  await page.locator('[data-list-row="notifications"]').click();
  await page.waitForSelector('[data-live-tile="wrapped"]');
  await page.locator('[data-live-tile="wrapped"]').getByRole('switch').click();
  await fresh('/');
  if (!(await page.locator('[data-wrapped-card]').count())) throw new Error('the card did not come back');
  ok('wrapped: Home card, both presentations, the entry floor and the toggle');
} catch (e) { fail('wrapped', e); }

/* 21. typed dysphoria and euphoria logging (phase 4 features ticket 02): all
   seven confirmed categories render as bare names under their own heading,
   an info affordance tells "social" apart from "societal" - the exact pair
   CONTEXT.md's glossary calls out as not self-explanatory - hiding one
   follows the same built-in mechanic as any other tag, and the euphoria tag
   stays selectable independently of a dysphoria type on the same entry.

   Never run as part of the implementation loop, per this ticket's
   merge-time note: append here rather than before flow 20 (ticket 01's,
   which must stay last on its own branch), and run `npx svelte-kit sync`
   first or the build this file drives dies on ENOENT for
   .svelte-kit/output/client/service-worker.js. */
try {
  await fresh('/entry/new/today');
  const dysphoriaGroup = page.locator('[data-tag-group="dysphoria_type"]');
  await dysphoriaGroup.waitFor();
  const labels = (await dysphoriaGroup.locator('[data-tag]').allTextContents()).map((t) => t.trim());
  const expected = ['physical', 'biochemical', 'social', 'societal', 'sexual', 'presentational', 'existential'];
  if (JSON.stringify(labels) !== JSON.stringify(expected)) {
    throw new Error('dysphoria type chips read: ' + JSON.stringify(labels));
  }

  await page.locator('[data-tag-info="dt-societal"]').click();
  await page.waitForSelector('[role="dialog"]');
  const societalBody = (await page.locator('[role="dialog"] p').textContent())?.trim() ?? '';
  if (!/society/i.test(societalBody)) throw new Error('societal description read: ' + societalBody);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });

  await page.locator('[data-tag-info="dt-social"]').click();
  await page.waitForSelector('[role="dialog"]');
  const socialBody = (await page.locator('[role="dialog"] p').textContent())?.trim() ?? '';
  if (socialBody === societalBody) throw new Error('social and societal show the same description');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"]', { state: 'detached' });

  /* Picking a dysphoria type and the euphoria tag leaves both selected -
     the euphoria capture is not tied to, or cleared by, picking a type
     (ticket scope: "usable independently of any dysphoria type tag, on the
     same entry or a different one"). */
  await page.locator('[data-tag="dt-physical"]').click();
  await page.locator('[data-tag="g-euphoria"]').click();
  if ((await page.locator('[data-tag="dt-physical"]').getAttribute('aria-pressed')) !== 'true') {
    throw new Error('physical dysphoria type was deselected by picking euphoria');
  }
  if ((await page.locator('[data-tag="g-euphoria"]').getAttribute('aria-pressed')) !== 'true') {
    throw new Error('euphoria did not select');
  }
  await page.locator('[data-mood="3"]').click();
  await page.locator('#ed-note').fill('Playwright: physical and euphoria together.');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-note]');

  await page.goto(BASE + '/settings/tags', { waitUntil: 'networkidle' });
  await page.locator('[data-tag-hide="dt-existential"]').click();

  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1) / 86400000);
  });
  await page.goto(BASE + `/entry/new/${tomorrow}`, { waitUntil: 'networkidle' });
  await booted();
  const afterHide = (await dysphoriaGroup.locator('[data-tag]').allTextContents()).map((t) => t.trim());
  if (afterHide.includes('existential')) throw new Error('hidden dysphoria type still offered');
  if (afterHide.length !== 6) throw new Error('hiding one type should leave six, found ' + afterHide.length);

  await page.goto(BASE + '/settings/tags', { waitUntil: 'networkidle' });
  await page.locator('[data-tag-hide="dt-existential"]').click();

  ok('dysphoria type: seven categories, per-type descriptions, hide mechanics, euphoria stays independent');
} catch (e) { fail('typed dysphoria and euphoria logging', e); }

/* 22. on-this-day (phase 4 features ticket 03): the absolute good-day rule,
   the Home card, and the Settings toggle - independent of wrapped's own.

   The six-month lookback is where this flow writes: the demo persona only
   seeds the last 150 days (persona.ts), so ~182 days back is guaranteed
   empty before this flow touches it, and asserting on that one lookback's
   heading text ("Six months ago") isolates the check from whatever the
   persona and flow 20's manual June entries happen to do at the month and
   year marks. Never run as part of the implementation loop, per ticket
   02's flow above: append here, run `npx svelte-kit sync` first. */
try {
  await fresh('/on-this-day');
  if (!(await page.locator('[data-screen-title="on-this-day"]').count())) {
    throw new Error('the route did not render');
  }

  // Same clamped "N calendar months back" arithmetic as epochDayMonthsAgo
  // (src/lib/data/epochDay.ts), duplicated here rather than imported: this
  // script is plain Node ESM with no TS loader.
  const sixMonthsAgo = await page.evaluate(() => {
    const today = new Date();
    const totalMonths = today.getFullYear() * 12 + today.getMonth() - 6;
    const year = Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(today.getDate(), daysInMonth);
    return Math.floor(Date.UTC(year, month, day) / 86400000);
  });

  // A low mood with no euphoria capture: below the good-day bar, so this
  // day must not surface, not even as its own section.
  await fresh(`/entry/new/${sixMonthsAgo}`);
  await page.locator('[data-mood="1"]').click();
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-hello]', { timeout: 10000 });

  await fresh('/on-this-day');
  if (await page.locator('[data-lookback="sixMonths"]').count()) {
    throw new Error('a day below the good-day bar surfaced anyway');
  }

  // The euphoria capture on a second entry the same day is enough on its
  // own, regardless of the day's mood average.
  await fresh(`/entry/new/${sixMonthsAgo}`);
  await page.locator('[data-mood="1"]').click();
  await page.locator('[data-tag="g-euphoria"]').click();
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-hello]', { timeout: 10000 });

  await fresh('/on-this-day');
  const sixMonthSection = page.locator('[data-lookback="sixMonths"]');
  if (!(await sixMonthSection.count())) throw new Error('a euphoria capture should have qualified this day');
  /* Spec 05: the entries themselves, not a count of them, and each one
     opens where every other drawing of an entry opens. */
  const resurfaced = sixMonthSection.locator('[data-entry-card]');
  if (!(await resurfaced.count())) throw new Error('a resurfaced day shows no entries');
  const opens = await resurfaced.first().getAttribute('href');
  if (!/^\/entry\/\d+$/.test(opens ?? '')) throw new Error('a resurfaced entry opens ' + opens);
  if (await sixMonthSection.locator('[data-chart="area"]').count()) {
    throw new Error('the chart that cannot draw over one day is back');
  }

  await fresh('/');
  const hadWrappedCard = await page.locator('[data-wrapped-card]').count();
  const card = page.locator('[data-on-this-day-card]');
  if ((await card.count()) !== 1) throw new Error('Home should offer the on-this-day card now, found ' + (await card.count()));
  await card.click();
  await page.waitForSelector('[data-lookback]');

  /* The toggle turns the feature off entirely, and leaves wrapped's own
     toggle and card untouched (CONTEXT/ticket scope: independent toggles).
     It lives on the merged unprompted-registry screen (ticket 51, one
     screen since deepening ticket 09), in the Home column. */
  await fresh('/settings');
  await page.locator('[data-list-row="notifications"]').click();
  await page.waitForSelector('[data-live-tile="on-this-day"]');
  await page.locator('[data-live-tile="on-this-day"]').getByRole('switch').click();
  await fresh('/');
  if (await page.locator('[data-on-this-day-card]').count()) throw new Error('the card survived the toggle');
  if ((await page.locator('[data-wrapped-card]').count()) !== hadWrappedCard) {
    throw new Error("turning on-this-day off changed wrapped's own card");
  }
  await fresh('/on-this-day');
  if (await page.locator('[data-lookback]').count()) {
    throw new Error('on-this-day still rendered a day with the feature turned off');
  }
  if (!(await page.locator('[data-notice-title]').count())) throw new Error('the off state explains nothing');

  await fresh('/settings');
  await page.locator('[data-list-row="notifications"]').click();
  await page.waitForSelector('[data-live-tile="on-this-day"]');
  await page.locator('[data-live-tile="on-this-day"]').getByRole('switch').click();
  await fresh('/');
  if (!(await page.locator('[data-on-this-day-card]').count())) throw new Error('the card did not come back');

  ok('on-this-day: the good-day rule, the Home card, and its own Settings toggle');
} catch (e) { fail('on-this-day', e); }

/* 23. an unsaved entry survives Android killing the backgrounded process,
   not only a same-process app-switcher round trip (ticket 14). A full page
   reload discards every JS heap the same way process death does, while
   localStorage - the mirror EntryEditor.svelte writes to on every change -
   survives on disk either way, so this is the closest a desktop browser
   gets to proving it. */
try {
  await fresh('/entry/new/today');
  await page.locator('[data-mood="4"]').click();
  /* The mirror is ciphertext under the session data key now (sec-audit 02),
     so what can be read from outside the app is that a value was written and
     that the note is not sitting in it. Taken away first, or the mood click's
     own write would satisfy the wait and the reload could beat the note into
     storage. That the mirror still carries this draft is what the reload
     below proves, which was always the point of the flow. */
  await page.evaluate(() => localStorage.removeItem('gender-diary-entry-draft'));
  await page.locator('#ed-note').fill('Killed mid-edit by Playwright.');
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('gender-diary-entry-draft');
    return !!raw && !raw.includes('Killed mid-edit');
  });

  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('#ed-note');
  const restoredNote = await page.locator('#ed-note').inputValue();
  if (restoredNote !== 'Killed mid-edit by Playwright.') {
    throw new Error(`note lost across reload: "${restoredNote}"`);
  }
  await page.waitForSelector('[data-mood="4"][aria-checked="true"]');

  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-entry-note]');
  const saved = await page.locator('[data-entry-note]').first().textContent();
  if (!saved.includes('Killed mid-edit')) throw new Error('the resumed draft did not save');

  /* Saving unmounts the editor, which clears the mirror (onDestroy), so a
     later, unrelated new entry must not inherit anything from this one. */
  await fresh('/entry/new/today');
  const leftover = await page.locator('#ed-note').inputValue();
  if (leftover) throw new Error(`a saved draft leaked into a fresh editor: "${leftover}"`);
  ok('an unsaved entry survives a killed process and does not leak into the next one');
} catch (e) { fail('background/process-death draft restore', e); }

/* 23b. the other half of ticket 14: backgrounding and returning without the
   process ever dying (home button, app switcher) must not touch an
   in-progress edit either. Unlike flow 20, this never reloads or
   navigates, so the editor component itself never unmounts - firing the
   same visibility events Android does is only worth asserting because it
   proves nothing here mistakes "hidden" for "gone" and clears the draft
   early. */
try {
  await fresh('/entry/new/today');
  await page.locator('[data-mood="3"]').click();
  await page.locator('#ed-note').fill('Backgrounded but never killed.');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide', { persisted: true }));
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow', { persisted: true }));
  });

  const note = await page.locator('#ed-note').inputValue();
  if (note !== 'Backgrounded but never killed.') throw new Error(`note changed across backgrounding: "${note}"`);
  await page.waitForSelector('[data-mood="3"][aria-checked="true"]');
  ok('backgrounding and returning in the same process leaves an unsaved edit untouched');
} catch (e) { fail('same-process background/resume', e); }

/* 24. quick log offers to fill in the active preset's scales too (phase 4
   features ticket 13, beta B2), unconditionally - unlike the "Add details"
   toast (flow 2b), this prompt does not depend on the entry-nudges
   preference. The prompt's inputs carry only placeholder text, never a
   real prefilled value, so there is nothing to delete before typing - and
   filling them in writes onto the entry the quick log already saved. */
try {
  await fresh('/');
  await page.locator('[data-mood="4"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-quick-log-dims]');

  const firstInput = page.locator('[data-qld-input]').first();
  if (!(await firstInput.getAttribute('placeholder'))) throw new Error('dimension input has no placeholder text');
  if ((await firstInput.inputValue()) !== '') {
    throw new Error('dimension input starts with a real value instead of just a placeholder');
  }

  for (const input of await page.locator('[data-qld-input]').all()) await input.fill('7');
  await page.locator('[data-qld-add]').click();
  await page.waitForSelector('[data-quick-log-dims]', { state: 'detached' });

  await page.locator('[data-entry-card]').first().click();
  await page.waitForSelector('[data-dim-value]');
  // Asserted as "is this a number", not against the unset marker's wording:
  // that marker is ordinary UI copy and changed once already (ticket 31).
  const values = await page.locator('[data-dim-value]').allTextContents();
  if (values.some((v) => !Number.isFinite(Number(v.trim())))) {
    throw new Error('a scale value from the prompt did not save: ' + JSON.stringify(values));
  }
  ok('quick log dims prompt saves typed scale values onto the just-saved entry');
} catch (e) { fail('quick log dims prompt (save)', e); }

/* 24b. declining the prompt must never block or delay the quick log itself
   - the entry is already saved by the time the prompt appears, so skipping
   it leaves that entry exactly as it was. */
try {
  await fresh('/');
  await page.locator('[data-mood="3"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-quick-log-dims]');
  await page.locator('[data-qld-skip]').click();
  await page.waitForSelector('[data-quick-log-dims]', { state: 'detached' });

  await page.locator('[data-entry-card]').first().click();
  await page.waitForSelector('[data-dim-value]');
  const values = await page.locator('[data-dim-value]').allTextContents();
  if (values.some((v) => Number.isFinite(Number(v.trim())))) {
    throw new Error('declining the prompt still wrote a scale value: ' + JSON.stringify(values));
  }
  ok('declining the quick log dims prompt leaves the saved entry untouched');
} catch (e) { fail('quick log dims prompt (decline)', e); }

/* 25. ticket 18's compare-two-periods stats screen (phase 4 features): two
   independently picked ranges show their own core figures side by side,
   with no computed delta rendered between them. */
try {
  await fresh('/compare');
  const { aStart, aEnd, bStart, bEnd } = await page.evaluate(() => {
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const daysAgo = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return d;
    };
    return { aStart: fmt(daysAgo(29)), aEnd: fmt(today), bStart: fmt(daysAgo(59)), bEnd: fmt(daysAgo(30)) };
  });

  await fillDate(page, '#compare-a-start', aStart);
  await fillDate(page, '#compare-a-end', aEnd);
  await fillDate(page, '#compare-b-start', bStart);
  await fillDate(page, '#compare-b-end', bEnd);

  await page.waitForSelector('[data-compare-table]');
  const entriesRow = page.locator('[data-compare-metric="entries"]');
  const entriesValues = await entriesRow.locator('span').allTextContents();
  if (entriesValues.length !== 3) throw new Error('entries row: ' + JSON.stringify(entriesValues));
  if (entriesValues[1] === '0' || entriesValues[2] === '0') {
    throw new Error('one of the two periods had no entries: ' + JSON.stringify(entriesValues));
  }

  const headerValues = await page.locator('[data-compare-period-label]').allTextContents();
  if (headerValues[0] === headerValues[1]) throw new Error('the two period labels read the same: ' + JSON.stringify(headerValues));

  if (await page.getByRole('button', { name: /share|export/i }).count()) throw new Error('compare is not view-only');
  ok('two independently picked periods compare side by side with no computed delta');
} catch (e) { fail('compare two periods', e); }

/* Flow: the transition roadmap (phase 4 ticket 23, widened phase 5 ticket
   20 for the "not my path" tri-state and custom goals). Acceptance boxes
   that need a real browser rather than a unit test: that a status
   survives a reload, that a bundled country pack makes no network request
   at all, and that a custom goal appends to a track and ticks through the
   same tri-state a bundled goal does. The request log is armed only
   around the ticking, after the reload has finished, so what it asserts
   is exact - zero requests of any origin, not just none off-origin.
   Boot's own document, modules and SQLite wasm are all behind it by
   then. */
try {
  await fresh('/settings/roadmap');
  await page.waitForSelector('[data-goal]');

  /* The kit's heading, not SectionTitle's: phase 5 UX ticket 25 moved the
     feature screens onto it, and the handle moved with the component the
     way ticket 24's list-row handles did. */
  const tracks = (await page.locator('[data-section-heading]').allTextContents()).map((t) => t.trim());
  for (const track of ['Social', 'Legal', 'Presentation', 'Medical']) {
    if (!tracks.includes(track)) throw new Error('missing track ' + track + ': ' + JSON.stringify(tracks));
  }

  if (!(await page.getByText(/III CZP 20\/26/).count())) throw new Error('the unsettled-law caveat is not shown'); // text-under-test: the caveat itself
  if (!(await page.getByText(/checked against its sources/i).count())) throw new Error('the review date is not shown'); // text-under-test: the review note itself

  const boxes = page.locator('[data-goal]');
  const before = await boxes.count();
  if (before < 30) throw new Error('the Polish pack rendered only ' + before + ' goals');

  const target = page.locator('[data-goal="pl-legal-written-reasons"]');
  await target.click(); // unchecked -> checked
  await page.waitForFunction(() => document.querySelectorAll('[data-goal][data-status="checked"]').length === 1);

  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-goal][data-status="checked"]');
  const stillChecked = await page.locator('[data-goal][data-status="checked"]').count();
  if (stillChecked !== 1) throw new Error('after a reload ' + stillChecked + ' goals read as checked');

  /* Every other goal is untouched by that one status: they are
     independently checkable, not a run that fills in behind the
     furthest one. */
  const after = await boxes.count();
  if (after !== before) throw new Error('the goal count changed from ' + before + ' to ' + after);

  const requested = [];
  page.on('request', (request) => requested.push(request.url()));

  const target2 = page.locator('[data-goal="pl-legal-written-reasons"]');
  await target2.click(); // checked -> not-my-path
  await page.waitForFunction(
    () => document.querySelector('[data-goal="pl-legal-written-reasons"]')?.getAttribute('data-status') === 'not-my-path'
  );
  if (await page.locator('[data-goal][data-status="checked"]').count()) {
    throw new Error('not-my-path still reads as checked');
  }

  await target2.click(); // not-my-path -> unchecked, leaving zero checked
  await page.waitForFunction(() => document.querySelectorAll('[data-goal][data-status="checked"]').length === 0);
  await page.locator('[data-goal]').last().click(); // a different goal, unchecked -> checked
  await page.waitForFunction(() => document.querySelectorAll('[data-goal][data-status="checked"]').length === 1);

  if (requested.length) throw new Error('the roadmap made requests: ' + JSON.stringify(requested.slice(0, 4)));
  ok('the roadmap cycles a goal through checked, not-my-path and unchecked, offline, and remembers it across a reload');
} catch (e) { fail('transition roadmap tri-state', e); }

/* Custom goals (phase 5 ticket 20): a person can add their own goal to a
   track, it appends after the bundled ones, and it ticks through the same
   tri-state. Scoped to this one goal's own data-status rather than a
   global checked count: the tri-state flow above already leaves one
   bundled goal checked in this same browser session, since fresh() only
   clears localStorage and never the journal itself. */
try {
  await fresh('/settings/roadmap');
  await page.waitForSelector('[data-goal]');

  const before = await page.locator('[data-goal]').count();
  const addGoalButton = page.locator('[data-add-goal="social"]');
  // The social track's own list-group, so "appended to the end" is checked
  // against that track alone - `[data-goal]` on the whole page ends inside
  // whichever track renders last (medical), not the one this goal was
  // added to.
  const socialGroup = addGoalButton.locator('xpath=..');

  await addGoalButton.click();
  await page.getByPlaceholder('Your step').fill('Tell my sister');
  await page.getByRole('button', { name: 'Add goal' }).click();

  await page.waitForFunction((n) => document.querySelectorAll('[data-goal]').length === n, before + 1);
  const customRow = socialGroup.locator('[data-goal]').filter({ hasText: 'Tell my sister' }); // text-under-test: the goal I just typed
  if (!(await customRow.count())) throw new Error('the custom goal did not render inside the social track');

  const idsInOrder = await socialGroup.locator('[data-goal]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-goal')));
  const customGoalId = await customRow.getAttribute('data-goal');
  if (idsInOrder[idsInOrder.length - 1] !== customGoalId) {
    throw new Error('the custom goal did not append to the end of its track');
  }

  await customRow.click(); // unchecked -> checked
  await page.waitForFunction(
    (id) => document.querySelector(`[data-goal="${id}"]`)?.getAttribute('data-status') === 'checked',
    customGoalId
  );

  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector(`[data-goal="${customGoalId}"]`);
  const afterReload = await page.locator(`[data-goal="${customGoalId}"]`).getAttribute('data-status');
  if (afterReload !== 'checked') throw new Error('the custom goal did not survive a reload, checked');

  ok('a custom goal appends to its track and ticks through the same tri-state a bundled goal does');
} catch (e) { fail('transition roadmap custom goal', e); }

/* 26. the journaling pause (phase 5 ticket 21): Home's streak line goes
   quiet while a pause covers today, and resuming brings it straight back
   rather than waiting a day - the exact bug an inclusive end day would
   cause if `resumeToday()` used today instead of yesterday as the end. */
try {
  await fresh('/');
  await page.waitForSelector('[data-home-streak]');

  await page.goto(BASE + '/settings/journaling-pause', { waitUntil: 'networkidle' });
  await page.locator('[data-new-pause]').click();
  await page.locator('[data-confirm-pause]').click();
  await page.waitForSelector('[data-resume-pause]');

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  if (await page.locator('[data-home-streak]').count()) throw new Error('the streak line still shows while a pause covers today');

  await page.goto(BASE + '/settings/journaling-pause', { waitUntil: 'networkidle' });
  await page.locator('[data-resume-pause]').click();
  await page.waitForSelector('[data-new-pause]');

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-home-streak]');
  ok('the streak line quiets while a journaling pause covers today, and resuming brings it back the same day');
} catch (e) { fail('journaling pause', e); }

/* 27. the journal book (phase 5 ticket 17): what the inclusion picker says
   is what the pages hold, and the print layout is many sheets rather than
   one. The second half is the part no unit test can reach - the app shell
   is a fixed-height frame with one scrolling region, so before the print
   rules in app.css the document laid out to exactly one viewport and every
   page after the first was silently dropped. */
try {
  await fresh('/settings/journal-book');
  await page.waitForSelector('[data-book-entry]');
  /* By part, not by position: the picker's order is a list in journalBook.ts
     and gripping nth() would silently assert the wrong switch the day that
     list is reordered (ADR-0029). */
  const part = (key) => page.locator(`[data-inclusion="${key}"] [role="switch"]`);

  if (await page.locator('[data-book-opening]').count()) throw new Error('the opening page is on before anyone asks for it');
  await part('openingPage').click();
  await page.waitForSelector('[data-book-opening] [data-wrapped-card-art]');

  await part('entries').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-book-entry]').length === 0);
  if ((await part('photos').getAttribute('aria-checked')) !== 'false') {
    throw new Error('photos stayed ticked with no entries to sit under');
  }

  await part('entries').click();
  await page.waitForSelector('[data-book-entry]');

  await page.emulateMedia({ media: 'print' });
  if (await page.locator('[data-book-inclusion]').isVisible()) throw new Error('the inclusion picker prints');
  if (await page.locator('[data-app-nav]').isVisible()) throw new Error('the navigation bar prints');
  const sheets = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
  if (sheets < 2) throw new Error(`the printed document is ${sheets.toFixed(1)} viewports tall, so it fits on one page`);
  await page.emulateMedia({ media: 'screen' });

  ok('a journal book carries what the picker was told to carry, and prints as more than one page');
} catch (e) { await page.emulateMedia({ media: 'screen' }); fail('journal book', e); }

/* Concurrent regimen episodes and dose-drug attribution (phase 5 ticket
   38): two episodes for different drugs can both be active without one
   reading as ended, logging a dose while both are active prompts for
   which drug it was, and ending one drops it out of the active set again
   - the disambiguation this ticket exists to force before a dose can be
   drawn into the wrong drug's curve. */
try {
  await fresh('/settings/regimen');

  const addOwnEpisode = async (drug, dose, unit) => {
    await page.click('[data-add]');
    await page.click('[data-own]');
    await page.fill('#regimen-drug', drug);
    await page.fill('#regimen-dose', dose);
    await page.fill('#regimen-dose-unit', unit);
    await page.fill('#regimen-route', 'oral');
    await page.fill('#regimen-interval', 'daily');
    await page.click('[data-save-regimen]');
  };

  // Scoped to these two rows by name throughout, not a page-wide badge
  // count: a demo persona seeded by an earlier flow may already carry its
  // own regimen episode, and this flow only ever claims something about
  // the two it created.
  const estradiolRow = () => page.locator('[data-episode]', { hasText: 'Estradiol' }); // text-under-test: the drug I just typed
  const spiroRow = () => page.locator('[data-episode]', { hasText: 'Spironolactone' }); // text-under-test: the drug I just typed

  await addOwnEpisode('Estradiol', '4', 'mg');
  await page.waitForSelector('[data-episode]');
  await addOwnEpisode('Spironolactone', '100', 'mg');
  await page.waitForSelector('[data-episode]:nth-of-type(2)');

  if ((await estradiolRow().locator('[data-active-badge]').count()) !== 1 || (await spiroRow().locator('[data-active-badge]').count()) !== 1) {
    throw new Error('both concurrently active episodes should read Current, not just the latest one');
  }

  await page.goto(BASE + '/doses', { waitUntil: 'networkidle' });
  await page.click('[data-add]');
  if ((await page.locator('[data-dose-drug]').count()) !== 2) {
    throw new Error('logging a dose with two active episodes should prompt for which drug it was');
  }
  if (!(await page.isDisabled('[data-save-dose]'))) throw new Error('save should be disabled until a drug is picked');

  await page.click('[data-dose-drug="Spironolactone"]');
  await page.click('[data-save-dose]');
  await page.waitForSelector('[data-dose]');
  const doseRow = await page.locator('[data-dose]').first().innerText();
  if (!doseRow.includes('Spironolactone')) throw new Error(`the logged dose should be labelled Spironolactone, got: ${doseRow}`);

  // Ending one episode drops it out of today's active set, so the next new
  // dose is unchanged from a single-episode journal - no prompt at all.
  await page.goto(BASE + '/settings/regimen', { waitUntil: 'networkidle' });
  const localDateInput = (daysAgo = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  await estradiolRow().click();
  await page.click('[data-end-episode]');
  // endEpisode() writes to the DB asynchronously and only then updates the
  // end-date field's own value via Svelte's reactive binding - filling it
  // before that settles gets clobbered right back to today's date.
  const today = localDateInput();
  await page.waitForFunction(
    ([sel, expected]) => {
      const fp = document.querySelector(sel)?._flatpickr;
      return fp?.selectedDates[0] && fp.formatDate(fp.selectedDates[0], 'Y-m-d') === expected;
    },
    ['#regimen-end', today]
  );
  await fillDate(page, '#regimen-end', localDateInput(1));
  await page.click('[data-save-regimen]');
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll('[data-episode]')].find((el) => el.textContent.includes('Estradiol'));
    return row && !row.querySelector('[data-active-badge]');
  });
  if ((await spiroRow().locator('[data-active-badge]').count()) !== 1) {
    throw new Error('ending the estradiol episode should not touch spironolactone, which is still active');
  }

  await page.goto(BASE + '/doses', { waitUntil: 'networkidle' });
  await page.click('[data-add]');
  if ((await page.locator('[data-dose-drug]').count()) !== 0) {
    throw new Error('logging a dose with exactly one active episode should not prompt for a drug');
  }

  ok('two concurrent regimen episodes stay active together, a dose logged during the overlap is attributed by an explicit pick, and ending one restores single-episode behaviour');
} catch (e) {
  fail('concurrent regimen episodes and dose attribution', e);
}

/* Characterization pass for the More hub (phase 5 ticket 03): every route
   Settings used to link, directly or by way of the new /more hub, still
   answers at its own address - ADR-0036 moves who links to a route, never
   the route itself, and this is the thing that would catch a slip. */
try {
  const SETTINGS_AREA_ROUTES = [
    '/settings', '/settings/dimension', '/settings/export', '/settings/journal-book',
    '/settings/security', '/settings/tags', '/settings/trash', '/settings/reminders',
    '/settings/journey-anchor', '/settings/affirmations', '/settings/body-regions',
    '/settings/streak-goal', '/settings/journaling-pause', '/settings/photos',
    '/settings/measurements', '/settings/sizes', '/settings/hair-progress',
    '/settings/hair-removal', '/settings/labs', '/settings/regimen', '/settings/hormone-curve',
    '/settings/cycle-events', '/settings/side-effects', '/settings/surgery',
    '/settings/appointment-prep', '/settings/clinician-summary', '/settings/milestones',
    '/settings/roadmap', '/settings/letters', '/settings/tryouts', '/settings/presentations',
    '/settings/eras',
    '/settings/voice', '/settings/wear', '/settings/effects', '/settings/resources',
  ];
  for (const route of SETTINGS_AREA_ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    if ((await page.getByRole('heading', { level: 1 }).count()) === 0) {
      throw new Error(`${route} rendered no heading - not reachable`);
    }
  }
  ok(`all ${SETTINGS_AREA_ROUTES.length} settings-area routes still answer at their own address`);
} catch (e) {
  fail('More hub route characterization', e);
}

/* Phase 5 ticket 36: the persona alone leaves most of the More hub in its
   empty state, which is why this ticket exists - a review pass through
   those screens was "a tour of empty states with a few exceptions"
   (Alicja, 2026-08-26). "Fill every feature" layers a second seed over the
   persona; walked here by checking each area's own `data-notice="<key>-
   empty"` marker is gone rather than by counting rows, since an empty-state
   Notice existing at all is a screen's own claim that it has nothing to
   show. */
try {
  await fresh('/settings/measurements'); // any settings route boots the shell before the demo bar is queried
  await page.click('[data-fill-every-feature]');
  await page.waitForURL('**/more');
  await booted();

  const NOT_EMPTY_ROUTES = [
    ['/settings/measurements', 'measurements-empty'],
    ['/settings/sizes', 'sizes-empty'],
    ['/settings/hair-progress', 'hair-stages-empty'],
    ['/settings/hair-removal', 'hair-removal-empty'],
    ['/settings/labs', 'labs-empty'],
    ['/settings/regimen', 'regimen-empty'],
    ['/settings/hormone-curve', 'curve-empty'],
    ['/doses', 'doses-empty'],
    ['/settings/cycle-events', 'cycle-events-empty'],
    ['/settings/side-effects', 'side-effects-empty'],
    ['/settings/surgery', 'surgery-empty'],
    ['/settings/appointment-prep', 'appointment-prep-empty'],
    ['/settings/milestones', 'milestones-empty'],
    ['/settings/letters', 'letters-empty'],
    ['/settings/tryouts', 'tryouts-empty'],
    /* `/settings/voice` was on this list for its memo picker's own
       `voice-empty` notice. Phase 8 features ticket 09 moved memos off the
       screen (ticket 11 gives them their own) and nothing in either demo
       seed writes a benchmark, so the notice this asserted the absence of
       no longer exists anywhere - which would have made the check pass for
       free rather than fail. The voice screen's own walk is below. */
    ['/settings/wear', 'wear-empty'],
    ['/settings/stock', 'stock-empty']
  ];
  for (const [route, emptyKey] of NOT_EMPTY_ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    if (await page.locator(`[data-notice="${emptyKey}"]`).count()) {
      throw new Error(`${route} still shows its empty state (${emptyKey}) after filling every feature`);
    }
  }

  /* The voice screen's three tabs (phase 8 features ticket 09): each one
     renders its own surface and no other tab's, and the compare tab is the
     one that lists benchmarks. Deliberately no microphone here - this
     browser has none, and a step that waits on a live figure would hang
     for thirty seconds and then blame the screen. The figure itself, with
     its bands, its source and its caveat, is asserted in the browser tier
     against an oscillator (tests/browser-tier/voice-benchmark-probe.ts). */
  await page.goto(BASE + '/settings/voice', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-vb-passage]');
  await page.locator('[data-segment="practise"]').click();
  await page.waitForSelector('[data-comfort-band]');
  if ((await page.locator('[data-vb-passage]').count()) !== 0) {
    throw new Error('the practise tab still shows the benchmark passage');
  }
  if ((await page.locator('[data-vp-start]').count()) === 0) {
    throw new Error('the practise tab offers no way to start');
  }
  await page.locator('[data-segment="compare"]').click();
  await page.waitForSelector('[data-notice="voice-benchmark-empty"]');
  if ((await page.locator('[data-comfort-band]').count()) !== 0) {
    throw new Error('the compare tab still shows the practise tab\'s comfort row');
  }

  // Roadmap and effects carry no empty-state Notice of their own (their
  // toggles and tracks always render) - checked instead for a signal that
  // only exists once something is ticked or marked.
  await page.goto(BASE + '/settings/roadmap', { waitUntil: 'networkidle' });
  if ((await page.locator('[data-status="checked"], [data-status="not-my-path"]').count()) === 0) {
    throw new Error('roadmap has no ticked or not-my-path goal after filling every feature');
  }

  // The tryout detail route is reached from the list, not a URL this test
  // would have to invent an id for.
  await page.goto(BASE + '/settings/tryouts', { waitUntil: 'networkidle' });
  await page.locator('[data-tryout] a').first().click();
  await page.waitForSelector('[data-screen-header]');
  /* The entries section reads a range keyed off the tryout the route names,
     which is a round trip away. It used to be read beside that one, so it
     could answer with nothing before the tryout arrived and leave its empty
     state up for good - this wait carried a reload-and-recheck around that.
     Phase 5 audit ticket 09 made the read wait for the record it reads for
     (detailDraft.ts, tests/browser-tier/detail-draft-probe.svelte.ts), so
     one look is enough now and an empty section here is a real failure. */
  await page.waitForFunction(
    () => document.querySelector('[data-notice="tryout-entries-empty"]') || document.querySelector('[data-entry-card]'),
    null,
    { timeout: 8000 }
  );
  if ((await page.locator('[data-notice="tryout-entries-empty"]').count()) > 0) {
    throw new Error('the first tryout has no entries in its date range after filling every feature');
  }

  ok('every More-hub area shows real content once "Fill every feature" has run, not just its empty state');
} catch (e) {
  fail('fill every feature', e);
}

/* Ticket 18: "compare this stretch" on a tryout and on a procedure, over
   the journal "fill every feature" just layered onto whatever ~50 earlier
   flows left the journal holding - `fresh()` reloads the page, not the
   journal, so this is not the clean persona seed alone. That is exactly
   why the procedure half below does not assert which of "ready" or "too
   short" it lands on: the procedure is dated `today - 400`, and whether
   its 90-day recovery window (long since closed - the fixed-end half of
   ADR-0049's clamp, next to the tryout's still-open half) has real journal
   before it depends on how far back editing and importing left the
   earliest entry, which this suite does not pin down. Both branches are
   asserted instead - a link that opens with the right two sides, or a
   notice that says why it does not - and "too short to compare" as a rule
   is exercised at the unit level (compareStretch.test.ts) regardless. The
   tryout is dated only `today - 100`, comfortably inside any journal this
   suite produces, so that half stays a strict assertion. Expected sides
   are computed from the same pure rule the screens call, so this checks
   the two agree rather than restating one arithmetic as the other's
   assertion.

   The tryout half also proves the ticket's own acceptance criterion that
   `/compare`'s arithmetic is unchanged: the same two dates, once arrived
   at through this link and once typed into the pickers by hand exactly as
   flow 25 already does, have to read the same numbers back - a stronger
   check than "the diff to sideStats/periodFromRange is empty", since it
   exercises the real computation rather than trusting the diff not to
   have touched it. */
try {
  // epochDay.ts and recoveryDay.ts both import nothing of their own (each
  // file's own header comment says so, for exactly this reason), so they
  // are two app modules plain Node can import directly - compareStretch.ts
  // imports epochDay.ts by a bare specifier Node's loader does not resolve,
  // the same reason src/lib/data/epochDay.ts's own "N calendar months back"
  // arithmetic is duplicated further up this file rather than imported.
  // `precedingWindow` is duplicated here for the same reason - it is
  // compareStretch.ts's own two-line rule.
  const { todayEpochDay, dateInputValueFromEpochDay } = await import('../src/lib/data/epochDay.ts');
  const { SURGERY_RECOVERY_CUTOFF_DAYS } = await import('../src/lib/data/recoveryDay.ts');
  const today = todayEpochDay();
  const precedingWindow = (stretch) => {
    const length = stretch.end - stretch.start + 1;
    return { start: stretch.start - length, end: stretch.start - 1 };
  };
  const assertOpensWithSides = async (stretch) => {
    const preceding = precedingWindow(stretch);
    const gotA = [await page.locator('#compare-a-start').inputValue(), await page.locator('#compare-a-end').inputValue()];
    const gotB = [await page.locator('#compare-b-start').inputValue(), await page.locator('#compare-b-end').inputValue()];
    const wantA = [dateInputValueFromEpochDay(stretch.start), dateInputValueFromEpochDay(stretch.end)];
    const wantB = [dateInputValueFromEpochDay(preceding.start), dateInputValueFromEpochDay(preceding.end)];
    if (gotA[0] !== wantA[0] || gotA[1] !== wantA[1] || gotB[0] !== wantB[0] || gotB[1] !== wantB[1]) {
      throw new Error(`compare opened with the wrong sides: got A ${gotA} B ${gotB}, wanted A ${wantA} B ${wantB}`);
    }
    await page.waitForSelector('[data-compare-table]');
    if (new URL(page.url()).search) throw new Error('the query parameters that opened compare were never stripped');
  };
  /* Every metric row is a name span plus one span per side (compare/+page.svelte's
     `data-compare-metric` rows) - side A's is always index 1. */
  const columnA = async () => {
    const rows = page.locator('[data-compare-metric]');
    const values = [];
    for (let i = 0; i < (await rows.count()); i++) {
      values.push((await rows.nth(i).locator('span').allTextContents())[1]);
    }
    return values;
  };

  /* The full-fixture tryouts sort newest-start-first (tryouts.ts's own
     ORDER BY), so the pronoun tryout - started `today - 100`, still
     open - is always the second row: 'layered look' (today - 40, closed),
     then this one, then 'Alex' (today - 120, closed). Picked by position
     rather than its label, which is arbitrary demo content and not what
     this flow is testing. */
  await page.goto(BASE + '/settings/tryouts', { waitUntil: 'networkidle' });
  await page.locator('[data-tryout] a').nth(1).click();
  await page.waitForSelector('[data-screen-header]');

  const tryoutNotice = page.locator('[data-notice="tryout-compare"]');
  await tryoutNotice.waitFor();
  if (!(await tryoutNotice.locator('[data-notice-text]').count())) {
    throw new Error('an open-ended tryout\'s compare link does not say it counts through today');
  }
  const tryoutAction = tryoutNotice.locator('[data-notice-action]');
  if (!(await tryoutAction.count())) throw new Error('the open-ended tryout has enough journal before it and should offer to compare');
  await tryoutAction.click();
  await page.waitForURL('**/compare');
  await assertOpensWithSides({ start: today - 100, end: today });
  const viaLink = await columnA();

  // The exact same side A, typed into the pickers instead of arriving by
  // URL - compare's own computation has to read the identical numbers
  // back either way, which is the acceptance criterion this ticket states
  // for compare's arithmetic.
  await page.goto(BASE + '/compare', { waitUntil: 'networkidle' });
  await fillDate(page, '#compare-a-start', dateInputValueFromEpochDay(today - 100));
  await fillDate(page, '#compare-a-end', dateInputValueFromEpochDay(today));
  await fillDate(page, '#compare-b-start', dateInputValueFromEpochDay(today - 100));
  await fillDate(page, '#compare-b-end', dateInputValueFromEpochDay(today));
  await page.waitForSelector('[data-compare-table]');
  const viaPickers = await columnA();
  if (JSON.stringify(viaLink) !== JSON.stringify(viaPickers)) {
    throw new Error(`compare computed different numbers for the same range depending on how it arrived: link ${JSON.stringify(viaLink)}, pickers ${JSON.stringify(viaPickers)}`);
  }

  // The procedure's own recovery window has a fixed end once archived
  // (SURGERY_RECOVERY_CUTOFF_DAYS past surgery), not one still tracking
  // today - whether there is enough journal before that fixed window
  // depends on the ~50 flows already run against this journal, so both
  // outcomes are legitimate and both are checked.
  await page.goto(BASE + '/settings/surgery', { waitUntil: 'networkidle' });
  await page.locator('[data-procedure]').first().click();
  await page.waitForSelector('[data-phase="archived"]');
  const procedureNotice = page.locator('[data-notice="surgery-compare"]');
  await procedureNotice.waitFor();
  const procedureAction = procedureNotice.locator('[data-notice-action]');
  if (await procedureAction.count()) {
    // Ready, and archived rather than still-open, so no "counts through
    // today" hint is expected here - that only shows on a stretch still
    // tracking today (asserted from the tryout above instead).
    await procedureAction.click();
    await page.waitForURL('**/compare');
    await assertOpensWithSides({ start: today - 400, end: today - 400 + SURGERY_RECOVERY_CUTOFF_DAYS });
  } else if (!(await procedureNotice.locator('[data-notice-text]').count())) {
    throw new Error('the procedure\'s compare notice offers no link and says nothing about why');
  }

  ok('"compare this stretch" opens the right two sides and reads the same numbers a hand-picked range would, from an open-ended tryout and from a procedure that either does the same or says why it cannot');
} catch (e) {
  fail('compare this stretch', e);
}

/* Importing a Daylio backup (phase 7 ticket 09). The one flow in this
   suite that hands the app a file: `chooseFiles` creates an input and
   clicks it (data/fileDialog.ts), so Chromium's own file chooser is what
   the picker resolves through here too.

   The `.daylio` is built at run time from the same test-support builder the
   node tier uses, rather than committed as a binary - the format was
   learned from a real personal journal that has been deleted, and a zip
   nobody can read is a worse fixture than a JSON literal a reviewer can.
   Imported dynamically so a Node without type stripping fails this flow
   rather than the suite.

   Nothing here asserts on wording. The assertions are handles and counts:
   that a preview resolved, that the sheet closed on commit, that the
   import wrote a history row, and that picking the same file again offers
   no confirm button, which is the whole of "re-importing adds nothing". */
try {
  const { makeDaylioBackup } = await import('../src/lib/data/archive/test-support/daylio-backup.ts');
  const { writeFile, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const directory = await mkdtemp(join(tmpdir(), 'walkthrough-daylio-'));
  const file = join(directory, 'walkthrough.daylio');
  await writeFile(file, await makeDaylioBackup());

  await fresh('/settings/export');
  await page.locator('[data-daylio-backup]').click();
  await page.waitForSelector('[data-pick-backup]');

  const pick = async () => {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-pick-backup]').click();
    await (await chooser).setFiles(file);
  };

  await pick();
  await page.waitForSelector('[data-confirm-backup]', { timeout: 15000 });

  await page.locator('[data-confirm-backup]').click();
  /* The scrim rather than the sheet: both go on close, but the scrim is
     what covers the row this flow clicks next, and a click landing on it
     opens nothing while looking like it worked. */
  await page.waitForSelector('[data-sheet-scrim]', { state: 'detached', timeout: 60000 });

  if (!(await page.locator('[data-import-log-row]').count())) {
    throw new Error('a committed import wrote no history row');
  }

  await page.locator('[data-daylio-backup]').click();
  await page.waitForSelector('[data-pick-backup]');
  await pick();
  /* The preview has to have resolved before the absence below means
     anything, and the moods block is what says it did - it is listed for a
     backup whose every record is already here, where the arriving rows are
     not. */
  await page.waitForSelector('[data-sheet] [data-import-nothing-new]', { timeout: 15000 });
  if (await page.locator('[data-confirm-backup]').count()) {
    throw new Error('a backup whose every record is already here still offered an import button');
  }

  ok('a Daylio backup previews, imports, writes a history row, and adds nothing the second time');
} catch (e) { fail('daylio backup import', e); }


/* The rotation map's dots at the narrowest phone the app supports (phase 6
   ticket 13). Ticket 10 read the crowding on that figure as a reason to put
   recency in a text list instead of on the dots, and the crowding was real:
   two of the twelve 48px targets sat 33.7px apart, so a fifth of six of
   them belonged to a neighbour. injectionSiteMap.test.ts holds the spacing
   in the abstract; what only a browser can say is that the figure renders
   at the width that spacing assumes, that the targets come out at
   --touch-target, and that a tap aimed at a dot lands on that dot.

   After "Fill every feature", whose 500 days of weekly injections around
   six of the twelve sites are the only seed with a rotation behind them -
   which is also what makes the never-used half of the map checkable here.

   The viewport is narrowed for this flow alone and put back afterwards:
   every other flow in this file reads a 440px screen. */
try {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(BASE + '/doses', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-sheet]');
  // Two regimens run at once in this seed, so which one this dose is has to
  // be answered before the sheet asks about an injection site at all. The
  // sheet opens that group itself on exactly this state.
  await page.locator('[data-dose-drug="Estradiol valerate"]').click();
  await page.waitForSelector('button[data-site="thigh-left"]');
  await page.locator('button[data-site="thigh-left"]').scrollIntoViewIfNeeded();

  /* The clear space Android asks for between two touch targets, on top of
     the targets themselves. Read out of the module that spaces the dots by
     it rather than written here as well, so raising it cannot leave this
     check asserting the old number. */
  const layout = await readFile(
    new URL('../src/lib/components/injectionSiteMap.ts', import.meta.url),
    'utf8'
  );
  const gap = Number(/MAP_TOUCH_GAP = (\d+)/.exec(layout)?.[1]);
  if (!Number.isFinite(gap)) throw new Error('injectionSiteMap.ts declares no MAP_TOUCH_GAP');

  const map = await page.evaluate((gap) => {
    const target = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--touch-target')
    );
    const dots = [...document.querySelectorAll('button[data-site]')].map((el) => {
      const box = el.getBoundingClientRect();
      return {
        key: el.dataset.site,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        width: box.width,
        height: box.height,
        never: el.classList.contains('is-never'),
        fill: getComputedStyle(el, '::after').backgroundColor
      };
    });
    let closest = { gap: Infinity, pair: '' };
    for (const [i, a] of dots.entries()) {
      for (const b of dots.slice(i + 1)) {
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (gap < closest.gap) closest = { gap, pair: `${a.key} and ${b.key}` };
      }
    }
    const transparent = (fill) => fill === 'transparent' || fill === 'rgba(0, 0, 0, 0)';
    return {
      count: dots.length,
      target,
      closest,
      undersized: dots.filter((d) => d.width < target || d.height < target).map((d) => d.key),
      sites: dots.map((d) => d.key),
      never: dots.filter((d) => d.never).map((d) => d.key),
      unshaded: dots.filter((d) => !d.never && transparent(d.fill)).map((d) => d.key),
      shadedNever: dots.filter((d) => d.never && !transparent(d.fill)).map((d) => d.key),
      clearance: target + gap
    };
  }, gap);

  /* Whether a tap aimed at a dot lands on that dot, which is the half of
     the crowding question a rect cannot answer: two 48px targets 33.7px
     apart both have their centres clear, and the one drawn later still
     takes the overlap. A trial click is Playwright's own hit-target check -
     it scrolls the dot into view, waits for it to settle and refuses if
     anything else would receive the press - and it presses nothing, so the
     dose being drafted is untouched. Aimed one dot at a time because the
     figure is 560px tall on an 844px screen: half of it is always scrolled
     out of the sheet, where a point in the viewport belongs to whatever is
     painted over it. */
  const misaimed = [];
  for (const site of map.sites) {
    try {
      await page.locator(`button[data-site="${site}"]`).click({ trial: true, timeout: 4000 });
    } catch (e) {
      misaimed.push(`${site} (${e.message.split('\n')[0]})`);
    }
  }

  if (map.count !== 12) throw new Error(`the map drew ${map.count} dots`);
  if (map.undersized.length) {
    throw new Error(`under --touch-target (${map.target}px): ${map.undersized.join(', ')}`);
  }
  if (map.closest.gap < map.clearance) {
    throw new Error(
      `${map.closest.pair} are ${map.closest.gap.toFixed(1)}px apart, closer than the ${map.clearance}px a ${map.target}px target and its gap need`
    );
  }
  if (misaimed.length) {
    throw new Error(`a tap aimed at these dots would land elsewhere: ${misaimed.join('; ')}`);
  }
  /* The demo's rotation covers six of the twelve sites, so the other six
     are the never-used state, drawn empty rather than at the pale end of
     the ramp - and every site it did use carries a swatch. */
  if (map.never.length !== 6) {
    throw new Error(
      `${map.never.length} sites drawn as never used, expected the six this seed has never injected: ${map.never.join(', ')}`
    );
  }
  if (map.unshaded.length) {
    throw new Error(`used sites with no recency swatch: ${map.unshaded.join(', ')}`);
  }
  /* The other half of that, which is the criterion a colour ramp cannot
     meet on its own: a site never used is drawn empty rather than at the
     pale end of the ramp, so it is not merely the faintest fill. */
  if (map.shadedNever.length) {
    throw new Error(`sites never used but drawn with a fill: ${map.shadedNever.join(', ')}`);
  }

  ok('every dot on the injection map is separately tappable at 320px, and the sites the demo never used are drawn apart from the ones it did');
} catch (e) {
  fail('injection map recency', e);
} finally {
  await page.setViewportSize({ width: 440, height: 940 });
}

/* Eras (phase 6 ticket 01, ADR-0049). Two things worth walking that no unit
   test reaches: leaving a bound open is a choice on screen rather than an
   empty field, and a collision is answered inside the sheet - a sentence
   naming the era it hit, and a save that will not fire - rather than thrown
   after a tap.

   After "Fill every feature" rather than on a first-run journal, because the
   line saying what an open bound comes to is computed against the journal's
   own first and last entry: on an empty journal there is nothing to clamp to
   and the line is correctly absent. The demo seeds no era of its own, so
   this flow still starts from the empty state and authors both of them. */
try {
  await page.goto(BASE + '/settings/eras', { waitUntil: 'networkidle' });
  await booted();
  if ((await page.locator('[data-notice="eras-empty"]').count()) === 0) {
    throw new Error('a journal with no eras should show its empty state');
  }

  // Both bounds left alone. An era with neither is the case that has to save
  // without a date being entered anywhere.
  await page.click('[data-add]');
  await page.fill('#era-name', 'all of it');
  if ((await page.locator('[data-era-resolved]').count()) === 0) {
    throw new Error('an era with an open bound should say what that comes to in the journal');
  }
  await page.click('[data-save-era]');
  await page.waitForSelector('[data-era]');

  const firstRow = await page.locator('[data-era]').first().innerText();
  if (!firstRow.includes('all of it')) throw new Error(`the era should read back by name, got: ${firstRow}`);

  /* A second era with the same open bounds collides three ways in turn, and
     each answer has to name the era it hit rather than say "invalid". Closing
     one bound at a time walks from the open-start refusal, through the
     open-end one, to the plain overlap - no date typed anywhere, because
     each bound is a two-way choice. */
  await page.click('[data-add]');
  await page.fill('#era-name', 'earlier still');
  await page.waitForSelector('[data-era-conflict]');
  const conflictNow = () => page.locator('[data-era-conflict]').innerText();
  const openStartConflict = await conflictNow();
  if (!openStartConflict.includes('all of it')) {
    throw new Error(`the conflict should name the era it hit, got: ${openStartConflict}`);
  }
  if (!(await page.isDisabled('[data-save-era]'))) {
    throw new Error('save should be off while the era collides with another');
  }

  await page.click('[data-segmented="era-start"] [data-segment="day"]');
  const openEndConflict = await conflictNow();
  if (openEndConflict === openStartConflict) {
    throw new Error('an era given a start of its own should stop being refused as a second open start');
  }

  await page.click('[data-segmented="era-end"] [data-segment="day"]');
  const overlapConflict = await conflictNow();
  if (overlapConflict === openEndConflict || !overlapConflict.includes('all of it')) {
    throw new Error(`an era inside another should be refused as an overlap naming it, got: ${overlapConflict}`);
  }
  if (!(await page.isDisabled('[data-save-era]'))) {
    throw new Error('save should still be off while the era overlaps another');
  }

  /* Escape and not a scrim click: the scrim's own handler ignores anything
     that did not land on the scrim itself, and a click at its centre lands
     on the sheet. */
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });

  // Deleting is a plain delete: nothing references an era, so nothing can
  // block it.
  await page.click('[data-era]');
  await page.click('[data-delete-era]');
  await page.click('[data-confirm-delete-era]');
  await page.waitForSelector('[data-notice="eras-empty"]');

  ok('eras: an open bound is a choice, a collision is answered in the sheet, and deleting is not blocked');
} catch (e) {
  fail('eras', e);
}

/* Quick add, rebuilt (phase 5 ticket 18, closing spec 04).

   The old sheet offered two choices that both led to the same screen. What
   is checked here is the widening - every option reaching the surface that
   records that thing - and, separately, that both gestures reach the same
   targets: tap the add button and tap a row, or press the button and slide
   onto a row without ever letting go.

   The two gestures are worth testing separately because they resolve
   through different code paths in the browser even though they resolve
   through one rule in the component: a tap ends in a click on the row, and
   a slide ends in a pointerup the row never sees.

   The tally is asserted through its toast rather than through a count on a
   screen, and that is not the weaker check it looks like: the toast is
   awaited behind journal.tally.log(), so it cannot appear until the write
   has come back from the worker. */
async function openQuickAdd(path = '/') {
  await fresh(path);
  await page.locator('[data-nav-fab]').click();
  await page.waitForSelector('[data-fan-target="mood-3"]');
}

/** Press the add button, slide onto a target, let go - one pointer, never
    lifted, which is the gesture the fan exists for. */
async function slideToTarget(selector) {
  const from = await page.locator('[data-nav-fab]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForSelector('[data-fan]');
  /* The fan is in the DOM before it has finished arriving, and it arrives by
     travelling: measuring it mid-transition reads a box up to
     --motion-distance-md away from where it settles, which is enough to aim
     the drag into the gap between two cards. */
  await page.waitForTimeout(500);
  const to = await page.locator(selector).boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.waitForSelector(`${selector}[class*="is-armed"]`, { timeout: 4000 });
  await page.mouse.up();
}

try {
  await openQuickAdd();
  await page.locator('[data-fan-target="mood-4"]').click();
  await page.waitForSelector('#ed-note');
  await page.waitForSelector('[data-mood="4"][aria-checked="true"]');
  ok('quick add: a mood opens the editor seeded with it');
} catch (e) { fail('quick add mood', e); }

try {
  await openQuickAdd();
  await page.locator('[data-fan-target="mood-3"]').click();
  await page.waitForSelector('#ed-note');
  await page.waitForSelector('[data-mood="3"][aria-checked="true"]');
  ok("quick add: a mood is how today's entry starts, seeded with it");
} catch (e) { fail('quick add today', e); }

try {
  await openQuickAdd();
  await page.locator('[data-choose="another-day"]').click();
  await page.waitForSelector('#backdate');
  const wanted = await page.locator('#backdate').inputValue();
  if (!wanted) throw new Error('the backdate field was empty');
  await page.locator('[data-choose="date"]').click();
  await page.waitForSelector('#ed-note');
  if (!page.url().includes('/entry/new/')) throw new Error(`backdate went to ${page.url()}`);
  ok('quick add: a backdated entry still opens the editor on that day');
} catch (e) { fail('quick add backdate', e); }

for (const kind of ['misgendered', 'correctly_gendered']) {
  try {
    /* From a screen with nothing to do with the tally, which is the whole
       reason it is in this fan. */
    await openQuickAdd('/stats');
    await page.locator(`[data-choose="tally-${kind}"]`).click();
    /* The write landing is a thing you can see: the row flies into the add
       control and the control catches it with a tick. Asserted because it
       is the only confirmation an in-place action has that is anywhere near
       the thumb that pressed it, and because it plays when the write comes
       back rather than when the finger lifts - so its absence would mean
       the write never returned, not merely that an animation was dropped. */
    await page.waitForSelector('[data-fan-flight]', { timeout: 8000 });
    /* And the half of the confirmation a screen reader gets. Checked for
       being non-empty rather than for what it says, so this is a live
       region that speaks, not an assertion about wording. */
    await page.waitForFunction(
      () => (document.querySelector('[data-quick-add-status]')?.textContent ?? '').trim().length > 0,
      null,
      { timeout: 8000 }
    );
    if (!page.url().includes('/stats')) throw new Error(`logging a tally left for ${page.url()}`);
    await page.waitForSelector('[data-fan-flight]', { state: 'detached', timeout: 8000 });
    ok(`quick add: ${kind} logs from wherever you are, without leaving it`);
  } catch (e) { fail(`quick add tally ${kind}`, e); }
}

try {
  /* A write that did not land must not borrow the animation of one that
     did. Forced through the demo build's own switch rather than by breaking
     the journal, so this checks the branch and not the wreckage: no mark
     flies, the control never wears a tick, and it says so instead. */
  await fresh('/stats');
  await page.evaluate(() => (document.documentElement.dataset.demoFail = 'tally-misgendered'));
  await page.locator('[data-nav-fab]').click();
  await page.waitForSelector('[data-fan]');
  await page.locator('[data-choose="tally-misgendered"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-nav-fab]')?.className.includes('is-refusing'),
    null,
    { timeout: 8000 }
  );
  if (await page.locator('[data-fan-flight]').count()) {
    throw new Error('a failed write sent the mark flying anyway');
  }
  /* A failure is announced too, and it is the same region rather than a
     second one: a screen reader user gets told either way. */
  const spoken = await page.locator('[data-quick-add-status]').textContent();
  if (!spoken?.trim()) throw new Error('a failed write said nothing to a screen reader');
  const refused = await page.locator('[data-nav-fab]').evaluate((node) => ({
    shaking: node.className.includes('is-refusing'),
    catching: node.className.includes('is-catching')
  }));
  if (!refused.shaking) throw new Error('the add control did not answer the failure');
  if (refused.catching) throw new Error('the add control played the landed animation on a failure');
  if (await page.locator('[data-nav-fab] [data-add-mark="check"][data-shown]').count()) {
    throw new Error('a failed write wore the landed mark');
  }
  if (!(await page.locator('[data-nav-fab] [data-add-mark="alert"][data-shown]').count())) {
    throw new Error('a failed write did not wear the refused mark');
  }
  await page.evaluate(() => delete document.documentElement.dataset.demoFail);
  ok('quick add: a write that fails says so, and borrows none of the landed animation');
} catch (e) { fail('quick add failed write', e); }

try {
  await openQuickAdd();
  await page.locator('[data-choose="dose"]').click();
  await page.waitForSelector('[data-save-dose]');
  ok('quick add: a dose reaches the dose log with its editor already open');
} catch (e) { fail('quick add dose', e); }

try {
  /* Cycle tracking stays out of sight until it is asked for (ADR-0043,
     phase 5 deepening ticket 05). The demo journal is transfemme by
     construction - estradiol, no testosterone - so by default not one
     surface names the cycle log, while the log itself keeps its records
     and its direct URL. Two ways in, walked one after the other: the
     explicit opt-in switch in Settings, and an active testosterone
     episode, which surfaces it with the switch back off. */
  await fresh('/more');
  if (await page.locator('[data-list-row="cycle-events"]').count()) {
    throw new Error('the cycle row showed in More with no testosterone and no opt-in');
  }
  await page.goto(BASE + '/settings/side-effects', { waitUntil: 'networkidle' });
  if ((await page.locator('[data-cycle-event]').count()) || (await page.locator('[data-list-row="all-cycle-events"]').count())) {
    throw new Error('side effects named the cycle log with no testosterone and no opt-in');
  }
  if (await page.locator('[data-cycle-events-link]').count()) {
    throw new Error('regimen linked the cycle log without a testosterone episode');
  }

  // The direct URL still answers, records intact - hiding a row never
  // closes a screen (ADR-0043).
  await page.goto(BASE + '/settings/cycle-events', { waitUntil: 'networkidle' });
  if ((await page.locator('[data-cycle-event]').count()) === 0) {
    throw new Error('the cycle log lost its records behind the hidden row');
  }

  // Way in one: the explicit opt-in, for someone no regimen speaks for.
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.locator('[data-cycle-tracking-toggle] [role="switch"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-cycle-tracking-toggle] [role="switch"]')?.getAttribute('aria-checked') === 'true',
    null,
    { timeout: 8000 }
  );
  await page.goto(BASE + '/more', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-list-row="cycle-events"]', { timeout: 8000 });
  await page.goto(BASE + '/settings/side-effects', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-list-row="all-cycle-events"]', { timeout: 8000 });

  // Back off, so the next flow starts from the default and the testosterone
  // episode below has to be the thing that surfaces the log.
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.locator('[data-cycle-tracking-toggle] [role="switch"]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-cycle-tracking-toggle] [role="switch"]')?.getAttribute('aria-checked') === 'false',
    null,
    { timeout: 8000 }
  );
  ok('cycle tracking: hidden by default, surfaced by the opt-in, records and direct URL untouched');
} catch (e) { fail('cycle tracking opt-in', e); }

try {
  /* Way in two: an active testosterone episode, which is the body the log
     is for, asking nothing of preferences. The regimen screen links the
     log while the episode runs, and stops again once it is ended - cycle
     cessation belongs to the timeline that caused it. */
  await fresh('/settings/regimen');
  await page.click('[data-add]');
  await page.click('[data-own]');
  await page.waitForSelector('#regimen-drug');
  await page.fill('#regimen-drug', 'Testosterone cypionate');
  await page.fill('#regimen-dose', '100');
  await page.fill('#regimen-dose-unit', 'mg');
  await page.fill('#regimen-route', 'im');
  await page.fill('#regimen-interval', 'weekly');
  await page.click('[data-save-regimen]');
  await page.waitForSelector('[data-cycle-events-link]', { timeout: 8000 });

  await page.goto(BASE + '/more', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-list-row="cycle-events"]', { timeout: 8000 });

  // End the episode the way the concurrent-episodes flow does: an end date
  // of yesterday, so it stops being active today, saved from the editor.
  const daysAgoIso = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  await page.goto(BASE + '/settings/regimen', { waitUntil: 'networkidle' });
  await page.locator('[data-episode]', { hasText: 'Testosterone' }).first().click(); // text-under-test: the drug I just typed
  await page.waitForSelector('#regimen-end');
  await fillDate(page, '#regimen-end', daysAgoIso(1));
  await page.click('[data-save-regimen]');
  await page.waitForFunction(() => !document.querySelector('[data-cycle-events-link]'), null, { timeout: 8000 });

  await page.goto(BASE + '/more', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('[data-list-row="cycle-events"]'), null, { timeout: 8000 });
  ok('cycle tracking: an active testosterone episode surfaces it, and ending that episode withdraws it again');
} catch (e) { fail('cycle tracking testosterone', e); }


try {
  /* The personal effects onset nudge (phase 5 ticket 49).
     Absent on a fresh journal with no regimen. Once an active regimen
     episode with a literature onset window is added, opening the fan shows
     the effects row; tapping it navigates to /settings/effects and closes
     the fan. When the anchor is moved past the onset window (>12 months),
     the row is absent again. */
  const localIso = (daysAgo = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  await openQuickAdd();
  if ((await page.locator('[data-choose="effects"]').count()) > 0) {
    throw new Error('effects row was present with no regimen logged');
  }
  await page.locator('[data-quick-add]').click();

  // Add an active estradiol regimen episode starting today
  await page.goto(BASE + '/settings/regimen', { waitUntil: 'networkidle' });
  await page.click('[data-add]');
  await page.click('[data-own]');
  await page.waitForSelector('#regimen-drug');
  await page.fill('#regimen-drug', 'Estradiol valerate');
  await page.fill('#regimen-dose', '4');
  await page.fill('#regimen-dose-unit', 'mg');
  await page.fill('#regimen-route', 'oral');
  await page.fill('#regimen-interval', 'daily');
  await page.click('[data-save-regimen]');
  await page.waitForSelector('[data-episode]', { timeout: 8000 });

  // Now Quick Add should show the effects row
  await page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
  await page.locator('[data-nav-fab]').click();
  await page.waitForSelector('[data-choose="effects"]', { timeout: 8000 });
  await page.locator('[data-choose="effects"]').click();
  await page.waitForFunction(() => window.location.pathname === '/settings/effects', null, { timeout: 8000 });
  if ((await page.locator('[data-fan]').count()) > 0) {
    throw new Error('the fan remained open after tapping effects');
  }

  // Move the anchor episode to 400 days ago (>12 months)
  await page.goto(BASE + '/settings/regimen', { waitUntil: 'networkidle' });
  await page.locator('[data-episode]').first().click();
  await page.waitForSelector('#regimen-start');
  await fillDate(page, '#regimen-start', localIso(400));
  await page.click('[data-save-regimen]');
  await page.waitForTimeout(500);

  // Now Quick Add should no longer show the effects row
  await page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
  await page.locator('[data-nav-fab]').click();
  await page.waitForSelector('[data-fan-target="mood-3"]');
  if ((await page.locator('[data-choose="effects"]').count()) > 0) {
    throw new Error('effects row was still present after onset window had passed');
  }
  await page.locator('[data-quick-add]').click();

  ok('quick add: personal effects nudge appears only during onset window and navigates to /settings/effects');
} catch (e) { fail('quick add effects nudge', e); }



try {
  /* The wear session is the one target that reads the journal before it
     draws itself, because it is two things: nothing running, so this
     starts; something running, so this stops it. Both resolve in place, and
     the whole point of it being here is that a session started late is a
     session recorded wrong - so this checks it never leaves the screen, and
     that the row comes back saying the other thing. */
  await openQuickAdd('/stats');
  const startLabel = (await page.locator('[data-choose="wear"]').textContent()).trim();
  if (await page.locator('[data-choose="wear"][data-wear-running]').count()) {
    throw new Error('a session was already running on a fresh journal');
  }
  await page.locator('[data-choose="wear"]').click();
  await page.waitForSelector('[data-fan-flight]', { timeout: 8000 });
  if (!page.url().includes('/stats')) throw new Error(`starting a session left for ${page.url()}`);

  await page.locator('[data-nav-fab]').click();
  await page.waitForSelector('[data-choose="wear"][data-wear-running]', { timeout: 8000 });
  const stopLabel = (await page.locator('[data-choose="wear"]').textContent()).trim();
  if (stopLabel === startLabel) throw new Error(`the row still says "${stopLabel}" with a session running`);
  await page.locator('[data-choose="wear"]').click();
  await page.waitForSelector('[data-fan-flight]', { timeout: 8000 });

  await page.goto(BASE + '/settings/wear', { waitUntil: 'networkidle' });
  await booted();
  /* [data-skeleton] used to match nothing - Skeleton.svelte only ever wrote
     `class="skeleton"` - so this wait was a no-op from its first tick
     (ticket 01). Skeleton.svelte now stamps data-skeleton on its own root,
     chosen over pointing this wait at something wear-log-specific because
     every other screen that shows a Skeleton while loading gets the same
     real wait for free. */
  await page.waitForFunction(() => !document.querySelector('[data-skeleton]'), null, { timeout: 8000 });
  if (!(await page.getByRole('heading', { level: 1 }).count())) throw new Error('the wear log did not render');
  ok('quick add: a wear session starts and stops in place, and the row says which');
} catch (e) { fail('quick add wear session', e); }

try {
  await fresh('/');
  await slideToTarget('[data-choose="another-day"]');
  await page.waitForSelector('#backdate');
  ok('quick add: pressing and sliding onto a row runs it, with no second tap');
} catch (e) { fail('quick add slide to a row', e); }

try {
  await fresh('/');
  await slideToTarget('[data-fan-target="mood-2"]');
  await page.waitForSelector('#ed-note');
  await page.waitForSelector('[data-mood="2"][aria-checked="true"]');
  ok('quick add: the slide crosses the mood row too, and picks off it');
} catch (e) { fail('quick add slide to a mood', e); }

try {
  /* Letting go over the button itself chooses nothing, which is what makes
     one rule serve both gestures: the fan stays up to be tapped. */
  await fresh('/');
  const fab = await page.locator('[data-nav-fab]').boundingBox();
  await page.mouse.move(fab.x + fab.width / 2, fab.y + fab.height / 2);
  await page.mouse.down();
  await page.waitForSelector('[data-fan]');
  await page.mouse.up();
  await page.waitForTimeout(300);
  if (!(await page.locator('[data-fan-target="mood-3"]').count())) {
    throw new Error('releasing on the button chose something, or closed the fan');
  }
  ok('quick add: releasing without going anywhere leaves the fan up to tap');
} catch (e) { fail('quick add press without a slide', e); }

/* The shell's window insets (phase 5 ticket 18).

   A headless desktop Chromium reports every safe-area inset as 0, so
   env(safe-area-inset-*) can never exercise the defect here - which is why
   the shell reads --inset-* tokens the layout can be told to change. This
   flow sets them to a phone's numbers and then asserts against the real
   rendered geometry rather than against the stylesheet: where content
   actually starts, and where the bar actually ends.

   The device check the acceptance list asks for is a separate thing and
   this does not stand in for it. What this catches is a regression - a
   screen or a control that stops consuming the insets, on every run,
   without anyone plugging a phone in. */
const CUTOUT = { top: 48, right: 0, bottom: 24, left: 0 };

async function withSimulatedInsets(fn) {
  await page.evaluate((cutout) => {
    for (const [side, px] of Object.entries(cutout)) {
      document.documentElement.style.setProperty(`--inset-${side}`, `${px}px`);
    }
  }, CUTOUT);
  try {
    return await fn();
  } finally {
    await page.evaluate(() => {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        document.documentElement.style.removeProperty(`--inset-${side}`);
      }
    });
  }
}

/* Every measurement below is taken against the app frame, never against the
   window. The two are not the same thing here: this suite runs the demo
   build, whose review bar sits above the app and pushes it down the page, so
   a check written as "content starts at least 48px down" passes on the bar's
   own height while the inset it claims to be testing is ignored. That is not
   a hypothetical - it is what the first version of these four checks did,
   and three of them passed that way. */
async function appFrame() {
  return page.evaluate(() => {
    const { top, bottom } = document.querySelector('[data-app-root]').getBoundingClientRect();
    return { top, bottom };
  });
}

try {
  await fresh('/more');
  await withSimulatedInsets(async () => {
    const app = await appFrame();
    /* The hub's own first content, not a wrapper's padding: whatever a
       screen is built from has to start below the cutout. */
    const contentTop = await page
      .getByRole('heading', { level: 2 })
      .first()
      .evaluate((node) => node.getBoundingClientRect().top);
    const safeFrom = app.top + CUTOUT.top;
    if (contentTop < safeFrom) {
      throw new Error(`More hub content starts ${safeFrom - contentTop}px inside a ${CUTOUT.top}px cutout`);
    }
    ok('a screen renders clear of the top inset');
  });
} catch (e) { fail('top inset clears content', e); }

try {
  await fresh('/more');
  await withSimulatedInsets(async () => {
    const app = await appFrame();
    const barBottom = await page
      .locator('[data-app-nav]')
      .evaluate((node) => node.getBoundingClientRect().bottom);
    const safeTo = app.bottom - CUTOUT.bottom;
    if (barBottom > safeTo) {
      throw new Error(`the bar ends ${barBottom - safeTo}px inside the ${CUTOUT.bottom}px bottom inset`);
    }
    ok('the bar floats clear of the bottom inset');
  });
} catch (e) { fail('bottom inset clears the bar', e); }

try {
  await fresh('/more');
  await withSimulatedInsets(async () => {
    /* The scroll region reserves the bar's whole footprint, so the last
       thing on a screen is reachable rather than sitting under it. Measured
       after scrolling to the end, because padding being declared is not the
       same claim as content clearing. */
    const lastRowBottom = await page.evaluate(async () => {
      const main = document.querySelector('[data-app-scroll-region]');
      main.scrollTop = main.scrollHeight;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      /* Phase 5 ticket 24: the hub's rows are ListRow now, whose own handle
         is data-list-row rather than a hub-specific attribute. */
      const rows = document.querySelectorAll('[data-list-row]');
      return rows[rows.length - 1].getBoundingClientRect().bottom;
    });
    const barTop = await page
      .locator('[data-app-nav]')
      .evaluate((node) => node.getBoundingClientRect().top);
    if (lastRowBottom > barTop) {
      throw new Error(`the last row ends ${lastRowBottom - barTop}px under the bar`);
    }
    ok('scrolled to the end, the last row still clears the bar');
  });
} catch (e) { fail('bar clearance survives a full scroll', e); }

try {
  await fresh('/');
  await withSimulatedInsets(async () => {
    const app = await appFrame();
    /* Home's flag sun is the one deliberate bleed, and it is worth its own
       check: if it ever stopped crossing the inset, the sun's centre would
       drift off the window corner and every ring would show as more than a
       quarter. Decoration crosses the inset, the greeting under it does
       not. */
    const { headerTop, greetingTop } = await page.evaluate(() => ({
      headerTop: document.querySelector('[data-home-header]').getBoundingClientRect().top,
      greetingTop: document.querySelector('[data-home-hero]').getBoundingClientRect().top
    }));
    const safeFrom = app.top + CUTOUT.top;
    if (headerTop >= safeFrom) {
      throw new Error(`the flag sun's header stops ${headerTop - safeFrom}px short of the corner`);
    }
    if (greetingTop < safeFrom) {
      throw new Error(`the greeting sits ${safeFrom - greetingTop}px inside the cutout`);
    }
    ok('the flag sun bleeds into the inset and the greeting under it does not');
  });
} catch (e) { fail('Home bleeds decoration only', e); }

/* The one screen over the unprompted registry (phase 6 ticket 04, merged
   from two screens onto one by deepening ticket 09). This is a browser, so
   the notify column is the interesting half here: its switches are absent
   rather than shown and inert, since a browser cannot fire a scheduled
   notification while the app is closed - what the walkthrough can hold on
   web is that absence plus the screen still saying why. The Home column is
   not Android-only and keeps working, the same as when it was its own
   screen; its switches themselves are Android-and-web and are held by
   registry.test.ts and each producer's own test. */
try {
  await fresh('/settings');
  await page.locator('[data-list-row="notifications"]').click();
  await page.waitForSelector('[data-screen]');
  if ((await page.getByRole('heading', { level: 1 }).count()) === 0) {
    throw new Error('the merged screen rendered no heading');
  }
  if (await page.locator('[data-notification]').count()) {
    throw new Error('a notification toggle rendered on web, where it can never fire');
  }
  if (await page.locator('[data-quiet-hours]').count()) {
    throw new Error('quiet hours rendered on web, over notifications that cannot happen');
  }
  if (!(await page.locator('[data-notice-title]').count())) {
    throw new Error('the missing notify column explains nothing');
  }

  /* The Home column beside it, on the same screen, in the same load: its
     rows are what Home may show and are not Android-only. Not a
     hand-counted total: the registry's own claim is that a later ticket
     adds one array entry and no markup, and a number here would make that a
     walkthrough edit. registry.test.ts owns the list; what this holds is
     that the screen drew the registry rather than nothing. */
  const tiles = await page.locator('[data-live-tile]').count();
  if (tiles < 3) throw new Error('the Home column drew ' + tiles + ' rows');
  for (const key of ['wrapped', 'on-this-day', 'stock-notice']) {
    if (!(await page.locator(`[data-live-tile="${key}"]`).count())) {
      throw new Error(key + ' is missing from the Home column');
    }
  }

  ok('one screen over one registry: notify column absent on web, Home column still whole');
} catch (e) { fail('the unprompted registry view', e); }

/* The recovery key, made and removed from Settings (ADR-0054, ticket
   sec-01).

   Before the access-mode flow rather than after it, for that flow's own
   reason: it leaves the journal in PIN mode with no way back, so anything
   after it meets a gate instead of the app.

   What only a real browser can check here is the pair of facts the node
   tier cannot see: that minting reaches the live session's data key through
   journalDataKey() rather than finding nothing on a screen that was reached
   by a goto, and that the characters are on screen exactly once - leaving
   the shown state has to lose them, because nothing stores them. */
try {
  await fresh('/settings');
  await page.locator('a[href="/settings/security"]').click();
  await page.waitForSelector('[data-security-list]');

  const row = page.locator('[data-list-row="recovery-key"]');
  if (!(await row.count())) throw new Error('Security offers no recovery-key row');

  await page.locator('a[href="/settings/recovery-key"]').click();
  await page.waitForSelector('[data-make-recovery-key]');
  await page.locator('[data-make-recovery-key]').click();

  /* The key itself, gripped by its handle rather than by its copy
     (ADR-0029). Its shape is the assertion: five groups of five from the
     Crockford alphabet, which is what recoveryKey.ts guarantees and what
     somebody has to be able to read off the screen. */
  const shown = (await page.locator('[data-recovery-key]').innerText()).trim();
  if (!/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/.test(shown)) {
    throw new Error('the key on screen is not five groups of five: ' + shown);
  }
  if (!(await page.locator('[data-print-recovery-key]').count())) {
    throw new Error('the shown key offers no way to print it');
  }

  await page.locator('[data-recovery-key-done]').click();
  await page.waitForSelector('[data-list-row="remove-recovery-key"]');

  /* Shown once, and this is the half of that claim a browser can prove:
     acknowledging it leaves a screen with no key on it, and coming back to
     the screen fresh does not bring the characters back - the file holds a
     wrap and nothing else. */
  if (await page.locator('[data-recovery-key]').count()) {
    throw new Error('the key is still on screen after being acknowledged');
  }
  await page.locator('a[href="/settings/security"]').click();
  await page.waitForSelector('[data-security-list]');
  await page.locator('a[href="/settings/recovery-key"]').click();
  await page.waitForSelector('[data-list-row="remove-recovery-key"]');
  if (await page.locator('[data-recovery-key]').count()) {
    throw new Error('reopening the screen showed the key again');
  }

  /* Removing it, through the confirm the copy promises. The row going is
     the assertion, and the handle it asserts on is live until the click -
     the absence is checked against a screen that has redrawn, not against a
     handle that was deleted with the thing it named. */
  await page.locator('[data-list-row="remove-recovery-key"]').click();
  await page.waitForSelector('[data-confirm-revoke]');
  await page.locator('[data-confirm-revoke]').click();
  await page.waitForSelector('[data-make-recovery-key]');
  if (await page.locator('[data-list-row="remove-recovery-key"]').count()) {
    throw new Error('the removed key still offers a remove row');
  }

  ok('a recovery key is made once, shown once, and removed from Settings');
} catch (e) { fail('the recovery key', e); }

/* LAST. The access mode: changing it, and PIN mode's gate, throttle and the
   PIN that opens it (ticket 53, replacing ticket 17's app lock).

   Last on purpose, and it cannot be anywhere else. This flow leaves the
   journal in PIN mode, and there is no way back to where it started: coming
   back through the module means typing the demo build's own passphrase, which
   is four characters, and the module enforces the real eight-character floor.
   Refusing it is correct behaviour, so the flow ends here rather than asking
   the app to accept a passphrase no real setup screen would.

   Everything after a mode change would meet a gate instead of the app, which
   is exactly what happened when this sat at position 12: fifteen flows passed,
   this one changed the mode, and the remaining twenty-six timed out one after
   another with nothing to say for themselves.

   Passphrase, PIN and biometrics moved onto one screen in ticket 18, reached
   from a single Security row rather than being set up straight off /settings -
   so this flow goes through that row rather than assuming the switch is on
   the page it lands on. */
try {
  await fresh('/settings');
  await page.locator('a[href="/settings/security"]').click();
  await page.waitForSelector('[data-security-list]');

  /* Biometrics is Android-only (ticket 18) - a desktop browser has no
     platform prompt behind it, so the toggle must not exist here at all
     rather than sit there doing nothing. This is also as much of the
     consent-flow gating as this suite can reach: the ask itself lives
     behind AndroidKeyGate and SessionUnlock's `android` checks, which nothing
     in this browser tier can become true for. */
  if (await page.getByRole('switch', { name: 'Biometrics' }).count()) {
    throw new Error('a biometrics toggle rendered on a build with no Android platform behind it');
  }

  /* Changing access mode (ticket 53). The demo journal opens under a
     passphrase, so the module offers the other two and marks this one as
     current - which is also the assertion that it reads the mode off the
     keystore rather than tracking it separately. */
  await page.locator('a[href="/settings/access-mode"]').click();
  await page.waitForSelector('[data-access-modes]');
  if (await page.locator('[data-list-row="passphrase"]').count()) {
    throw new Error('the module offered the mode the journal is already on');
  }
  const currentLine = await page.locator('[data-access-current]').innerText();
  if (!/passphrase|hasło/i.test(currentLine)) throw new Error('the module names the wrong current mode: ' + currentLine);

  await page.locator('[data-list-row="pin"]').click();
  await page.waitForSelector('[data-access-chosen="pin"]');

  /* The consequence, before the PIN is typed rather than after. This is the
     honesty ADR-0041 made the condition of allowing four digits at all, so
     the walkthrough checks the sentence is actually on the screen. */
  const pinConsequence = await page.locator('[data-access-chosen="pin"]').innerText();
  /* Both halves of the claim, because either alone can be true while the
     screen is still dishonest: the size of the space, and how long walking
     it takes. The first draft of this check matched only the count. */
  if (!/10[ ,.]?000/.test(pinConsequence)) {
    throw new Error('the PIN screen does not state how many PINs there are: ' + pinConsequence);
  }
  if (!/five seconds|pięć sekund/.test(pinConsequence)) {
    throw new Error('the PIN screen does not state the wall-clock figure: ' + pinConsequence);
  }
  await page.waitForSelector('[data-access-export-note]');

  await typePin('1234');
  await typePin('1234');
  await page.waitForSelector('[data-security-list]');

  /* The retired gate's preference is gone rather than merely unread: a
     4-digit hash in plaintext beside the encrypted journal was an
     offline-guessable secret, and ticket 53 deletes the row (migration v43). */
  const bootMirror = await page.evaluate(() => JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}'));
  if ('pinHash' in bootMirror) throw new Error('the retired PIN hash is in the plaintext boot mirror');

  /* A cold start, not a navigation: the PIN gate has to be what renders once
     boot surveys the keystore and finds it says `pin`. The demo build's own
     passphrase must not open it any more - that is the rewrap having happened
     rather than a second keystore appearing beside the first.

     Not booted() from here down. The retired app-lock gate rendered *after*
     boot reached `ready`, so waiting for the app and then finding a gate over
     it was the right shape. A PIN is an access mode now, so its gate is a
     boot state: `ready` is exactly what does not happen until the PIN is
     right, and booted() would sit here for its full 30 seconds. Wait for the
     pad. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-pin-pad]');
  if (await page.locator('[data-home-hello]').count()) throw new Error('Home rendered behind the gate');

  await typePin('9999');
  await page.waitForSelector('[data-pin-status="wrong"]');
  await typePin('9999');
  await page.waitForSelector('[data-pin-status="throttled"]');
  if (await page.locator('[data-key="1"]:not([disabled])').count()) {
    throw new Error('pad still accepting attempts during the wait');
  }

  await page.waitForSelector('[data-key="1"]:not([disabled])', { timeout: 8000 });

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
  await page.waitForSelector('[data-pin-status="throttled"]');

  await page.evaluate(() => localStorage.removeItem('gender-diary-pin-attempts'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-pin-pad]');
  await typePin('1234');
  /* The right PIN is what makes boot finish, so this is the one place in the
     flow where waiting for the app is the assertion. */
  await booted();
  await page.waitForSelector('[data-home-hello]');

  /* The mode reads back off the keystore from the other side too: PIN is
     current now, so the module must have stopped offering it and must say so.
     This is the last thing the suite does, so the journal is left in PIN mode
     deliberately - see the note at the top of this flow. */
  await page.locator('[data-nav-item="settings"]').click();
  await page.locator('a[href="/settings"]').click();
  await page.locator('a[href="/settings/security"]').click();
  if (!/PIN/i.test(await page.locator('[data-list-row="access-mode"]').innerText())) {
    throw new Error('the security row does not name PIN as the mode');
  }
  await page.locator('a[href="/settings/access-mode"]').click();
  await page.waitForSelector('[data-access-modes]');
  if (await page.locator('[data-list-row="pin"]').count()) {
    throw new Error('the module still offered PIN while the journal was in PIN mode');
  }
  const nowLine = await page.locator('[data-access-current]').innerText();
  if (!/PIN/i.test(nowLine)) throw new Error('the module does not name PIN as current: ' + nowLine);

  /* And the change-my-PIN row is the one that appears in PIN mode, where the
     passphrase row appeared before. */
  if (!(await page.locator('[data-list-row="change-pin"]').count())) {
    throw new Error('PIN mode offers no way to change the PIN');
  }

  ok('the access mode changes, PIN gates a cold start, throttles wrong PINs and opens on the right one');
} catch (e) { fail('access mode', e); }

/* AFTER LAST. A recovery key used for what it is for (ADR-0054, ticket
   sec-02), which can only be checked here and in this order.

   Every part of this needs state the flow above leaves behind: the journal
   is in PIN mode with a known PIN, which is what makes a reload land on a
   gate instead of the app. `fresh()` only clears localStorage - it does not
   reseed the journal or the keystore - so a mode change persists across
   flows and this is the one place a gate is reachable at all.

   The chain: mint a key while the journal is open, meet the PIN gate, get
   in with the written key instead of the PIN, land on the forced
   access-mode module, choose device-bound from it, then destroy the local
   key device-bound mode depends on and come back through the dead-end
   screen with the same key. That last state is the one the ticket exists
   for - a browser that threw away its key - and it is the only screen in
   the app that used to have nothing on it but a reset. */
try {
  /* No fresh() here, and that is the first thing this flow taught: fresh()
     ends in booted(), and the journal this one inherits is in PIN mode, so a
     load lands on the pad and booted() never resolves. The flow hung on its
     own first line and reported it as an anonymous 30s timeout. Getting in
     with the PIN is the prerequisite rather than the subject here - the
     subject is getting in without it, twice, further down. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-pin-pad]');
  await typePin('1234');
  await booted();
  await page.waitForSelector('[data-home-hello]');

  await page.locator('[data-nav-item="settings"]').click();
  await page.locator('a[href="/settings"]').click();
  await page.locator('a[href="/settings/security"]').click();
  await page.waitForSelector('[data-security-list]');
  await page.locator('a[href="/settings/recovery-key"]').click();
  await page.waitForSelector('[data-make-recovery-key]');
  await page.locator('[data-make-recovery-key]').click();
  const written = (await page.locator('[data-recovery-key]').innerText()).trim();
  await page.locator('[data-recovery-key-done]').click();
  await page.waitForSelector('[data-list-row="remove-recovery-key"]');

  /* Back to Home before the reload, so the route waiting behind the gate is
     Home rather than the screen the key was minted on - what this checks
     after the recovery is that the app came back, and Home is the least
     ambiguous evidence of that.

     Clicked rather than goto'd, which is the second thing this flow taught:
     a goto to a different path is a full document load, so it cold-boots
     the app and lands on the gate. Two steps here were written with goto
     and both waited 30 seconds for a screen that was sitting behind a PIN
     pad. */
  await page.locator('[data-nav-item="home"]').click();
  await page.waitForSelector('[data-home-hello]');

  /* The gate the flow above left the journal behind: PIN mode, so a cold
     load asks for four digits. The written key is offered here because one
     exists, and it was not offered before this flow minted one. */
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-pin-pad]');
  if (!(await page.locator('[data-use-recovery-key]').count())) {
    throw new Error('the PIN gate offered no way to use a recovery key');
  }
  await page.locator('[data-use-recovery-key]').click();
  await page.waitForSelector('[data-recovery-key-input]');

  /* A typo first, because the two failures are the point: this one has to
     come back as "check what you typed" and leave the field usable, not as
     a key that belongs to another journal. */
  await page.fill('[data-recovery-key-input]', written.slice(0, -1) + (written.endsWith('0') ? '1' : '0'));
  await page.locator('[data-submit-recovery-key]').click();
  const mistyped = await page.locator('[data-recovery-key-error]').innerText();
  if (mistyped.trim() === '') throw new Error('a mistyped recovery key said nothing');
  if (!(await page.locator('[data-recovery-key-input]').count())) {
    throw new Error('a mistyped key left no field to correct');
  }

  await page.fill('[data-recovery-key-input]', written);
  await page.locator('[data-submit-recovery-key]').click();

  /* Not Home. A recovery unlock owes a new access mode first, with no way
     past - the PIN it just got in without is still the journal's only other
     door. */
  await page.waitForSelector('[data-post-recovery-setup]');
  await booted();
  if (await page.locator('[data-home-hello]').count()) {
    throw new Error('a recovery unlock reached Home without choosing an access mode');
  }

  /* Device-bound from the forced module, which is the mode this browser can
     move to. The offer to make a recovery key must NOT appear after it:
     this journal has one, and offering a second would be the screen failing
     to read the file it was written from. */
  await page.locator('[data-access-modes] [data-list-row="device-bound"]').click();
  await page.locator('[data-access-submit]').click();
  await page.waitForSelector('[data-home-hello]');
  if (await page.locator('[data-recovery-offer]').count()) {
    throw new Error('the device-bound offer appeared on a journal that already has a recovery key');
  }

  /* The cliff itself - a browser that threw its local key away - is where
     this flow stopped, and it stops on purpose rather than for want of
     trying. Deleting the device-key slot and reloading does reach the
     dead-end screen in a real build; in a demo build it does not, because a
     keystore-less journal is what the demo boot path treats as a first run,
     so it mints its own passphrase keystore and the reload lands on the
     passphrase gate instead. Driving the app past that would mean teaching
     the demo path about a state only this test wants.

     What covers that screen instead: its two states are shot in the gates
     gallery (`device-recovery-with-key` beside `device-recovery`), against a
     real recovery wrap rather than a prop, and the condition behind them is
     one read of `recoveryKeyExists`, which the node tier owns. What only a
     real gate could prove - that a written key opens a journal whose secret
     is gone, and that the app then refuses to go anywhere until a new one is
     set - is what the steps above are. */

  ok('a written key opens a journal whose PIN is gone, is refused when mistyped, and owes a new access mode before the app comes back');
} catch (e) { fail('the recovery key at the gate', e); }

if (errors.length) fail('no uncaught page errors', errors.slice(0, 6).join('; '));

const failures = finish('ALL FLOWS PASS');
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
