import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';

/** Resolves once `selector`'s scroll position has held for three frames, so
    the next scroll does not start while an eased one is still running: two
    overlapping smooth scrolls leave Chromium short of either target. */
const scrollSettled = (page, selector) =>
  page.evaluate(
    (sel) =>
      new Promise((resolve) => {
        let last = NaN;
        let still = 0;
        const tick = () => {
          const el = (sel && document.querySelector(sel)) || document.scrollingElement;
          const now = el.scrollTop;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 3) resolve(now);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    selector
  );


const server = await createServer({
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);

async function reloadLetters() {
  await page.goto(`${base}/transition/letters`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
}

try {
  await settlePage(page, base, '/transition/letters', 'light');

  // 1. Initial empty state
  const emptyNotice = page.locator('[data-notice="letters-empty"]');
  await emptyNotice.waitFor();
  assert.equal(await page.locator('[data-letters-ready-jump]').count(), 0);

  // 2. Insert mixed ready/waiting letters:
  // - 10 sealed letters unlocking in future (creates a long waiting list)
  // - 3 unlocked letters (unlockEpochDay <= today)
  const letterIds = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();

    const ids = [];
    // 10 waiting letters
    for (let i = 1; i <= 10; i++) {
      const id = await journal.letters.addLetter({
        epochDay: today - 10,
        text: `Future secret letter ${i}`,
        unlockEpochDay: today + i * 30
      });
      ids.push(id);
    }
    // 3 ready letters: 2 from past days, 1 unlocking today (boundary)
    const r1 = await journal.letters.addLetter({
      epochDay: today - 100,
      text: 'Past ready letter 1',
      unlockEpochDay: today - 20
    });
    const r2 = await journal.letters.addLetter({
      epochDay: today - 50,
      text: 'Past ready letter 2',
      unlockEpochDay: today - 5
    });
    const r3 = await journal.letters.addLetter({
      epochDay: today - 10,
      text: 'Today boundary ready letter 3',
      unlockEpochDay: today
    });
    ids.push(r1, r2, r3);
    const { markLetterGreeted } = await import('/src/lib/data/letterStatus.ts');
    markLetterGreeted(r3);
    return ids;
  });

  await reloadLetters();

  // 3. Verify mixed state:
  // - Compact jump is visible above the waiting list
  // - Count is 3
  const jump = page.locator('[data-letters-ready-jump]');
  await jump.waitFor();
  const jumpText = await jump.innerText();
  assert.match(jumpText, /Ready to read \(3\)/, 'Jump text displays accurate ready count');

  // Verify sealed letters content is not exposed in DOM text
  const sealedCards = page.locator('[data-letter-state="sealed"]');
  assert.equal(await sealedCards.count(), 10, 'All 10 future letters remain sealed');
  for (let i = 0; i < 10; i++) {
    const cardText = await sealedCards.nth(i).innerText();
    assert.doesNotMatch(cardText, /Future secret letter/, 'Sealed letter text is never revealed');
  }

  const getScroll = () =>
    page.evaluate(() => {
      const region = document.querySelector('[data-app-scroll-region]');
      return region ? region.scrollTop : window.scrollY;
    });

  // Verify scroll position before jump
  const initialScroll = await getScroll();
  assert.equal(initialScroll, 0, 'Starts at top of waiting list');

  // Clicking may first scroll the link into view. Back restores that position.
  await jump.evaluate((link) => link.addEventListener('click', () => {
    const region = document.querySelector('[data-app-scroll-region]');
    window.__lettersBeforeJump = region ? region.scrollTop : window.scrollY;
  }, { capture: true, once: true }));

  // Click jump to navigate to #opened
  await jump.click();
  const beforeJump = await page.evaluate(() => window.__lettersBeforeJump);
  await page.waitForFunction(() => window.location.hash === '#opened');
  assert.ok(page.url().includes('#opened'), 'URL carries #opened hash');

  // Verify we scrolled down towards #opened
  await page.waitForFunction(() => {
    const region = document.querySelector('[data-app-scroll-region]');
    return (region ? region.scrollTop : window.scrollY) > 100;
  });
  /* The jump eases; going Back while it still runs starts a second eased
     scroll on top of it. */
  await scrollSettled(page, '[data-app-scroll-region]');
  const scrolledY = await getScroll();
  assert.ok(scrolledY > beforeJump, `Viewport scrolled down to open section (scrolled ${scrolledY}px)`);

  // Verify browser back restores previous position
  await page.goBack();
  await page.waitForFunction(() => !window.location.hash);
  /* Back eases to the remembered position now (ticket 278), so wait for it,
     to the same limit the assertion below holds it to: the position the
     list was at, which is not always the top. On a timeout, say where the
     scroll stopped, since only CI has failed here. */
  await page
    .waitForFunction((limit) => {
      const region = document.querySelector('[data-app-scroll-region]');
      return Math.abs((region ? region.scrollTop : window.scrollY) - limit) <= 50;
    }, beforeJump)
    .catch(async (error) => {
      console.log('back stopped at', await getScroll(), 'on', page.url(), 'from', scrolledY, 'started at', beforeJump);
      throw error;
    });
  const returnedScroll = await getScroll();
  assert.ok(Math.abs(returnedScroll - beforeJump) <= 50, 'Back restores list position at waiting section');

  // 4. Test no-ready state:
  // Delete the 3 ready letters
  await page.evaluate(async (ids) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const readyIds = ids.slice(10);
    for (const id of readyIds) {
      await journal.letters.deleteLetter(id);
    }
  }, letterIds);

  await reloadLetters();
  assert.equal(await page.locator('[data-letters-ready-jump]').count(), 0, 'No jump link in no-ready state');
  assert.equal(await page.locator('[data-letter-state="sealed"]').count(), 10, 'Waiting list remains intact');

  // 5. Test all-ready state:
  // Delete waiting letters, add 2 ready letters
  await page.evaluate(async (ids) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();
    const waitingIds = ids.slice(0, 10);
    for (const id of waitingIds) {
      await journal.letters.deleteLetter(id);
    }
    await journal.letters.addLetter({
      epochDay: today - 30,
      text: 'All ready letter 1',
      unlockEpochDay: today - 10
    });
    await journal.letters.addLetter({
      epochDay: today - 20,
      text: 'All ready letter 2',
      unlockEpochDay: today
    });
  }, letterIds);

  await reloadLetters();
  assert.equal(await page.locator('[data-letters-ready-jump]').count(), 0, 'No jump link in all-ready state');
  assert.equal(await page.locator('[data-letter-state="sealed"]').count(), 0, 'No waiting list rendered');
  assert.ok(await page.locator('#opened').isVisible(), 'Open section is at top of screen');

  // Cleanup letters
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const all = await journal.letters.getLetters(100);
    for (const l of all) {
      await journal.letters.deleteLetter(l.id);
    }
  });

  console.log('PASS: ready letters count/jump, boundary eligibility, sealed safety, navigation back position, no-ready and all-ready states');
} finally {
  await browser.close();
  await server.close();
}
