/* The 26 feature screens, after the rebuild onto the surface kit (phase 5
   UX ticket 25), at the level a screen's source can be held to - the same
   shape as home-surfaces.test.ts and more-surfaces.test.ts, which is where
   this kind of test started.

   This is the grind ticket, so the thing worth watching is not any one
   screen but that none of the 26 was quietly left on the old vocabulary.
   The list below is SCREENS.md's own: the 22 hub rows, the three reached
   only from inside a feature screen, and the tryout detail. It is written
   out rather than globbed, because a screen dropped from the glob and a
   screen dropped from the redesign look identical to a glob. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

/** SCREENS.md's list: 22 hub rows + tryouts/[id] + stock + exposure +
    photos/export. The hub row count is 23 there because doubt is one of
    them, and doubt is not this ticket's screen - it is unchanged by the
    move that put it on the hub (ticket 24). */
const ROUTES = [
  // Body
  'settings/photos',
  'settings/measurements',
  'settings/sizes',
  'settings/hair-progress',
  'settings/hair-removal',
  // Health
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
  // Practice
  'settings/voice',
  'settings/wear',
  'settings/effects',
  'settings/resources',
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

describe('all 26 of them', () => {
  it('is the count SCREENS.md gives', () => {
    expect(ROUTES.length).toBe(26);
    expect(new Set(ROUTES).size).toBe(26);
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
      so a screen reading only that owes no loading state. Two here:
      milestones reads the milestone catalogue, and resources reads a
      directory compiled into the bundle. */
  const ENTRY_DATA = ROUTES.filter(
    (route) => !['settings/milestones', 'settings/resources'].includes(route)
  );

  it('keeps a loading state on every screen that reads the journal', () => {
    for (const route of ENTRY_DATA) {
      expect(sourceOf.get(route), route).toContain('Skeleton.svelte');
      expect(sourceOf.get(route), route).toMatch(/\.loading/);
    }
  });

  it('crossfades the skeleton into the content rather than popping it', () => {
    /* DIRECTION.md tier 3: skeletons crossfade into content over --dur-fast.
       The substitute under reduced motion is an instant cut, which
       fadeOnly's own duration read handles - the token is clamped to 1ms
       by the theme, and motionDuration reads the token. */
    for (const route of ENTRY_DATA) {
      expect(sourceOf.get(route), route).toContain("from '$lib/motion/tokens'");
      expect(sourceOf.get(route), route).toMatch(/fadeOnly\(motionDuration\('--dur-fast'/);
    }
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
