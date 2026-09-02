/* Screenshots of the log-a-dose sheet (phase 5 UX ticket 37), in every
   state it has and in both themes.

   The ticket exists because a click-through found the old sheet too big, so
   a click-through is what closes it: these are the pictures the redesign is
   signed off against.

   Everything here drives the app's own production build, which has to be a
   demo build (VITE_DEMO=1) or every screen renders as the passphrase gate.
   Nothing is faked at the component level, because what is under review is
   what the sheet does with a real regimen: the demo persona carries no
   regimen episode and no dose log, so each scenario builds the journal it
   needs through the regimen screen first, exactly as a person would.

   One page per scenario, because a page is a profile: OPFS is per browser
   context, and the difference between "one active episode" and "two" is a
   difference in stored data rather than in a prop.

   Run: npm run test:walkthrough  (or any VITE_DEMO=1 build) first, then
        node tests/dose-sheet-gallery.mjs [outDir]
   Default outDir is .claude/dose-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/dose-shots'));

/* Long enough for the sheet to rise (--dur-med, and the scrim crossfades
   with it) and for a group to open its own height. What is wanted in every
   frame here is the resting state, never a tween mid-flight. */
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

async function setLook(page, palette, theme) {
  await goto(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** One regimen episode, typed in rather than seeded: the route the sheet
    reads back is a free-text field, so it matters that these are the words
    a person would actually type. */
async function addEpisode(page, { drug, dose, unit, route, interval = 'daily' }) {
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

/** An alternating schedule on the episode just saved: 2mg one day, 1mg the
    next, which is the case the amount prefill exists for. The schedule
    editor only exists on an episode that has been saved, so this reopens
    the row rather than filling it in on the way past. */
async function addAlternatingSchedule(page, drug, amounts) {
  await goto(page, '/settings/regimen');
  await page.locator('[data-episode]', { hasText: drug }).click();
  await page.waitForSelector('[data-add-amount]');
  for (const [index, amount] of amounts.entries()) {
    await page.locator('[data-add-amount]').click();
    await page.fill(`[data-amount-dose="${index}"]`, String(amount.dose));
    await page.fill(`[data-amount-unit="${index}"]`, amount.doseUnit);
  }
  await page.locator('[data-save-schedule]').click();
  await page.waitForTimeout(SETTLED);
}

async function openSheet(page) {
  await goto(page, '/doses');
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-sheet]');
  await page.waitForTimeout(SETTLED);
}

/** "Fill every feature", which is the only seed with a real rotation behind
    it: 500 days of weekly injections around six of the twelve sites, so the
    map has every swatch of the recency ramp and six sites never used
    (ticket 13). It resets the preferences too, so the look is set after
    this rather than before. */
async function fillEveryFeature(page) {
  await goto(page, '/settings/measurements');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more');
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

/** The sheet on the injectable episode. The full fixture runs two regimens
    at once, so which one this dose is has to be answered before the sheet
    knows it is asking about an injection site at all. */
async function openInjectionSheet(page) {
  await openSheet(page);
  // The sheet opens the what-group itself where more than one regimen is
  // running, which is exactly this seed, so the chips are already up.
  await page.locator('[data-dose-drug="Estradiol valerate"]').click();
  await page.waitForTimeout(SETTLED);
  const what = page.locator('[data-dose-what]');
  if ((await what.getAttribute('aria-expanded')) === 'true') {
    await what.click();
    await page.waitForTimeout(SETTLED);
  }
  await page.locator('button[data-site="thigh-left"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SETTLED);
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

/* Every scenario runs on both themes, and the two palettes at the ends of
   the range run on the sheet's two resting states. The sheet spends almost
   no flag colour - what changes between palettes is the accent a selected
   chip and a focused field take - so eight palettes across twelve states
   would be pictures nobody looks at. */
const THEMES = ['dark', 'light'];
const EXTRA_LOOKS = [
  ['nonbinary', 'light'],
  ['agender', 'dark']
];

const ORAL = { drug: 'Estradiol', dose: '4', unit: 'mg', route: 'oral' };
const INJECTED = { drug: 'Estradiol', dose: '40', unit: 'mg', route: 'IM every 7 days' };
const TOPICAL = { drug: 'Estradiol', dose: '1.5', unit: 'mg', route: 'gel' };

/* ---------- nothing to seed from ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await openSheet(page);
  await shoot(page, `dose-no-regimen-trans-${theme}`);
  await page.close();
}

/* ---------- one oral regimen: the sheet's resting state, and each line ---------- */
for (const [palette, theme] of [...THEMES.map((t) => ['trans', t]), ...EXTRA_LOOKS]) {
  const page = await freshPage();
  await setLook(page, palette, theme);
  await addEpisode(page, ORAL);
  await openSheet(page);
  await shoot(page, `dose-oral-closed-${palette}-${theme}`);

  if (palette === 'trans') {
    for (const line of ['what', 'when', 'status']) {
      await page.locator(`[data-dose-${line}]`).click();
      await page.waitForTimeout(SETTLED);
      await shoot(page, `dose-oral-${line}-open-trans-${theme}`);
      await page.locator(`[data-dose-${line}]`).click();
      await page.waitForTimeout(SETTLED);
    }

    // The correction job: status opened, and changed picked inside it.
    await page.locator('[data-dose-status]').click();
    await page.waitForTimeout(SETTLED);
    await page.locator('[data-segment="changed"]').click();
    await page.waitForTimeout(SETTLED);
    await shoot(page, `dose-oral-changed-trans-${theme}`);
  }
  await page.close();
}

/* ---------- an injected regimen: the site map, and a second dose ---------- */
for (const [palette, theme] of [...THEMES.map((t) => ['trans', t]), ...EXTRA_LOOKS]) {
  const page = await freshPage();
  await setLook(page, palette, theme);
  await addEpisode(page, INJECTED);
  await openSheet(page);
  await shoot(page, `dose-injection-first-${palette}-${theme}`);

  // Save one, so the next one has a rotation to read: the map marks where
  // the last one went and the sheet fills the vehicle in from it.
  // The map's dot, not the row of the same name in the recency list under it.
  await page.locator('button[data-site="ventrogluteal-left"]').click();
  await page.locator('[data-save-dose]').click();
  await page.waitForSelector('[data-dose]');
  await openSheet(page);
  await shoot(page, `dose-injection-second-${palette}-${theme}`);

  if (palette === 'trans') {
    await page.locator('[data-dose-what]').click();
    await page.waitForTimeout(SETTLED);
    await shoot(page, `dose-injection-what-open-trans-${theme}`);
    await page.keyboard.press('Escape');

    // Editing the dose already logged, which is the same sheet plus a way
    // to throw the dose away.
    await page.waitForTimeout(SETTLED);
    await page.locator('[data-dose]').first().click();
    await page.waitForTimeout(SETTLED);
    await shoot(page, `dose-edit-existing-trans-${theme}`);
  }
  await page.close();
}

/* ---------- a topical regimen: a flat row of sites, not the map ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await addEpisode(page, TOPICAL);
  await openSheet(page);
  await shoot(page, `dose-topical-trans-${theme}`);
  await page.close();
}

/* ---------- two active episodes: the one question the app cannot answer ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await addEpisode(page, ORAL);
  await addEpisode(page, { drug: 'Spironolactone', dose: '100', unit: 'mg', route: 'oral' });
  await openSheet(page);
  await shoot(page, `dose-two-episodes-trans-${theme}`);
  await page.close();
}

/* ---------- an alternating schedule: the amount comes off the slot ---------- */
for (const theme of THEMES) {
  const page = await freshPage();
  await setLook(page, 'trans', theme);
  await addEpisode(page, ORAL);
  await addAlternatingSchedule(page, ORAL.drug, [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ]);
  await openSheet(page);
  await shoot(page, `dose-alternating-schedule-trans-${theme}`);
  await page.close();
}

/* ---------- the recency ramp on the dots (ticket 13) ----------
   All eight palettes and both themes, unlike the scenarios above: what the
   map spends is the accent's own heat ramp, so this is the one part of the
   sheet where every palette is a different picture. The map is shot on its
   own as well as in the sheet, because the two states the ramp has to keep
   apart - the palest step and a site never used - are a judgment about
   22px dots. */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    const page = await freshPage();
    await fillEveryFeature(page);
    await setLook(page, palette, theme);
    await openInjectionSheet(page);
    await shoot(page, `dose-recency-${palette}-${theme}`);
    await page.locator('.site-map').screenshot({ path: `${outDir}/dose-recency-map-${palette}-${theme}.png` });
    process.stdout.write(`  dose-recency-map-${palette}-${theme}\n`);

    /* The sheet as a screen, at the two places a person stops scrolling:
       the whole figure with its key, and the list. Asked for by Alicja on
       2026-09-02 - "no screen with a list visible" - and it is the shot
       that shows what the figure's height costs, which is why the figure is
       420px and not the 560px it was. */
    if (palette === 'trans') {
      for (const [name, handle] of [
        ['map', '.site-map'],
        ['list', '.site-recency-list']
      ]) {
        await page.locator(handle).scrollIntoViewIfNeeded();
        await page.waitForTimeout(SETTLED);
        await shoot(page, `dose-recency-frame-${name}-${theme}`);
      }
    }

    /* The three channels at once, on the palette the app opens on: a fill
       per site's recency, the dashed ring where the last injection went,
       and the ring around the site tapped for this dose. Then the keyboard,
       because a dot is a 48px button with no fill of its own and the focus
       ring is the only thing that says which one is in hand. */
    if (palette === 'trans') {
      await page.locator('button[data-site="loveHandle-right"]').click();
      await page.waitForTimeout(SETTLED);
      await shoot(page, `dose-recency-picked-${theme}`);
      await page.locator('.site-map').screenshot({ path: `${outDir}/dose-recency-picked-map-${theme}.png` });

      /* Shift+Tab off the dot just tapped, rather than focus() on
         another: :focus-visible answers to how the focus arrived, so a
         programmatic focus draws no ring and would picture nothing. */
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(SETTLED);
      await page.locator('.site-map').screenshot({ path: `${outDir}/dose-recency-focus-map-${theme}.png` });
      process.stdout.write(`  dose-recency-focus-map-${theme}\n`);
    }
    await page.close();
  }
}

await browser.close();
await app.close();

process.stdout.write(`\n${shots.length} shots in ${outDir}\n`);
