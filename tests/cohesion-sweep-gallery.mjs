/* The cohesion sweep (redesign ticket 20): every route rendered against
   DIRECTION.md, and audited from the rendered tree rather than by eye.

   Why a reading and not just a gallery. `tests/direction-contract.test.ts`
   already greps the shared sheets for every rule ticket 07 landed, so a
   divergence that survives is one a grep cannot see: an old-world class on
   one screen, a literal inside a route's own <style> block, a header a
   screen draws itself instead of asking ScreenHeader for. Those only exist
   in the computed tree of a real route, which is what this walks. 78 routes
   by eye across two themes is 156 screens and no reconciled count; 78 routes
   audited is a table.

   What it reads per route, each keyed to the rule it answers to:
     elevation  rule 4  - any box-shadow outside the floating bar's one
     radius     rule 5  - any corner outside 0/1/2/4/6/8/50%/100%/999px
     type       rule 2  - any font-size outside 15/16/17/19/21/28/40/48,
                          except .wrapped-cover-year's named 64px (carpet 23)
     field      rule 7  - a screen that shows the wrong one of a field and a
                          back control for what it is: a door, a deep
                          screen, or chrome (carpet 25)
     tint       rule 3  - --role-tint or --role-wash as a background
     ink        rule 9  - a stroke-width outside 1/2/12/14 and the bar ends
     target     PRODUCT  - an interactive box rendered under 48x48
     occlusion  PRODUCT  - anything covering an interactive box, measured
     ground     rule 4  - --surface or --surface-2 as a ground, a fourth
                          treatment beside flush, block and ink

   The last three are carpet 28's, and each closes a hole this instrument
   had. It read nothing about geometry, so the save bar covering the bottom
   19px of a 48px slider on /settings/dimension was invisible to it across
   all 75 routes (carpet 26) - Alicja found that by eye on a render the
   sweep had already passed. And the 48px floor and the three surface
   treatments were in the same state `box-shadow` was in before ticket 20:
   a rule declared in one place - `accessibility-audit.test.ts` reads the
   `--touch-target` token, `kit-surfaces.test.ts` reads the kit's sheets -
   and holding nowhere else, because nothing had ever measured a rendered
   box or a resolved ground.

   Occlusion is answered by hit-testing rather than by comparing z-index,
   because the ticket asks for the *effective* stacking and a declared 20
   means nothing on its own inside a stacking context. `elementFromPoint`
   is what the browser itself would do with a finger, so it also catches
   the two neighbours of occlusion for free: a control clipped out of an
   ancestor's overflow, and one under a `pointer-events` trap. It reads
   the viewport, so the geometry pass steps the scroll region a screen at
   a time instead of reading only what is above the fold.

   Every finding carries the selector chain that produced it, so triage
   groups by shared component instead of by screen.

   A route is shot only where it names a `shoot` selector, which today is
   the gated leg's one surface: 156 PNGs nobody opens is not evidence, and
   a finding carries its selector chain and its measurement, which is what
   triage reads. The crops a review page needs are cut separately, against
   the addresses the findings name.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/cohesion-sweep-gallery.mjs
   `--out <dir>` names where the audit lands. To sweep another checkout -
   main's tip, for a before column - run it from *that* checkout's directory
   and hand it the same path as --root: vite's preview server resolves
   .svelte-kit/output relative to the cwd whatever root it is given, so
   --root on its own silently sweeps this build twice under two tags.

   `--prove` runs one extra route first with seven marks - an undersized
   button, a covered button and a tonal ground, which have to be found, and
   four that have to be left alone: a big heading inside a `display: none`
   parent, a round button, a small button inside an `inert` subtree, and a
   control that runs past the region's own fold with something painted
   beyond it (carpet 26). It exits non-zero if any of the seven misbehaves.
   A sweep that reports nothing is worth nothing until it has been seen to
   find something, and all four negative marks are phantoms this instrument
   has actually produced -
   `display` is not inherited, so `getComputedStyle` on a hidden element's
   child still answers `display: block`; hit testing respects
   `border-radius`, so a circle falls through to its ancestor at the four
   corners of its box; a control past the fold is one scroll away rather
   than lost, which had every long column filing its last control as
   covered by the app's foot; and an inert control is not a control, which
   is how the floating bar came to report itself as covered by the screen
   while a sheet held it out.

   `--pin-android` adds the states no web build can reach. The reminders
   list is `isAndroid()`-gated with no demo bypass, so nothing on it counts
   in a plain walk - which is how the check-in group reached carpet 30
   undecided, and why that leg is what finally rendered it. This pins that
   screen's own `isWeb` to false, rebuilds, walks the gated routes and puts
   the file back, which is `tests/unprompted-gallery.mjs`'s pattern:
   forcing `isAndroid()` itself sends boot at the Android SQLite driver and
   the app never becomes ready, and a query parameter that forced the branch
   would be a backdoor shipped to production for the sake of a reading. */
import { preview } from 'vite';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const root = resolve(flag('root', resolve(here, '..')));
const outDir = resolve(flag('out', resolve(here, '../.claude/cohesion-shots')), tag);
/* The ticket asks for every palette on anything that carries colour. Of the
   six checks below only `tint` can vary with the palette at all - a corner,
   a shadow, a font size and a stroke width are the same eight ways round -
   so the walk runs one palette by default and `--palettes a,b` is how that
   is *shown* rather than assumed: two palettes whose findings are identical
   are the evidence that the dimension adds nothing to these checks. Run it
   with the flag whenever a check is added that reads a role. */
const PALETTES = flag('palettes', 'trans').split(',');

/* Every route in src/routes, with the dynamic ones resolved to a real id by
   `resolve` below. `door` marks the four doors, which rule 7 says never show
   a back control; `chrome` marks the rule's third case (carpet 25), which is
   Settings and nothing else so far; `exception` marks a screen rule 7 does
   not reach, and holds the decision that put it outside - a route with no
   reason written here is a route the rule judges. Everything unmarked is a
   deep screen, which shows both. */
const ROUTES = [
  { path: '/', door: true, name: 'today' },
  { path: '/calendar', door: true, name: 'journal' },
  { path: '/stats', door: true, name: 'lookback' },
  { path: '/more', door: true, name: 'transition' },
  { path: '/body/hair-progress' },
  { path: '/body/hair-removal' },
  { path: '/body-map' },
  { path: '/body/measurements' },
  { path: '/body/sizes' },
  { path: '/care' },
  { path: '/coming-back', exception: 'chromeless by decision (redesign ticket 35, ADR-0080)' },
  {
    path: '/onboarding',
    name: 'setup',
    /* Filed as a deep screen by ticket 20's table, which is what a route
       with nothing said about it is. Setup is a step machine, and its
       header is rules 12 to 15's rather than rule 7's: the field carries
       the question and the sun is the meter, and the back control is the
       step's own `data-back` in the field's ink, which rule 12 drops on
       the welcome step and wherever a step has no way back. So rule 7 does
       not reach this screen, and reading it as a deep screen with no back
       control was the instrument judging it by a rule it does not answer
       to (carpet 25).

       The exception is the route's because the reading is: the walk loads
       the address and reads the welcome step, which is the one step rule 12
       says has nothing to go back to. It excuses no step this walk has ever
       looked at except that one, so a back control going missing deeper in
       setup is not something this line can swallow - it is
       tests/setup-review.mjs and the walkthrough's own setup flows that
       read those. */
    exception: "a step machine: DIRECTION.md rules 12 to 15 own its header, and rule 12 drops the step's own back control on the welcome step, which is the step this walk reads"
  },
  { path: '/doses' },
  { path: '/doubt' },
  { path: '/day/today', name: 'day' },
  { path: '/health/appointment-prep' },
  { path: '/health/appointments' },
  { path: '/health/appointments/in-the-room' },
  { path: '/health/clinician-summary' },
  { path: '/health/cycle-events' },
  { path: '/health/dilation' },
  { path: '/health/side-effects' },
  { path: '/health/surgery' },
  { path: '/media/documents' },
  { path: '/media/photos' },
  { path: '/media/photos/export' },
  { path: '/media/voice/memos' },
  { path: '/on-this-day' },
  { path: '/practice/entry-templates' },
  { path: '/practice/personal-effects' },
  { path: '/practice/resources' },
  { path: '/practice/voice' },
  { path: '/practice/voice/metrics' },
  { path: '/practice/wear' },
  { path: '/search' },
  { path: '/search/questions' },
  { path: '/search/starred' },
  {
    path: '/settings',
    /* Rule 7's third case (ADR-0076, carpet 25): chrome, which shows the
       field and shows a back control on the phone - which is the width this
       walk runs at - and none in the 1024px shell, where the rail's fifth
       row is the way in. The desktop half of that answer is the
       walkthrough's, at step 14b. */
    chrome: true,
    /* The disguise rows are drawn inside a sheet, so no walk that only
       loads the address had ever seen them - `.card.spread` counted 0 while
       carpet 30 was trying to decide about it, which is what this state was
       added for. Carpet 29 has since taken that variant's ground and its
       `.card` off it, and the state stays: a sheet's contents are three
       rows, a segmented control and a switch that no other reading covers.
       A state is read as its own reading rather than folded into the
       screen's, so the base route stays a reading of the screen and the
       sheet is a reading of the sheet. */
    states: [{ name: 'disguise-sheet', open: ['[data-list-row="disguise"]'] }]
  },
  { path: '/settings/access-mode' },
  { path: '/settings/affirmations' },
  { path: '/settings/body-regions' },
  { path: '/settings/dimension' },
  { path: '/settings/export' },
  { path: '/settings/exposure' },
  { path: '/settings/hormone-curve' },
  { path: '/settings/journal-book' },
  { path: '/settings/journaling-pause' },
  { path: '/settings/labs' },
  { path: '/settings/live-tiles' },
  { path: '/settings/notifications' },
  { path: '/settings/passphrase' },
  { path: '/settings/permissions' },
  { path: '/settings/recovery-key' },
  { path: '/settings/regimen' },
  { path: '/settings/reminders' },
  { path: '/settings/security' },
  { path: '/settings/stock' },
  { path: '/settings/tags' },
  { path: '/settings/trash' },
  { path: '/tally' },
  { path: '/timeline' },
  { path: '/compare' },
  { path: '/transition/eras' },
  { path: '/transition/letters' },
  { path: '/transition/milestones' },
  { path: '/transition/presentations' },
  { path: '/transition/roadmap' },
  { path: '/transition/tryouts' },
  { path: '/transition/words' },
  { path: '/wrapped/year', name: 'wrapped' },
  { path: '/wrapped/year/share', name: 'wrapped-share' }
];

/* The routes whose address needs an id the demo journal only invents at
   seed time. Resolved by reading a link off the list screen that owns them,
   so the walk covers them without a fixture of its own. */
const RESOLVED = [
  { name: 'entry', prefix: '/entry/', look: ['/day/today', '/calendar', '/timeline'] },
  { name: 'document', prefix: '/media/documents/', look: ['/media/documents'] },
  { name: 'question', prefix: '/search/questions/', look: ['/search/questions', '/search'] },
  { name: 'reminder', prefix: '/settings/reminders/', look: ['/settings/reminders'] },
  { name: 'letter', prefix: '/transition/letters/', look: ['/transition/letters', '/stats'] },
  { name: 'tryout', prefix: '/transition/tryouts/', look: ['/transition/tryouts'] }
];

/* Rule 5's allow-list, as the radius contract test resolves it, plus the
   proportional corner ADR-0077 gave the mood face. */
const RADII = new Set(['0px', '1px', '2px', '4px', '6px', '8px', '50%', '100%', '999px']);
/* Rule 2's scale: 15 secondary, 16 body, 17 content title, 19 a tile's
   title, 21 a sheet heading, 28 section, 40 a number on a block, 48 a door
   title. 12 and 13 are the two small-text exceptions rule 11 names (a tag's
   label, a day bar's date); 14 is the pad's dots. */
const SIZES = new Set([12, 13, 14, 15, 16, 17, 19, 21, 24, 28, 40, 48]);
/* Rule 9: a series at 2, a guide at 1, the donut's ring at 12, a bar at 14,
   the inline bar at 36, and the hairline a box draws at 1. 4 is the rail the
   rule names beside the donut, which the breathing ring also draws. */
const STROKES = new Set([0, 0.8, 1, 1.5, 2, 2.5, 3, 4, 12, 14, 36]);
/* `PRODUCT.md`: "touch targets >= 48px (Android's floor, which is the
   stricter of the two platforms)". `--touch-target` is 48px and
   `accessibility-audit.test.ts` asserts the token; this asserts the box. */
const TOUCH_FLOOR = 48;
/* The ticket's list, plus `textarea`, which is an input by every name but
   its tag. `[tabindex]` is filtered to non-negative below: -1 is
   programmatically focusable and not a pointer target. */
const INTERACTIVE = 'button, a, input, select, textarea, [role="slider"], [tabindex]';
/* The surfaces whose variants the carpet counts. Matched elements are keyed
   by their whole class list rather than by the base, so a variant nobody
   predicted shows up as itself - which is how carpet 21 came to say four
   when the source has six. */
const AUDITED = ['.card', '.app-savebar'];

/* The gated leg, which is its own run of this script rather than a second
   act inside the main one. `/settings/reminders` draws its Android branch -
   the check-in group, the switch rows, the battery notice - only where
   `isAndroid()` is true, so on the web it has always counted 0, which is
   what carpet 30 needed a render of. Pinning that screen's own
   `isWeb` is `tests/unprompted-gallery.mjs`'s pattern, and the reason for
   it holds here too: forcing `isAndroid()` sends boot at the Android SQLite
   driver and the app never becomes ready, and a query parameter that forced
   the branch would be a backdoor shipped to production for the sake of a
   reading.

   A second process rather than a rebuild mid-run, because a rebuild means a
   new preview server on a new port, a new origin and an empty journal - and
   when that leg failed to boot it took the whole main walk's audit down
   with it, unwritten. A process that pins before it serves anything has one
   build for its whole life, and its findings merge into the report the main
   run already wrote. */
const PIN_ANDROID = args.includes('--pin-android');
/* `[data-checkin]` rather than a `.card` variant: carpet 30 took the box off
   the check-in group, and the group is what this leg exists to photograph. */
const GATED = [{ path: '/settings/reminders', name: 'reminders', shoot: '[data-checkin]' }];
const SCREEN = resolve(root, 'src/routes/settings/reminders/+page.svelte');
const PINNED = '  let isWeb = $derived(false && !isAndroid()); // pinned by tests/cohesion-sweep-gallery.mjs';
let pinnedLeg = false;
let original = null;

const build = () =>
  new Promise((done, fail) => {
    const child = spawn('npx', ['vite', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, VITE_DEMO: '1' }
    });
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`vite build exited ${code}`))));
  });

if (PIN_ANDROID) {
  original = await readFile(SCREEN, 'utf8');
  const forced = original.replace('  let isWeb = $derived(!isAndroid());', PINNED);
  if (forced === original) throw new Error(`${SCREEN} no longer has the shape this script pins`);
  /* The restore writes `original` back, and over uncommitted work
     `original` would be somebody's half-finished edit. */
  const dirty = execFileSync('git', ['status', '--porcelain', '--', SCREEN], { cwd: root }).toString().trim();
  if (dirty) throw new Error(`${SCREEN} has uncommitted changes - commit or stash them before the gated leg`);

  /* `finally` covers a throw; a Ctrl-C is a signal and skips it, which
     would leave the pinned file on disk. */
  const putBack = () => writeFileSync(SCREEN, original);
  process.on('SIGINT', () => {
    putBack();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    putBack();
    process.exit(143);
  });
  process.on('uncaughtException', (err) => {
    putBack();
    console.error(err);
    process.exit(1);
  });
  await writeFile(SCREEN, forced);
  await build();
}

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
let app = await preview({ root, preview: { port: 0 } });
let base = `http://localhost:${app.httpServer.address().port}`;
const errors = [];
const audit = [];
const shots = [];

let page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));
watch(page);

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

const strip = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    if (!document.getElementById('sweep-shot-css')) {
      const style = document.createElement('style');
      style.id = 'sweep-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/* The audit, run in the page so it reads computed values rather than
   source. Walks the app frame only: the demo bar and anything a gallery
   injected are outside it, and so is the browser's own scrollbar. */
const read = () =>
  page.evaluate(
    async ([RADII, SIZES, STROKES, INTERACTIVE, FLOOR, AUDITED]) => {
      const root = document.querySelector('[data-app-root]');
      if (!root) return { fatal: 'no app frame' };
      const frame = root.getBoundingClientRect();
      const radiusOk = new Set(RADII);
      const sizeOk = new Set(SIZES);
      const strokeOk = new Set(STROKES);

      /* A selector chain short enough to read and specific enough to grep
         for: the element's own classes, then its nearest classed ancestor. */
      const chain = (el) => {
        const own = el.classList.length ? `.${[...el.classList].join('.')}` : el.tagName.toLowerCase();
        let up = el.parentElement;
        while (up && up !== root && !up.classList.length) up = up.parentElement;
        const parent = up && up !== root ? `.${[...up.classList].join('.')}` : '';
        return parent ? `${parent} > ${own}` : own;
      };

      /* The app's one shadow, and the two rings that are spelled box-shadow
         because a ring drawn inward has no other spelling (kit.css says so
         at .kit-block's edge). A ring is not elevation and rule 4 does not
         ban it; what it bans is a surface floating. */
      const shadowAllowed = (el, value) => {
        if (el.closest('[data-app-nav], [data-app-rail]')) return true;
        if (/inset/.test(value)) return true;
        /* A knockout: `<colour> 0px 0px 0px Npx`. No offset and no blur, so
           nothing is cast - it is a ring drawn outward, which is the only
           spelling CSS has for one, the same reason kit.css draws its inward
           edge as an inset shadow. Rule 4 bans a surface floating, not a
           ring. */
        return /\)\s*0px\s+0px\s+0px\s+[\d.]+px$/.test(value.trim());
      };

      /* Rule 4 sanctions three treatments - flush (no ground), block (a
         stripe with its ink) and ink (--text as a ground). A tonal ground
         is a fourth, and it is invisible to a grep because the token is
         spelled a dozen ways and resolves per palette and per theme. So
         the two are resolved here, on this document, and compared against
         what each element actually painted. */
      const tone = getComputedStyle(document.documentElement);
      const GROUNDS = [
        ['--surface', tone.getPropertyValue('--surface').trim()],
        ['--surface-2', tone.getPropertyValue('--surface-2').trim()]
      ].filter(([, v]) => v);
      /* Declared hexes against computed rgb(): resolved through the same
         parser rather than compared as text. */
      const swatch = document.createElement('span');
      swatch.style.display = 'none';
      document.body.append(swatch);
      const asColour = (value) => {
        swatch.style.backgroundColor = '';
        swatch.style.backgroundColor = value;
        return getComputedStyle(swatch).backgroundColor;
      };
      const groundOf = new Map(GROUNDS.map(([name, value]) => [asColour(value), name]));
      swatch.remove();

      /* The floor's documented exceptions, each by shape rather than by
         class name, so none of them can be used to smuggle a small control
         in under a new selector.

         1. A link inside a sentence. It is `display: inline`, it takes the
            line box's height, and growing it to 48px would open a hole in
            the paragraph. Rule 4's notice draws its action this way.
         2. Something nothing can hit: `pointer-events: none`, or disabled,
            or inside an `inert` subtree. Not a target, so not a target
            failure, and not something worth reporting as covered either.
            `inert` is how a sheet holds the background out - `Sheet.svelte`
            sets it on the shell's other children - and `components.css`
            then puts an inert child of the shell at `z-index: -1` on
            purpose, so the floating bar recedes *behind* the screen while a
            sheet is up. Read as a divergence that was the withdrawal
            working: the whole bar reported its active tab as covered by
            `.app-main` on the one route the walk opens a sheet on. Neither
            `disabled` nor a computed `pointer-events` reflects inertness,
            so it is asked for by attribute.
         3. A negative tabindex, which is a scroll region or a focus sink
            asking to be reachable from script, not a control. */
      const exemptTarget = (el, cs) => {
        if (cs.pointerEvents === 'none') return true;
        if (el.disabled) return true;
        if (el.closest('[inert]')) return true;
        const tabindex = el.getAttribute('tabindex');
        if (tabindex !== null && Number(tabindex) < 0 && !el.matches('button, a, input, select, textarea'))
          return true;
        if (cs.display === 'inline' && el.textContent.trim()) return true;
        return false;
      };

      /* What a finger can actually find: the run through the element's own
         centre in each direction where hit testing still answers with the
         element or something inside it. It sees a pseudo-element's reach,
         which has no box to measure, and it stops at anything covering the
         control, which is the same thing from the other side. Run only on
         a control whose box already failed, so the common case pays
         nothing. */
      const hitExtent = (el, box) => {
        const cx = Math.round(box.left + box.width / 2);
        const cy = Math.round(box.top + box.height / 2);
        const mine = (x, y) => {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
          const at = document.elementFromPoint(x, y);
          return !!at && (at === el || el.contains(at));
        };
        if (!mine(cx, cy)) return { width: 0, height: 0 };
        const run = (dx, dy) => {
          let step = 1;
          while (step <= FLOOR && mine(cx + dx * step, cy + dy * step)) step += 1;
          return step - 1;
        };
        return { width: run(-1, 0) + run(1, 0) + 1, height: run(0, -1) + run(0, 1) + 1 };
      };

      const found = { elevation: [], radius: [], type: [], tint: [], ink: [], target: [], ground: [], occlusion: [] };
      const seen = new Set();
      const note = (bucket, el, detail) => {
        const key = `${bucket}|${chain(el)}|${detail}`;
        if (seen.has(key)) return;
        seen.add(key);
        found[bucket].push({ where: chain(el), detail });
      };

      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        /* Effective opacity, because opacity composes down the tree and an
           invisible element's corners are not on screen. The chart picker's
           real select sits at opacity 0 under its drawn face - it is there
           to open the platform's list, not to be looked at - and its user
           agent 7.5px corner was reported as the one radius in the app
           outside rule 5's budget. */
        let shown = Number(cs.opacity);
        for (let up = el.parentElement; up && up !== root && shown; up = up.parentElement)
          shown *= Number(getComputedStyle(up).opacity);
        if (!shown) continue;

        /* And no box at all, which `display` alone does not catch: the check
           above skips a hidden element but `getComputedStyle` on its
           *children* still answers `display: block`, because display is not
           inherited and is never recomputed to none for a descendant. So a
           paper-only heading - `.print-heading` is `display: none` until
           `@media print` turns it on - reported its 32px h1 as live type on
           two screens, in both themes, and `DIRECTION.md` governs screens.
           A zero-size box is the honest test for "on screen at all". */
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        /* And nothing parked off the frame. `.skip-link` sits at
           `top: -48px` until a keyboard focuses it, so it has a real 146x40
           box that is not on screen and is not a touch target; the same
           argument as the zero-size box above, one axis out. Below the
           frame is left alone, because that is unscrolled content rather
           than somewhere off screen. */
        if (box.bottom <= frame.top || box.right <= frame.left || box.left >= frame.right) continue;

        if (cs.boxShadow && cs.boxShadow !== 'none' && !shadowAllowed(el, cs.boxShadow))
          note('elevation', el, cs.boxShadow.replace(/\s+/g, ' ').slice(0, 60));

        for (const corner of [
          cs.borderTopLeftRadius,
          cs.borderTopRightRadius,
          cs.borderBottomRightRadius,
          cs.borderBottomLeftRadius
        ]) {
          /* A percentage corner resolves to px per axis; a mood face's is
             26.7% of whatever size a surface asked for, so it is read from
             the declared value rather than the resolved one. */
          if (radiusOk.has(corner)) continue;
          if (el.classList.contains('mood-face')) continue;
          /* 50%/100% resolve to half the box. Recognised as such rather
             than listed as a divergence per element size. */
          const half = Math.abs(parseFloat(corner) - el.getBoundingClientRect().width / 2) < 0.6;
          const full = Math.abs(parseFloat(corner) - el.getBoundingClientRect().height) < 0.6;
          if (half || full) continue;
          note('radius', el, corner);
        }

        /* Type is read only where the element has text of its own, so a
           wrapper inheriting a size is not counted eight times. */
        const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasOwnText) {
          const px = Math.round(parseFloat(cs.fontSize) * 10) / 10;
          /* The wrapped cover's year is a named exception (rule 2, carpet
             23): the one screen that is a poster rather than a door, so its
             64px title is legal by selector rather than added to the scale. */
          const isWrappedYear = el.classList.contains('wrapped-cover-year') && Math.round(px) === 64;
          if (!isWrappedYear && !sizeOk.has(Math.round(px))) note('type', el, `${px}px`);
        }

        const bg = cs.backgroundImage + ' ' + cs.backgroundColor;
        if (/role-tint|role-wash/.test(bg)) note('tint', el, 'tint as a ground');

        const ground = groundOf.get(cs.backgroundColor);
        if (ground) note('ground', el, `${ground} as a ground`);

        if (el.namespaceURI === 'http://www.w3.org/2000/svg' && !el.closest('.mood-face')) {
          const w = cs.strokeWidth;
          if (w && w !== '0px' && cs.stroke !== 'none') {
            const px = Math.round(parseFloat(w) * 10) / 10;
            if (!strokeOk.has(px)) note('ink', el, `${px}`);
          }
        }
      }

      /* Rule 7: every door and every deep screen shows the field, a door
         never shows a back control, a deep screen always does. The field is
         whatever carries --field as its ground. */
      const header = root.querySelector('[data-screen-header], [data-home-header]');
      /* The field is the blind ScreenHeader (and Today's own header) draws:
         a block hanging from the top edge whose ground is --field. Read as
         the element, not as a colour match, because under disguise --field
         is --surface-2 and a colour match would call that no field. */
      const blind = root.querySelector('[data-field-blind]');
      const field = !!blind && blind.getBoundingClientRect().width > root.clientWidth * 0.9;
      const back = !!root.querySelector('[data-screen-back]');

      /* Coverage, so an unreached variant reads as a gap rather than as a
         zero. Each audited base is counted by the whole class list of the
         elements that matched it, drawn or not: `.card.spread` and
         `.card.checkin-card` were the two ticket 20's walk never reached,
         and a count nobody can see is what let ticket 21 size itself
         against four variants when the source has six. Carpet 29 and 30
         have since retired both, so the census should now read one base
         and no variant but `.card.no-print`, which is a print utility
         rather than a variant. */
      const census = {};
      for (const base of AUDITED)
        for (const el of root.querySelectorAll(base)) {
          /* Without the compiler's scope class, which is not a variant:
             `.card.breathing-card.svelte-k4blm0` was drawn on /doubt and
             read as a gap against the source's `.card.breathing-card`
             (both retired on carpet 30),
             which is the instrument inventing the hole it exists to find. */
          const key = `.${[...el.classList].filter((c) => !c.startsWith('svelte-')).join('.')}`;
          census[key] = (census[key] ?? 0) + 1;
        }

      /* Occlusion, answered the way a finger answers it. For every
         interactive box a grid of points is handed to `elementFromPoint`,
         which walks the real stacking order including every context a
         declared z-index disappears into - the ticket asks for the
         effective stacking, and a declared 20 means nothing on its own.
         Three answers:

           the element itself, or something inside it - clear;
           an ancestor - the element is not on top of its own box, which is
             a control clipped out of an overflow or under a pointer-events
             trap, and is as unclickable as a covered one;
           anything else - covered, and by that.

         The overlap is measured off the two rects rather than counted in
         samples, so a finding reads "19px of 48" and carpet 26 can size
         itself from the list.

         The scroll region is stepped a screen at a time, because
         `elementFromPoint` only answers inside the viewport and a pinned
         thing covers what is under it at every position, not only at rest.

         **The app's own chrome is exempt at the positions where content is
         meant to pass beneath it, and only there.** A floating bar that
         content never went behind would not be floating; what the app
         promises instead is a reservation, and the two halves of that
         promise are what this checks. `.app-main` reserves
         --nav-clearance for the bottom bar, so the bar may cover a row
         mid-scroll and may not at the end of the column. The field blind
         holds its own room at the top of the flow, so it may cover a row
         once the column has moved and may not at rest. Everything else -
         the save bar above all, which is a second pinned thing over the
         same column and the column does not know it is there (carpet 26) -
         is a finding wherever it lands. */
      const seenCover = new Set();
      const targets = new Map();
      const occlusion = found.occlusion;
      const region = root.querySelector('[data-app-scroll-region]') ?? root;
      const scrim = root.querySelector('.sheet-scrim');

      /* Is some ancestor a scroller this element is merely scrolled out
         of? Read off the computed overflow rather than a class, and only
         for `auto` and `scroll`: those the user can bring back. */
      const scrollableAway = (el) => {
        const box = el.getBoundingClientRect();
        for (let up = el.parentElement; up && up !== root; up = up.parentElement) {
          const cs = getComputedStyle(up);
          const scrolls = /auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflowY);
          if (!scrolls) continue;
          const port = up.getBoundingClientRect();
          if (box.left < port.left || box.right > port.right || box.top < port.top || box.bottom > port.bottom)
            return true;
        }
        return false;
      };

      /* Pinned: anything that stays put while the column moves, which is
         either something outside the scroll region altogether - the
         floating bar is `position: absolute` against the frame, not fixed -
         or something sticky or fixed inside it. Read off the computed
         position and the tree rather than off a class, so a screen that
         invents its own footer is caught too. */
      const pinned = (el) => {
        if (!region.contains(el)) return true;
        for (let up = el; up && up !== region; up = up.parentElement) {
          const at = getComputedStyle(up).position;
          if (at === 'fixed' || at === 'sticky') return true;
        }
        return false;
      };

      /* How much of the target is actually dead, walked a pixel at a time
         down the column the sample failed in. Two rects would do for a bar
         lying across a slider and would answer 0px for the case that
         motivated this: a 48px title set solid overflows its own border box
         by the leading it does not have, so its *inline* box swallows the
         bottom of the back control while the two boxes do not intersect at
         all. Hit testing is the only thing that knows that, so hit testing
         is what measures it. */
      /* Where the region actually paints. A control that runs past the fold
         is clipped there rather than covered, whatever is painted beyond it,
         and reading those points as coverage is a phantom of exactly the
         kind this sweep found twelve of: after carpet 26 put the app's foot
         *outside* the region, every long column filed its last control as
         covered by the foot at rest, on five routes, when a scroll of the
         column brings the whole control clear of it. The allowance the
         `clipped` branch below already makes for a control scrolled out of
         a scroller it lives in is the same allowance, read off the point
         instead of off the tree. Both edges, since the region's top is a
         fold too. */
      const outsidePort = (el, x, y) => {
        if (!region.contains(el) || region === root) return false;
        const port = region.getBoundingClientRect();
        return y < port.top || y >= port.bottom || x < port.left || x >= port.right;
      };

      const band = (el, over, x, box) => {
        let dead = 0;
        let first = null;
        let last = null;
        for (let y = Math.ceil(box.top); y <= Math.floor(box.bottom); y++) {
          if (y < 0 || y >= innerHeight) continue;
          if (outsidePort(el, x, y)) continue;
          const at = document.elementFromPoint(x, y);
          if (!at || !over.contains(at)) continue;
          dead += 1;
          first ??= y;
          last = y;
        }
        const height = Math.round(box.height);
        /* The scan is inclusive at both ends, so a box read pixel by pixel
           answers one more than its own height. */
        dead = Math.min(dead, height);
        if (!dead) return `an edge of ${height}`;
        const end = first - box.top < box.bottom - last ? 'top' : 'bottom';
        return `the ${end} ${dead}px of ${height}`;
      };

      /* What covered it, as one object rather than as whichever descendant
         the point landed in. Walking up until the parent is an ancestor of
         the target gives the box that sits beside it in the tree, so a
         label and an icon inside the save bar's button are one finding
         against `.app-savebar` instead of three against its innards. */
      const coverer = (el, hit) => {
        let up = hit;
        while (up.parentElement && up.parentElement !== root && !up.parentElement.contains(el)) up = up.parentElement;
        return up;
      };
      const settled = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const sweepStep = (where) => {
        for (const el of root.querySelectorAll(INTERACTIVE)) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (exemptTarget(el, cs)) continue;
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          if (box.bottom <= frame.top || box.right <= frame.left || box.left >= frame.right) continue;
          if (box.bottom <= 0 || box.top >= innerHeight) continue;

          /* The rendered box against the 48px floor, taken here rather
             than in the pass above because the answer needs the control on
             screen: a box under the floor is not yet a finding, since a
             control can be drawn small and hit large, and only hit testing
             can see that. `.tag-info-btn` is 24x24 with an `::after` at
             `inset: -12px` - a 48px target around a 24px glyph, the pattern
             `.photo-remove` takes too - and a pseudo has no box to measure.
             An element is measured as itself: a control nested inside a
             larger control is still the thing a finger has to find.

             The best reading over all the scroll positions wins, filed
             after the walk. A control straddling the fold has its reach
             cut by the viewport edge rather than by anything on the page,
             and filing the first reading would make that the finding. */
          const best = targets.get(el) ?? { w: 0, h: 0 };
          let w = Math.round(box.width);
          let h = Math.round(box.height);
          if ((w < FLOOR || h < FLOOR) && box.top >= 0 && box.bottom <= innerHeight) {
            const reach = hitExtent(el, box);
            w = Math.max(w, reach.width);
            h = Math.max(h, reach.height);
          }
          targets.set(el, { w: Math.max(best.w, w), h: Math.max(best.h, h) });

          for (let i = 0; i < 5; i++)
            for (let j = 0; j < 5; j++) {
              const x = box.left + ((i + 0.5) / 5) * box.width;
              const y = box.top + ((j + 0.5) / 5) * box.height;
              if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
              if (outsidePort(el, x, y)) continue;
              const hit = document.elementFromPoint(x, y);
              if (!hit || hit === el || el.contains(hit)) continue;
              /* A control that falls through to its own ancestor at one of
                 the four corners of its bounding box is round, not clipped:
                 hit testing respects `border-radius`, and `.kit-notice-x`
                 is a 48px circle whose box corners were never part of it.
                 Real clipping takes an edge with it, so the corners are not
                 evidence of it. A sibling covering a corner still is. */
              if (hit.contains(el) && (i === 0 || i === 4) && (j === 0 || j === 4)) continue;
              /* And a control hanging out of a scroller it lives in is one
                 scroll away, not lost - the same allowance the column
                 itself gets from the walk below. `.segmented` is
                 `overflow-x: auto`, so its off-screen segments are exactly
                 that. `hidden` and `clip` earn no such allowance: nothing
                 brings those back. */
              if (hit.contains(el) && scrollableAway(el)) continue;
              /* A scrim covering the page is the scrim working. Everything
                 behind an open sheet is inert on purpose, so the reading is
                 of the sheet and not of what it is over. */
              if (scrim && (scrim.contains(hit) || hit.contains(scrim))) continue;
              if (where === 'mid-column' && pinned(hit)) continue;
              if (where === 'at rest' && hit.closest('[data-app-nav], [data-app-rail]')) continue;
              if (
                where === 'at the end of the column' &&
                hit.closest('[data-field-blind], [data-screen-header], [data-home-header]')
              )
                continue;
              const clipped = hit.contains(el);
              const over = clipped ? hit : coverer(el, hit);
              const by = chain(over);
              const key = `${chain(el)}|${by}|${clipped}|${where}`;
              if (seenCover.has(key)) continue;
              seenCover.add(key);
              occlusion.push({
                where: chain(el),
                detail: clipped
                  ? `clipped out of ${by}, ${where}`
                  : `${band(el, over, x, box)} covered by ${by}, ${where}`
              });
            }
        }
      };

      const top = region.scrollTop;
      const floor = Math.max(0, region.scrollHeight - region.clientHeight);
      sweepStep('at rest');
      const stride = Math.max(1, Math.round(region.clientHeight * 0.85));
      for (let at = stride; at < floor; at += stride) {
        region.scrollTop = at;
        await settled();
        sweepStep('mid-column');
      }
      if (floor > 0) {
        region.scrollTop = floor;
        await settled();
        sweepStep('at the end of the column');
      }
      region.scrollTop = top;
      await settled();

      /* One finding per rule, carrying its worst instance. Twenty tag
         chips of twenty widths are one rule set 7px short, and three
         info buttons whose expanded hit area is eaten by three different
         neighbours are one rule too - filing the measurement rather than
         the rule turns a component into a page of near-duplicates. */
      const worst = new Map();
      for (const [el, { w, h }] of targets) {
        if (w >= FLOOR && h >= FLOOR) continue;
        const key = chain(el);
        const had = worst.get(key);
        /* The worst single instance, not the worst of each axis taken
           separately, which would report a box no instance has. */
        if (!had || Math.min(w, h) < Math.min(had.w, had.h)) worst.set(key, { el, w, h });
      }
      for (const { el, w, h } of worst.values()) {
        if (w < FLOOR && h < FLOOR) note('target', el, `${w}x${h}`);
        else if (h < FLOOR) note('target', el, `${h}px tall`);
        else note('target', el, `${w}px wide`);
      }

      return { found, header: !!header, field, back, census };
    },
    [[...RADII], [...SIZES], [...STROKES], INTERACTIVE, TOUCH_FLOOR, AUDITED]
  );

/* Seed the demo persona: every route below needs data to render anything,
   and the seed ends by navigating to /more. */
const seed = async () => {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(2000);
};
await seed();

/* Rule 7's verdict, per reading (carpet 25). Ticket 20's sweep read the
   field and the back control and left the judging to whoever read the
   table, which is how `/settings` came to be filed as a question - "door
   with a field and no back, or deep screen with both?" - rather than as a
   pass or a finding. The rule has three cases now and each fixes both
   answers, so the instrument can say which it is:

     door    the field, and never a back control
     deep    the field and a back control
     chrome  the field, and a back control on the phone only (ADR-0076);
             this walk is 390px wide, so here that is a back control, and
             the 1024px half is the walkthrough's step 14b
     exception  a screen the rule does not reach, which has to carry the
             decision that put it outside: /coming-back, chromeless by
             ADR-0080, and /onboarding, whose header rules 12 to 15 own.
             Reported as a recorded exception rather than counted as a pass,
             so the two are never confused for each other

   A state is judged as its own reading, the same way every other check
   treats one: a sheet open over a screen does not change what the screen
   is. */
const CASES = {
  door: { field: true, back: false },
  deep: { field: true, back: true },
  chrome: { field: true, back: true }
};
const rule7 = (route, reading) => {
  if (route.exception) return { case: 'exception', verdict: 'recorded exception', why: route.exception };
  const which = route.chrome ? 'chrome' : route.door ? 'door' : 'deep';
  const want = CASES[which];
  const wrong = [];
  if (reading.field !== want.field) wrong.push(want.field ? 'no field' : 'a field it should not have');
  if (reading.back !== want.back) wrong.push(want.back ? 'no back control' : 'a back control');
  return { case: which, verdict: wrong.length ? wrong.join(', ') : 'pass' };
};

/* One reading, filed. Shared by the walk, the gated leg and the proof, so
   all three land in the same table with the same keys. */
const record = async (route, palette, theme, extra = {}) => {
  const state = extra.state;
  const slug = route.name ?? (route.path.replace(/^\//, '').replace(/\//g, '-') || 'today');
  const name = `${slug}${state ? `-${state.name}` : ''}-${palette}-${theme}`;
  try {
    await settle(route.path);
    for (const selector of state?.open ?? []) {
      await page.locator(selector).first().click();
      await page.waitForTimeout(600);
    }
    await strip();
    await page.waitForTimeout(900);
    const reading = await read();
    const counts = reading.found
      ? Object.fromEntries(Object.entries(reading.found).map(([k, v]) => [k, v.length]))
      : {};
    audit.push({
      route: route.path,
      palette,
      theme,
      name,
      ...reading,
      counts,
      rule7: rule7(route, reading),
      door: !!route.door,
      ...extra,
      state: state?.name
    });
    /* A surface only one build can draw is a number nobody can check, so
       the gated leg leaves the picture beside the count. */
    if (route.shoot) {
      const clip = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.left - 10), y: Math.max(0, r.top - 10), width: r.width + 20, height: r.height + 20 };
      }, route.shoot);
      if (clip) {
        await page.screenshot({ path: `${outDir}/${name}.png`, clip });
        shots.push({ name, route: route.path, selector: route.shoot, file: `${name}.png` });
      }
    }
    return reading;
  } catch (err) {
    audit.push({
      route: route.path,
      palette,
      theme,
      name,
      error: String(err).slice(0, 200),
      ...extra,
      state: state?.name
    });
    return null;
  }
};

const walkRoutes = async (list, extra = {}) => {
  for (const palette of PALETTES) {
    for (const theme of ['light', 'dark']) {
      await dress(palette, theme);
      for (const route of list) {
        await record(route, palette, theme, extra);
        for (const state of route.states ?? []) await record(route, palette, theme, { ...extra, state });
      }
    }
  }
};

/* The proof. Five marks go onto one real screen, the audit runs over them,
   and the run fails unless the three checks carpet 28 added each catch
   their own and the two that are meant to be ignored are ignored. A check nobody
   has watched fail is a check that reports zero for the wrong reason, which
   is what the 48px floor and the surface treatments had been doing all
   along; and the fourth mark is the phantom ticket 20's triage found, where
   `display: none` on a parent leaves `getComputedStyle` on its child still
   answering `display: block`. The fifth is the other one: a round button
   falls through to its ancestor at the four corners of its bounding box,
   because hit testing respects `border-radius`, and reading that as a
   clipped control filed eight findings against `.kit-notice-x` before this
   mark existed. */
const proof = [];
if (args.includes('--prove')) {
  await settle('/settings');
  await strip();
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'prove-fixture';
    host.style.cssText = 'position:relative;padding:8px;font-size:16px';
    host.innerHTML = `
      <button class="prove-small" style="display:flex;width:24px;height:24px;font-size:16px">x</button>
      <span class="prove-stack" style="position:relative;display:block;width:60px;height:60px">
        <button class="prove-covered" style="display:flex;width:60px;height:60px;font-size:16px">y</button>
        <span class="prove-cover" style="position:absolute;left:0;bottom:0;width:60px;height:20px;z-index:9;background:#f0f"></span>
      </span>
      <button class="prove-round" style="display:flex;width:48px;height:48px;border-radius:50%;border:0;font-size:16px">o</button>
      <div class="prove-tonal" style="width:100px;height:40px;background:var(--surface-2)"></div>
      <span class="prove-inert" inert><button class="prove-inert-btn" style="display:flex;width:24px;height:24px;font-size:16px">i</button></span>
      <div class="prove-hidden" style="display:none"><h1 style="font-size:32px">not on screen</h1></div>`;
    document.querySelector('[data-app-scroll-region]')?.prepend(host);
  });
  const reading = await read();
  const hit = (bucket, mark) => (reading?.found?.[bucket] ?? []).some((f) => f.where.includes(mark));
  proof.push({ check: 'target', mark: '.prove-small at 24x24', want: true, got: hit('target', 'prove-small') });
  proof.push({ check: 'occlusion', mark: '.prove-covered under .prove-cover', want: true, got: hit('occlusion', 'prove-covered') });
  proof.push({ check: 'ground', mark: '.prove-tonal on --surface-2', want: true, got: hit('ground', 'prove-tonal') });
  proof.push({
    check: 'occlusion',
    mark: 'a 48px round button, whose box corners are not the button',
    want: false,
    got: hit('occlusion', 'prove-round')
  });
  proof.push({
    check: 'target',
    mark: 'a 24px button inside an inert subtree, which nothing can hit',
    want: false,
    got: hit('target', 'prove-inert')
  });
  proof.push({ check: 'type', mark: '32px inside a display:none parent', want: false, got: hit('type', 'prove-hidden') });

  /* Rule 7's verdict, on the screen the proof leg is already standing on
     (carpet 25). The mark is worth having because this check reports a word
     rather than a count, and a word that is always "pass" reads the same
     whether the rule is being applied or ignored. So: the screen as it
     ships, and then the same screen with its back control taken out of the
     DOM, which has to come back as the finding it would be. */
  proof.push({
    check: 'field',
    mark: '/settings as chrome, with the field and a back control',
    want: 'pass',
    got: rule7({ path: '/settings', chrome: true }, reading).verdict
  });
  await page.evaluate(() => document.querySelector('[data-screen-back]')?.remove());
  const stripped = await read();
  proof.push({
    check: 'field',
    mark: 'the same screen with its back control removed',
    want: 'no back control',
    got: rule7({ path: '/settings', chrome: true }, stripped).verdict
  });
  await page.evaluate(() => document.querySelector('.prove-fixture')?.remove());

  /* The seventh mark, and the one carpet 26 needed: a control that runs
     past a fold with the app's foot painted beyond it. It has to be planted
     on a screen that has a foot, because that is the only shell where any
     strip of window lies outside the scroll region's own box at all - on
     every other screen the region reaches the window's bottom edge and
     there is nothing beyond the fold to paint. `.screen` is the region's
     own height there, so a box at `bottom: -30px` straddles the region's
     bottom edge with its lower half over the foot. A control clipped by its
     own scroller is one scroll away rather than lost, so this must be left
     alone - it is the exact shape five routes filed at rest when the foot
     moved out of the column. */
  await settle('/settings/dimension');
  await strip();
  await page.evaluate(() => {
    const fold = document.createElement('span');
    fold.className = 'prove-fold-wrap';
    fold.style.cssText = 'position:absolute;left:0;bottom:-30px;display:block;width:60px;height:60px';
    fold.innerHTML =
      '<button class="prove-fold" style="display:flex;width:60px;height:60px;font-size:16px">f</button>';
    document.querySelector('.screen')?.append(fold);
  });
  const folded = await read();
  proof.push({
    check: 'occlusion',
    mark: "a control past the region's fold, under the foot painted beyond it",
    want: false,
    got: (folded?.found?.occlusion ?? []).some((f) => f.where.includes('prove-fold'))
  });
  await page.evaluate(() => document.querySelector('.prove-fold-wrap')?.remove());
}

/* Resolve the dynamic routes to real addresses before the walk, so the
   count reconciles against src/routes rather than against what seeded. The
   gated process skips it: it walks one address and its findings merge into
   the reconciliation the main run already did. */
const resolved = [];
for (const { name, prefix, look } of PIN_ANDROID ? [] : RESOLVED) {
  let found = null;
  let where = null;
  for (const from of look) {
    await settle(from);
    /* `new` is a real address but it is the empty form, not a record, so it
       is the fallback rather than the answer. */
    found = await page.evaluate((p) => {
      const all = [...document.querySelectorAll(`a[href^="${p}"]`)].map((a) => a.getAttribute('href'));
      return all.find((h) => !h.endsWith('/new')) ?? all[0] ?? null;
    }, prefix);
    if (found) {
      where = from;
      break;
    }
  }
  resolved.push({ name, path: found, from: where, prefix, looked: look });
}

/* The new-entry form takes an epoch day rather than a record id, so it has a
   real address without anything to resolve. */
if (!PIN_ANDROID)
  resolved.push({ name: 'entry-new', path: `/entry/new/${Math.floor(Date.now() / 86400000)}`, from: 'computed' });

const walk = PIN_ANDROID
  ? GATED
  : [...ROUTES, ...resolved.filter((r) => r.path).map((r) => ({ path: r.path, name: r.name }))];
/* The gated readings are labelled with a state of their own, because the
   web branch of the same address is in the same table: `/settings/reminders`
   read twice, once as the list nobody on the web can see, is two different
   screens and the report has to say which. The state carries no selector to
   click - the branch is reached by the build, not by the page - and it names
   the shot as well, so `reminders-android-trans-light.png` still says what
   it is. */
await walkRoutes(walk, PIN_ANDROID ? { state: { name: 'android' } } : {});
pinnedLeg = PIN_ANDROID;

if (PIN_ANDROID) {
  await writeFile(SCREEN, original);
  // Left as a plain demo build, which is what every other browser check in
  // the repo expects to find.
  await build();
}

await page.close();
await browser.close();
await app.close();

/* Coverage. A count of zero and a variant nobody drew read the same in a
   table, and ticket 21 sized itself against four `.card` variants when the
   source has six because of exactly that. So the source is counted too, and
   anything the source has and the walk never drew is named a gap. */
const sourceCensus = async () => {
  const files = [];
  const walkDir = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      if (entry.isDirectory()) await walkDir(at);
      else if (at.endsWith('.svelte')) files.push(at);
    }
  };
  await walkDir(resolve(root, 'src'));
  const bases = AUDITED.map((s) => s.replace(/^\./, ''));
  const out = {};
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/class="([^"]*)"/g)) {
      /* An interpolated class is dropped rather than guessed at: what is
         wanted is the literal variants, and a `{cond ? 'a' : 'b'}` has no
         single answer at rest. */
      const tokens = match[1].replace(/\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean);
      if (!bases.some((b) => tokens.includes(b))) continue;
      const key = `.${tokens.join('.')}`;
      out[key] ??= { instances: 0, files: [] };
      out[key].instances += 1;
      if (!out[key].files.includes(file)) out[key].files.push(file.replace(`${root}/`, ''));
    }
  }
  return out;
};

/* The gated leg extends the report rather than replacing it: its whole
   contribution is one address the main walk cannot draw, and a coverage
   table split across two files is the gap it was meant to close. */
let earlier = { audit: [], routes: 0, proof: [], resolved: [] };
if (PIN_ANDROID)
  try {
    earlier = JSON.parse(await readFile(`${outDir}/audit.json`, 'utf8'));
  } catch {
    console.log('no earlier audit to merge into; the gated leg stands alone');
  }
audit.unshift(...(earlier.audit ?? []));
shots.unshift(...(earlier.shots ?? []));
proof.unshift(...(earlier.proof ?? []));
const routes = (earlier.routes ?? 0) + walk.length;

const inSource = await sourceCensus();
const drawn = {};
for (const reading of audit)
  for (const [key, n] of Object.entries(reading.census ?? {})) {
    drawn[key] ??= { most: 0, routes: [] };
    drawn[key].most = Math.max(drawn[key].most, n);
    const at = `${reading.route}${reading.state ? ` (${reading.state})` : ''}`;
    if (!drawn[key].routes.includes(at)) drawn[key].routes.push(at);
  }
const coverage = [...new Set([...Object.keys(inSource), ...Object.keys(drawn)])].sort().map((key) => ({
  variant: key,
  inSource: inSource[key]?.instances ?? 0,
  files: inSource[key]?.files ?? [],
  drawnMost: drawn[key]?.most ?? 0,
  routes: drawn[key]?.routes ?? [],
  gap: !drawn[key] && !!inSource[key]
}));

/* Every finding, grouped by the rule and then by the selector chain, which
   is how the carpet tickets are shaped: one shared component, the routes it
   reaches. Carpet 26 needs the occlusion group to be able to size itself. */
const groups = {};
for (const reading of audit)
  for (const [bucket, items] of Object.entries(reading.found ?? {}))
    for (const item of items) {
      const key = `${item.where} :: ${item.detail}`;
      groups[bucket] ??= {};
      groups[bucket][key] ??= { where: item.where, detail: item.detail, routes: [] };
      const at = `${reading.route}${reading.state ? ` (${reading.state})` : ''} ${reading.theme}`;
      if (!groups[bucket][key].routes.includes(at)) groups[bucket][key].routes.push(at);
    }

const lines = [`# Cohesion sweep - ${tag}`, ''];
lines.push(
  `${routes} route(s) x ${PALETTES.length} palette(s) x 2 themes` +
    (pinnedLeg ? `, the last ${GATED.length} on the pinned Android branch` : '') +
    '.',
  ''
);
for (const [bucket, items] of Object.entries(groups)) {
  const rows = Object.values(items).sort((a, b) => b.routes.length - a.routes.length);
  lines.push(`## ${bucket} (${rows.length})`, '');
  for (const row of rows) lines.push(`- \`${row.where}\` - ${row.detail} - ${row.routes.length} reading(s): ${row.routes.join(', ')}`);
  lines.push('');
}
/* Rule 7, route by route (carpet 25). The other checks report the
   divergences and say nothing about what passed, which is right for a rule
   that reads a property off every element on the screen. This one is a
   verdict per screen against what that screen *is*, so the whole list goes
   in the report: a route missing from it is a route the walk never read,
   and that is the reading ticket 20's own summary could not make. */
const rule7Rows = new Map();
for (const reading of audit) {
  if (!reading.rule7) continue;
  const at = `${reading.route}${reading.state ? ` (${reading.state})` : ''}`;
  const row = rule7Rows.get(at) ?? { at, case: reading.rule7.case, why: reading.rule7.why, verdicts: new Set() };
  row.verdicts.add(reading.rule7.verdict);
  rule7Rows.set(at, row);
}
const rule7List = [...rule7Rows.values()].map((row) => ({
  at: row.at,
  case: row.case,
  why: row.why,
  verdict: [...row.verdicts].join(' / ')
}));
const rule7Failing = rule7List.filter((row) => row.verdict !== 'pass' && row.verdict !== 'recorded exception');
const rule7Exceptions = rule7List.filter((row) => row.verdict === 'recorded exception');
lines.push(
  `## rule 7 (${rule7List.length - rule7Failing.length - rule7Exceptions.length} pass, ` +
    `${rule7Exceptions.length} recorded exception(s), ${rule7Failing.length} finding(s))`,
  ''
);
for (const row of [...rule7Failing, ...rule7Exceptions, ...rule7List.filter((r) => r.verdict === 'pass')])
  lines.push(`- \`${row.at}\` - ${row.case} - ${row.verdict}${row.why ? ` - ${row.why}` : ''}`);
lines.push('');

lines.push('## coverage', '');
for (const row of coverage)
  lines.push(
    `- \`${row.variant}\` - ${row.inSource} in source, drawn on ${row.routes.length} route(s)` +
      (row.gap ? ' - **never drawn**' : '') +
      (row.files.length ? ` - ${row.files.join(', ')}` : '')
  );
if (proof.length) {
  lines.push('', '## proof', '');
  for (const p of proof) lines.push(`- ${p.check}: ${p.mark} - ${p.got === p.want ? 'as expected' : 'WRONG'}`);
}

await writeFile(
  `${outDir}/audit.json`,
  JSON.stringify(
    {
      tag,
      routes,
      palettes: PALETTES,
      resolved: earlier.resolved?.length ? earlier.resolved : resolved,
      pinnedLeg,
      proof,
      coverage,
      rule7: rule7List,
      groups,
      audit,
      shots,
      errors
    },
    null,
    2
  )
);
await writeFile(`${outDir}/findings.md`, `${lines.join('\n')}\n`);

const diverging = audit.filter((a) => a.found && Object.values(a.counts).some((n) => n > 0));
console.log(
  `${routes} route(s) x ${PALETTES.length} palette(s) x 2 themes; ` +
    `${diverging.length} reading(s) with a divergence`
);
for (const [bucket, items] of Object.entries(groups))
  console.log(`  ${bucket}: ${Object.keys(items).length} distinct`);
console.log(
  `  rule 7: ${rule7List.length - rule7Failing.length - rule7Exceptions.length} pass, ` +
    `${rule7Exceptions.length} recorded exception(s)${rule7Exceptions.length ? ` (${rule7Exceptions.map((r) => r.at).join(', ')})` : ''}, ` +
    `${rule7Failing.length} finding(s)`
);
for (const row of rule7Failing) console.log(`    ${row.at} - ${row.case} - ${row.verdict}`);
const gaps = coverage.filter((c) => c.gap);
if (gaps.length) console.log(`  coverage gaps: ${gaps.map((g) => g.variant).join(', ')}`);
console.log(`audit in ${outDir}/audit.json, findings in ${outDir}/findings.md`);

const failedProof = proof.filter((p) => p.got !== p.want);
if (failedProof.length) {
  console.error(`${failedProof.length} of ${proof.length} proof mark(s) did not behave:`);
  for (const p of failedProof) console.error(`  ${p.check}: expected ${p.want ? 'a finding' : 'no finding'} for ${p.mark}`);
  process.exitCode = 1;
}
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}
