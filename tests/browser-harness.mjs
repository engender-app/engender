/* Shared by the three browser-driven scripts (browser-tier/run.mjs,
   browser-tier/verify-build.mjs, walkthrough.test.mjs - ticket 20): the
   PASS/FAIL reporting and the Chromium launch, which used to be declared
   three times over, including three copies of the same hardcoded
   /usr/bin/chromium-browser path. Starting the actual server each script
   drives Chromium against stays with that script - a probe-page server, a
   built-app preview server and a real dev server are different enough not
   to share. */
import { chromium } from 'playwright-core';

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

/** Collects PASS/FAIL lines in the format all three scripts already
    printed, plus the closing summary line and failure count. */
export function createReporter() {
  let failures = 0;
  const ok = (name) => console.log('PASS', name);
  const fail = (name, detail) => {
    failures++;
    const message = detail instanceof Error ? (detail.message ?? String(detail)).split('\n')[0] : detail;
    console.log('FAIL', name, '—', message);
  };
  const finish = (passMessage) => {
    console.log(failures ? `\n${failures} FAILURE(S)` : `\n${passMessage}`);
    return failures;
  };
  return { ok, fail, finish };
}
