/* Screenshots of everything ticket 05 (dysphoria-safe cycle architecture,
   ADR-0043) changed about what names the cycle log, in every state it has
   and in both themes.

   What is under review is visibility, so every picture is of a state the
   rule decides: the More hub and side effects with the log unnamed (the
   default the demo profile arrives in), the Settings card that opts in,
   and the same surfaces once it is on - plus the regimen screen with and
   without a testosterone episode, which is the way in that needs no
   preference at all.

   Everything drives the app's own production build, which has to be a demo
   build (VITE_DEMO=1) or every screen renders as the passphrase gate. Each
   scenario builds the journal it needs through the screens themselves,
   exactly as a person would - the cycle events in the side-effects picture
   are typed in on the cycle screen first.

   One page per scenario, because a page is a profile: OPFS is per browser
   context, and "opted in" versus "not" is a difference in stored data.

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/cycle-visibility-gallery.mjs [outDir]
   Default outDir is the ticket's screenshots dir, gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.scratch/phase-5/deepening/screenshots'));

const SETTLED = 500;

await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];

/** A fresh page is a fresh journal. Also leaves the first run, which a
    profile this script just created always lands on. */
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

async function setLook(page, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function setOptIn(page, on) {
  await goto(page, '/settings');
  const current = await page.locator('[data-cycle-tracking-toggle] [role="switch"]').getAttribute('aria-checked');
  if ((current === 'true') !== on) {
    await page.locator('[data-cycle-tracking-toggle] [role="switch"]').click();
    await page.waitForFunction(
      (want) => document.querySelector('[data-cycle-tracking-toggle] [role="switch"]')?.getAttribute('aria-checked') === String(want),
      on
    );
  }
}

async function addCycleEvent(page, kind) {
  await goto(page, '/settings/cycle-events');
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-sheet]');
  await page.locator(`[data-sheet] button:has-text("${kind}")`).first().click();
  await page.locator('[data-sheet] [data-save-cycle-event]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.waitForTimeout(SETTLED);
}

async function addEpisode(page, { drug, dose, unit, route, interval }) {
  await goto(page, '/settings/regimen');
  await page.locator('[data-add]').click();
  await page.locator('[data-own]').click();
  await page.fill('#regimen-drug', drug);
  await page.fill('#regimen-dose', dose);
  await page.fill('#regimen-dose-unit', unit);
  await page.fill('#regimen-route', route);
  await page.fill('#regimen-interval', interval);
  await page.locator('[data-save-regimen]').click();
  await page.waitForSelector(`[data-episode]:has-text("${drug}")`);
}

async function shoot(page, name) {
  /* Headless Chromium never grants persistent storage, so the app's own
     "export backups regularly" toast sits over the foot of every screen.
     It is a true notice about this browser and it is not what these
     pictures are of. */
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

const THEMES = ['light', 'dark'];

/* ---------- More hub: the cycle row is there, or it is nobody's ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, theme);

  // Default: no testosterone, no opt-in. Health runs labs to clinician
  // summary with no cycle row in it.
  await goto(page, '/more');
  await shoot(page, `more-default-${theme}`);

  // The opt-in, and what the hub looks like after it.
  await setOptIn(page, true);
  await goto(page, '/more');
  await shoot(page, `more-optin-${theme}`);

  // The card that did it, with the switch resting on.
  await goto(page, '/settings');
  await page.locator('[data-cycle-tracking-toggle]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SETTLED);
  await shoot(page, `settings-toggle-${theme}`);

  // Off again: this profile's remaining pictures are the default-state ones.
  await setOptIn(page, false);
  await page.close();
}

/* ---------- Side effects: the cycle area, once something is in it ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, theme);
  await setOptIn(page, true);

  // Two events, so the area shows rows rather than only the link out.
  await addCycleEvent(page, 'Spotting');
  await addCycleEvent(page, 'Period occurred');
  await goto(page, '/settings/side-effects');
  await page.waitForSelector('[data-cycle-event]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `side-effects-cycle-${theme}`);
  await page.close();
}

/* ---------- Regimen: the cycle link belongs to the testosterone episode ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, theme);

  // A testosterone episode is the way in that asks no permission: the
  // link sits between the episodes and the dose log, and leaves when the
  // episode ends.
  await addEpisode(page, { drug: 'Testosterone cypionate', dose: '100', unit: 'mg', route: 'im', interval: 'weekly' });
  await page.waitForSelector('[data-cycle-events-link]');
  await page.waitForTimeout(SETTLED);
  await shoot(page, `regimen-testosterone-${theme}`);
  await page.close();
}

await browser.close();
await app.close();
process.stdout.write(`\n${shots.length} shots in ${outDir}\n`);
