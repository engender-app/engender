/* What the save bar covers, and what it stops covering (carpet 26).

   Carpet 28's sweep reads occlusion over every route and takes 25 minutes;
   this is the same hit test aimed at one object, so a change to the foot can
   be measured in a couple of minutes and photographed for sign-off in the
   same run. It answers three things per screen and viewport:

     covered   every interactive box the foot itself covers, hit-tested a
               pixel at a time, at rest, mid-column and at the end of the
               column - the positions carpet 28 walks, for the reason it
               walks them: a pinned thing covers what is under it at every
               position and not only at rest.
     hosted    whether the foot is in the app column or inside the scroll
               region, which is the whole mechanism of the fix.
     gap       the distance from the last block of the column to the top of
               the foot, so the arrangement can be read as well as the
               defect.

   Both sides of the change run the same file. The foot is
   `[data-app-savebar]` after carpet 26 and `.editor-savebar` before it, so
   the selector names both and the before column needs no separate script.

   Run against a demo build, once per side. The before side has to run with
   its own checkout as the *working directory*, not just as --root: vite's
   preview server resolves .svelte-kit/output relative to the cwd whatever
   root it is handed, so running it from here serves this branch's build
   under the before tag (redesign ticket 20's note, and it happened again).
     VITE_DEMO=1 npm run build
     node tests/savebar-clearance-gallery.mjs --tag after --out /abs/path
     cd /path/to/main-worktree && VITE_DEMO=1 npm run build && \
       node /abs/path/to/tests/savebar-clearance-gallery.mjs \
         --tag before --root . --out /abs/path
*/
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { readFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const root = resolve(flag('root', resolve(here, '..')));
const outRoot = resolve(flag('out', resolve(here, '../.claude/savebar-shots')));
const outDir = resolve(outRoot, tag);

/** The foot, under either name. */
const BAR = '[data-app-savebar], .editor-savebar';
/* Carpet 28's own list, plus `textarea`. `[tabindex]` is filtered to
   non-negative in the page: -1 is programmatically focusable and not a
   pointer target. */
const INTERACTIVE = 'button, a, input, select, textarea, [role="slider"], [tabindex]';

/* 320 is the narrowest phone the app claims, 430 the widest, 390 the one
   every number in DIRECTION.md is measured at; 390x360 stands in for a
   raised keyboard, as rule 14's check does. */
const VIEWPORTS = [
  { name: '320x844', width: 320, height: 844 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x844', width: 430, height: 844 },
  { name: '390x360', width: 390, height: 360 },
  /* The desktop shell, where the rail replaces the floating bar and the
     foot takes the column's width: what is under it there is the page's own
     20px inset rather than the 56 a phone's bar needs, which is a number
     this ticket chose rather than inherited. */
  { name: '1280x900', width: 1280, height: 900 }
];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const readings = [];
const shots = [];
const errors = [];

/* The oscillator voice every voice gallery uses, read as text and injected:
   two of the ten feet only exist once a take has been recorded, and a
   headless microphone is silence (tests/fake-microphone.mjs). */
const fakeMicrophoneSource = (await readFile(resolve(here, 'fake-microphone.mjs'), 'utf8')).replace(
  /^export /gm,
  ''
);

let page;
const openContext = async (viewport) => {
  if (page) await page.close();
  page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2
  });
  await page.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = installFakeMicrophone('steady');
  `);
  page.on('pageerror', (err) => errors.push(String(err)));
};

/* The demo bar is a development control over the frame's own bottom edge,
   which is exactly where the foot is: left in, it is what the hit test
   finds and what a click on a tab lands on. The toasts are removed for the
   same reason. `keepDemo` is for the seed alone, whose own control - "fill
   every feature" - lives in that bar, so stripping it first leaves nothing
   to seed the journal with. */
const strip = (keepDemo = false) =>
  page.evaluate((keepDemo) => {
    if (!keepDemo) for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    for (const toast of document.querySelectorAll('.toast, [data-toast]')) toast.remove();
    if (!document.getElementById('savebar-shot-css')) {
      const style = document.createElement('style');
      style.id = 'savebar-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  }, keepDemo);

const settle = async (path, keepDemo = false) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  /* Here rather than only before a reading: the demo bar and the boot
     toast both sit over the frame's bottom edge, which is where every tab
     and every control this walk has to click lives. They intercepted the
     click on the practise tab and timed the whole run out. */
  await strip(keepDemo);
};

/** Seed the demo persona, which is what gives the photo and voice screens
    something to draw. It ends on /more (the demo control's own last step). */
const seed = async () => {
  await settle('/', true);
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 240000 });
  await page.waitForTimeout(2000);
};

const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-segment="' + theme + '"]').click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
};

/* The reading. Everything below runs in the page, because every question
   here is about painted pixels: what `elementFromPoint` answers is the
   effective stacking order, which is the only thing that knows whether a
   declared z-index put the foot over a control or under it. */
const read = (selector, interactive) =>
  page.evaluate(
    ([selector, interactive]) => {
      const settled = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const region = document.querySelector('[data-app-scroll-region]');
      const bar = document.querySelector(selector);
      if (!bar) return { bar: false };

      const chain = (el) => {
        const parts = [];
        for (let up = el; up && up !== document.body; up = up.parentElement) {
          const name = up.tagName.toLowerCase();
          const cls = [...up.classList].filter((c) => !c.startsWith('svelte-')).join('.');
          parts.unshift(cls ? `${name}.${cls}` : name);
        }
        return parts.slice(-2).join(' > ');
      };

      /* How much of a box the foot actually kills, walked a pixel at a time
         down its middle - the measure carpet 28 uses, and for its reason: a
         box's rect can miss an overlap that hit testing sees. */
      const dead = (box) => {
        let n = 0;
        const x = box.left + box.width / 2;
        /* Only where the region actually paints. A row taller than a short
           viewport, or a photo cell at the fold, has a box that runs past
           the region's own bottom edge; the foot is over those pixels and
           the row is not painted on them either, because the region clips
           them. Counting them made the detector its own first finding -
           and the region's bottom edge is exclusive for the same reason:
           it is the foot's top edge too, so an inclusive scan reads one
           shared pixel row as 1px of every control that reaches the
           fold. */
        const port = region.getBoundingClientRect();
        for (let y = Math.ceil(box.top); y <= Math.floor(box.bottom); y++) {
          if (y < 0 || y >= innerHeight) continue;
          if (y < port.top || y >= port.bottom) continue;
          const at = document.elementFromPoint(x, y);
          if (at && bar.contains(at)) n += 1;
        }
        return Math.min(n, Math.round(box.height));
      };

      const covered = [];
      const step = (where) => {
        for (const el of document.querySelectorAll(interactive)) {
          const tabindex = el.getAttribute('tabindex');
          if (tabindex !== null && Number(tabindex) < 0) continue;
          if (bar.contains(el)) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (box.bottom <= 0 || box.top >= innerHeight) continue;
          const n = dead(box);
          if (!n) continue;
          covered.push({
            where,
            what: chain(el),
            dead: n,
            of: Math.round(box.height)
          });
        }
      };

      return (async () => {
        const top = region.scrollTop;
        const floor = Math.max(0, region.scrollHeight - region.clientHeight);
        step('at rest');
        const stride = Math.max(1, Math.round(region.clientHeight * 0.85));
        for (let at = stride; at < floor; at += stride) {
          region.scrollTop = at;
          await settled();
          step('mid-column');
        }
        if (floor > 0) {
          region.scrollTop = floor;
          await settled();
          step('at the end of the column');
        }

        /* Where the foot lives, which is the mechanism rather than a
           symptom: inside the scroll region it is a second pinned thing
           over the column, beside it it is a box the column is shorter
           for. */
        const hosted = region.contains(bar)
          ? 'inside the scroll region'
          : bar.parentElement?.hasAttribute('data-app-column')
            ? 'the app column'
            : chain(bar.parentElement);

        /* The last block of the column and the distance from it to the
           foot, read at the end of the column where the two are
           neighbours: the arrangement, so a fix that clears a control by
           opening a canyon under it reads as one. At rest this would be
           the distance to a block below the fold, which measures the
           screen's length and nothing about the foot. */
        if (floor > 0) {
          region.scrollTop = floor;
          await settled();
        }
        const blocks = [...(document.querySelector('.screen')?.children ?? [])].filter(
          (el) => !bar.contains(el) && el !== bar && getComputedStyle(el).display !== 'none'
        );
        const last = blocks[blocks.length - 1]?.getBoundingClientRect();
        const barBox = bar.getBoundingClientRect();
        const regionBox = region.getBoundingClientRect();
        const reading = {
          bar: true,
          hosted,
          scrolls: Math.max(0, region.scrollHeight - region.clientHeight),
          region: { top: Math.round(regionBox.top), bottom: Math.round(regionBox.bottom) },
          barTop: Math.round(barBox.top),
          barBottom: Math.round(barBox.bottom),
          gap: last ? Math.round(barBox.top - last.bottom) : null,
          covered
        };
        region.scrollTop = top;
        await settled();
        return reading;
      })();
    },
    [selector, interactive]
  );

/** Scrolls the column to its end, which is where the reservation is worth
    looking at: at rest the foot's top edge is simply the fold, and what a
    reservation buys is that the *last* row of the column clears it. */
const toEnd = () =>
  page.evaluate(async () => {
    const region = document.querySelector('[data-app-scroll-region]');
    region.scrollTop = region.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

/** The bottom of the frame: the foot with enough of the column over it to
    read the arrangement. One crop per scene, not a whole screen (Alicja,
    ticket 07's sign-off). */
const shoot = async (name, note, height = 300) => {
  await strip();
  const frame = await page.evaluate(() => {
    const box = document.querySelector('[data-app-root]').getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const clip = {
    x: frame.x,
    y: Math.max(frame.y, frame.y + frame.height - height),
    width: frame.width,
    height: Math.min(height, frame.height)
  };
  await page.screenshot({ path: `${outDir}/${name}.png`, clip });
  shots.push({ name, note });
};

/* The scenes: every render state that draws a foot and can be reached from
   a seeded demo journal. `.editor-savebar.vp-review-actions` needs a voice
   take recorded through a fake microphone and is the one state left to
   carpet 28's own coverage census. */
const scenes = [
  {
    name: 'dimension',
    note: '/settings/dimension - the reported defect: a 48px slider under the foot',
    go: async () => settle('/settings/dimension')
  },
  {
    name: 'entry-editor',
    note: "/entry/new - the worst of the three: the same slider lost 44 of its 48",
    go: async () => {
      await settle(`/entry/new/${Math.floor(Date.now() / 86400000)}`);
      await page.waitForTimeout(600);
    }
  },
  {
    name: 'photos-export',
    note: '/media/photos/export - a selected photo cell, 36px covered',
    go: async () => {
      await settle('/media/photos/export');
      await page.waitForTimeout(600);
      const cell = page.locator('.photo-cell').first();
      if (await cell.count()) await cell.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  },
  {
    name: 'reminder',
    /* `/new` rather than an existing reminder's id: it is the same route
       and the same foot, and the list's own rows are `isAndroid()`-gated,
       so a web demo journal has none to click. */
    note: '/settings/reminders/new - a foot on a settings screen',
    go: async () => {
      await settle('/settings/reminders/new');
      await page.waitForTimeout(600);
    }
  },
  {
    name: 'wrapped-share',
    note: '/wrapped/year/share - the foot over a poster',
    go: async () => {
      await settle('/wrapped/year/share');
      await page.waitForTimeout(900);
    }
  },
  {
    name: 'voice-benchmark',
    note: '/practice/voice, the record tab - the stacked arrangement (record, and skip)',
    go: async () => {
      await settle('/practice/voice');
      const tab = page.locator('[data-segment="record"], [data-tab="record"]').first();
      if (await tab.count()) await tab.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  },
  {
    name: 'voice-practise',
    note: '/practice/voice, the practise tab - one control',
    go: async () => {
      await settle('/practice/voice');
      const tab = page.locator('[data-segment="practise"], [data-tab="practise"]').first();
      if (await tab.count()) await tab.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  },
  {
    name: 'voice-review',
    /* The `row` arrangement, and the one foot carpet 28's coverage census
       could not reach: two controls of equal weight, because declining to
       keep a take is as ordinary an outcome as keeping it. It exists only
       after a take, which is what the fake microphone is for. */
    note: '/practice/voice, a recorded take under review - two controls side by side',
    go: async () => {
      await settle('/practice/voice');
      const tab = page.locator('[data-segment="practise"]').first();
      if (!(await tab.count())) return false;
      await tab.click();
      await page.waitForTimeout(500);
      if (!(await page.locator('[data-vp-start]').count())) return false;
      await page.locator('[data-vp-start]').click();
      await page.waitForTimeout(2400);
      await page.locator('[data-vp-stop]').click();
      await page.waitForSelector('[data-vp-save]', { timeout: 20000 });
      await page.waitForTimeout(400);
    }
  },
  {
    name: 'voice-compare',
    /* The tenth foot: `/practice/voice`'s own, which appears when two takes
       are picked. Two benchmarks recorded through the real flow, the way
       tests/voice-compare-gallery.mjs does it - the passage, the first held
       vowel, the other two skipped. */
    note: '/practice/voice, two takes picked - the compare foot',
    go: async () => {
      for (let i = 0; i < 2; i++) {
        await settle('/practice/voice?tab=record');
        if (!(await page.locator('[data-vb-record]').count())) return false;
        await page.locator('[data-vb-record]').click();
        await page.waitForTimeout(2600);
        await page.locator('[data-vb-stop]').click();
        await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
        await page.locator('[data-vb-record]').click();
        await page.waitForSelector('[data-vb-skip]', { timeout: 25000 });
        await page.locator('[data-vb-skip]').click();
        await page.waitForSelector('[data-vb-skip]', { timeout: 25000 });
        await page.locator('[data-vb-skip]').click();
        await page.waitForSelector('[data-vb-save]', { timeout: 25000 });
        await page.waitForTimeout(300);
        await page.locator('[data-vb-save]').click();
        await page.waitForTimeout(1200);
      }
      await settle('/practice/voice');
      const tab = page.locator('[data-segment="compare"]').first();
      if (!(await tab.count())) return false;
      await tab.click();
      await page.waitForTimeout(600);
      const cells = page.locator('[data-voice-cell]');
      if ((await cells.count()) < 2) return false;
      await cells.nth(0).click();
      await cells.nth(1).click();
      await page.waitForTimeout(400);
    }
  },
  {
    name: 'coming-back',
    /* The chromeless screen, and the acceptance criterion that named it.
       Its foot is its own (`.return-foot`, rule 12's foot with rule 15's
       one control) and this ticket left it there deliberately: it is opaque,
       it hugs the window's edge where there is no bar to sit on, and carpet
       28 reads the screen clean. What is measured here is that it still
       does, under a shell whose column is now split in two. */
    note: '/coming-back - the chromeless screen keeps its own foot',
    bar: '.return-foot',
    go: async () => {
      await settle('/coming-back');
      await page.waitForTimeout(800);
    }
  }
];

for (const viewport of VIEWPORTS) {
  await openContext(viewport);
  await seed();
  for (const scene of scenes) {
    const reached = await scene.go();
    if (reached === false) {
      errors.push(`${scene.name} at ${viewport.name}: not reachable`);
      continue;
    }
    await strip();
    const reading = await read(scene.bar ?? BAR, INTERACTIVE);
    if (!reading.bar) {
      errors.push(`${scene.name} at ${viewport.name}: no foot on screen`);
      continue;
    }
    readings.push({ scene: scene.name, viewport: viewport.name, note: scene.note, ...reading });
    if (viewport.name === '390x844') {
      await shoot(`${scene.name}-light`, scene.note);
      await toEnd();
      await shoot(`${scene.name}-end`, `${scene.note} - scrolled to the end of the column`);
    }
    if (viewport.name === '1280x900') await shoot(`${scene.name}-wide`, `${scene.note} - the desktop shell`);
  }
}

/* Chromeless, which is the one case the ticket named and no screen with a
   foot is: `--nav-clearance` narrows to the system inset plus a breath on
   `.app.is-chromeless` (phase 5 ticket 26), and the foot's padding is
   written against that token rather than against the bar's height, so a
   chromeless screen that grew a foot would hold the inset and the hairline
   and not room for a bar there is none of. Read by putting the class on the
   frame of a screen that has a foot, since the two never meet in the app.
   `/coming-back` is the chromeless screen with a foot and it draws its own
   (`.return-foot`), which carpet 28 reads clean. */
let chromeless = null;
await openContext(VIEWPORTS[1]);
await seed();
await settle('/settings/dimension');
await strip();
const withoutChrome = await page.evaluate(() => {
  const root = document.querySelector('[data-app-root]');
  root.classList.add('is-chromeless');
  return new Promise((done) =>
    requestAnimationFrame(() => {
      const bar = document.querySelector('[data-app-savebar], .editor-savebar');
      const frame = root.getBoundingClientRect();
      const box = bar.getBoundingClientRect();
      const read = {
        clearance: getComputedStyle(root).getPropertyValue('--nav-clearance').trim(),
        padBottom: getComputedStyle(bar).paddingBottom,
        underFoot: Math.round(frame.bottom - box.bottom)
      };
      root.classList.remove('is-chromeless');
      done(read);
    })
  );
});
chromeless = withoutChrome;

/* The dark theme, at the one viewport every number is measured at: the foot
   has no ground of its own, so what changes with the theme is what it is
   drawn against. */
await openContext(VIEWPORTS[1]);
await seed();
await dress('dark');
for (const scene of scenes) {
  const reached = await scene.go();
  if (reached === false) continue;
  await shoot(`${scene.name}-dark`, scene.note);
}

await page.close();
await browser.close();
await app.close();

const worst = readings.flatMap((r) => r.covered.map((c) => ({ ...c, scene: r.scene, viewport: r.viewport })));
await writeFile(
  `${outDir}/clearance.json`,
  JSON.stringify({ tag, readings, chromeless, shots, errors }, null, 2) + '\n'
);
console.log(`${tag}: ${readings.length} readings, ${worst.length} covered controls, ${errors.length} errors`);
for (const c of worst) console.log(`  ${c.scene} ${c.viewport}: ${c.what} loses ${c.dead} of ${c.of}px, ${c.where}`);
for (const e of errors) console.log(`  ! ${e}`);
for (const r of readings) console.log(`  ${r.scene} ${r.viewport}: foot in ${r.hosted}, gap ${r.gap}, scrolls ${r.scrolls}`);
if (chromeless)
  console.log(
    `  chromeless: --nav-clearance ${chromeless.clearance}, foot pads ${chromeless.padBottom}, ${chromeless.underFoot}px under it`
  );
