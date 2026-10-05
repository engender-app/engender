/* Where keyboard focus goes when quick add opens and when a screen changes
   (phase 15 release blockers ticket 08, audit findings A11Y-01, A11Y-02,
   A11Y-08, A11Y-12 and L04-15).

   The 5 October audit found the quick-add fan was a modal for the eye only:
   Enter on the add button left focus on the button, fifteen Tabs walked the
   dimmed screen before the sixteenth reached the fan, and Escape dropped
   focus to the body. A screen change left focus on the body too, so a
   screen reader heard the tab title ("engender", on purpose) and nothing
   else, and onboarding lost focus on two of its step changes.

   This checks, against a demo build:

   - Enter on the add button puts focus inside the fan, which is a labelled
     modal dialog; the screen behind it is inert; Tab and Shift+Tab stay in
     the fan; Escape closes it and gives focus back to the add button.
   - A press on the add button that slides onto a target and lets go there
     does not leave the button swallowing the next keyboard Enter.
   - Arrow keys on Today's mood faces move focus and open nothing; Space
     still commits.
   - After a keyboard navigation through the bar, and after quick add's
     mood opens the editor, focus is on the new screen's heading rather
     than the body, and the tab title has not changed.
   - Onboarding never drops focus to the body between steps, each step's
     question takes focus, and the name field is named by its question.

     VITE_DEMO=1 npm run build
     node tests/quick-add-focus-check.mjs [--root <built tree>] [--url <running server>] */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};

const browser = await launchChromium();
const app = flag('url', null) ? null : await previewBuild(resolve(flag('root', resolve(here, '..'))));
const base = flag('url', null) ?? `http://localhost:${app.httpServer.address().port}`;

let failures = 0;
function ok(cond, label, detail = '') {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
  await page.addInitScript(() => {
    if (navigator.storage) {
      navigator.storage.persist = () => Promise.resolve(true);
      navigator.storage.persisted = () => Promise.resolve(true);
    }
  });
  page.on('pageerror', (error) => {
    failures++;
    console.log(`  FAIL page error - ${error.message}`);
  });
  return page;
}

/** What has focus, in words. */
const focused = (page) =>
  page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return { where: 'BODY' };
    return {
      where: e.tagName + (e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''),
      text: (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48),
      inFan: !!e.closest('[data-fan]'),
      inMain: !!e.closest('#app-main'),
      isFab: e.matches('[data-nav-fab]'),
      heading: /^H[1-6]$/.test(e.tagName)
    };
  });

/** Resolves true once `fn` is true in the page, false if it never is. */
const eventually = (page, fn, arg, timeout = 3000) =>
  page.waitForFunction(fn, arg, { timeout }).then(
    () => true,
    () => false
  );

const fanClosed = (page) => eventually(page, () => !document.querySelector('[data-fan]'));

/** One group of checks; a throw inside it fails that group only. */
async function section(name, fn) {
  console.log(name);
  try {
    await fn();
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name}: ${error.message?.split('\n')[0] ?? error}`);
  }
}

try {
  const page = await newPage();
  await settlePage(page, base, '/', 'light');
  const title = await page.title();

  await section('quick add by keyboard', async () => {
    await settlePage(page, base, '/', 'light');
    await page.locator('[data-nav-fab]').focus();
    await page.keyboard.press('Enter');
    ok(
      await eventually(page, () => !!document.activeElement?.closest('[data-fan]')),
      'Enter puts focus inside the fan',
      JSON.stringify(await focused(page))
    );
    const fan = await page.evaluate(() => {
      const f = document.querySelector('[data-fan]');
      return (
        f && {
          role: f.getAttribute('role'),
          modal: f.getAttribute('aria-modal'),
          label: f.getAttribute('aria-label')
        }
      );
    });
    ok(fan?.role === 'dialog' && fan.modal === 'true' && !!fan.label, 'the fan is a labelled modal dialog', JSON.stringify(fan));
    ok(await page.evaluate(() => !!document.querySelector('[data-app-column]')?.closest('[inert]')), 'the screen behind the fan is inert');
    let escaped = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const at = await focused(page);
      if (!at.inFan) escaped.push(`tab ${i + 1}: ${JSON.stringify(at)}`);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      const at = await focused(page);
      if (!at.inFan) escaped.push(`shift-tab ${i + 1}: ${JSON.stringify(at)}`);
    }
    ok(escaped.length === 0, 'Tab and Shift+Tab stay inside the fan', escaped.slice(0, 3).join('; '));
    await page.keyboard.press('Escape');
    ok(await fanClosed(page), 'Escape closes the fan');
    ok(
      await eventually(page, () => document.activeElement?.matches('[data-nav-fab]') ?? false),
      'Escape gives focus back to the add button',
      JSON.stringify(await focused(page))
    );
    ok((await page.locator('[data-nav-fab]').getAttribute('aria-expanded')) === 'false', 'the add button says it is collapsed');
  });

  await section('a slide onto a target, then Enter', async () => {
    await settlePage(page, base, '/', 'light');
    const fab = await page.locator('[data-nav-fab]').boundingBox();
    await page.mouse.move(fab.x + fab.width / 2, fab.y + fab.height / 2);
    await page.mouse.down();
    const target = page.locator('[data-fan-target="tally-correctly_gendered"]');
    await target.waitFor({ state: 'visible' });
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity)
    );
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 6
    });
    await page.mouse.up();
    ok(await fanClosed(page), 'releasing on a target runs it and closes the fan');
    await page.locator('[data-nav-fab]').focus();
    await page.keyboard.press('Enter');
    ok(await eventually(page, () => !!document.querySelector('[data-fan]')), 'the next keyboard Enter on the add button opens the fan');
    await page.keyboard.press('Escape');
    await fanClosed(page);
  });

  await section("Today's mood faces", async () => {
    await settlePage(page, base, '/', 'light');
    const faces = page.locator('[data-mood-chips] [role="radio"]');
    await faces.first().focus();
    await page.keyboard.press('ArrowRight');
    const navigated = await page.waitForURL(/\/entry\//, { timeout: 1500 }).then(
      () => true,
      () => false
    );
    ok(!navigated, 'ArrowRight does not open the editor', page.url());
    ok(
      await faces.nth(1).evaluate((el) => el === document.activeElement),
      'ArrowRight moves focus to the next face',
      JSON.stringify(await focused(page))
    );
    ok((await faces.nth(1).getAttribute('tabindex')) === '0', "the focused face is the group's one Tab stop");
    if (navigated) await settlePage(page, base, '/', 'light');
    else {
      await page.keyboard.press('Space');
      ok(
        await page.waitForURL(/\/entry\/new\//, { timeout: 5000 }).then(
          () => true,
          () => false
        ),
        'Space commits the focused face'
      );
      await settlePage(page, base, '/', 'light');
    }
  });

  await section('a screen change through the bar', async () => {
    await settlePage(page, base, '/', 'light');
    for (const key of ['calendar', 'stats', 'settings', 'home']) {
      const before = page.url();
      await page.locator(`[data-nav-item="${key}"]`).focus();
      await page.keyboard.press('Enter');
      await page.waitForURL((url) => url.href !== before, { timeout: 5000 });
      const landed = await eventually(page, () => {
        const e = document.activeElement;
        return !!e && e !== document.body && /^H1$/.test(e.tagName) && !!e.closest('#app-main');
      });
      const at = await focused(page);
      ok(landed, `${key}: focus is on the new screen's heading`, JSON.stringify(at));
      ok((await page.title()) === title, `${key}: the tab title is unchanged`, await page.title());
      await page.keyboard.press('Tab');
      const next = await focused(page);
      ok(next.inMain, `${key}: the next Tab stays in the screen`, JSON.stringify(next));
    }
  });

  await section("quick add's mood opens the editor", async () => {
    await settlePage(page, base, '/', 'light');
    await page.locator('[data-nav-fab]').focus();
    await page.keyboard.press('Enter');
    await eventually(page, () => !!document.activeElement?.closest('[data-fan]'));
    await page.locator('[data-fan-target="mood-3"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/entry\/new\//, { timeout: 5000 });
    ok(
      await eventually(page, () => {
        const e = document.activeElement;
        return !!e && /^H1$/.test(e.tagName) && !!e.closest('#app-main');
      }),
      "focus lands on the editor's heading, not on the add button",
      JSON.stringify(await focused(page))
    );
  });
  await section('quick add from the desktop rail', async () => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await settlePage(page, base, '/', 'light');
    await page.locator('[data-rail-add]').focus();
    await page.keyboard.press('Enter');
    ok(await eventually(page, () => !!document.activeElement?.closest('[data-fan]')), 'Enter on the rail puts focus inside the fan');
    await page.keyboard.press('Escape');
    ok(await fanClosed(page), 'Escape closes the fan');
    ok(
      await eventually(page, () => document.activeElement?.matches('[data-rail-add]') ?? false),
      'Escape gives focus back to the rail button',
      JSON.stringify(await focused(page))
    );
  });
  await page.context().close();

  await section('onboarding', async () => {
    const setup = await newPage();
    await setup.goto(`${base}/`, { waitUntil: 'networkidle' });
    await setup.waitForSelector('[data-app-root][data-boot="ready"]', {
      state: 'attached',
      timeout: 30000
    });
    /* A demo build seeds its persona on first boot, so setup is reached by
     address, the way the audit reached it. */
    if (!(await setup.locator('[data-setup-question]').count())) {
      await setup.goto(`${base}/onboarding`, { waitUntil: 'networkidle' });
    }
    await setup.waitForSelector('[data-setup-question]');
    const question = () => setup.evaluate(() => [...document.querySelectorAll('[data-setup-question]')].at(-1)?.textContent?.trim() ?? '');
    const dropped = [];
    let steps = 0;
    let namedChecked = false;
    for (let i = 0; i < 16; i++) {
      const asked = await question();
      const next = setup.locator('[data-next]');
      if (await next.count()) {
        await next.focus();
        await setup.keyboard.press('Enter');
      } else {
        const unlocked = setup.locator('[data-access-modes] [data-list-row="unlocked"]');
        if (!(await unlocked.count())) break;
        await unlocked.focus();
        await setup.keyboard.press('Enter');
      }
      await eventually(
        setup,
        (was) => {
          const all = [...document.querySelectorAll('[data-setup-question]')];
          return all.length > 0 && all.at(-1).textContent.trim() !== was;
        },
        asked,
        5000
      );
      steps++;
      const now = await question();
      const landed = await eventually(
        setup,
        (want) => {
          const e = document.activeElement;
          return !!e && e.matches('[data-setup-question]') && e.textContent.trim() === want;
        },
        now
      );
      if (!landed) dropped.push(`${asked} -> ${now}: ${JSON.stringify(await focused(setup))}`);
      /* Only when the name field is in the step that just arrived: a
         keyed step that is still leaving holds the previous step's field
         for the length of its exit. */
      const nameStep = await setup.evaluate(() => {
        const field = document.querySelector('#ob-name');
        const steps = [...document.querySelectorAll('.setup-step')];
        return !!field && field.closest('.setup-step') === steps.at(-1);
      });
      if (nameStep) {
        namedChecked = true;
        const named = await setup.getByRole('textbox', { name: now, exact: true }).count();
        ok(named === 1, 'the name field is named by its question', now);
      }
      if (await setup.locator('[data-finish]').count()) break;
    }
    ok(steps >= 5, `walked ${steps} onboarding steps`);
    ok(namedChecked, 'the name step was reached and its field checked');
    ok(dropped.length === 0, "each step's question takes focus, never the body", dropped.join('; '));
    await setup.context().close();
  });
} catch (error) {
  failures++;
  console.log(`  FAIL ${error.stack ?? error}`);
} finally {
  await browser.close();
  await app?.httpServer.close();
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
