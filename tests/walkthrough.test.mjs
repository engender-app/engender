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

/* 1. quick log */
try {
  await fresh('/');
  await page.locator('.quicklog .mood-btn[data-mood="4"]').click();
  await page.waitForSelector('.toast');
  await page.locator('.toast-action').click();
  await page.waitForSelector('.mood-picker:not(.is-compact) .mood-btn.is-selected');
  ok('quick log + Add details opens editor');
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
  await page.waitForFunction(() => document.querySelector('.nav-item span')?.textContent === 'Start', null, { timeout: 8000 });
  ok('language swap EN→PL via paraglide');
} catch (e) { fail('language', e); }

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

/* 11. import: a file that is not an archive, plus the plain export confirm */
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
  await page.waitForSelector('[role="alert"]');
  await page.locator('[data-plain="csv"]').click();
  await page.waitForSelector('.sheet .notice-danger');
  await page.locator('[data-confirm-plain]').click();
  await page.waitForSelector('.toast');
  ok('a file that is not a backup is refused + plain export warn/confirm');
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

  /* A cold start, not a navigation: the gate has to be what renders, and
     it has to render from the mirror rather than after SQLite opens. */
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
  await page.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.pinHash === null;
  });
  ok('app lock gates a cold start, throttles wrong PINs, opens on the right one');
} catch (e) { fail('app lock', e); }

/* 13. onboarding end-to-end via demo jump */
try {
  await fresh('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  await page.locator('[data-next]').click();
  await page.locator('#ob-name').fill('Ola');
  await page.locator('[data-next]').click();
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
  /* Waits on the mirror, not on the screen: the screen updates from the
     in-memory projection immediately, while the write to SQLite and the
     cache refresh behind it are a round-trip away. */
  await page.waitForFunction(() => {
    const boot = JSON.parse(localStorage.getItem('gender-diary-boot-prefs') || '{}');
    return boot.theme === 'dark' && boot.palette === 'lesbian';
  });

  /* Records the first time anything writes data-theme, and whether <body>
     existed yet. The pre-paint script sits in <head>, so it runs with no
     body at all; hydration cannot, which is what stops this passing if the
     stamping quietly moved back into the layout's $effect. */
  await page.addInitScript(() => {
    // Observes `document`, not `document.documentElement`: an init script
    // runs before the parser has created <html>, so there is no element to
    // hand the observer yet.
    new MutationObserver(() => {
      window.__firstStamp ??= { ...document.documentElement.dataset, hadBody: !!document.body };
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-theme', 'data-palette']
    });
  });
  await page.reload({ waitUntil: 'networkidle' });

  const first = await page.evaluate(() => window.__firstStamp);
  if (first?.theme !== 'dark' || first?.palette !== 'lesbian' || first.hadBody) {
    throw new Error('first stamp on <html>: ' + JSON.stringify(first));
  }
  ok('theme and palette persist and apply before first paint');
} catch (e) { fail('boot preferences', e); }

/* 17. built-in vocabulary is localized by key, not stored in English (ticket 05) */
try {
  await fresh('/entry/new/today');
  await page.waitForSelector('.tag-chip:has-text("social euphoria")');

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.locator('.segment:has-text("Polski")').click();
  await page.waitForFunction(() => document.querySelector('.nav-item span')?.textContent === 'Start', null, { timeout: 8000 });

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

if (errors.length) fail('no uncaught page errors', errors.slice(0, 6).join('; '));

const failures = finish('ALL FLOWS PASS');
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
