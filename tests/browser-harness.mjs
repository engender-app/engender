/* Shared by the three browser-driven scripts (browser-tier/run.mjs,
   browser-tier/verify-build.mjs, walkthrough.test.mjs - ticket 20): the
   PASS/FAIL reporting and the Chromium launch, which used to be declared
   three times over, including three copies of the same hardcoded
   /usr/bin/chromium-browser path. Starting the actual server each script
   drives Chromium against stays with that script - a probe-page server, a
   built-app preview server and a real dev server are different enough not
   to share. `fillDate` joined the same way (redesign ticket 17), once the
   walkthrough and a gallery script both needed it. `previewBuild` is the
   one exception to that: every probe that takes `--root` needs the same
   chdir, and twelve copies of it had already gone wrong (ticket 226). */
import { chromium, firefox, webkit } from 'playwright-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveBuild } from './serve-build.mjs';
import { SETTLE_PAGE_EXPRESSION } from './yank-sweep-core.mjs';

const DEFAULT_CHROMIUM_PATH = '/usr/bin/chromium-browser';
const NO_CRASH_REPORTER = ['--disable-crash-reporter', '--disable-breakpad'];

/** Launches headless Chromium. Set CHROMIUM_PATH to point at a different
    binary (e.g. on a machine or CI image where chromium-browser lives
    somewhere else) instead of editing source.

    The crash reporter is off in both launchers (ticket 239): system
    Chromium aborted at startup inside crash_reporter::InitializeCrashpad
    seven times on 2026-09-24, and each core dump raised a notification on
    the desktop. Neither flag touches rendering. A caller's own `args`
    are kept after them. */
/** @param {import('playwright-core').LaunchOptions} options */
export function launchChromium(options = {}) {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? DEFAULT_CHROMIUM_PATH,
    headless: true,
    ...options,
    args: [...NO_CRASH_REPORTER, ...(options.args ?? [])],
  });
}

/** Launches headless Chromium against a real profile directory and returns
    the context, for the checks a throwaway incognito context cannot answer
    (ticket 03): Chromium calls an incognito profile uninstallable before it
    looks at anything else, and "restart the app" means a profile that was
    still there afterwards. The caller owns `userDataDir` and removes it. */
/** @param {string} userDataDir
 * @param {Parameters<typeof chromium.launchPersistentContext>[1]} options */
export function launchPersistentChromium(userDataDir, options = {}) {
  return chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.CHROMIUM_PATH ?? DEFAULT_CHROMIUM_PATH,
    headless: true,
    ...options,
    args: [...NO_CRASH_REPORTER, ...(options.args ?? [])],
  });
}

/** Selects the runtime for capability checks without changing Chromium callers. */
export function browserEngine() {
  const engine = process.env.BROWSER_ENGINE ?? 'chromium';
  if (engine !== 'chromium' && engine !== 'firefox' && engine !== 'webkit') throw new Error(`Unknown browser engine: ${engine}`);
  return engine;
}

/** @param {import('playwright-core').LaunchOptions} options */
export function launchBrowser(options = {}) {
  const engine = browserEngine();
  if (engine === 'chromium') return launchChromium(options);
  const executablePath = process.env[`${engine.toUpperCase()}_PATH`];
  return ({ firefox, webkit })[engine].launch({ headless: true, ...(executablePath ? { executablePath } : {}), ...options });
}

/** @param {string} userDataDir
 * @param {Parameters<typeof chromium.launchPersistentContext>[1]} options */
export function launchPersistentBrowser(userDataDir, options = {}) {
  const engine = browserEngine();
  if (engine === 'chromium') return launchPersistentChromium(userDataDir, options);
  const executablePath = process.env[`${engine.toUpperCase()}_PATH`];
  return ({ firefox, webkit })[engine].launchPersistentContext(userDataDir, {
    headless: true, ...(executablePath ? { executablePath } : {}), ...options
  });
}

/** Puts a date into a DatePicker the way a person types one: a tap on the
    field opens the picker, whose foot takes `yyyy-mm-dd` and "Use date".
    Waits for the picker to have gone, so the next step starts on the
    screen again. A date outside the field's bounds leaves the picker open
    with its field marked invalid, and this times out on the wait. */
/** @param {import('playwright-core').Page} page
 * @param {string} selector
 * @param {string} iso */
export async function fillDate(page, selector, iso) {
  await page.locator(selector).click();
  const picker = page.locator('[data-date-picker]');
  await picker.locator('[data-date-picker-entry]').fill(iso);
  await picker.locator('[data-date-picker-apply]').click();
  await picker.waitFor({ state: 'detached' });
}

/** WebKit's ephemeral runtime rejects OPFS on Linux. Capability checks use
    independent normal profiles there; private-mode behavior is checked separately. */
/** @param {import('playwright-core').Browser} browser
 * @param {import('playwright-core').BrowserContextOptions} options */
export async function newCapabilityContext(browser, options = {}) {
  if (browserEngine() !== 'webkit') return browser.newContext(options);
  const profile = await mkdtemp(join(tmpdir(), 'engender-webkit-capability-'));
  let context;
  try { context = await launchPersistentBrowser(profile, options); }
  catch (error) { await rm(profile, { recursive: true, force: true }); throw error; }
  context.on('close', () => { void rm(profile, { recursive: true, force: true }); });
  return context;
}

/** The `yyyy-mm-dd` a DatePicker field holds. The field itself shows the
    day written out ("3 Oct 2026", after-release 28), so its `inputValue()`
    is what a person reads; the stored value rides on `data-date-value`. */
/** @param {import('playwright-core').Locator} locator */
export async function dateValue(locator) {
  return locator.getAttribute('data-date-value');
}

/** Any field's value as a guard compares it: a DatePicker's stored
    `yyyy-mm-dd`, every other field's own value. */
/** @param {import('playwright-core').Locator} locator */
export async function fieldValue(locator) {
  return (await locator.getAttribute('data-date-value')) ?? (await locator.inputValue());
}

/** fillDate's twin for a TimePicker: the picker's foot takes `HH:MM` and
    "Use time". */
/** @param {import('playwright-core').Page} page
 * @param {string} selector
 * @param {string} hhmm */
export async function fillTime(page, selector, hhmm) {
  await page.locator(selector).click();
  const picker = page.locator('[data-time-picker]');
  await picker.locator('[data-time-picker-entry]').fill(hhmm);
  await picker.locator('[data-time-picker-apply]').click();
  await picker.waitFor({ state: 'detached' });
}

/** A screen at rest, the yank sweep's own settle (ticket 100 wrote it;
 *  the hydration sweep, ticket 108, needed the same one for its sheet
 *  scenes and profile prologues): the page navigated, boot waited ready,
 *  a first run left if it was in the way, and the page-side settle
 *  stamped - toasts gone, demo bar hidden, theme on <html> the way
 *  +layout.svelte stamps it. */
/** @param {import('playwright-core').Page} page
 * @param {string} base
 * @param {string} path
 * @param {string} theme */
export async function settlePage(page, base, path, theme) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  /* Attached, not visible: at a 200%-zoom width the demo bar wraps taller
     than the viewport and leaves the app no height at all until the settle
     below hides the bar, so waiting for it to be visible first never ends. */
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { state: 'attached', timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.evaluate(() => /** @type {HTMLElement | null} */ (document.querySelector('[data-leave-setup]'))?.click());
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
/** @template T
 * @param {import('playwright-core').Page} page
 * @param {(frames: {data: string, at: number}[]) => Promise<T>} fn */
export async function screencast(page, fn) {
  const session = await page.context().newCDPSession(page);
  /** @type {{data: string, at: number}[]} */
  const frames = [];
  session.on('Page.screencastFrame', (ev) => {
    frames.push({ data: ev.data, at: /** @type {number} */ (ev.metadata.timestamp) * 1000 });
    session.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  await session.send('Page.enable');
  let failure;
  try {
    await session.send('Page.startScreencast', {
      format: 'png',
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 1
    });
    return await fn(frames);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    /** @type {unknown[]} */
    const cleanupErrors = [];
    await session.send('Page.stopScreencast').catch((error) => cleanupErrors.push(error));
    await session.detach().catch((error) => cleanupErrors.push(error));
    if (cleanupErrors.length) throw new AggregateError(
      [...(failure ? [failure] : []), ...cleanupErrors],
      [failure && String(failure), ...cleanupErrors.map((error) => 'screencast cleanup failed: ' + String(error))].filter(Boolean).join('; ')
    );
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
  /** @param {string} name */
  const ok = (name) => {
    checks++;
    console.log('PASS', name);
  };
  /** @param {string} name
   * @param {unknown} detail */
  const fail = (name, detail) => {
    checks++;
    failures++;
    const message = detail instanceof Error ? (detail.message ?? String(detail)) : detail;
    console.log('FAIL', name, '—', message);
  };
  /* Sets the exit code itself. Six probes called finish() and ignored what
     it returned, so a run that printed FAILURE(S) still exited 0 and the
     guard runner recorded a pass (hosted run 37504870508). */
  /** @param {string} passMessage */
  const finish = (passMessage) => {
    console.log(failures ? `\n${failures} FAILURE(S)` : `\n${passMessage}`);
    if (failures) process.exitCode = 1;
    return failures;
  };

  /** Runs `fn`, which is expected to call `ok`/`fail` `expected` times
      between them. An exception inside `fn` is still reported once under
      `label`, exactly as an uninstrumented try/catch would - but whether it
      threw or just under-ran, a shortfall against `expected` is reported
      too, so a block that quietly ran fewer checks than it has cannot pass
      by omission. */
  /** @param {string} label
   * @param {number} expected
   * @param {() => unknown | Promise<unknown>} fn */
  const block = async (label, expected, fn) => {
    const before = checks;
    try {
      await fn();
    } catch (e) {
      fail(label, /** @type {{message?: unknown} | null | undefined} */ (e)?.message ?? String(e));
    }
    const ran = checks - before;
    if (ran < expected) {
      failures++;
      console.log('FAIL', label, `— ran ${ran} of ${expected} checks, the rest never ran`);
    }
  };

  return { ok, fail, finish, block };
}

/** A server over the built app in `root`, serving build/index.html itself
    under the production headers (serve-build.mjs, ticket 31). It was vite
    preview until then, whose document had no CSP and no held module hints.

    It still changes into `root` first, as it did for vite preview, whose
    SvelteKit adapter read the built server from the working directory
    (tickets 224 and 226): a probe given `--root <other tree>` that reads
    relative paths afterwards keeps reading that tree. Resolve any output
    path the caller takes before calling it. Without `--root` the root is
    the checkout the probe runs in and the change is a no-op. */
/** @param {string} root */
export function previewBuild(root) {
  process.chdir(root);
  return serveBuild(root);
}
