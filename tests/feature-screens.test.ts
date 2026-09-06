/* The feature screens, after the rebuild onto the surface kit (phase 5 UX
   ticket 25), at the level a screen's source can be held to - the same
   shape as home-surfaces.test.ts and more-surfaces.test.ts, which is where
   this kind of test started.

   This is the grind ticket, so the thing worth watching is not any one
   screen but that none of them was quietly left on the old vocabulary.
   The list below is the More hub's own rows, read off `hubRows.ts`, plus
   the handful of screens reached only from inside another one. It was a
   third hand-written screen list until phase 8 audit ticket 22; a screen
   that joins the hub now joins every assertion in this file with it, which
   is the half of the problem a written-out list could never solve - and the
   half it did solve stays, because the screens below the hub are still
   written out rather than globbed, and a screen dropped from a glob and a
   screen dropped from the redesign look identical to a glob.

   Greps by design (ticket 08). The question this file asks 26 times is
   whether a screen still reaches for the old vocabulary, which is a
   negative over its source and has no call form. Where one of these
   screens held a rule instead of markup it has since moved out: the
   archive failure kinds, the chart's padded scale and the personal
   effect's source tier are all called from their own tests now. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HUB_ROWS, rowScreen, type HubRow, type HubRowKey } from '../src/lib/data/hubRows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

/** The hub rows that are **not** on this list, and why. One of them, and
    keyed by `HubRowKey`, so a row named here that stops existing is a
    compile error rather than a silent exemption.

    SCREENS.md still says "22 More-hub rows" against a hub that has been
    longer than that since `/doubt` moved onto it under spec 08, and ticket
    24 found the same gap from the other side and recorded it as out of its
    scope. Correcting SCREENS.md is still nobody's ticket, and
    reading the routes off the hub instead of off the doc makes that
    disagreement smaller rather than pretending it is settled. */
const NOT_A_FEATURE_SCREEN: Partial<Record<HubRowKey, string>> = {
  doubt: 'moved onto the hub under spec 08 with the screen itself unchanged (ticket 24), so it was never rebuilt onto the kit'
};

/** Every screen reached only from inside another one, or from the shell -
    the part of this list the hub cannot supply. */
const REACHED_FROM_INSIDE = [
  /* Four screens stopped being hub rows in phase 5 deepening ticket 07 -
     labs, regimen, hormone-curve and doses sit behind the `/care` row now -
     and they are still feature screens, still built on the kit, so they stay
     on this list. */
  'settings/labs',
  'settings/regimen',
  'settings/hormone-curve',
  'doses',
  'transition/tryouts/[id]',
  /* The metric reference (phase 8 features ticket 27): reached only from a
     figure on the voice screen, never from the hub, which is ADR-0060's
     own rule and what keeps it out of the UX spec's navigation rules. On
     this list all the same, because what the list is for is holding a
     screen to the kit. */
  'practice/voice/metrics',
  /* Two views over the unprompted registry (phase 6 ticket 04). The
     notifications view joins the list because its own milestone spec says so
     ("feature-screens.test.ts covers /transition/eras and the notifications
     view"); its sibling /settings/live-tiles predates that line and is not
     on it. */
  'settings/notifications',
  /* Reached from the shell rather than from a hub row, and deliberately
     linked from nowhere (phase 8 features ticket 05, ADR-0062): the return
     surface opens itself once per gap and is a moment rather than a place.
     Still a feature screen in every way this file asks about, and on the
     list for the reason the note above the list gives - a screen that is
     not here escapes every assertion in it. */
  'coming-back',
  'settings/stock',
  'settings/exposure',
  'media/photos/export',
  /* The appointment prep list stopped being a hub row in phase 8 features
     ticket 57: the row it had is the appointments row now, and prep is
     reached from that screen. The list itself is untouched - it is a
     standing list of what to ask, which outlives any one appointment
     (ADR-0066). */
  'health/appointment-prep',
  /* One document (phase 8 features ticket 52). Reached from a row on
     /media/documents, from a day's context list and from a search hit,
     never from the hub - the hub row is the list. */
  'media/documents/[id]',
  /* The prep list read one question at a time (phase 8 features ticket 60).
     Chromeless, reached from the appointments screen on the day and from
     the prep list any time, never from the hub. On this list for the reason
     the note above it gives: chromeless is about the shell around a screen,
     and says nothing about whether the screen itself is built on the kit. */
  'health/appointments/in-the-room'
];

/** A hub row's route: the screen behind it, without the leading slash, since
    what this file reads is that screen's source. */
const routeOf = (row: HubRow) => rowScreen(row).slice(1);

const HUB_ROUTES = HUB_ROWS.filter((row) => !(row.key in NOT_A_FEATURE_SCREEN)).map(routeOf);

const ROUTES = [...HUB_ROUTES, ...REACHED_FROM_INSIDE];

const sourceOf = new Map(ROUTES.map((route) => [route, read(`src/routes/${route}/+page.svelte`)]));
const markupOf = new Map(
  ROUTES.map((route) => [
    route,
    sourceOf
      .get(route)!
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
  ])
);

describe('every feature screen', () => {
  it('is the hub, plus the fourteen screens reached only from inside another', () => {
    /* The count that was here covered all 36 routes and had been raised ten
       times since it was written as 26, twice by two branches that each
       thought they were adding the 28th. The hub's own rows no longer need
       one - they arrive from `hubRows.ts`, and a row with no screen behind
       it throws in `sourceOf` above before any assertion runs.

       The fourteen below it still do, for the reason the note at the top of
       the file gives: a screen quietly dropped from a hand-written list and
       a screen quietly dropped from the redesign look identical. */
    expect(REACHED_FROM_INSIDE.length).toBe(14);
    expect(new Set(ROUTES).size, 'a route is on the list twice').toBe(ROUTES.length);
  });

  it('drops the old world: no .card, no .list-group, no .list-row, no SectionTitle', () => {
    /* kit.css's own header comment calls these the old world and says the
       screen tickets replace them one screen at a time. This is the ticket
       that finishes the job for the feature screens. */
    for (const route of ROUTES) {
      const markup = markupOf.get(route)!;
      expect(markup, `${route}: .card`).not.toMatch(/class="[^"]*\bcard\b/);
      expect(markup, `${route}: .list-group`).not.toMatch(/class="[^"]*\blist-group\b/);
      expect(markup, `${route}: .list-row`).not.toMatch(/class="[^"]*\blist-row\b/);
      expect(sourceOf.get(route), `${route}: SectionTitle`).not.toContain('SectionTitle.svelte');
    }
  });

  it('names its areas with the kit heading rather than a grey label', () => {
    // DIRECTION.md 3c: display face at the screen-title size, no icon. A
    // screen with only one area needs no heading at all, so this only
    // holds the screens that had a SectionTitle to replace.
    for (const route of ['transition/letters', 'transition/tryouts/[id]', 'practice/resources']) {
      expect(sourceOf.get(route), route).toContain("from '$lib/components/kit/SectionHeading.svelte'");
    }
  });

  it('builds every one of them out of the kit', () => {
    for (const route of ROUTES) {
      expect(sourceOf.get(route), route).toMatch(/from '\$lib\/components\/kit\//);
    }
  });

  it('reads its section colours from the shell, never from the document', () => {
    /* DIRECTION.md, ticket 21's first rule: `<html>`'s data-palette is
       stamped after the preferences arrive from SQLite, so anything
       reading the flag for itself at mount draws the previous one. */
    for (const route of ROUTES) {
      const source = sourceOf.get(route)!;
      if (!source.includes('roleAt(')) continue;
      expect(source, route).toContain("from '$lib/theme/activeFlag.svelte'");
      expect(source, route).not.toContain('readFlagRoles(');
    }
  });
});

describe('what a first-run journal sees', () => {
  /** Every one of these ships an empty state today and must keep one - the
      ticket's own line. Milestones is reference data with a seeded
      catalogue, resources is a bundled directory and entry templates
      reconciles every `ENTRY_TEMPLATES` built-in on every boot (the
      screen's own header comment), so none of the three can be empty; the
      clinician summary and the exposure counters state their emptiness
      per section rather than per screen. */
  const WITH_EMPTY_STATE = ROUTES.filter(
    (route) =>
      ![
        'transition/milestones',
        'practice/resources',
        'practice/entry-templates',
        'health/clinician-summary',
        'settings/exposure',
        /* The metric reference explains a fixed table of seven figures
           compiled into the bundle (data/voice/metrics.ts), so it has no
           empty state for the same reason the bundled directory has
           none. */
        'practice/voice/metrics'
      ].includes(route)
  );

  it('draws the empty state as a surface, not as a fallback string', () => {
    for (const route of WITH_EMPTY_STATE) {
      expect(sourceOf.get(route), route).toContain("from '$lib/components/kit/Notice.svelte'");
    }
  });

  it('has retired the old bloom-and-heading empty state', () => {
    // EmptyState draws a RiveSlot: a soft blob standing in for content,
    // which is on the craft floor's Refuse list. The kit's Notice carries
    // the area's own flag stripe and the screen's one call to action.
    for (const route of ROUTES) {
      expect(sourceOf.get(route), route).not.toContain('EmptyState.svelte');
    }
  });

  it('gives every notice a handle to grip (ADR-0029)', () => {
    for (const route of WITH_EMPTY_STATE) {
      const notices = markupOf.get(route)!.match(/<Notice\b[\s\S]*?\/>/g) ?? [];
      expect(notices.length, `${route} renders no Notice`).toBeGreaterThan(0);
      for (const notice of notices) expect(notice, route).toMatch(/\bkey=/);
    }
  });
});

describe('what the worker is still fetching', () => {
  /** Reference data is held in memory and read synchronously (CONTEXT.md),
      so a screen reading only that owes no loading state. Five here:
      milestones reads the milestone catalogue, resources reads a directory
      compiled into the bundle, the notifications view reads nothing but the
      preference store, and presentations and entry templates both read the
      mirrored vocabulary (reference.svelte.ts) rather than a live query -
      all the same shape, a projection already in memory, with no round trip
      to wait on. */
  const ENTRY_DATA = ROUTES.filter(
    (route) =>
      ![
        'transition/milestones',
        'practice/resources',
        'settings/notifications',
        'transition/presentations',
        'practice/entry-templates',
        // Reads no journal at all: seven figures explained, and not one of
        // the person's own numbers anywhere on it (ADR-0060).
        'practice/voice/metrics'
      ].includes(route)
  );

  it('keeps a loading state on every screen that reads the journal', () => {
    /* Two ways to hold one, since phase 5 audit ticket 04: a screen either
       hands its read to ReadGate, which owns the placeholder and the branch
       around it, or it draws a Skeleton against a `.loading` of its own where
       what it is waiting on is not a list. What must not happen is neither. */
    for (const route of ENTRY_DATA) {
      const source = sourceOf.get(route)!;
      const gated = source.includes('ReadGate.svelte');
      expect(gated || source.includes('Skeleton.svelte'), `${route} waits for nothing`).toBe(true);
      if (!gated) expect(source, route).toMatch(/\.loading/);
    }
  });

  it('crossfades the skeleton into the content rather than popping it', () => {
    /* DIRECTION.md tier 3: skeletons crossfade into content over --dur-fast,
       and the substitute under reduced motion is an instant cut, which the
       primitive's own duration read handles - the token is clamped to 1ms by
       the theme.

       What this holds is that no screen was left off the crossfade, not that
       each one declares it: the first pass wrote the same arrow function
       into twenty-four routes and this assertion was what pinned it there.
       It grips the shared primitive's import instead.

       And it holds the asymmetry, because that is the part that was wrong.
       The skeleton fades out; the content it uncovers gets no entrance of
       its own. A screen arriving is tier 2's - the shell already runs a
       view transition over the whole of it - so a second fade on the
       content a moment later is that content arriving twice. */
    /* A route that hands its read to ReadGate gets the fade from the gate,
       asserted once below - which is what took the same arrow function back
       out of the routes the first pass had written it into. */
    for (const route of ENTRY_DATA) {
      const source = sourceOf.get(route)!;
      if (!source.includes('ReadGate.svelte')) {
        expect(source, route).toMatch(/import \{[^}]*\bcrossfade\b[^}]*\} from '\$lib\/motion\/reveal'/);
        expect(markupOf.get(route), route).toMatch(/out:crossfade/);
      }
      expect(markupOf.get(route), `${route} fades its content in on top of the navigation`).not.toMatch(
        /in:crossfade/
      );
    }
  });

  it('fades the gate\'s own placeholder out, on the one file that draws it', () => {
    const gate = readFileSync(root + 'src/lib/components/kit/ReadGate.svelte', 'utf8');
    expect(gate).toMatch(/import \{[^}]*\bcrossfade\b[^}]*\} from '\$lib\/motion\/reveal'/);
    expect(gate).toMatch(/out:crossfade/);
    expect(gate).not.toMatch(/in:crossfade/);
  });
});

describe('the two print surfaces', () => {
  it('keeps the clinician summary printable', () => {
    const source = sourceOf.get('health/clinician-summary')!;
    // Its own print rule: the disclaimer that only appears on paper.
    expect(source).toMatch(/@media print/);
    /* And what print hides is the app around the page, not the page. The
       header, the range picker and the on-screen copy of the disclaimer
       all carry `no-print`, which app.css's print block hides; the print
       heading that replaces the header carries the range in words. */
    expect(source).toMatch(/<ScreenHeader[^>]*class="no-print"/);
    expect(source).toMatch(/class="kit-filter cd-endpoints no-print"/);
    expect(source).toContain('print-heading');
  });

  it('spends no flag colour on the page somebody else reads', () => {
    /* The one screen in the app whose output leaves it, on paper. A stripe
       behind an icon disc is neither what a clinician needs nor what the
       person handing the page over chose to disclose, so every list card
       here is handed no role. */
    const source = sourceOf.get('health/clinician-summary')!;
    expect(source).not.toContain('roleAt(');
    expect(markupOf.get('health/clinician-summary')).not.toMatch(/<ListCard\b[^>]*role=/);
  });

  it('shares its seam with the journal book rather than forking it', () => {
    const book = read('src/routes/settings/journal-book/+page.svelte');
    expect(book).toMatch(/@media print/);
  });
});

describe('no medical framing and no interpreted values', () => {
  it('keeps the hormone curve saying it is modelled or illustrative', () => {
    /* Three places say it, and the screen renders all three: the lead
       paragraph, the band's own legend, and the pill on the heading of
       every curve the research does not support a fit for. The scope line
       is explicit that this screen must keep saying so. */
    const source = sourceOf.get('settings/hormone-curve')!;
    for (const key of ['curve_intro', 'curve_legend_band', 'curve_qual_notice']) {
      expect(source, key).toContain(`m.${key}()`);
    }
  });

  it('gives no chart card a place to say what a reading means', () => {
    /* ChartCard has no prop for a finding, which is enforced in
       kit-surfaces.test.ts. What this holds is the other half: a screen
       cannot smuggle one in as a child of the card, because the card's
       children are the marks. A paragraph belongs outside it. */
    for (const route of ROUTES) {
      const markup = markupOf.get(route)!;
      for (const card of markup.match(/<ChartCard\b[^>]*>/g) ?? []) {
        expect(card, route).not.toMatch(/\b(finding|verdict|summary|meaning)=/);
      }
    }
  });
});
