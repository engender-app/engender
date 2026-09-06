/* Screenshots of the in-the-room view (phase 8 features ticket 60): the
   prep list read one question per screen, plus the two rows that lead into
   it.

   What has to be looked at is not one render. The question is the largest
   text in the app and it is somebody else's words, so the shots below hold
   a short one and one that runs to three lines; the step controls change
   state at each end of the list; and the screen is chromeless, so the
   absence of the bar is part of what these are of.

   Nothing is faked at the component level. Every question here is written
   through the prep screen's own add sheet and every appointment through the
   appointments editor, exactly as a person would.

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/in-the-room-gallery.mjs [outDir]
   Default outDir is .claude/room-shots, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/room-shots'));

/** Long enough for the sheet to rise (--dur-med), the wipe to finish
    (--dur-slow) and both to settle. Every frame here wants the resting
    state, never a tween mid-flight. */
const SETTLED = 600;

await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];

async function freshPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
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

/** The palette and theme are set after any state jump, never before: a
    demo reset writes the preferences back. */
async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function addQuestion(page, text) {
  await goto(page, '/health/appointment-prep');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-prep-input');
  await page.fill('#appointment-prep-input', text);
  await page.locator('[data-save-appointment-item]').click();
  await page.waitForTimeout(SETTLED);
}

/** A visit today, which is what puts the room's row on the appointments
    screen and gives the answers an appointment to belong to. The date field
    already opens on today, so nothing is typed into it. */
async function bookToday(page, kind) {
  await goto(page, '/health/appointments');
  await page.locator('[data-add]').click();
  await page.waitForSelector('#appointment-kind');
  await page.fill('#appointment-kind', kind);
  await page.locator('[data-save-appointment]').click();
  await page.waitForTimeout(SETTLED);
}

async function shoot(page, name) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen.
     It is a true notice about this browser and not what these are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

/* One short, one that runs past a line, and one that is somebody's real
   half-sentence - the three shapes a person's own question comes in. */
const QUESTIONS = [
  'Bloods',
  'Ask whether the dose goes up now, or whether we are waiting for the next set of levels',
  'The referral she said she would write'
];

/* Three of the eight rather than all of them: what these shots vary is one
   screen's own layout under a person's own words, and the palette ramp
   itself is what `gallery:kit` is for. Read out of `PALETTES`, which is
   where the set is declared (tests/palettes.mjs, ticket 06), so a renamed
   palette fails here rather than quietly rendering the default one. */
const named = (name) => {
  if (!PALETTES.includes(name)) throw new Error(`no such palette: ${name}`);
  return name;
};
const LOOKS = [
  [named('trans'), 'dark'],
  [named('trans'), 'light'],
  [named('nonbinary'), 'light'],
  [named('agender'), 'dark']
];

/* ---------- nothing on the list yet ---------- */
for (const theme of ['dark', 'light']) {
  const page = await freshPage();
  await setLook(page, named('trans'), theme);
  await goto(page, '/health/appointments/in-the-room');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `room-empty-trans-${theme}`);
  await page.close();
}

/* ---------- the screen itself, across palettes and themes ---------- */
for (const [palette, theme] of LOOKS) {
  const page = await freshPage();
  await setLook(page, palette, theme);
  for (const question of QUESTIONS) await addQuestion(page, question);
  await bookToday(page, 'endokrynolog');

  // The way in from the appointment, on its day.
  await goto(page, '/health/appointments');
  await shoot(page, `room-row-appointments-${palette}-${theme}`);

  // And the way in from the list, any day.
  await goto(page, '/health/appointment-prep');
  await shoot(page, `room-row-prep-${palette}-${theme}`);

  // First question: short, and Previous has nowhere to go.
  await goto(page, '/health/appointments/in-the-room');
  await page.waitForSelector('[data-in-the-room]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `room-first-${palette}-${theme}`);

  // The long one, which is the render that decides whether 32px was a
  // good idea.
  await page.locator('[data-room-next]').click();
  await page.waitForTimeout(SETTLED);
  await shoot(page, `room-long-${palette}-${theme}`);

  // The last one, answered, with the way out saying it will carry it.
  await page.locator('[data-room-next]').click();
  await page.waitForTimeout(SETTLED);
  await page.fill('[data-room-answer]', 'She is writing it this week and posting it to me');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `room-answered-${palette}-${theme}`);
  await page.close();
}

process.stdout.write(`\n${shots.length} shot(s) in ${outDir}\n`);
await browser.close();
await app.httpServer.close();
