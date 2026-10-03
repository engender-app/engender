/* The entry editor's Save name, date line, return path and delete (phase 14
   pre-release ticket 03: audit findings U1, U3, U4, U5).

   Holds:
   - Save is a button with a name in the accessibility tree, at 390 and 1280
     (the live region sits beside it, not inside it);
   - the date line sits clear of the header and is what a tap on it lands on,
     for a new and an existing entry at 390 and 1280;
   - Save and Delete on an entry opened from Calendar, Search, a day and
     On this day return to that screen; Search comes back with its query;
   - Delete says "Moved to trash" with Restore, Restore brings the entry
     back, and a failed delete says so on screen.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/entry-editor-return.mjs
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
const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
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

/** The two facts about the editor's top that U3 broke. */
async function dateClearOfHeader(page) {
  await page.waitForSelector('.editor-date');
  return page.evaluate(() => {
    const header = document.querySelector('.screen.editor .screen-header, .screen-header');
    const date = document.querySelector('.editor-date');
    const h = header.getBoundingClientRect();
    const d = date.getBoundingClientRect();
    const hit = document.elementFromPoint(d.left + d.width / 2, d.top + 1);
    return { headerBottom: h.bottom, dateTop: d.top, hitIsDate: !!hit && date.contains(hit) };
  });
}

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

  for (const source of sources) {
    for (const action of ['save', 'delete']) {
      await block(`${action} returns to ${source.name}`, action === 'save' ? 1 + (source.after ? 1 : 0) : 3 + (source.after ? 1 : 0), async () => {
        await page.goto(`${base}/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-home-hello]');
        await go(page, source.path);
        await page.waitForTimeout(600);
        await source.open();
        await page.waitForSelector('[data-save]');
        await page.waitForTimeout(500);
        if (action === 'save') {
          await page.locator('[data-save]').click();
        } else {
          await page.locator('.screen-header [aria-label]').last().click();
          await page.locator('[data-sheet] .btn-danger, .sheet .btn-danger').first().click();
        }
        await page.waitForTimeout(1200);
        if (source.back()) ok(`${action} from ${source.name} lands back on ${source.name}`);
        else fail(`${action} from ${source.name} lands back on ${source.name}`, page.url());
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
  await new Promise((resolve) => app.httpServer.close(resolve));
}
process.exit(finish('entry editor name, date, return and delete: all hold') ? 1 : 0);
