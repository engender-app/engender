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
import { createReporter, launchChromium, fillDate } from './browser-harness.mjs';
import { makePdf, makeUnreadablePdf } from './pdf-fixture.mjs';
import { tinyPhoto } from './photo-fixture.mjs';

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

/* The entry written last, found on the day view rather than on Home: Home
   draws no entries since redesign ticket 13, and the day view lists every
   one of today's. Ids are minted in order (ADR-0002), so the largest is the
   newest whatever order the list draws them in. */
async function openNewestEntry() {
  await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-entry-card]');
  const hrefs = await page.locator('[data-entry-card]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
  const ids = hrefs.map((h) => Number(/\/entry\/(\d+)/.exec(h ?? '')?.[1])).filter(Number.isFinite);
  if (!ids.length) throw new Error('no entry link on the day view');
  await page.goto(BASE + `/entry/${Math.max(...ids)}`, { waitUntil: 'networkidle' });
  await booted();
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
  /* The entries are counted on the Journal door, which is where they draw
     since redesign tickets 10 and 13; Home's mood pick is one shape of its
     log strip and still one tap from landing. */
  await fresh('/calendar');
  await page.waitForSelector('[data-entry-card]');
  const beforeCards = await page.locator('[data-entry-card]').count();
  await page.locator('[data-nav-item="home"]').first().click();
  await page.waitForSelector('[data-home-log] [data-mood="4"]');
  await page.locator('[data-home-log] [data-mood="4"]').click();
  await page.waitForSelector('#ed-note');
  await page.waitForSelector('[data-mood="4"][aria-checked="true"]');
  await page.locator('[data-screen-back]').click();
  await page.waitForSelector('[data-home-log]');
  await page.locator('[data-nav-item="calendar"]').first().click();
  await page.waitForSelector('[data-entry-card]');
  const afterCards = await page.locator('[data-entry-card]').count();
  if (afterCards !== beforeCards) throw new Error(`entry count changed: ${beforeCards} -> ${afterCards}`);
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
  /* The save lands on Today, which draws no entries since redesign ticket
     13; the day view is where today's are read back. */
  await page.waitForSelector('[data-home-log]');
  await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-entry-note]');
  const notes = await page.locator('[data-entry-card] [data-entry-note]').allTextContents();
  if (!notes.some((note) => note.includes('Playwright'))) throw new Error('new entry not on today');
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

/* 4. calendar → open the month → day → add another. The Journal door opens
      on the month folded to a strip (redesign ticket 10), whose cells are
      not links: 7px is not a tap target. So the flow starts by opening it,
      which is also the check that the control does. */
try {
  await fresh('/calendar');
  await page.locator('[data-cal-open]').click();
  await page.waitForSelector('[data-hm-cell-filled]');
  await page.locator('[data-hm-cell-filled]').first().click();
  await page.waitForSelector('[data-entry-card]');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#ed-note');
  ok('calendar → open the month → day detail → add another');
} catch (e) { fail('calendar flow', e); }

/* 4a. And the month closes again, with the metric picker working in both
       states. The strip and the grid are one set of cells in two layouts, so
       what says which state the screen is in is the grid's own class and the
       control's aria-expanded - and what says the picker still works is the
       month recolouring under a different metric while folded. */
try {
  await fresh('/calendar');
  const compact = () => page.evaluate(() => !!document.querySelector('[data-cal-month-state="strip"]'));
  if (!(await compact())) throw new Error('the month did not open folded to a strip');
  const options = await page.locator('#calendar-metric option').evaluateAll((els) => els.map((e) => e.value));
  const other = options.find((v) => v !== 'mood');
  if (!other) throw new Error('the metric picker offered nothing but mood');
  await page.selectOption('#calendar-metric', other);
  await page.waitForFunction(
    (want) => document.getElementById('calendar-metric')?.value === want,
    other
  );
  if (!(await compact())) throw new Error('picking a metric opened the month');

  await page.locator('[data-cal-open]').click();
  await page.waitForSelector('[data-cal-month-state="grid"]');
  if ((await page.locator('[data-cal-open]').getAttribute('aria-expanded')) !== 'true') {
    throw new Error('the control did not say the month was open');
  }
  await page.selectOption('#calendar-metric', 'mood');
  await page.waitForFunction(() => document.getElementById('calendar-metric')?.value === 'mood');
  if (await compact()) throw new Error('picking a metric closed the month');

  await page.locator('[data-cal-open]').click();
  await page.waitForSelector('[data-cal-month-state="strip"]');
  ok('the month opens and closes, and the metric picker works in both states');
} catch (e) { fail('the month expansion', e); }

/* 4b. What the Journal door leads with: the entries, uncapped, and the week
       strip under them. Both moved here off Home (redesign ticket 10). */
try {
  await fresh('/calendar');
  await page.waitForSelector('[data-day-card]');
  const days = await page.locator('[data-day-card]').count();
  if (days < 2) throw new Error(`the door drew ${days} day(s) of entries`);
  await page.waitForSelector('[data-week-strip]');
  await page.waitForSelector('[data-entry-card]');
  ok('the Journal door leads with the entries and carries the week strip');
} catch (e) { fail('the Journal door blocks', e); }

/* Today faces forward (phase 10 redesign ticket 13; ADR-0067, ADR-0073,
   ADR-0074). The dated things lead, the mood pick is one write shape of
   the log strip, the pinned rows draw with their readings, and each
   section that left this screen is reachable on the door that hosts it.
   An appointment three days out is written first, since the demo persona's
   own dated things all fall past the agenda's week. Early in the walk, while
   the journal is still the persona's: later flows finish areas and change
   modes, and this one is about the screen, not about their leftovers. */
try {
  const AGENDA_KIND = 'agenda-13';
  await fresh('/health/appointments');
  await page.click('[data-add]');
  await page.waitForSelector('#appointment-kind');
  const inThreeDays = new Date();
  inThreeDays.setDate(inThreeDays.getDate() + 3);
  await page.$eval('#appointment-date', (input, value) => input._flatpickr.setDate(value, true), inThreeDays.toISOString().slice(0, 10));
  await page.fill('#appointment-kind', AGENDA_KIND);
  await page.click('[data-save-appointment]');
  await page.waitForSelector('[data-appointment]:has-text("agenda-13")', { timeout: 8000 }); // text-under-test

  /* The agenda leads. The appointment is a row of it, its own screen is
     one tap away, and the whole band sits above the log strip - which is
     the ticket's one sentence: what is coming before how you feel. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-home-agenda]');
  await page.waitForSelector('[data-agenda-item="appointment"]');
  const order = await page.evaluate(() => ({
    agenda: document.querySelector('[data-home-agenda]').getBoundingClientRect().top,
    log: document.querySelector('[data-home-log]').getBoundingClientRect().top,
    moods: document.querySelector('[data-mood-chips]').getBoundingClientRect().top
  }));
  if (!(order.agenda < order.log && order.log <= order.moods)) {
    throw new Error('the agenda does not lead the log strip: ' + JSON.stringify(order));
  }
  if ((await page.locator('[data-home-log-shape]').count()) !== 4) {
    throw new Error('the log strip does not carry the four write shapes beside the mood pick');
  }
  await page.locator('[data-agenda-item="appointment"]').first().click();
  await page.waitForURL('**/health/appointments');

  /* A mood from the strip is still one tap from landing, and lands in the
     editor the way it always did. */
  await fresh('/');
  await page.locator('[data-home-log] [data-mood="4"]').click();
  await page.waitForSelector('[data-mood="4"][aria-checked="true"]');
  await page.locator('[data-screen-back]').click();
  await page.waitForSelector('[data-home-log]');

  /* A tally from the strip resolves in place: the save toast is what says
     the write came back, and Home is still Home. */
  await page.locator('[data-home-log-shape="tally-misgendered"]').click();
  await page.waitForSelector('[data-toast]');
  if (new URL(page.url()).pathname !== '/') throw new Error('a tally from the strip left Home: ' + page.url());

  /* The pinned rows: the default set resolves for a journal that never
     answered onboarding's question, each row opens its own screen, and the
     row reads the same line the Transition door gives it. */
  await page.waitForSelector('[data-pinned-row]');
  const pinnedRows = await page.locator('[data-pinned-row]').evaluateAll((nodes) =>
    nodes.map((n) => ({ key: n.getAttribute('data-pinned-row'), line: n.getAttribute('data-hub-line'), href: n.getAttribute('href') }))
  );
  if (pinnedRows.length < 1 || pinnedRows.some((row) => !row.href || !row.line)) {
    throw new Error('a pinned row has no screen or no line: ' + JSON.stringify(pinnedRows));
  }
  await page.locator('[data-pinned-row]').first().click();
  await page.waitForURL('**' + pinnedRows[0].href);

  /* Nothing that left is unreachable, route by route: the week strip and
     the entries on the Journal door, the timeline from the Look back door,
     the milestones list from the Transition door. */
  await fresh('/calendar');
  await page.waitForSelector('[data-week-strip]');
  await page.waitForSelector('[data-entry-card]');
  await fresh('/stats');
  await page.locator('[data-list-row="timeline"]').click();
  await page.waitForURL('**/timeline');
  await fresh('/more');
  await page.locator('[data-list-row="milestones"]').click();
  await page.waitForURL('**/transition/milestones');

  /* Under disguise: no agenda and no sun, and every control left on the
     screen still works - asserted on the log strip that replaces the band
     rather than on a handle that is gone. */
  await fresh('/settings');
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'Notes', null, { timeout: 8000 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-home-log]');
  await page.waitForSelector('[data-pinned-row]');
  if (await page.locator('[data-home-agenda]').count()) throw new Error('the agenda drew under disguise');
  if (await page.locator('[data-flag-sun]').count()) throw new Error('the sun drew under disguise');
  await page.locator('[data-home-log-shape="dose"]').click();
  await page.waitForURL('**/doses**');
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await page.getByRole('button', { name: /Disguise/i }).click();
  await page.getByRole('switch', { name: 'Disguise app' }).click();
  await page.waitForFunction(() => document.title === 'enGender', null, { timeout: 8000 });
  await page.keyboard.press('Escape');

  /* The appointment this flow wrote goes with it. */
  await fresh('/health/appointments');
  await page.locator('[data-appointment]', { hasText: AGENDA_KIND }).click(); // text-under-test
  await page.waitForSelector('[data-delete-appointment]');
  await page.click('[data-delete-appointment]');
  await page.click('[data-confirm-delete-appointment]');
  await page.waitForSelector('[data-appointment]:has-text("agenda-13")', { state: 'detached', timeout: 8000 }); // text-under-test
  ok('today faces forward: the agenda leads, a row opens its screen, the strip logs a mood and a tally, the pins resolve, nothing that left is unreachable, and disguise keeps the strip');
} catch (e) { fail('today faces forward', e); }

/* Editing Today (phase 10 redesign ticket 14; ADR-0073, ADR-0067,
   ADR-0043). The last row of the pinned block opens the edit mode, a row
   is added from the registry, moved with the keyboard, kept across a
   reload, and the reset puts the default set and the five switches back.
   Right after the flow that reads the pinned rows, and for the same
   reason: this is about the screen while the journal is still the
   persona's. */
try {
  await fresh('/');
  await page.waitForSelector('[data-edit-today]');
  await page.locator('[data-edit-today]').click();
  await page.waitForSelector('[data-today-editor]');

  /* A bad-hour row is pinnable and off until asked for: the counterevidence
     check is in the add list, not on the front page. */
  if (await page.locator('[data-pinned-row="doubt"]').count()) {
    throw new Error('the counterevidence check is pinned before anybody asked for it');
  }
  /* And the cycle log is not offered cold - ADR-0043's gate is closed for a
     persona with no testosterone regimen and no opt-in. */
  if (await page.locator('[data-edit-add="cycle-events"]').count()) {
    throw new Error('the add list offered the cycle log with its own gate shut');
  }

  await page.locator('[data-edit-add="doubt"]').click();
  await page.waitForSelector('[data-edit-pinned-row="doubt"]');
  const addedLast = await page.locator('[data-edit-pinned-row]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-edit-pinned-row'))
  );
  if (addedLast[addedLast.length - 1] !== 'doubt') {
    throw new Error('a row added did not land at the end: ' + JSON.stringify(addedLast));
  }

  /* The drag's keyboard equivalent: one place up per press, and the handle
     keeps the focus so a second press moves the same row again. */
  await page.locator('[data-edit-grip="doubt"]').focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => {
    const keys = [...document.querySelectorAll('[data-edit-pinned-row]')].map((n) => n.getAttribute('data-edit-pinned-row'));
    return keys[keys.length - 2] === 'doubt';
  }, null, { timeout: 8000 });

  /* A kind switched off stays off, which is the whole reason it is a switch
     rather than a dismissal. */
  await page.locator('[data-edit-kind="doseSlot"] [role="switch"]').click();
  await page.waitForSelector('[data-edit-kind="doseSlot"] [role="switch"][aria-checked="false"]');

  await page.locator('[data-edit-done]').click();
  await page.waitForSelector('[data-pinned-row="doubt"]');

  /* It survives a reload, which is the stronger half of the ticket's
     "survives a reload and a lock". A reload re-opens the journal and
     reads the preference back; the lock does not - `lockNow`
     (stores/lock.svelte.ts) clears one flag and the same mounted app comes
     back with the same store behind it, so a lock has nothing to lose.
     Flow 18 is where the gate itself is exercised. */
  await page.reload({ waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-pinned-row="doubt"]');
  const afterReload = await page.locator('[data-pinned-row]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-pinned-row'))
  );
  if (afterReload[afterReload.length - 2] !== 'doubt') {
    throw new Error('the arrangement did not survive a reload: ' + JSON.stringify(afterReload));
  }

  /* Removing takes it off the front page, and the reset puts the default
     set and the switches back - one edit mode, one reset. */
  await page.locator('[data-edit-today]').click();
  await page.waitForSelector('[data-today-editor]');
  /* The switch is still off after the reload, which is the difference
     between a switch and a dismissal. */
  await page.waitForSelector('[data-edit-kind="doseSlot"] [role="switch"][aria-checked="false"]');
  await page.locator('[data-edit-unpin="doubt"]').click();
  await page.waitForSelector('[data-edit-pinned-row="doubt"]', { state: 'detached', timeout: 8000 });
  await page.locator('[data-edit-reset]').click();
  /* The one write on this surface that is behind a question, because it is
     the one that throws away work somebody did. */
  await page.waitForSelector('[data-confirm-edit-reset]');
  await page.locator('[data-confirm-edit-reset]').click();
  await page.waitForSelector('[data-edit-kind="doseSlot"] [role="switch"][aria-checked="true"]');
  await page.locator('[data-edit-done]').click();
  await page.waitForSelector('[data-pinned-row]');
  if (await page.locator('[data-pinned-row="doubt"]').count()) {
    throw new Error('the reset left a row the default set does not hold');
  }
  ok('editing Today: the last row opens the edit mode, a row is added, moved with the keyboard and kept across a reload, and the reset restores the default set and the switches');
} catch (e) { fail('editing Today', e); }

/* 4c. day detail keeps entries separate and shows no day average */
try {
  await fresh('/entry/new/today');
  await page.locator('[data-mood="2"]').click();
  await page.locator('#ed-note').fill('Day detail proof A');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-log]');

  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-mood="5"]').click();
  await page.locator('#ed-note').fill('Day detail proof B');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-log]');

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

/* 4c. a margin note: added, rendered as a layer, edited, deleted - and the
   entry's own note untouched by any of it (phase 8 features ticket 07).
   Grip handles only, per ADR-0029: data-margin-note-* rather than anything
   read off the rendered date or text. */
try {
  await fresh('/entry/new/today');
  await page.locator('[data-mood="3"]').click();
  await page.locator('#ed-note').fill('Margin note proof entry');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-log]');

  await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-margin-note-add]');
  /* Entries on a day are timestamp order, oldest first (entries.ts), and
     this one was just saved with the latest timestamp of any entry today's
     earlier flows may have left behind - so `.last()` is this entry,
     deterministically, whatever else `/day/today` is carrying. */
  const entryNoteBefore = await page.locator('[data-entry-note]').last().textContent();

  await page.locator('[data-margin-note-add]').last().click();
  await page.waitForSelector('[data-margin-note-input]');
  await page.locator('[data-margin-note-input]').fill('I know now what I did not then');
  await page.locator('[data-margin-note-save]').click();
  await page.waitForSelector('[data-margin-note]');
  const afterAdd = await page.locator('[data-margin-note]').first().textContent();
  if (!afterAdd?.includes('I know now what I did not then')) {
    throw new Error('the margin note did not render after being added');
  }
  if ((await page.locator('[data-entry-note]').last().textContent()) !== entryNoteBefore) {
    throw new Error("adding a margin note changed the entry's own note");
  }

  await page.locator('[data-margin-note-edit]').first().click();
  await page.waitForSelector('[data-margin-note-input]');
  await page.locator('[data-margin-note-input]').fill('corrected, on rereading');
  await page.locator('[data-margin-note-save]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-margin-note]')?.textContent?.includes('corrected, on rereading'),
    null,
    { timeout: 8000 }
  );
  if ((await page.locator('[data-entry-note]').last().textContent()) !== entryNoteBefore) {
    throw new Error("editing a margin note changed the entry's own note");
  }

  await page.locator('[data-margin-note-delete]').first().click();
  await page.waitForSelector('[data-confirm-delete-margin-note]');
  await page.locator('[data-confirm-delete-margin-note]').click();
  await page.waitForSelector('[data-margin-note]', { state: 'detached' });
  if ((await page.locator('[data-entry-note]').last().textContent()) !== entryNoteBefore) {
    throw new Error("deleting a margin note changed the entry's own note");
  }

  ok('a margin note is added, rendered as a layer, edited and deleted, and the entry stays byte-identical throughout');
} catch (e) { fail('margin note', e); }

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
  await page.waitForSelector('[data-home-log]');

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
  if (href !== '/transition/milestones') throw new Error(`a milestone hit went to ${href}`);
  /* The ticket's own condition: a hit says what kind of thing it is. Read as
     "the row states two things" rather than by gripping the kit's own class
     or the label's wording (ADR-0029) - the excerpt on one line, the area it
     came from on the next. */
  const lines = (await milestoneHit.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error(`a hit did not say what kind of thing it is: ${JSON.stringify(lines)}`);

  await page.locator('#q').fill('diagnostyka');
  await page.waitForSelector('[data-search-hit="labResults"]');

  /* A word in no record at all still says so, rather than showing the
     entries' empty state over hits from somewhere else. The wait covers the
     search debounce (ticket 15) on top of the round trip a fixed wait always
     had to cover here - there is no result to wait for, only its absence. */
  await page.locator('#q').fill('pierogi');
  await page.waitForTimeout(600);
  if (await page.locator('[data-search-hit]').count()) throw new Error('a word in no record still returned hits');

  ok('search reaches records outside entries, and every hit says its kind and where it goes');
} catch (e) { fail('search reaches past entries', e); }

/* 5d. search waits for the typist (phase 8 audit ticket 15).

   Ten keystrokes firing one search rather than ten is proved by counting
   closure runs (tests/browser-tier/live-reads-probe.svelte.ts) - nothing a
   walkthrough drives from outside the page can count that. What this proves
   instead is what a person actually sees: a query typed key by key still
   lands once typing stops, `pressSequentially` rather than `fill` because
   `fill` sets the whole value in one event and would exercise no wait at
   all. */
try {
  await fresh('/search');

  await page.locator('#q').pressSequentially('hopeful', { delay: 30 });
  await page.waitForSelector('[data-entry-card]');

  ok('a query typed key by key still lands once the typing stops');
} catch (e) { fail('search waits for the typist', e); }

/* 5e. clearing search does not wait out the debounce (phase 8 audit ticket 15). */
try {
  await fresh('/search');

  await page.locator('#q').fill('hopeful');
  await page.waitForSelector('[data-entry-card]');

  await page.locator('#q').fill('');
  // Well inside the 250ms debounce interval - clearing is the one case the
  // ticket says is not waited out, so the previous results have to be gone
  // long before a debounced run of an empty query ever could have answered.
  await page.waitForTimeout(80);
  if (await page.locator('[data-entry-card]').count()) throw new Error('clearing left the previous results on screen');
  if (!(await page.locator('[data-notice="search-idle"]').count())) throw new Error('clearing did not bring back the idle hint');

  ok('clearing the query clears the results well inside the debounce interval, not after it');
} catch (e) { fail('clearing search does not wait out the debounce', e); }

/* 5f. a saved question runs (phase 8 audit ticket 15's "same shape" screen).

   Regression cover for moving that screen's two closures off `question`
   itself onto a signature-memoized copy of it - the run-count claim about
   *why* is proved against the real journal in the browser tier
   (live-reads-probe.svelte.ts); what this proves is that the run still
   shows the entries a person searched for. */
try {
  await fresh('/search');
  await page.locator('#q').fill('hopeful');
  await page.waitForSelector('[data-entry-card]');

  await page.locator('[data-search-save]').click();
  await page.waitForSelector('[data-saved-question-save-confirm]');
  await page.locator('#saved-question-name').fill('ticket15 saved question');
  await page.locator('[data-saved-question-save-confirm]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });

  await page.locator('a[href="/search/questions"]').click();
  // text-under-test: the name is this test's own fixture data, not app copy.
  const row = page.locator('[data-saved-question]').filter({ hasText: 'ticket15 saved question' }); // text-under-test
  await row.waitFor();
  await row.click();
  await page.waitForSelector('[data-entry-card]');

  ok('a saved question runs and shows entries, the same read /search itself made');
} catch (e) { fail('saved question runs', e); }

/* 6. stats range + value list.

   The handles moved with ticket 23's rebuild: the period is the header's
   subtitle rather than half of its title, the values open from their own
   control instead of by pressing a chart, and a tag insight is a bar rather
   than a list row. The values control itself went in ticket 99 item 26;
   what it used to open is a hidden list now. Redesign ticket 11 replaced
   the segmented range with the span on the rail: the range is whatever the
   two handles bound, so the flow widens the span from the keyboard - ten
   steps back on the start handle - and reads the subtitle change with it. */
try {
  await fresh('/stats');
  await page.waitForSelector('[data-span-handle="start"]');
  const spanBefore = await page.locator('[data-screen-subtitle]').textContent();
  await page.locator('[data-span-handle="start"]').focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForFunction(
    (was) => document.querySelector('[data-screen-subtitle]')?.textContent !== was,
    spanBefore
  );
  const period = await page.locator('[data-screen-subtitle]').textContent();
  /* The subtitle carries the span's two dates and its length in days. */
  if (!/\d/.test(period ?? '')) throw new Error('the subtitle carries no span: ' + period);
  const spanStart = Number(await page.locator('[data-span-timeline]').getAttribute('data-span-start'));
  const spanEnd = Number(await page.locator('[data-span-timeline]').getAttribute('data-span-end'));
  if (!(spanEnd > spanStart)) throw new Error(`the span is not a span: ${spanStart}..${spanEnd}`);
  /* The charts re-read on the settled span a beat after the last key. */
  await page.waitForTimeout(600);
  /* The values are a visually hidden list on the screen itself since ticket
     99 item 26 removed the "All values" link and its sheet - no control to
     press, and the numbers still there in text for anything that reads the
     page rather than looks at it. Counted rather than clicked, since a
     hidden node cannot be interacted with. */
  if (!(await page.locator('[data-values-list] li').count())) {
    throw new Error('the stats series is no longer readable as text');
  }
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

/* 6a. a tag insight's sheet holds the same set the row's own count named
   (carpet ticket 19). An unranged read used to open the tag's twenty most
   recent carriers across the whole journal; this asserts the row's count
   against the number of entry cards the sheet actually opened, so the two
   cannot drift apart again without failing here. */
try {
  await fresh('/stats');
  const bar = page.locator('[data-chart-card="tag-insights"] [data-bar-row]').first();
  await bar.waitFor();
  const note = await bar.locator('[data-bar-note]').textContent();
  const claimed = Number((note ?? '').match(/\d+/)?.[0]);
  if (!claimed) throw new Error('tag insight row has no entry count: ' + note);

  await bar.click();
  await page.waitForSelector('[data-sheet]');
  await page.waitForSelector('[data-sheet] [data-entry-card]');
  const cards = await page.locator('[data-sheet] [data-entry-card]').count();
  const capped = await page.locator('[data-insight-sheet-capped]').count();

  if (capped) {
    // A capped list says so rather than silently showing fewer than the
    // row claimed - the row's count can exceed what the sheet shows, never
    // the other way round.
    if (cards > claimed) throw new Error(`sheet held ${cards}, row claimed ${claimed}, and said capped`);
  } else if (cards !== claimed) {
    throw new Error(`row said ${claimed} entries, sheet held ${cards}`);
  }
  ok('tag insight sheet holds the row\'s own count, or says it is capped');
} catch (e) { fail('tag insight sheet range', e); }

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

/* 6b2. a tag insight opens the entries carrying that tag, and one of them
   opens (carpet ticket 10).

   The sheet is the only place /stats draws an entry card, and the ticket's
   own acceptance asks whether those cards reach the entries they name. The
   assertion is the card's own href against the URL the tap landed on, not
   just that a navigation happened: a click that navigates anywhere would
   pass the weaker version of this check.

   It is also the surface behind the ticket's fade-through carve-out. The
   pattern itself is pinned in screen-transition.test.ts, where it is a
   pure function; what this proves is that the tap still arrives, which is
   the half a table cannot answer. */
try {
  await fresh('/stats');
  await page.locator('[data-chart-card="tag-insights"] [data-bar-row]').first().click();
  /* The sheet, and then the entries in it: the read behind them is its own
     query, so the card can arrive a frame after the sheet does. */
  await page.waitForSelector('[data-sheet] [data-entry-card]');
  const opens = page.locator('[data-sheet] [data-entry-card]').first();
  const href = await opens.getAttribute('href');
  if (!/^\/entry\/\d+$/.test(href ?? '')) {
    throw new Error('a tag insight entry links nowhere in particular: ' + href);
  }
  await opens.click();
  await page.waitForURL('**' + href);
  /* And it is the editor for that entry rather than a screen that merely
     answers to the URL - #ed-note is the note field every other editor
     flow in this file waits on. */
  await page.waitForSelector('#ed-note');
  ok('a tag insight opens its entries, and one of them opens the editor');
} catch (e) { fail('tag insight entries', e); }

/* 6c. the custom-interval card's length field waits for the typist (phase 8
   audit ticket 16, the same debounce ticket 15 gave /search's query).

   Three digits firing one read rather than three is proved by counting
   closure runs (tests/browser-tier/live-reads-probe.svelte.ts's own
   ticket-16 section, alongside ticket 15's) - nothing a walkthrough drives
   from outside the page can count that. What
   this proves instead is what a person actually sees: a length typed digit
   by digit still lands once typing stops, `pressSequentially` rather than
   `fill` because `fill` sets the whole value in one event and would
   exercise no wait at all. 182 is a three-digit length the demo persona's
   own history draws a pattern for - chosen by checking the rendered card
   rather than assumed, since a length past the persona's span draws nothing
   to wait for. */
try {
  await fresh('/stats');
  const card = page.locator('[data-chart-card="custom-interval"]');
  const field = page.locator('#custom-interval-length');

  await field.fill('');
  await field.pressSequentially('182', { delay: 30 });
  await card.locator('[aria-label*="182-day interval"]').first().waitFor();

  ok('the custom interval length typed digit by digit still lands once typing stops');
} catch (e) { fail('custom interval length waits for the typist', e); }

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

  await fresh('/media/photos');
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

  /* Redesign ticket 11: a span pointed at on the Look back door's rail is
     read at the same URL the picker writes for those two days - proven by
     opening it from the rail, then typing the same query, and comparing what
     the two renders say. The door opens on the last thirty days, which the
     persona clears. */
  await fresh('/stats');
  await page.waitForSelector('[data-lookback-read]');
  const spanHref = await page.locator('[data-lookback-read]').getAttribute('href');
  if (!/^\/wrapped\/range\?named=custom&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/.test(spanHref ?? '')) {
    throw new Error('the span opens at ' + spanHref);
  }
  await page.locator('[data-lookback-read]').click();
  await page.waitForSelector('[data-wrapped-stats]');
  const fromRail = await page.locator('[data-wrapped-stats]').textContent();
  await fresh(spanHref);
  await page.waitForSelector('[data-wrapped-stats]');
  const fromPicker = await page.locator('[data-wrapped-stats]').textContent();
  if (fromRail !== fromPicker) throw new Error('the rail and the picker read two different wrappeds for one span');
  ok('timeline, progress-photo compare, the wrapped range that replaced recap, and the span read from the rail');
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
  /* The door's field follows the palette (redesign ticket 07): activeFlag
     publishes the flag's second colour and its ink on <html> beside the
     roles. Pansexual's is its yellow, which carries the near-black ink. */
  const field = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return [style.getPropertyValue('--field').trim(), style.getPropertyValue('--field-ink').trim()];
  });
  if (field[0].toUpperCase() !== '#FFD800' || field[1] !== '#101820') {
    throw new Error(`field tokens after the switch: ${field.join(' / ')}`);
  }
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
  await page.waitForFunction(() => document.querySelector('[data-nav-item="home"] [data-nav-label]')?.textContent === 'Dzisiaj', null, { timeout: 8000 });
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
  await fresh('/transition/milestones');
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

/* 10b. Back returns to the screen you were actually on (CARPET-05).

   Home's stale-backup notice is the case that names it. The notice is a
   deep link out of Home into the export screen, whose header names
   /settings as where it sits - so back used to land on a Settings screen
   nobody had opened. Run before the notice is dismissed below, because the
   notice is the only link into that screen from anywhere but Settings.

   The pair of flows is the whole decision: with an entry behind this one,
   back walks history; on the entry the app booted onto there is nothing to
   walk to and the header's href is what is left to offer. Asserting only
   the first would pass just as well on a back control that had stopped
   being a link at all. */
try {
  await fresh('/');
  await page.locator('[data-backup-notice] [data-notice-action]').click();
  await page.waitForURL(BASE + '/settings/export');
  await booted();
  await page.locator('[data-screen-back]').click();
  await page.waitForURL(BASE + '/');
  ok('back from a screen a notice linked into returns to the notice, not to the menu above it');
} catch (e) { fail('back to where you came from', e); }

try {
  await fresh('/settings/export');
  await page.locator('[data-screen-back]').click();
  await page.waitForURL(BASE + '/settings');
  ok('back on the screen the app booted onto takes the parent the header names');
} catch (e) { fail('back with nothing behind it', e); }

/* 10c. Home's stale-backup notice (ticket 15, F21). Before the export
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

  /* And it stays dismissed on the way back (phase 9 carpet ticket 04,
     ADR-0071's "closed stays closed"). Every close on Home persists
     somewhere - a preference, a journal write, a 24-hour key in localStorage
     - and the ADR re-decided none of them, which is a claim nothing was
     checking. This notice is the one whose close is a preference, and
     navigating away and back is where a close that only lived in component
     state would come undone. The greeting is waited for first: an absence
     assertion on a screen that has not drawn yet passes for the wrong
     reason. */
  await page.locator('[data-nav-item="calendar"]').first().click();
  await page.waitForURL('**/calendar');
  await page.locator('[data-nav-item="home"]').first().click();
  await page.waitForSelector('[data-home-hello]');
  if (await page.locator('[data-backup-notice]').count()) {
    throw new Error('the dismissed backup notice came back from the calendar');
  }
  ok('the stale-backup notice reads 34 days, dismisses, and stays dismissed across a navigation');
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
  /* The Journal door, since the recent entries left Home (redesign
     tickets 10 and 13): it is the everyday list a duplicate would show up
     on now. */
  const homeCards = async () => {
    await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
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
  await page.waitForSelector('[data-home-log]');

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


/* 13. onboarding end-to-end via demo jump (phase 5 ticket 26, phase 10
   redesign ticket 22: eight steps - welcome, name, flag, scales, areas,
   lock, check-in, finish) */
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
  await page.locator('[data-next]').click(); // scales -> areas

  /* Ticket 22: the hub's own groups and rows, met once here and once more on
     the hub - the same headings the More screen draws, in the same order. */
  /* Support and Media are left off this step (Alicja, sign-off): neither is
     something a person tracks. */
  /* Steps, not Transition, since redesign ticket 15 renamed the group in the
     one place both surfaces read it from (`hubLabels.ts`): a group called
     Transition inside a door called Transition said nothing. */
  const areaHeadings = (await page.locator('[data-section-heading] h2').allTextContents()).map((t) => t.trim());
  if (areaHeadings.join() !== ['Body', 'Health', 'Steps'].join()) {
    throw new Error('onboarding areas headings: ' + JSON.stringify(areaHeadings));
  }

  // The default four arrive ticked and nothing else does (measurements,
  // care, milestones, tryouts - pinnedRows.ts's own default set).
  const areasTickedOnArrival = await page.locator('[data-list-row^="area-"][aria-checked="true"]').count();
  if (areasTickedOnArrival !== 4) throw new Error('areas ticked on arrival: ' + areasTickedOnArrival);
  for (const key of ['measurements', 'care', 'milestones', 'tryouts']) {
    if ((await page.locator(`[data-list-row="area-${key}"]`).getAttribute('aria-checked')) !== 'true') {
      throw new Error(`${key} is not part of the default set on arrival`);
    }
  }

  await expectNoHorizontalOverflow('[data-app-viewport]');

  // Untick a default and tick something outside it, so what is stored is a
  // set this screen chose rather than the one it started with (the same
  // proof the scales step makes above).
  await page.locator('[data-list-row="area-care"]').click();
  await page.locator('[data-list-row="area-eras"]').click();
  await page.locator('[data-next]').click(); // areas -> lock
  await page.locator('[data-next]').click(); // lock -> check-in

  /* Ticket 46: the persona premise this step answers is that it defaults
     the daily nudge on. It doesn't - confirmed here at the switch itself,
     not only by never touching it below. */
  if ((await page.getByRole('switch', { name: 'Daily check-in' }).getAttribute('aria-checked')) === 'true') {
    throw new Error('daily check-in switched itself on by default');
  }

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
  /* Out from the second step, five steps short of the finish. The name that
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

/* 13c. a first run that restores (phase 10 redesign ticket 36).

   The whole path a person on a new phone takes: say on the welcome that you
   already have a backup, hand over the file and its password, and get the
   journal back without being asked to invent a life you already have.

   The archive is a real one, exported through the export screen a moment
   earlier, because a fixture would prove the screen wires up and not that a
   journal survives the round trip. It is a small one on purpose: what a
   whole demo journal survives is flow 11b's question, and asking it twice
   costs this suite a second full export and restore of every photo the
   earlier flows imported. Here the journal is emptied first and given one
   entry and one flag, so what has to come back is nameable - the note, and
   the palette, which is a portable preference (ADR-0003) and therefore also
   the proof that the flag step was rightly not asked. */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');

  /* An empty journal is what a new phone is, and the jump is what makes
     one. Out of setup first, so the entry can be written. */
  const emptyFirstRun = async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await booted();
    await page.selectOption('#demo-jump', 'first-run');
    await page.waitForSelector('[data-restore-start]');
  };
  await emptyFirstRun();
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-palette-pick="lesbian"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'lesbian');

  /* Through the FAB, whose fan seeds the mood, so this needs no mood control
     of its own - the editor's and Home's log strip both answer to
     `[data-mood]` and picking between them is flow 2's problem, not this
     flow's. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-nav-fab]').click();
  await page.locator('[data-fan-target="mood-3"]').click();
  await page.waitForSelector('#ed-note');
  await page.locator('#ed-note').fill('The entry that came back.');
  await page.locator('[data-save]').click();
  await page.waitForSelector('[data-home-log]');

  await page.goto(BASE + '/settings/export', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('#exp-pass').fill('walkthrough');
  await page.locator('[data-export]').click();
  const [archive] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.locator('[data-confirm-export]').click()
  ]);
  const archivePath = await archive.path();

  /* Emptied again, and the flag put back to something the archive will have
     to overwrite, so a palette reading lesbian at the end can only have come
     out of the file. */
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await booted();
  await page.locator('[data-palette-pick="trans"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'trans');
  await emptyFirstRun();

  await page.locator('[data-restore-start]').click();
  await page.waitForSelector('[data-restore-pick]');

  /* The refusal first, on the file that is not an archive, because this is
     the ticket where being wrong loses somebody's journal: what has to hold
     is that a refused archive says so and leaves the person on the step with
     the way back still there, not that the happy path works. The handle is
     the kind, matching the Settings screen's own - the walkthrough grips a
     kind, never a sentence in one language. */
  page.once('filechooser', (chooser) =>
    chooser.setFiles({
      name: 'not-a-backup.ttbackup',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('this is not an archive')
    })
  );
  await page.locator('[data-restore-pick]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-restore-file]')?.textContent.includes('not-a-backup')
  );
  await page.locator('#ob-restore-pass').fill('walkthrough');
  await page.locator('[data-restore-check]').click();
  await page.waitForSelector('[data-restore-error="not-an-archive"]');
  if (await page.locator('[data-finish]').count()) {
    throw new Error('a refused archive was let through to the finish');
  }

  /* And the real one over the top of it, which is also the check that a
     second pick clears the first one's refusal. */
  page.once('filechooser', (chooser) => chooser.setFiles(archivePath));
  await page.locator('[data-restore-pick]').click();
  await page.waitForFunction(
    (name) => document.querySelector('[data-restore-file]')?.textContent.includes(name),
    archive.suggestedFilename()
  );
  await page.locator('#ob-restore-pass').fill('walkthrough');
  await page.locator('[data-restore-check]').click();

  /* One step between the restore and the finish, and it is the access mode
     step (steps.ts's restoreSteps). Nothing that the archive answers is
     asked again: no name field, no flag picker, no scales, no areas. */
  await page.waitForSelector('[data-next]', { timeout: 120000 });
  if (await page.locator('#ob-name').count()) throw new Error('setup asked for a name the archive carries');
  if (await page.locator('[data-palette-pick]').count()) {
    throw new Error('setup asked for a flag the archive carries');
  }
  await page.locator('[data-next]').click(); // access mode -> finish
  await page.waitForSelector('[data-finish]');

  await page.locator('[data-finish]').click();
  await page.waitForSelector('[data-home-hello]', { timeout: 120000 });
  await heldOnHome('the restore was undone by a late navigation');

  /* The entry is back, in the journal, and the flag is back with it - which
     is the settings half of ADR-0003 and the reason the flag step was never
     asked. Nothing from setup overwrote either: on this flow the steps that
     would have are the ones restoreSteps() dropped. */
  await page.goto(BASE + '/day/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-entry-note]', { timeout: 30000 });
  const notes = await page.locator('[data-entry-card] [data-entry-note]').allTextContents();
  if (!notes.some((note) => note.includes('The entry that came back'))) {
    throw new Error(`the restored journal has no entry from the archive: ${JSON.stringify(notes)}`);
  }
  const palette = await page.evaluate(() => document.documentElement.dataset.palette);
  if (palette !== 'lesbian') {
    throw new Error(`the archive's own flag did not come back with it: ${palette}`);
  }
  ok('a first run restores its own backup, entry and flag, and refuses one that is not an archive');
} catch (e) { fail('onboarding restore', e); }

/* 13d. and the way back out of it: a restore that is given up on leaves the
   person on the welcome as somebody new, with the whole flow ahead of them
   and nothing written. */
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-restore-start]');
  await page.locator('[data-restore-start]').click();
  await page.waitForSelector('[data-restore-pick]');
  await page.locator('[data-restore-abandon]').click();

  /* Back on the welcome, and it is the ordinary welcome: the second action
     is offered again, and the step after it is the name step rather than the
     access mode, which is what says the flow is the full one. */
  await page.waitForSelector('[data-restore-start]');
  await page.locator('[data-next]').click(); // welcome -> name
  await page.waitForSelector('#ob-name');

  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  ok('giving up on a restore leaves setup running as a new person');
} catch (e) { fail('onboarding restore abandoned', e); }

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
     has something to strand.

     One entry first, because the onboarding flows above leave the journal
     empty and Home's week strip - the picker's own heading - waits for the
     first entry (phase 8 UX ticket 01). Written here rather than by a demo
     reset, which would put the preferences back and undo the tick this flow
     just made. */
  await page.goto(BASE + '/entry/new/today', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('#ed-note');
  await page.locator('[data-mood="4"]').click();
  await page.locator('[data-save]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-toast-kind="saved"]').length > 0);
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await booted();
  /* The metric picker left Home with the week strip (redesign tickets 10
     and 13); the Journal door's is the one that shades the days now. */
  await page.waitForSelector('[data-chart-picker="calendar-metric"]');
  await page.locator('[data-chart-picker="calendar-metric"]').selectOption('femininity');
  await page.waitForFunction(
    () => document.querySelector('[data-chart-picker="calendar-metric"]')?.value === 'femininity'
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
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await booted();
  await page.waitForSelector('[data-chart-picker="calendar-metric"]');
  const metric = await page.locator('[data-chart-picker="calendar-metric"]').inputValue();
  if (metric !== 'mood') throw new Error('Home is still coloured by ' + metric + ' with nothing ticked');
  ok('settings scales sheet ticks through to the editor, empty included');
} catch (e) { fail('settings scales sheet', e); }

console.log(finish('done'));
await browser.close();
await server.close();
process.exit(0);
