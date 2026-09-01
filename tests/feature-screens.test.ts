/* The feature screens, after the rebuild onto the surface kit (phase 5 UX
   ticket 25), at the level a screen's source can be held to - the same
   shape as home-surfaces.test.ts and more-surfaces.test.ts, which is where
   this kind of test started.

   This is the grind ticket, so the thing worth watching is not any one
   screen but that none of them was quietly left on the old vocabulary.
   The list below is SCREENS.md's own: the 22 hub rows, the three reached
   only from inside a feature screen, and the tryout detail. It is written
   out rather than globbed, because a screen dropped from the glob and a
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

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

/** SCREENS.md's list: 22 hub rows + tryouts/[id] + stock + exposure +
    photos/export.

    The cross-check the acceptance box asks for, and it finds a
    discrepancy rather than agreement. SCREENS.md's Total says "22 More-hub
    rows" and its four tables list 22 routes; the hub actually renders 23,
    because `/doubt` moved onto it under spec 08 and the inventory was
    never updated. Ticket 24 found the same gap from the other side and
    recorded it as out of its scope, `tests/more-surfaces.test.ts` holding
    the real 23.

    So: 22 of this ticket's routes are hub rows, the 23rd hub row is
    `/doubt`, and `/doubt` is not redesigned here - the move that put it on
    the hub left the screen itself unchanged (ticket 24). Correcting
    SCREENS.md is still nobody's ticket. */
const ROUTES = [
  // Body
  'settings/photos',
  'settings/measurements',
  'settings/sizes',
  'settings/hair-progress',
  'settings/hair-removal',
  /* Health. Four of these stopped being hub rows in phase 5 deepening ticket
     07 - labs, regimen, hormone-curve and doses sit behind the new /care row
     now - and they are still feature screens, still redesigned onto the kit,
     so they stay on this list. What that ticket adds to it is /care itself. */
  'care',
  'settings/labs',
  'settings/regimen',
  'settings/hormone-curve',
  'doses',
  'settings/cycle-events',
  'settings/side-effects',
  'settings/surgery',
  'settings/appointment-prep',
  'settings/clinician-summary',
  // Transition
  'settings/milestones',
  'settings/roadmap',
  'settings/letters',
  'settings/tryouts',
  'settings/tryouts/[id]',
  /* Phase 6 ticket 01. `settings/presentations` is absent from this list and
     should not be - deepening ticket 17 added the screen and never joined it
     here, which is a gap in that ticket rather than in this one. */
  'settings/eras',
  // Practice
  'settings/voice',
  'settings/wear',
  'settings/effects',
  'settings/resources',
  /* Two views over the unprompted registry (phase 6 ticket 04). The
     notifications view joins the list because its own milestone spec says so
     ("feature-screens.test.ts covers /settings/eras and the notifications
     view"); its sibling /settings/live-tiles predates that line and is not
     on it. */
  'settings/notifications',
  // Reached from inside a feature screen
  'settings/stock',
  'settings/exposure',
  'settings/photos/export'
];

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

describe('all 29 of them', () => {
  it('is the count SCREENS.md gives, plus the three added since', () => {
    /* 26 when this list was written, 27 since deepening ticket 07 added
       /care, then 28 and 29 as phase 6's tickets 01 and 04 landed
       /settings/eras and the notifications view. Both arrived on their own
       branch and each thought it was the 28th, which is what this line is
       for: SCREENS.md is three tickets behind either way - see the note
       above the list - and correcting it is still nobody's ticket. */
    expect(ROUTES.length).toBe(29);
    expect(new Set(ROUTES).size).toBe(29);
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
    for (const route of ['settings/letters', 'settings/tryouts/[id]', 'settings/resources']) {
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
      catalogue and resources is a bundled directory, so neither can be
      empty; the clinician summary and the exposure counters state their
      emptiness per section rather than per screen. */
  const WITH_EMPTY_STATE = ROUTES.filter(
    (route) =>
      !['settings/milestones', 'settings/resources', 'settings/clinician-summary', 'settings/exposure'].includes(route)
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
      so a screen reading only that owes no loading state. Three here:
      milestones reads the milestone catalogue, resources reads a directory
      compiled into the bundle, and the notifications view reads nothing but
      the preference store, which is the same shape - a projection already in
      memory, with no round trip to wait on. */
  const ENTRY_DATA = ROUTES.filter(
    (route) => !['settings/milestones', 'settings/resources', 'settings/notifications'].includes(route)
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
    const source = sourceOf.get('settings/clinician-summary')!;
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
    const source = sourceOf.get('settings/clinician-summary')!;
    expect(source).not.toContain('roleAt(');
    expect(markupOf.get('settings/clinician-summary')).not.toMatch(/<ListCard\b[^>]*role=/);
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
