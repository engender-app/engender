/* How tall Safe space is, measured (phase 10 redesign ticket 47).

   The ticket's case is a number: 5908px on a demo journal with every
   feature filled, second only to the roadmap, on the screen a person opens
   on their worst day. So the fix owes the same number back, measured the
   same way, and the acceptance asks for it before and after.

   Two things are reported, because the tall screen was only half the
   problem:

     height    what the scroll region actually holds at 390px wide - the
               figure the audit quoted.
     toBreath  how far down the region the breathing exercise starts, which
               is what "nothing is scrolled past to reach the breath"
               means. A tall screen whose first surface is the calming tool
               is not the defect; a short one that opens on a chart is.

   Both are read off the scroll region rather than the document, because the
   app frame is what scrolls (the walkthrough's own geometry rule), and the
   demo bar is removed first - it is review chrome and not in the build being
   signed off.

   Run: node tests/safe-space-height.mjs
   Serves the `build/` in the current working directory, so the before
   figure comes from running this in a detached worktree of main and the
   after figure from running it here. `vite preview` serves the cwd rather
   than any root it is handed, so the two have to be two processes. */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const VIEWPORT = { width: 390, height: 844 };
/* The screens Safe space's ways down land on (safeSpaceWays.ts). Phase 11
   ticket 15 folds two of them into screens that already existed, so the
   letters screen is measured here - it carries Safe space's starred photos
   now - and the readings are not, because they land on the Look back door
   and that door's own length is ticket 07's to answer for. */
const ROUTES = ['/doubt', '/transition/letters', '/doubt/comfort', '/doubt/evidence'];

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await context.newPage();

const strip = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });

const settle = async (path, { keepDemoBar = false } = {}) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (!keepDemoBar) await strip();
  /* Long enough for every read on the screen to have answered and for the
     skeletons to have been replaced: a measurement taken over a placeholder
     is a measurement of the placeholder. */
  await page.waitForTimeout(1800);
};

const measure = () =>
  page.evaluate(() => {
    const main = document.querySelector('.app-main') ?? document.scrollingElement;
    const breath = document.querySelector('[data-breathing-exercise]');
    const height = Math.round(main.scrollHeight);
    if (!breath) return { height, toBreath: null };
    const top = breath.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    return { height, toBreath: Math.round(top) };
  });

try {
  /* Every feature filled, which is the journal the audit's 5908px was
     measured on. The seeding resolves with a goto('/more'). */
  await settle('/', { keepDemoBar: true });
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 60000 });

  const rows = [];
  for (const route of ROUTES) {
    await settle(route);
    /* The four ways down do not exist on main, and a SvelteKit SPA answers
       an unknown route with the shell and a 200, so the status says nothing.
       A screen that drew no header of its own never rendered. */
    const drew = await page.locator('[data-screen-header]').count();
    rows.push(drew ? { route, ...(await measure()) } : { route, height: null, toBreath: null });
  }

  console.log(`\n390x844, demo journal with every feature filled\n`);
  for (const row of rows) {
    if (row.height == null) {
      console.log(`${row.route.padEnd(18)}  not on this build`);
      continue;
    }
    const reach = row.toBreath == null ? 'no breath on it' : `breath starts at ${row.toBreath}px`;
    console.log(`${row.route.padEnd(18)}  ${String(row.height).padStart(5)}px   ${reach}`);
  }
} finally {
  await browser.close();
  await app.close();
}
