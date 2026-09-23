/* The four things a hand-built transport can quietly lose (phase 10
   redesign ticket 46): the keyboard, the spoken position, full screen, and
   working with the radio off.

   The native `<audio controls>` and `<video controls>` this replaced were
   keyboard-operable and screen-reader labelled with nobody doing any work,
   and that is the one thing a custom transport can quietly lose. So the
   behaviour is checked against theirs rather than against what the new
   component happens to do: in Chromium a media element's own transport
   answers Space or Enter on the play control, moves five seconds on the
   left and right arrows, and goes to the ends on Home and End. Each of
   those is a line below, driven with the keyboard and nothing else, on a
   real recording and a real video note imported through the app's own
   picker.

   The spoken part is checked too, because a slider whose value is "3.41" is
   not a transport anybody can follow: the scrub carries a role, a name, a
   range, and an `aria-valuetext` that reads as a position in a length.

   Full screen and the offline check are here for the same reason: they are
   behaviours the native elements had for free, and each is one line of this
   file rather than a claim in a commit message. The page is put offline
   before anything is played, so a player that had reached for a CDN - which
   is what the libraries this ticket turned down do by default - would fail
   here rather than in somebody's kitchen.

   Run against a demo build:
     VITE_DEMO=1 npm run build && node tests/media-transport-check.mjs */
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReporter, launchChromium } from './browser-harness.mjs';
import { mediaFixtures } from './media-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { ok, fail, finish } = createReporter();
/** The reporter takes a line and a verdict separately; every check here is
    a line plus a boolean, so they are joined once here. */
const check = (name, passed) => (passed ? ok(name) : fail(name, 'not so'));
const media = await mediaFixtures(resolve(here, '../.claude/media-fixtures'));

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
page.on('pageerror', (error) => fail(`page error: ${error.message}`));

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const importFile = async (trigger, file, mimeType) => {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(trigger).click();
  await (await chooser).setFiles({
    name: file.split('/').pop(),
    mimeType,
    buffer: await readFile(file)
  });
};

/** Puts the keyboard on `selector` the way a person would - by tabbing
    until it lands there - rather than by calling focus(), which proves
    nothing about whether the control is reachable at all.

    `from` is where the walk starts: tabbing forward from wherever the last
    click left the focus can mean walking the whole rest of the screen and
    round again, so a walk that is about one control starts at the top of
    the document. */
const tabTo = async (selector, limit = 160, from = 'top') => {
  if (from === 'top') {
    await page.evaluate(() => {
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
    });
  }
  for (let press = 0; press < limit; press++) {
    if (await page.locator(selector).evaluate((el) => el === document.activeElement).catch(() => false)) {
      return press;
    }
    await page.keyboard.press('Tab');
  }
  return null;
};

const timeOf = (within) =>
  page.evaluate((sel) => document.querySelector(`${sel} audio, ${sel} video`)?.currentTime ?? -1, within);

const pausedIn = (within) =>
  page.evaluate((sel) => document.querySelector(`${sel} audio, ${sel} video`)?.paused ?? true, within);

async function drive(label, row, toggle, scrub) {
  const reached = await tabTo(toggle, 160, 'top');
  if (reached === null) {
    fail(`${label}: the play control is reachable by Tab`);
    return;
  }
  ok(`${label}: the play control is reachable by Tab (${reached} presses in)`);

  const named = await page.locator(toggle).getAttribute('aria-label');
  check(`${label}: the play control names itself while stopped ("${named}")`, !!named);

  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  check(`${label}: Space starts playback, as it does on a native transport`, !(await pausedIn(row)));

  const playingLabel = await page.locator(toggle).getAttribute('aria-label');
  check(
    `${label}: the same control names itself pause once it is playing ("${playingLabel}")`,
    !!playingLabel && playingLabel !== named
  );

  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(`${label}: Enter stops it again`, await pausedIn(row));

  /* The scrub: reachable, and a slider rather than a div that moves. */
  /* Continuing from the play control rather than from the top, which is
     what makes "the next tab stop" mean anything. */
  const toScrub = await tabTo(scrub, 4, 'here');
  if (toScrub === null) {
    fail(`${label}: the scrub is reachable by Tab`);
    return;
  }
  check(`${label}: the scrub is the next tab stop after the play control`, toScrub <= 2);

  const aria = await page.locator(scrub).evaluate((el) => ({
    role: el.getAttribute('role'),
    name: el.getAttribute('aria-label'),
    min: el.getAttribute('aria-valuemin'),
    max: el.getAttribute('aria-valuemax'),
    now: el.getAttribute('aria-valuenow'),
    text: el.getAttribute('aria-valuetext'),
    tabindex: el.getAttribute('tabindex')
  }));
  check(`${label}: the scrub is a slider with a name and a range`, aria.role === 'slider' && !!aria.name && aria.min !== null && aria.max !== null);
  check(
    `${label}: it speaks a position in a length rather than a number ("${aria.text}")`,
    !!aria.text && /\d+:\d\d/.test(aria.text)
  );

  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  check(`${label}: Home goes to the start`, (await timeOf(row)) < 0.2);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const afterRight = await timeOf(row);
  check(`${label}: the right arrow moves five seconds, as a native transport does (${afterRight.toFixed(2)}s)`, Math.abs(afterRight - 5) < 0.3);

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  const afterLeft = await timeOf(row);
  check(`${label}: and the left arrow moves five back (${afterLeft.toFixed(2)}s)`, afterLeft < 0.3);

  await page.keyboard.press('End');
  await page.waitForTimeout(250);
  const duration = await page.evaluate(
    (sel) => document.querySelector(`${sel} audio, ${sel} video`)?.duration ?? 0,
    row
  );
  const atEnd = await timeOf(row);
  check(`${label}: End goes to the end (${atEnd.toFixed(2)}s of ${duration.toFixed(2)}s)`, Math.abs(atEnd - duration) < 0.4);

  const spoken = await page.locator(scrub).getAttribute('aria-valuetext');
  check(`${label}: and says where it now is ("${spoken}")`, !!spoken && spoken !== aria.text);
}

/* Phase 11 ticket 19 put the editor's sections behind a chip row, one open
   at a time - the walkthrough's own openSection, restated. */
async function openSection(section) {
  const chip = page.locator(`[data-section-chip="${section}"]`);
  await chip.waitFor();
  if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
  await page.waitForSelector(`[data-editor-section="${section}"]`);
}

try {
  await settle('/entry/new/today');
  await openSection('voice');
  await page.waitForSelector('[data-add-recording-file]');

  /* The radio off, from here on. Everything below plays from a file this
     device already holds, so nothing in the transport may need the network
     to draw itself or to run. */
  await page.context().setOffline(true);

  await importFile('[data-add-recording-file]', media.voice, 'audio/webm');
  await page.waitForSelector('.recording-row [data-transport]');
  await page.waitForTimeout(800);
  await drive(
    'a recording',
    '.recording-row',
    '.recording-row [data-transport-toggle]',
    '.recording-row [data-transport-scrub]'
  );

  await openSection('video');
  await importFile('[data-add-video-file]', media.landscape, 'video/webm');
  await page.waitForSelector('.video-row [data-transport]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await drive(
    'a video note',
    '.video-row',
    '.video-row [data-transport-toggle]',
    '.video-row [data-transport-scrub]'
  );

  /* One thing at a time across the two media is not checked here any
     more: since phase 11 ticket 19 the editor opens one section at a time,
     and it is the only screen that draws both players, so a recording and a
     video note are never on screen together. */

  /* Full screen: it takes the whole player rather than the picture alone,
     so the transport goes with it, and leaving has to put everything back. */
  const named0 = {
    full: await page.locator('.video-row [data-video-full]').getAttribute('aria-label')
  };
  await page.locator('.video-row [data-video-full]').click();
  await page.waitForTimeout(600);
  const inFull = await page.evaluate(() => ({
    element: !!document.fullscreenElement,
    hasTransport: !!document.fullscreenElement?.querySelector('[data-transport]')
  }));
  check('full screen takes the player, transport and all', inFull.element && inFull.hasTransport);

  /* Left through the app's own control. Escape is the other way out and it
     is the browser's rather than the app's - headless Chromium does not
     answer it, so what is checked here is the path this ticket owns, and
     the `fullscreenchange` listener behind the label is the same one either
     way out goes through. */
  const fullLabel = await page.locator('.video-row [data-video-full]').getAttribute('aria-label');
  check('the control renames itself while full screen', fullLabel !== named0.full);
  await page.locator('.video-row [data-video-full]').click();
  await page.waitForTimeout(600);
  const left = await page.evaluate(() => ({
    element: !!document.fullscreenElement,
    label: document.querySelector('.video-row [data-video-full]')?.getAttribute('aria-label')
  }));
  check('the same control leaves it again, and goes back to saying "full screen"', !left.element && left.label === named0.full);

  const stillThere = await page.locator('.video-row [data-transport-scrub]').count();
  check('and the player is still on the page afterwards', stillThere === 1);

  /* Played with the radio off from the first import to here. */
  check('everything above ran offline', await page.evaluate(() => !navigator.onLine));

  /* And no `controls` attribute survives anywhere: the whole point is that
     the browser's transport is not what anybody sees. */
  const natives = await page.evaluate(
    () => document.querySelectorAll('audio[controls], video[controls]').length
  );
  check('no browser transport is rendered anywhere on the screen', natives === 0);
} finally {
  await page.close();
  await browser.close();
  await app.close();
}

process.exitCode = finish(
  'the transport is keyboard-operable, spoken, full-screenable and offline, on both media'
) ? 1 : 0;
