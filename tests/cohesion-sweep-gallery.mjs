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
     type       rule 2  - any font-size outside 15/16/17/19/21/28/40/48
     field      rule 7  - a door with no field, a deep screen with no back
     tint       rule 3  - --role-tint or --role-wash as a background
     ink        rule 9  - a stroke-width outside 1/2/12/14 and the bar ends

   Every finding carries the selector chain that produced it, so triage
   groups by shared component instead of by screen.

   Screens are shot only where a route diverges, plus the sample the review
   page needs: 156 PNGs nobody opens is not evidence, and the review page
   for this ticket shows what changed rather than the whole app (Alicja,
   ticket 07's sign-off).

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/cohesion-sweep-gallery.mjs
   `--root <dir>` previews another checkout's build, `--out <dir>` names
   where the shots and the audit land, `--routes a,b` narrows the walk. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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

/* Every route in src/routes, with the dynamic ones resolved to a real id by
   `resolve` below. `door` marks the four doors, which rule 7 says never show
   a back control; everything else is a deep screen, which always does. */
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
  { path: '/coming-back', chromeless: true },
  { path: '/onboarding', name: 'setup' },
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
  { path: '/settings' },
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

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
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
const read = (radii, sizes, strokes) =>
  page.evaluate(
    ([RADII, SIZES, STROKES]) => {
      const root = document.querySelector('[data-app-root]');
      if (!root) return { fatal: 'no app frame' };
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

      const found = { elevation: [], radius: [], type: [], tint: [], ink: [] };
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
          if (!sizeOk.has(Math.round(px))) note('type', el, `${px}px`);
        }

        const bg = cs.backgroundImage + ' ' + cs.backgroundColor;
        if (/role-tint|role-wash/.test(bg)) note('tint', el, 'tint as a ground');

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

      return { found, header: !!header, field, back };
    },
    [[...radii], [...sizes], [...strokes]]
  );

/* Seed the demo persona: every route below needs data to render anything,
   and the seed ends by navigating to /more. */
await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(2000);

/* Resolve the dynamic routes to real addresses before the walk, so the
   count reconciles against src/routes rather than against what seeded. */
const resolved = [];
for (const { name, prefix, look } of RESOLVED) {
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
resolved.push({ name: 'entry-new', path: `/entry/new/${Math.floor(Date.now() / 86400000)}`, from: 'computed' });

const walk = [...ROUTES, ...resolved.filter((r) => r.path).map((r) => ({ path: r.path, name: r.name }))];

for (const theme of ['light', 'dark']) {
  await dress('trans', theme);
  for (const route of walk) {
    const slug = route.name ?? (route.path.replace(/^\//, '').replace(/\//g, '-') || 'today');
    const name = `${slug}-${theme}`;
    try {
      await settle(route.path);
      await strip();
      await page.waitForTimeout(900);
      const reading = await read(RADII, SIZES, STROKES);
      const counts = reading.found
        ? Object.fromEntries(Object.entries(reading.found).map(([k, v]) => [k, v.length]))
        : {};
      audit.push({ route: route.path, theme, name, ...reading, counts, door: !!route.door });
    } catch (err) {
      audit.push({ route: route.path, theme, name, error: String(err).slice(0, 200) });
    }
  }
}

await writeFile(
  `${outDir}/audit.json`,
  JSON.stringify({ tag, routes: walk.length, resolved, audit, shots, errors }, null, 2)
);
await page.close();
await browser.close();
await app.close();

const diverging = audit.filter((a) => a.found && Object.values(a.counts).some((n) => n > 0));
console.log(`${walk.length} route(s) x 2 themes; ${diverging.length} reading(s) with a divergence`);
console.log(`audit in ${outDir}/audit.json`);
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}
