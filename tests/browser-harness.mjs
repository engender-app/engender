/* Shared by the three browser-driven scripts (browser-tier/run.mjs,
   browser-tier/verify-build.mjs, walkthrough.test.mjs - ticket 20): the
   PASS/FAIL reporting and the Chromium launch, which used to be declared
   three times over, including three copies of the same hardcoded
   /usr/bin/chromium-browser path. Starting the actual server each script
   drives Chromium against stays with that script - a probe-page server, a
   built-app preview server and a real dev server are different enough not
   to share. `fillDate` joined the same way (redesign ticket 17), once the
   walkthrough and a gallery script both needed it. */
import { chromium } from 'playwright-core';
import { SETTLE_PAGE_EXPRESSION } from './yank-sweep-core.mjs';

const DEFAULT_CHROMIUM_PATH = '/usr/bin/chromium-browser';

/** Launches headless Chromium. Set CHROMIUM_PATH to point at a different
    binary (e.g. on a machine or CI image where chromium-browser lives
    somewhere else) instead of editing source. */
export function launchChromium(options = {}) {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? DEFAULT_CHROMIUM_PATH,
    headless: true,
    ...options,
  });
}

/** Launches headless Chromium against a real profile directory and returns
    the context, for the checks a throwaway incognito context cannot answer
    (ticket 03): Chromium calls an incognito profile uninstallable before it
    looks at anything else, and "restart the app" means a profile that was
    still there afterwards. The caller owns `userDataDir` and removes it. */
export function launchPersistentChromium(userDataDir, options = {}) {
  return chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.CHROMIUM_PATH ?? DEFAULT_CHROMIUM_PATH,
    headless: true,
    ...options,
  });
}

/** The date fields are DatePickers on flatpickr: the visible field is
    flatpickr's altInput and the ISO value lives on the hidden original, so
    typing into the field is not how a date gets set. The picker instance
    hangs off the element; setDate with fireChange runs the same onChange a
    real pick runs. */
export async function fillDate(page, selector, iso) {
  await page.evaluate(([sel, v]) => {
    const el = document.querySelector(sel);
    const fp = el?._flatpickr ?? el?.flatpickr;
    if (!fp) throw new Error(`no flatpickr instance on ${sel}`);
    fp.setDate(v, true);
  }, [selector, iso]);
}

/** A screen at rest, the yank sweep's own settle (ticket 100 wrote it;
 *  the hydration sweep, ticket 108, needed the same one for its sheet
 *  scenes and profile prologues): the page navigated, boot waited ready,
 *  a first run left if it was in the way, and the page-side settle
 *  stamped - toasts gone, demo bar hidden, theme on <html> the way
 *  +layout.svelte stamps it. */
export async function settlePage(page, base, path, theme) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.evaluate(() => document.querySelector('[data-leave-setup]')?.click());
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  /* The demo bar is hidden rather than removed since redesign ticket 33:
     setup's own scenes reach the flow through the demo's first-run control,
     and a removed bar takes the control with it. Nothing measures the bar
     either way - it is out of the frame and out of the flow. */
  await page.evaluate(SETTLE_PAGE_EXPRESSION(theme));
}

/** Collect compositor frames while `fn` runs, via CDP Page.startScreencast.
 *  Shared between tests/hydration-sweep.mjs and tests/yank-sweep.mjs. */
export async function screencast(page, fn) {
  const session = await page.context().newCDPSession(page);
  const frames = [];
  session.on('Page.screencastFrame', (ev) => {
    frames.push({ data: ev.data, at: ev.metadata.timestamp * 1000 });
    session.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  await session.send('Page.enable');
  try {
    await session.send('Page.startScreencast', {
      format: 'png',
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1
    });
    return await fn(frames);
  } finally {
    await session.send('Page.stopScreencast').catch(() => {});
    await session.detach().catch(() => {});
  }
}

/** Collects PASS/FAIL lines in the format all three scripts already
    printed, plus the closing summary line and failure count, and `block()`
    (ticket 06) for a group of checks that has an expected roster: without
    one, a throw partway through a block silently abandons whatever checks
    were still to come, and a summary that only counts failures says
    nothing happened. */
export function createReporter() {
  let failures = 0;
  let checks = 0;
  const ok = (name) => {
    checks++;
    console.log('PASS', name);
  };
  const fail = (name, detail) => {
    checks++;
    failures++;
    const message = detail instanceof Error ? (detail.message ?? String(detail)) : detail;
    console.log('FAIL', name, '—', message);
  };
  const finish = (passMessage) => {
    console.log(failures ? `\n${failures} FAILURE(S)` : `\n${passMessage}`);
    return failures;
  };

  /** Runs `fn`, which is expected to call `ok`/`fail` `expected` times
      between them. An exception inside `fn` is still reported once under
      `label`, exactly as an uninstrumented try/catch would - but whether it
      threw or just under-ran, a shortfall against `expected` is reported
      too, so a block that quietly ran fewer checks than it has cannot pass
      by omission. */
  const block = async (label, expected, fn) => {
    const before = checks;
    try {
      await fn();
    } catch (e) {
      fail(label, e?.message ?? String(e));
    }
    const ran = checks - before;
    if (ran < expected) {
      failures++;
      console.log('FAIL', label, `— ran ${ran} of ${expected} checks, the rest never ran`);
    }
  };

  return { ok, fail, finish, block };
}
