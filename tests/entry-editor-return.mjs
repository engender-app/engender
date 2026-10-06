/* The entry editor's Save name, date line, return path and delete (phase 14
   pre-release ticket 03: audit findings U1, U3, U4, U5), and its header,
   media sections and unset scales (phase 15 after-release ticket 04: UI-01,
   UX-05, UX-17).

   Holds:
   - Save is a button with a name in the accessibility tree, at 390 and 1280
     (the live region sits beside it, not inside it);
   - the date line sits clear of the header and is what a tap on it lands on,
     for a new and an existing entry at 390 and 1280;
   - Save and Delete on an entry opened from Calendar, Search, a day and
     On this day return to that screen; Search comes back with its query;
   - Delete says "Moved to trash" with Restore, Restore brings the entry
     back, and a failed delete says so on screen;
   - the header's field spans the same box as Care's and Day's, and the
     blocks under it take the screen's 20px floor;
   - tapping Photos, Voice or Video leaves the opened section above the foot
     with its chip still on screen;
   - an untouched scale draws no thumb and no fill, and saving the entry
     stores no value for it.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/entry-editor-return.mjs
   or against a build some other server already serves (a base build, to
   watch the checks fail): node tests/entry-editor-return.mjs --base <url>
   Exits 1 on any failure. */
import { launchChromium, previewBuild, settlePage, createReporter } from './browser-harness.mjs';
import {
  DEMO_THEME_EXPRESSION,
  FILL_EVERY_FEATURE_EXPRESSION,
  INIT_HIDE_DEMO_SCRIPT,
  RESET_PERSONA_EXPRESSION,
  STUB_PERSIST_SCRIPT
} from './yank-sweep-core.mjs';

const { ok, fail, finish, block } = createReporter();
const baseArg = process.argv.indexOf('--base');
const app = baseArg > 0 ? null : await previewBuild(process.cwd());
const base = baseArg > 0 ? process.argv[baseArg + 1] : `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

/** A client-side navigation, the way a tapped link does it: the app's own
    history gets an entry, which is what "back" returns through. */
const go = (page, href) =>
  page.evaluate((h) => {
    const a = document.createElement('a');
    a.href = h;
    document.body.append(a);
    a.click();
    a.remove();
  }, href);

async function persona(page) {
  await settlePage(page, base, '/', 'light');
  if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
  await page.waitForTimeout(1200);
  await page.evaluate(DEMO_THEME_EXPRESSION('light'));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { state: 'attached' });
  await page.waitForSelector('[data-home-hello]');
}

async function newContext(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  await context.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await context.addInitScript(STUB_PERSIST_SCRIPT);
  return context;
}

/** The two facts about the editor's top that U3 broke: the date line is
    the header's subtitle now, so it is measured against the field above it. */
async function dateClearOfHeader(page) {
  await page.waitForSelector('[data-screen-subtitle]');
  await page.waitForFunction(() => document.querySelector('[data-screen-subtitle]')?.textContent?.trim());
  return page.evaluate(() => {
    const field = document.querySelector('[data-screen-field]');
    const date = document.querySelector('[data-screen-subtitle]');
    const h = field.getBoundingClientRect();
    const d = date.getBoundingClientRect();
    const hit = document.elementFromPoint(d.left + d.width / 2, d.top + 1);
    return { headerBottom: h.bottom, dateTop: d.top, hitIsDate: !!hit && date.contains(hit) };
  });
}

/** Waits until the screen's boxes stop moving: no finite animation left
    running, then the same rects twice 600ms apart. */
async function settled(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const finite = () => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
    for (let i = 0; i < 100 && finite().length; i++) await sleep(50);
    const rects = () => JSON.stringify([...document.querySelectorAll('[data-screen-field], [data-editor-section], [data-editor-chips], [data-app-savebar]')]
      .map((el) => el.getBoundingClientRect()));
    let last = rects();
    for (let i = 0; i < 20; i++) {
      await sleep(600);
      const now = rects();
      if (now === last) return;
      last = now;
    }
  });
}

/** The field's box and the gap under the header, on whatever screen is up. */
const fieldBox = (page) =>
  page.evaluate(() => {
    const field = document.querySelector('[data-screen-field]').getBoundingClientRect();
    const header = document.querySelector('[data-screen-header]');
    const next = header.nextElementSibling;
    return {
      left: field.left,
      right: field.right,
      height: field.height,
      gapUnder: next ? next.getBoundingClientRect().top - header.getBoundingClientRect().bottom : null
    };
  });

async function saveName(page) {
  const snap = await page.locator('[data-save]').ariaSnapshot();
  const name = /button "([^"]+)"/.exec(snap)?.[1] ?? '';
  const inside = await page.evaluate(() => !!document.querySelector('[data-save] [role="status"], [data-save] [aria-live]'));
  return { name, inside, snap };
}

try {
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const context = await newContext(width, height);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await persona(page);

    await block(`editor header field matches Care and Day at ${width}`, 3, async () => {
      const boxes = {};
      for (const path of ['/care', '/day/today', '/entry/new/today']) {
        await go(page, path);
        await page.waitForSelector('[data-screen-field]');
        if (path.startsWith('/entry')) await page.waitForSelector('[data-save]');
        await settled(page);
        boxes[path] = await fieldBox(page);
      }
      const entry = boxes['/entry/new/today'];
      for (const other of ['/care', '/day/today']) {
        const box = boxes[other];
        const same = Math.abs(entry.left - box.left) < 0.5 && Math.abs(entry.right - box.right) < 0.5;
        if (same) ok(`the editor's field spans the same box as ${other} at ${width}`);
        else fail(`the editor's field spans the same box as ${other} at ${width}`, JSON.stringify({ entry, [other]: box }));
      }
      if (entry.gapUnder != null && Math.abs(entry.gapUnder - 20) < 0.5) ok(`the block under the editor's header sits 20 below it at ${width}`);
      else fail(`the block under the editor's header sits 20 below it at ${width}`, JSON.stringify(entry));
    });

    await block(`editor top and Save name at ${width}`, 5, async () => {
      for (const target of ['/entry/new/today', 'existing']) {
        if (target === 'existing') {
          await go(page, '/day/today');
          await page.waitForSelector('a[href^="/entry/"]:not([href*="/new"])');
          await page.locator('a[href^="/entry/"]:not([href*="/new"])').first().click();
        } else {
          await go(page, target);
        }
        await page.waitForSelector('[data-save]');
        await page.waitForTimeout(700);
        const label = `${target === 'existing' ? 'existing' : 'new'} entry at ${width}`;
        const top = await dateClearOfHeader(page);
        if (top.dateTop >= top.headerBottom - 0.5 && top.hitIsDate) ok(`date line clear of the header, ${label}`);
        else fail(`date line clear of the header, ${label}`, JSON.stringify(top));
        const save = await saveName(page);
        if (save.name && !save.inside) ok(`Save has an accessible name ("${save.name}"), ${label}`);
        else fail(`Save has an accessible name, ${label}`, save.snap);
        if (target !== 'existing') {
          const live = await page.locator('[data-save-status]').count();
          if (live === 1) ok(`the live region is a sibling of Save, ${label}`);
          else fail(`the live region is a sibling of Save, ${label}`, `count ${live}`);
        }
      }
    });
    if (width === 390) {
      await block('an opened media section lands above the foot', 6, async () => {
        for (const section of ['photos', 'voice', 'video']) {
          await go(page, '/entry/new/today');
          await page.waitForSelector(`[data-section-chip="${section}"]`);
          await settled(page);
          /* Scrolled to the end, the way a thumb reaches the chips after
             the note and the scales: the chips are the last row, so the
             region has no room left to scroll until the section grows. */
          await page.evaluate(() => {
            const region = document.querySelector('[data-app-scroll-region]');
            region.scrollTop = region.scrollHeight;
          });
          await settled(page);
          await page.evaluate((s) => document.querySelector(`[data-section-chip="${s}"]`).click(), section);
          await page.waitForSelector(`[data-editor-section="${section}"]`);
          await settled(page);
          const geo = await page.evaluate((s) => {
            const sec = document.querySelector(`[data-editor-section="${s}"]`).getBoundingClientRect();
            const chips = document.querySelector('[data-editor-chips]').getBoundingClientRect();
            const foot = document.querySelector('[data-app-savebar]').getBoundingClientRect();
            const region = document.querySelector('[data-app-scroll-region]').getBoundingClientRect();
            return { sectionBottom: sec.bottom, footTop: foot.top, chipsTop: chips.top, regionTop: region.top };
          }, section);
          if (geo.sectionBottom <= geo.footTop) ok(`${section} opens above the foot`);
          else fail(`${section} opens above the foot`, JSON.stringify(geo));
          if (geo.chipsTop >= geo.regionTop) ok(`${section}'s chip stays on screen`);
          else fail(`${section}'s chip stays on screen`, JSON.stringify(geo));
        }
      });

      await block('an untouched scale draws nothing and stores nothing', 3, async () => {
        await go(page, '/entry/new/today');
        await page.waitForSelector('.dim-slider');
        await settled(page);
        const drawn = await page.evaluate(() =>
          [...document.querySelectorAll('.dim-slider.is-unset')].map((s) => ({
            thumb: getComputedStyle(s.querySelector('.slider-thumb')).opacity,
            fill: getComputedStyle(s.querySelector('.slider-fill')).opacity
          }))
        );
        if (drawn.length && drawn.every((d) => d.thumb === '0' && d.fill === '0')) ok('an unset scale draws no thumb and no fill');
        else fail('an unset scale draws no thumb and no fill', JSON.stringify(drawn));
        const note = `untouched scales ${Date.now()}`;
        await page.fill('#ed-note', note);
        await page.locator('[data-save-moods] [data-mood]').nth(3).click();
        await page.locator('[data-save]').click();
        await page.waitForURL((url) => !url.pathname.startsWith('/entry/'));
        await go(page, '/day/today');
        const card = page.locator('a[href^="/entry/"]:not([href*="/new"])').filter({ hasText: note });
        await card.first().waitFor();
        await card.first().click();
        await page.waitForSelector('[data-save]');
        await page.waitForFunction(() => document.querySelector('#ed-note')?.value);
        await settled(page);
        const values = await page.locator('.dim-slider [data-dim-value]').allTextContents();
        const unset = await page.locator('.dim-slider.is-unset').count();
        if (values.length && values.every((v) => v.trim() === '-')) ok('the saved entry reads back with no scale value');
        else fail('the saved entry reads back with no scale value', JSON.stringify(values));
        if (unset === values.length) ok('every scale on the saved entry is still unset');
        else fail('every scale on the saved entry is still unset', `${unset} of ${values.length}`);
      });
    }

    if (errors.length) fail(`no page errors at ${width}`, errors.join(' | '));
    await context.close();
  }

  /* Return paths and delete, phone width. */
  const context = await newContext(390, 844);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await persona(page);

  const sources = [
    {
      name: 'Calendar',
      path: '/calendar',
      open: async () => {
        await page.waitForSelector('a[href^="/entry/"]:not([href*="/new"])');
        await page.locator('a[href^="/entry/"]:not([href*="/new"])').first().click();
      },
      back: () => page.url().endsWith('/calendar') || page.url().includes('/calendar?')
    },
    {
      name: 'Day',
      path: '/day/today',
      open: async () => {
        await page.waitForSelector('a[href^="/entry/"]:not([href*="/new"])');
        await page.locator('a[href^="/entry/"]:not([href*="/new"])').first().click();
      },
      back: () => /\/day\/(today|\d+)$/.test(new URL(page.url()).pathname)
    },
    {
      name: 'Search',
      path: '/search',
      open: async () => {
        await page.fill('input[type="search"], [data-search-input], input[name="q"]', 'the');
        await page.waitForSelector('a[href^="/entry/"]:not([href*="/new"])', { timeout: 10000 });
        await page.locator('a[href^="/entry/"]:not([href*="/new"])').first().click();
      },
      back: () => new URL(page.url()).pathname === '/search',
      after: async () => {
        const value = await page.locator('input[type="search"], [data-search-input], input[name="q"]').first().inputValue();
        if (value === 'the') ok('Search keeps its query after the editor');
        else fail('Search keeps its query after the editor', `input holds "${value}"`);
      }
    }
  ];

  const entryLink = 'a[href^="/entry/"]:not([href*="/new"])';
  sources.push(
    {
      name: 'On this day',
      path: '/on-this-day',
      open: async () => { await page.waitForSelector(entryLink); await page.locator(entryLink).first().click(); },
      back: () => new URL(page.url()).pathname === '/on-this-day'
    },
    {
      name: 'Good moments',
      path: '/doubt/evidence',
      open: async () => { await page.waitForSelector(entryLink); await page.locator(entryLink).first().click(); },
      back: () => new URL(page.url()).pathname === '/doubt/evidence'
    }
  );

  /* A reload of the editor empties the app's own history (depth 0), which is
     the case a bare history.back cannot answer: the list is in the address. */
  const runs = sources.flatMap((source) =>
    ['save', 'delete'].flatMap((action) =>
      (['Day', 'Search'].includes(source.name) ? [false, true] : [false]).map((reload) => ({ source, action, reload }))
    )
  );
  for (const { source, action, reload } of runs) {
    {
      const reloaded = reload ? ' after a reload' : '';
      await block(`${action} returns to ${source.name}${reloaded}`, action === 'save' ? 1 + (source.after ? 1 : 0) : 3 + (source.after ? 1 : 0), async () => {
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-home-hello]');
        await go(page, source.path);
        await page.waitForTimeout(600);
        await source.open();
        await page.waitForSelector('[data-save]');
        await page.waitForTimeout(500);
        if (reload) {
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('[data-save]');
          await page.waitForTimeout(500);
        }
        if (action === 'save') {
          await page.locator('[data-save]').click();
        } else {
          await page.locator('.screen-header [aria-label]').last().click();
          await page.locator('[data-sheet] .btn-danger, .sheet .btn-danger').first().click();
        }
        await page.waitForTimeout(1200);
        if (source.back()) ok(`${action} from ${source.name}${reloaded} lands back on ${source.name}`);
        else fail(`${action} from ${source.name}${reloaded} lands back on ${source.name}`, page.url());
        if (source.after) await source.after();
        if (action === 'delete') {
          const toast = page.locator('[data-toast-kind="trashed"]');
          if (await toast.count()) ok(`delete from ${source.name} says "Moved to trash"`);
          else fail(`delete from ${source.name} says "Moved to trash"`, 'no trashed toast');
          const restore = toast.locator('[data-toast-action]');
          if (await restore.count()) {
            await restore.click();
            await page.waitForSelector('[data-toast-kind="saved"]', { timeout: 5000 });
            ok(`Restore on the delete toast restores the entry (${source.name})`);
          } else fail(`Restore on the delete toast (${source.name})`, 'no action');
        }
      });
    }
  }

  await block('a failed delete says so', 2, async () => {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-home-hello]');
    await go(page, '/day/today');
    await page.waitForSelector('a[href^="/entry/"]:not([href*="/new"])');
    await page.locator('a[href^="/entry/"]:not([href*="/new"])').first().click();
    await page.waitForSelector('[data-save]');
    await page.waitForTimeout(500);
    /* The delete is one statement through the SQLite worker: make the
       post of the first message that touches trashed_at throw, which the
       client turns into a rejected promise. */
    await page.evaluate(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (data, ...rest) {
        let text = '';
        try { text = JSON.stringify(data); } catch { /* not serialisable */ }
        if (text.includes('trashed_at')) {
          Worker.prototype.postMessage = original;
          throw new Error('forced delete failure');
        }
        return original.call(this, data, ...rest);
      };
    });
    await page.locator('.screen-header [aria-label]').last().click();
    await page.locator('.sheet .btn-danger, [data-sheet] .btn-danger').first().click();
    await page.waitForTimeout(1500);
    const stayed = page.url().includes('/entry/');
    const toasts = await page.locator('[data-toast]').allTextContents();
    if (stayed) ok('a failed delete leaves the editor open');
    else fail('a failed delete leaves the editor open', page.url());
    if (toasts.some((t) => /couldn.t delete/i.test(t))) ok('a failed delete says so');
    else fail('a failed delete says so', JSON.stringify(toasts));
  });
  if (errors.length) fail('no page errors in the return flows', errors.join(' | '));
  await context.close();
} finally {
  await browser.close();
  if (app) await new Promise((resolve) => app.httpServer.close(resolve));
}
process.exit(finish('entry editor name, date, return and delete: all hold') ? 1 : 0);
