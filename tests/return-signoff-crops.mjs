/* Component crops off the return moment, for the sign-off page (redesign
   ticket 35).

   Whole screens are the wrong payload for a review of one ticket: a page
   that shows five screens every time is what Alicja asked sessions to stop
   doing (2026-09-07, ticket 07's sign-off - "only showcase the things that
   actually changed in this ticket"). So this shoots the elements the ticket
   changed, one PNG each, and the same script runs against main by giving it
   main's own selector for each of them.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/return-signoff-crops.mjs <outDir> [--before]
   `--before` uses main's selectors, since the notice the offer row replaces
   and the tab bar the foot replaces have names of their own.

   Trans, light: the ticket's brief says the screen is signed off in trans
   light. Both languages, because a step's field is never a fixed height and
   Polish is where a title or a reason line grows one - "Zaplanowana dawka
   na 7 września 2026" is nine characters longer than its English. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const argv = process.argv.slice(2);
const before = argv.includes('--before');
const outDir = resolve(argv.find((a) => !a.startsWith('--')) ?? '.claude/return-crops');

/** What to crop, per side. The key is what the sign-off page pairs on. */
const PARTS = before
  ? {
      field: '[data-screen-header]',
      list: '[data-list-card]',
      offer: '[data-coming-back-item="wear-session"]',
      foot: '.app-nav'
    }
  : {
      field: '[data-screen-header]',
      list: '[data-list-card]',
      offer: '[data-coming-back-item="wear-session"]',
      foot: '.return-foot'
    };

/** The sheet's own foot, which is the one thing in the sheets this ticket
    changed: the second control used to wear the offer's decline. Named the
    same on both sides, since the sheet's own markup did not move. */
const SHEET_PART = '.coming-back-sheet-actions';

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'light'
});

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

const bare = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });

const shot = async (name, selector) => {
  const el = page.locator(selector).first();
  if (!(await el.count())) {
    console.log(`skip ${name}: no ${selector}`);
    return;
  }
  await el.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`${name}: ${selector}`);
};

/* The wear sheet's yes, which is on a different control per side. */
const openWear = before
  ? '[data-coming-back-item="wear-session"] [data-notice-action]'
  : '[data-coming-back-yes="wear-session"]';

/** The whole set, in one language. The language control is a segmented
    control on the settings screen whose values are system/en/pl, and the
    theme's are system/light/dark, so the two never collide; picking one
    reloads the app. */
async function pass(locale) {
  const tag = locale === 'en' ? '' : `-${locale}`;
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator('[data-segment="light"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.locator(`[data-segment="${locale}"]`).click();
  await page.waitForTimeout(900);

  /* The empty state first, while the journal still stops today: it is the
     screen reached by hand with nothing waiting, which ADR-0062 says the
     route must draw rather than redirect away from, and seeding the gap
     would take it off the table. */
  await settle('/coming-back');
  await bare();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, `empty${tag}.png`) });
  console.log(`empty${tag}: nothing waiting`);

  await settle('/');
  await page.locator('[data-fill-coming-back]').click();
  await page.waitForURL('**/coming-back', { timeout: 180000 });
  await page.waitForSelector('[data-coming-back-item="dose"]');
  await bare();
  await page.waitForTimeout(700);

  for (const [name, selector] of Object.entries(PARTS)) await shot(`${name}${tag}`, selector);
  await page.screenshot({ path: resolve(outDir, `screen${tag}.png`), fullPage: true });
  console.log(`screen${tag}: the whole step`);

  await page.locator(openWear).click();
  await page.waitForSelector('[data-coming-back-wear-confirm]');
  await page.waitForTimeout(500);
  await bare();
  await shot(`sheet-foot${tag}`, SHEET_PART);
}

await pass('en');
await pass('pl');

await browser.close();
await app.close();
