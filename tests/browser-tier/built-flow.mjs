/** Shared first-run and navigation steps for the production browser checks. */
export const JOURNAL_SECRET = 'verify-build passphrase';

export async function ready(page) {
  await page.locator('[data-app-root][data-boot="ready"]').waitFor({ timeout: 60000 });
}

export async function choosePassphrase(page, secret = JOURNAL_SECRET, waitForReady = true) {
  await page.locator('[data-access-modes]').waitFor();
  await page.locator('[data-list-row="passphrase"]').click();
  await page.locator('[data-access-continue]').click();
  await page.locator('#am-passphrase').fill(secret);
  await page.locator('#am-passphrase-confirm').fill(secret);
  await page.locator('[data-access-submit]').click();
  if (waitForReady) await ready(page);
}

export async function reachAccessSetup(page, origin) {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('[data-next]').waitFor();
  for (let step = 0; step < 12 && await page.locator('[data-next]').count(); step++) {
    await page.locator('[data-next]').click();
  }
}

export async function firstRun(page, origin, secret = JOURNAL_SECRET) {
  await reachAccessSetup(page, origin);
  await choosePassphrase(page, secret);
  for (let step = 0; step < 12 && await page.locator('[data-next]').count(); step++) {
    await page.locator('[data-next]').click();
  }
  await page.locator('[data-finish]').click();
  await page.locator('[data-home-hello]').waitFor();
}

export async function unlock(page, secret = JOURNAL_SECRET) {
  await page.locator('#journal-passphrase').fill(secret);
  await page.locator('[data-passphrase-submit]').click();
  await ready(page);
}

/** Observe genuine transitions without changing their timing or outcome. */
export async function trackTransitions(context) {
  await context.addInitScript(() => {
    window.capabilityTransitions = new Set();
    const start = document.startViewTransition;
    if (!start) return;
    document.startViewTransition = function (...args) {
      const transition = start.apply(this, args);
      const settled = transition.finished.catch(() => {}).finally(() => window.capabilityTransitions.delete(settled));
      window.capabilityTransitions.add(settled);
      return transition;
    };
  });
}

async function settleNavigation(page) {
  await page.evaluate(async () => {
    while (window.capabilityTransitions?.size) await Promise.all([...window.capabilityTransitions]);
  });
}

export async function clientRoute(page, path, discard = false) {
  await settleNavigation(page);
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  if (discard) {
    await page.locator('[data-discard-record]').waitFor();
    await page.locator('[data-discard-record]').click();
  }
  await page.waitForFunction((path) => location.pathname === path.split('?')[0], path);
  await page.waitForLoadState('networkidle');
  await settleNavigation(page);
}

export async function openSection(page, section) {
  const chip = page.locator(`[data-section-chip="${section}"]`);
  if (await chip.getAttribute('aria-expanded') !== 'true') await chip.click();
  await page.locator(`[data-editor-section="${section}"]`).waitFor();
}

export async function pickFile(page, trigger, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(trigger).click();
  await (await chooser).setFiles(file);
}
