/* The surgery index, before and after the phase rail (phase 10 redesign
   ticket 52).

   What is being looked at is two cards: one procedure still running, and
   one past the recovery cutoff. So the shots are crops of the list card
   holding them and of each card on its own, and nothing else on the screen
   - the rest of the surgery journey is the same screen it was.

   Nothing is faked at the component level. Both procedures are written
   through the screen's own editor, their consults through the consult
   sheet and their photos through the photo picker, exactly as a person
   would, so the same script seeds an identical journal on either build.

   Run, for the after column:
     VITE_DEMO=1 npm run build
     node tests/surgery-rail-gallery.mjs --tag after

   And for the before column, from a detached worktree of main that has
   been built the same way - `preview()` serves `.svelte-kit/output` from
   the working directory, so the checkout has to be the cwd rather than a
   --root flag:
     cd <main worktree> && node <this repo>/tests/surgery-rail-gallery.mjs \
       --tag before --out <a directory outside both>

   Default outDir is .claude/surgery-rail-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, fillDate } from './browser-harness.mjs';
import { tinyPhoto } from './photo-fixture.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve(here, '../.claude/surgery-rail-shots')));

/** Long enough for a sheet to rise, a block to be uncovered and a rail's
    marks to have grown in (--dur-slow plus the strip's stagger). Every
    frame here wants the resting state, never a tween mid-flight. */
const SETTLED = 700;

await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

async function freshPage() {
  /* A phone's width, and a viewport tall enough that a crop of the list
     card is never clipped by the foot or by the scroll region's own edge -
     the shots are of two cards, not of a screenful. */
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return page;
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

/* The palette and theme are set after any state jump, never before: a demo
   reset writes the preferences back. */
async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** One procedure, through the add sheet. `day` is an ISO date, or null for
    one with no date set yet. */
async function addProcedure(page, { name, day }) {
  await goto(page, '/health/surgery');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#surgery-name');
  await page.fill('#surgery-name', name);
  if (day) await fillDate(page, '#surgery-date', day);
  await page.locator('[data-save-procedure]').click();
  await page.waitForSelector('[data-save-procedure]', { state: 'detached' });
  await page.waitForTimeout(SETTLED);
}

/** Opens a procedure's own log, which is where its consults and photos are
    written from. Idempotent in the sense that matters: the card toggles, so
    this closes any other one first by going back to the screen. */
async function open(page, name) {
  await goto(page, '/health/surgery');
  /* The card's own face rather than the card, which is a container: after
     this ticket its centre point is the rail rather than the button. */
  await page.locator('[data-procedure-card]', { hasText: name }).first().locator('button').first().click();
  await page.waitForSelector('[data-recovery-log]');
  await page.waitForTimeout(SETTLED);
}

async function addConsult(page, name, day) {
  await open(page, name);
  await page.locator('[data-add-consult]').click();
  await page.waitForSelector('#surgery-consult-date');
  await fillDate(page, '#surgery-consult-date', day);
  await page.locator('[data-save-consult]').click();
  await page.waitForTimeout(SETTLED);
}

/** One recovery photo, through the picker the screen offers.

    Waited out on the album rather than on a timeout: normalizing a picked
    photo is two JPEG encodes, and the second one takes seconds under
    headless Chromium's software canvas - long enough that a fixed settle
    left this returning before the photo was ever written. */
async function addPhoto(page, name, day, fill) {
  await open(page, name);
  const before = await page.locator('[data-procedure-photo]').count();
  await page.locator('[data-add-photo]').click();
  await page.waitForSelector('#surgery-photo-date');
  await fillDate(page, '#surgery-photo-date', day);
  const bytes = await tinyPhoto(page, fill);
  page.once('filechooser', (chooser) =>
    chooser.setFiles({ name: 'healing.png', mimeType: 'image/png', buffer: bytes })
  );
  await page.locator('[data-pick-procedure-photo]').click();
  await page.waitForFunction(
    (want) => document.querySelectorAll('[data-procedure-photo]').length >= want,
    before + 1,
    { timeout: 60000 }
  );
  await page.waitForTimeout(SETTLED);
}

/** Moves a stored procedure's date, through the same editor its pencil
    opens. */
async function setProcedureDate(page, name, day) {
  await goto(page, '/health/surgery');
  await page.locator('[data-procedure-card]', { hasText: name }).first().locator('[data-edit-procedure]').click();
  await page.waitForSelector('#surgery-date');
  await fillDate(page, '#surgery-date', day);
  await page.locator('[data-save-procedure]').click();
  await page.waitForSelector('[data-save-procedure]', { state: 'detached' });
  await page.waitForTimeout(SETTLED);
}

async function archiveProcedure(page, name) {
  await goto(page, '/health/surgery');
  await page.locator('[data-procedure-card]', { hasText: name }).first().locator('[data-edit-procedure]').click();
  await page.getByRole('switch', { name: 'Keep in archive' }).click();
  await page.locator('[data-save-procedure]').click();
  await page.waitForSelector('[data-save-procedure]', { state: 'detached' });
  await page.waitForTimeout(SETTLED);
}

async function shoot(page, selector, name) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen. It
     is a true notice about this browser and not what these are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator(selector).first().screenshot({ path: `${outDir}/${name}-${tag}.png` });
  shots.push(`${name}-${tag}`);
  process.stdout.write(`  ${name}-${tag}\n`);
}

/* Two procedures, which is the case the screen's own intro promises and
   the one a single row served worst: one eighteen days past its date and
   still healing, and one four hundred days past it and archived. Both
   carry the consults that came before them; only the running one is
   photographed, which is what a recovery album is for. */
async function seed(page) {
  await addProcedure(page, { name: 'facial surgery', day: iso(-18) });
  /* Written as a recent procedure and then dated back, because an archived
     one is a read-only record: its log offers no way to add a consult, by
     design, and this is a journal being built the way one is built in life
     rather than back-filled. */
  await addProcedure(page, { name: 'top surgery', day: iso(-18) });

  await addConsult(page, 'facial surgery', iso(-160));
  await addConsult(page, 'facial surgery', iso(-52));
  await addConsult(page, 'top surgery', iso(-460));
  await addConsult(page, 'top surgery', iso(-420));

  await addPhoto(page, 'facial surgery', iso(-16), '#c94f7c');
  await addPhoto(page, 'facial surgery', iso(-11), '#b8687f');
  await addPhoto(page, 'facial surgery', iso(-4), '#8f6f9e');

  await setProcedureDate(page, 'top surgery', iso(-400));
  await archiveProcedure(page, 'top surgery');

  /* Back to the index with nothing open, which is the reading the ticket
     is about: what a person sees before they choose anything. */
  await goto(page, '/health/surgery');
  await page.waitForTimeout(SETTLED);
}

for (const theme of ['light', 'dark']) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await seed(page);

  await shoot(page, '.screen-part', `surgery-index-trans-${theme}`);
  await shoot(page, '[data-procedure-card]:has-text("facial surgery")', `procedure-running-trans-${theme}`);
  await shoot(page, '[data-procedure-card]:has-text("top surgery")', `procedure-archived-trans-${theme}`);
  await page.close();
}

/* The two states with no number to draw, which the running/archived pair
   does not reach: a procedure on the day itself, and one with no date yet.
   Their own journal, so they cannot disturb the pair above. */
for (const theme of ['light', 'dark']) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await addProcedure(page, { name: 'today is the day', day: iso(0) });
  await addProcedure(page, { name: 'no date yet', day: null });
  await goto(page, '/health/surgery');
  await page.waitForTimeout(SETTLED);
  await shoot(page, '[data-list-card]', `procedure-states-trans-${theme}`);
  await page.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
await browser.close();
await app.httpServer.close();
