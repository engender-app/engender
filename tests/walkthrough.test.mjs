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

async function fresh(path = '/') {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
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
  ok('search live results');
} catch (e) { fail('search', e); }

/* 6. stats range + value list */
try {
  await fresh('/stats');
  await page.locator('[data-range="90"]').click();
  const title = await page.locator('.screen-title').textContent();
  if (!title.includes('90')) throw new Error('title: ' + title);
  await page.locator('.chart-card').first().click();
  await page.waitForSelector('.value-row');
  ok('stats range + value list');
} catch (e) { fail('stats', e); }

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

/* 11. export: wrong password, plain export confirm */
try {
  await fresh('/settings/export');
  await page.locator('[data-pick-file]').click();
  await page.locator('#imp-pass').fill('wrongpass');
  await page.locator('[data-import]').click();
  await page.waitForSelector('[role="alert"]');
  await page.locator('[data-plain="csv"]').click();
  await page.waitForSelector('.sheet .notice-danger');
  await page.locator('[data-confirm-plain]').click();
  await page.waitForSelector('.toast');
  ok('wrong password + plain export warn/confirm');
} catch (e) { fail('export/import', e); }

/* 12. app lock */
try {
  await fresh('/settings/lock');
  for (const k of ['1', '2', '3', '4']) await page.locator(`[data-key="${k}"]`).click();
  await page.waitForFunction(() => location.pathname === '/', null, { timeout: 4000 });
  ok('app lock PIN unlocks to Home');
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

  /* Sampled at DOMContentLoaded: the body has been parsed by then, so
     anything already stamped on <html> was stamped before the first paint
     could show the wrong theme. Hydration is still several ticks away. */
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      window.__themeAtDomReady = { ...document.documentElement.dataset };
    });
  });
  await page.reload({ waitUntil: 'networkidle' });

  const early = await page.evaluate(() => window.__themeAtDomReady);
  if (early?.theme !== 'dark' || early?.palette !== 'lesbian') {
    throw new Error('before first paint: ' + JSON.stringify(early));
  }
  ok('theme and palette persist and apply before first paint');
} catch (e) { fail('boot preferences', e); }

if (errors.length) fail('no uncaught page errors', errors.slice(0, 6).join('; '));

const failures = finish('ALL FLOWS PASS');
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);
