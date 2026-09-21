/* Phase 11 ticket 38: where the three vocabulary screens put the action that
   creates a line of your own, and whether the built-in catalogue buries it.

   Walks the real create/hide/reorder flows, then measures how far down each
   screen its add control sits and shoots the screens for sign-off. Run it
   once on the ticket branch and once on the commit before it to get the
   before/after pair:

     node tests/vocabulary-reach-gallery.mjs --tag before
     node tests/vocabulary-reach-gallery.mjs --tag after

   Each run builds, so run them as two processes - vite's preview() serves
   the first build's document for the life of a process. The add controls
   carry no handles before this ticket, so every locator here falls back to
   the button's words. Shots and a measurements JSON land in
   .claude/ticket-38-shots, gitignored. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { launchChromium } from './browser-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, '.claude/ticket-38-shots');
const tagAt = process.argv.indexOf('--tag');
const tag = tagAt === -1 ? 'after' : process.argv[tagAt + 1];

const VIEWPORT = { width: 390, height: 844 };
const THEMES = ['light', 'dark'];

const SCREENS = [
  {
    name: 'affirmations',
    path: '/settings/affirmations',
    add: '[data-add-affirmation]',
    addWords: 'Add affirmation',
    builtIn: '[data-affirmation-hide]'
  },
  {
    name: 'body-regions',
    path: '/settings/body-regions',
    add: '[data-add-region]',
    addWords: 'Add body region',
    builtIn: '[data-region-hide]'
  },
  {
    name: 'tags',
    path: '/settings/tags',
    add: '[data-new-tag-group]',
    addWords: 'New group',
    builtIn: '[data-tag-hide]'
  }
];

const run = (command, args, env) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
  });

await mkdir(outDir, { recursive: true });
await run('npx', ['vite', 'build'], { VITE_DEMO: '1' });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });

const results = [];
const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

const addControl = async (screen) => {
  const handled = page.locator(screen.add);
  if (await handled.count()) return handled;
  return page.getByRole('button', { name: screen.addWords }).first();
};

/* Where a control sits in the screen's own scroll content, which is what
   "buried" means here - the document does not scroll, [data-app-scroll-region]
   does. */
const placement = (locator) =>
  locator.evaluate((el) => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    const box = el.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    return {
      top: Math.round(box.top - frame.top + scroller.scrollTop),
      bottom: Math.round(box.bottom - frame.top + scroller.scrollTop),
      firstScreen: Math.round(scroller.clientHeight),
      content: Math.round(scroller.scrollHeight)
    };
  });

const shoot = async (name) => {
  const tall = await page.evaluate(() => {
    const scroller = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (scroller.scrollHeight - scroller.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width: VIEWPORT.width, height: tall });
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${tag}-${name}.png` });
  await page.setViewportSize(VIEWPORT);
};

const saveSheet = async () => {
  await page.locator('[data-sheet] .btn-primary').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
};

/* The labels of one named group's rows, in the order they are drawn. */
const groupRows = (heading) =>
  page.evaluate((want) => {
    for (const head of document.querySelectorAll('[data-section-heading]')) {
      if (!head.querySelector('h2')?.textContent.trim().startsWith(want)) continue;
      return [...head.nextElementSibling.querySelectorAll('.managed-label')].map((el) =>
        el.textContent.trim()
      );
    }
    return [];
  }, heading);

try {
  /* Both halves have to carry something for the shots to say anything, so
     the seeding is the ticket's own "create through the existing flows"
     verification rather than a fixture. */
  await settle('/settings/affirmations');
  await (await addControl(SCREENS[0])).click();
  await page.locator('[data-sheet] textarea.input').fill('Playwright: my own line.');
  await saveSheet();
  check(
    'a custom affirmation is listed after adding it',
    (await page.locator('.managed-tag:has-text("Playwright: my own line.")').count()) === 1
  );

  await page.locator('[data-affirmation-hide="affirmation_1"]').click();
  await page.waitForSelector('.managed-tag.is-hidden');
  check('a built-in affirmation still hides', (await page.locator('.managed-tag.is-hidden').count()) === 1);
  await page.locator('[data-affirmation-hide="affirmation_1"]').click();
  await page.waitForSelector('.managed-tag.is-hidden', { state: 'detached' });

  await settle('/settings/body-regions');
  await (await addControl(SCREENS[1])).click();
  await page.locator('[data-sheet] input.input').fill('Collarbone');
  await saveSheet();
  check(
    'a custom body region is listed after adding it',
    (await page.locator('.managed-tag:has-text("Collarbone")').count()) === 1
  );

  await settle('/settings/tags');
  await (await addControl(SCREENS[2])).click();
  await page.locator('[data-sheet] input.input').fill('Rituals');
  await saveSheet();
  await page.waitForSelector('[data-section-heading] h2:text-is("Rituals · custom")');
  const headings = (await page.locator('[data-section-heading] h2').allTextContents()).map((t) => t.trim());
  check(
    'a custom group is listed above the built-in ones',
    headings[0].startsWith('Rituals'),
    headings.join(' | ')
  );

  const beforeOrder = await groupRows('Gender');
  await page.locator('[data-up]:not([disabled])').first().click();
  await page.waitForFunction(
    (was) => {
      for (const head of document.querySelectorAll('[data-section-heading]')) {
        if (!head.querySelector('h2')?.textContent.trim().startsWith('Gender')) continue;
        return head.nextElementSibling.querySelector('.managed-label')?.textContent.trim() !== was;
      }
      return false;
    },
    beforeOrder[0]
  );
  const afterOrder = await groupRows('Gender');
  check(
    'moving a tag up reorders its group',
    afterOrder[0] === beforeOrder[1] && afterOrder[1] === beforeOrder[0],
    `${beforeOrder.slice(0, 2).join(', ')} -> ${afterOrder.slice(0, 2).join(', ')}`
  );

  /* The consumer end of the contract: a region added here is a chip in the
     entry editor's body section. */
  await settle('/entry/new/today');
  const chip = page.locator('[data-section-chip="body"]');
  await chip.waitFor();
  if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
  await page.waitForSelector('[data-editor-section="body"]');
  const regionChips = await page.locator('[data-editor-section="body"] .tag-chip').allTextContents();
  check(
    'the entry editor offers the custom body region',
    regionChips.some((t) => t.trim() === 'Collarbone'),
    `${regionChips.length} regions offered`
  );

  for (const theme of THEMES) {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

    for (const screen of SCREENS) {
      await settle(screen.path);
      await page.waitForSelector(screen.builtIn);
      const addAt = await placement(await addControl(screen));
      const builtInAt = await placement(page.locator(screen.builtIn).first());
      results.push({ tag, theme, screen: screen.name, add: addAt, firstBuiltIn: builtInAt });
      if (theme === 'light') {
        check(
          `${screen.name}: the add control sits above the built-in catalogue`,
          addAt.top < builtInAt.top,
          `add at ${addAt.top}px, first built-in row at ${builtInAt.top}px, content ${addAt.content}px`
        );
        check(
          `${screen.name}: the add control is on the first screenful`,
          addAt.bottom <= addAt.firstScreen,
          `add ends at ${addAt.bottom}px of a ${addAt.firstScreen}px screen`
        );
      }
      await shoot(`${screen.name}-${theme}`);
    }
  }

  await writeFile(`${outDir}/${tag}-measurements.json`, JSON.stringify({ tag, checks, results }, null, 2));
} finally {
  await page.close();
  await browser.close();
  await app.close();
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${tag}: ${checks.length - failed.length}/${checks.length} checks passed`);
for (const r of results.filter((r) => r.theme === 'light')) {
  console.log(
    `  ${r.screen}: add at ${r.add.top}px, first built-in at ${r.firstBuiltIn.top}px, content ${r.add.content}px`
  );
}
