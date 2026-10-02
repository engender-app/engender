/* Real-browser proof for ticket 04's sheet focus contract. Drives actual
   appointment, lab and dose screens because a component fixture cannot prove
   the date picker, mounted outside the screen, cooperates with the app shell
   and live routes.

   Pass an output directory to keep sign-off screenshots:
     node tests/sheet-focus-check.mjs .claude/ticket-04-shots */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createReporter, launchChromium } from './browser-harness.mjs';

const outDir = process.argv[2] ? resolve(process.argv[2]) : null;
if (outDir) await mkdir(outDir, { recursive: true });

const { ok, fail, finish, block } = createReporter();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

async function freshPage(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ...options
  });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  return { context, page };
}

async function goto(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
}

const activeState = (page) => page.evaluate(() => {
  const active = document.activeElement;
  const rect = active instanceof HTMLElement ? active.getBoundingClientRect() : null;
  return {
    id: active?.id ?? '',
    type: active instanceof HTMLInputElement ? active.type : '',
    inSheet: !!active?.closest?.('[data-sheet]'),
    inCalendar: !!active?.closest?.('[data-date-picker]'),
    visible: !!rect && rect.width > 0 && rect.height > 0
  };
});

async function openSheet(page, path) {
  await goto(page, path);
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-sheet]');
  await page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
}

async function shot(page, name) {
  if (!outDir) return;
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
}

await block('ticket 04 sheet focus', 13, async () => {
  const { context, page } = await freshPage();

  await openSheet(page, '/health/appointments');
  let active = await activeState(page);
  /* Kind is the first field. The dialog takes focus so opening the sheet
     does not raise the keyboard before a person chooses a text field. */
  if (active.visible && await page.locator('[data-sheet]').evaluate((sheet) => sheet === document.activeElement))
    ok('appointment sheet focuses its dialog without opening a keyboard');
  else fail('appointment sheet focuses its dialog without opening a keyboard', JSON.stringify(active));

  const dialogName = await page.locator('[data-sheet]').getAttribute('aria-label');
  if (dialogName?.trim()) ok('appointment sheet has a non-empty accessible dialog name');
  else fail('appointment sheet has a non-empty accessible dialog name', String(dialogName));

  await shot(page, '01-appointment-sheet-focus');

  const sheetTargets = await page.locator('[data-sheet]').evaluate((sheet) =>
    [...sheet.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.getClientRects().length > 0).length
  );
  let stayedInSheet = true;
  /* Focus starts on the dialog, so `sheetTargets` Tabs visit every control. */
  const visited = new Set();
  for (let i = 0; i < sheetTargets; i++) {
    await page.keyboard.press('Tab');
    const state = await activeState(page);
    stayedInSheet &&= state.inSheet && state.visible && state.type !== 'hidden';
    visited.add(await page.evaluate(() => {
      const el = document.activeElement;
      return `${el?.tagName}:${el?.id}:${el?.getAttribute?.('name')}:${el?.textContent?.trim()}`;
    }));
  }
  if (stayedInSheet && visited.size === sheetTargets)
    ok('forward Tab visits every visible enabled appointment control and wraps inside sheet');
  else fail('forward Tab visits every visible enabled appointment control and wraps inside sheet', `${visited.size}/${sheetTargets}, stayed=${stayedInSheet}`);

  stayedInSheet = true;
  await page.locator('#appointment-date').focus();
  for (let i = 0; i < sheetTargets - 1; i++) {
    await page.keyboard.press('Shift+Tab');
    const state = await activeState(page);
    stayedInSheet &&= state.inSheet && state.visible && state.type !== 'hidden';
  }
  if (stayedInSheet) ok('reverse Tab stays inside appointment sheet and skips hidden date input');
  else fail('reverse Tab stays inside appointment sheet and skips hidden date input', JSON.stringify(await activeState(page)));

  /* The picker is a sheet of its own over the appointment sheet: focus
     lands on its chosen day once it has risen, and Tab stays inside it. */
  await page.locator('#appointment-date').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.closest('[data-date-picker]'));
  await shot(page, '02-appointment-calendar-focus');
  const gridFocus = await activeState(page);
  await page.keyboard.press('Tab');
  active = await activeState(page);
  if (gridFocus.inCalendar && active.inCalendar && active.visible)
    ok('picker takes focus on its day and keeps Tab inside itself');
  else fail('picker takes focus on its day and keeps Tab inside itself', JSON.stringify({ gridFocus, active }));

  await page.locator('[data-date-picker] [data-sheet-focus]').focus();
  await page.keyboard.press('Shift+Tab');
  active = await activeState(page);
  if (active.inCalendar && active.visible)
    ok('reverse Tab from the picker grid stays within the picker');
  else fail('reverse Tab from the picker grid stays within the picker', JSON.stringify(active));

  await page.locator('[data-date-picker] [data-sheet-focus]').focus();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-date-picker]', { state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.id === 'appointment-date');
  const afterFirstEscape = {
    calendars: await page.locator('[data-date-picker]').count(),
    sheets: await page.locator('[data-sheet]').count(),
    active: await activeState(page)
  };
  if (afterFirstEscape.calendars === 0 && afterFirstEscape.sheets === 1 && afterFirstEscape.active.id === 'appointment-date')
    ok('first Escape closes calendar, restores its launcher and leaves appointment sheet open');
  else fail('first Escape closes calendar and leaves appointment sheet open', JSON.stringify(afterFirstEscape));

  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  if (await page.locator('[data-add]').evaluate((el) => el === document.activeElement))
    ok('second Escape closes appointment sheet and restores launcher focus');
  else fail('second Escape closes appointment sheet and restores launcher focus', JSON.stringify(await activeState(page)));

  await openSheet(page, '/health/appointments');
  await page.evaluate(() => document.querySelector('[data-add]')?.remove());
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  active = await activeState(page);
  if (active.visible && !active.inSheet) ok('removed launcher restores focus to a surviving nearby control');
  else fail('removed launcher restores focus to a surviving nearby control', JSON.stringify(active));

  await context.close();

  for (const [path, label] of [['/care/labs', 'lab'], ['/care/doses', 'dose']]) {
    const fresh = await freshPage();
    await openSheet(fresh.page, path);
    active = await activeState(fresh.page);
    const named = !!(await fresh.page.locator('[data-sheet]').getAttribute('aria-label'))?.trim();
    if (active.inSheet && active.visible && active.type !== 'hidden' && named)
      ok(`${label} sheet announces itself and focuses a visible enabled control`);
    else fail(`${label} sheet announces itself and focuses a visible enabled control`, JSON.stringify({ active, named }));
    await shot(fresh.page, label === 'lab' ? '03-lab-sheet-focus' : '04-dose-sheet-focus');
    await fresh.context.close();
  }

  const reduced = await freshPage({ reducedMotion: 'reduce' });
  await goto(reduced.page, '/health/appointments');
  await reduced.page.locator('[data-add]').click();
  const lockedDuringOpen = await reduced.page.evaluate(() =>
    [...document.querySelector('[data-app-root]').children]
      .filter((child) => !child.contains(document.querySelector('[data-sheet-scrim]')))
      .every((child) => child.hasAttribute('inert'))
  );
  await reduced.page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
  active = await activeState(reduced.page);
  if (lockedDuringOpen && active.visible && active.type !== 'hidden')
    ok('reduced-motion opening locks background and focuses visible control');
  else fail('reduced-motion opening locks background and focuses visible control', JSON.stringify({ lockedDuringOpen, active }));
  await reduced.context.close();

  const interrupted = await freshPage();
  await goto(interrupted.page, '/health/appointments');
  await interrupted.page.locator('[data-add]').click();
  const lockedBeforeEntranceEnds = await interrupted.page.evaluate(() =>
    [...document.querySelector('[data-app-root]').children]
      .filter((child) => !child.contains(document.querySelector('[data-sheet-scrim]')))
      .every((child) => child.hasAttribute('inert'))
  );
  await interrupted.page.keyboard.press('Escape');
  await interrupted.page.waitForSelector('[data-sheet]', { state: 'detached' });
  const unlockedAfterInterrupt = await interrupted.page.evaluate(() =>
    !document.querySelector('[data-app-root] > [inert]')
  );
  if (lockedBeforeEntranceEnds && unlockedAfterInterrupt)
    ok('interrupted opening never exposes background and releases it after close');
  else fail('interrupted opening never exposes background and releases it after close', JSON.stringify({ lockedBeforeEntranceEnds, unlockedAfterInterrupt }));
  await interrupted.context.close();
});

process.exitCode = finish('ticket 04 sheet focus checks passed') ? 1 : 0;
await browser.close();
await app.httpServer.close();
