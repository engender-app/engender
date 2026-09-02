/* The rules the Calendar tab's six screens keep after the rebuild (phase 5
   ticket 22), at the level their source can be held to.

   Same split as tests/home-surfaces.test.ts: proportion and colour are
   settled by an eye against a render, and the flows are proved by the
   walkthrough. What is left over is mechanical, and every one of these is
   something a later ticket could quietly put back - another card surface, a
   handle renamed out from under the walkthrough, a heat ramp that judges, a
   container transform with one half missing.

   Two of them are the ticket's own load-bearing warnings, and both are
   invisible to a typecheck: the `{#key}` wrapper on /entry/[id] that fixes a
   stale-params bug class, and `?seedMood` on a pinned Android launch route.

   Everything below is a grep on purpose (ticket 08). Each one is a
   negative over a whole file, a wiring, or a construct a typecheck cannot
   see - none of which a function call can answer. A rule with an answer
   worth asserting belongs in a module with a test that calls it, not in a
   string match against markup. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
/** The markup half: a string inside a script block may be anything. */
const markupOf = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');

const SCREENS = {
  calendar: 'src/routes/calendar/+page.svelte',
  day: 'src/routes/day/[day]/+page.svelte',
  search: 'src/routes/search/+page.svelte',
  starred: 'src/routes/search/starred/+page.svelte',
  entry: 'src/routes/entry/[id]/+page.svelte',
  entryNew: 'src/routes/entry/new/[day]/+page.svelte'
} as const;

const editor = read('src/lib/components/EntryEditor.svelte');
const heatMap = read('src/lib/components/HeatMap.svelte');
const roles = read('src/lib/theme/roles.ts');

describe('what the six screens are built from', () => {
  /* The editor is included by name: the two entry routes are four lines each
     and everything they show is this component, so the rule about card
     surfaces has to be checked where the surfaces are. */
  const BUILT = { ...SCREENS, editor: 'src/lib/components/EntryEditor.svelte' };

  for (const [name, path] of Object.entries(BUILT)) {
    it(`draws no card of the old vocabulary, ${name}`, () => {
      /* DIRECTION.md 2b: a screen picks the surfaces its content needs.
         `.card` and `.list-group` in components.css are what the screen
         tickets replace one screen at a time. The editor was eight `.card`
         sections stacked, which is the failure 2b exists to name. */
      const markup = markupOf(read(path));
      expect(markup).not.toMatch(/class="[^"]*\bcard\b/);
      expect(markup).not.toMatch(/class="[^"]*\blist-group\b/);
      expect(markup).not.toMatch(/class="[^"]*\blist-row\b/);
      expect(markup).not.toMatch(/<EmptyState/);
      expect(markup).not.toMatch(/<SectionTitle/);
    });
  }

  it('reads its section colours from the shell rather than from the document', () => {
    /* activeFlag.svelte.ts: the shell publishes the flag in the same effect
       that stamps the palette, because anything reading it for itself races
       that stamp and silently draws the previous palette. */
    for (const path of [SCREENS.calendar, SCREENS.day, SCREENS.search, SCREENS.starred]) {
      expect(read(path), path).toContain("from '$lib/theme/activeFlag.svelte'");
      expect(read(path), path).not.toContain('readFlagRoles(');
    }
    expect(editor).toContain("from '$lib/theme/activeFlag.svelte'");
  });

  it('gives the reading that carries a value the one role that is always a colour', () => {
    /* Roles run colours-before-shades, so index 0 is the only one guaranteed
       chromatic across all 8 palettes. The calendar's cells are a heat ramp,
       which is the same case Home's week strip is: on trans, reading order
       would hand it the white band, and a ramp from white into a white page
       is not a ramp. */
    expect(markupOf(read(SCREENS.calendar))).toContain('roleAt(activeFlag.roles, 0)');
  });

  it('keeps the entry editor off the flag deliberately rather than by omission', () => {
    // A role is spent on the two things in the editor that are not fields.
    expect(editor).toMatch(/roleAt\(activeFlag\.roles, 0\)/);
    expect(markupOf(editor)).toMatch(/<Notice[\s\S]*?\{role\}/);
  });
});

describe('the two things this ticket was told not to break', () => {
  it('keeps the {#key page.params.id} wrapper on the entry route', () => {
    /* Not incidental structure: SvelteKit reuses a [id] route's component
       across a navigation between two ids, so a plain read of page.params
       goes stale. A unit test cannot see the bug this prevents - only a
       click from one entry straight to another can - so what is checked
       here is that the wrapper is still there at all. */
    const source = read(SCREENS.entry);
    expect(source).toContain('{#key page.params.id}');
    expect(source).toContain('<EntryEditor entryId={Number(page.params.id)} />');
  });

  it('still seeds a mood from the query string, on the pinned launch route', () => {
    const source = read(SCREENS.entryNew);
    expect(source).toContain("page.url.searchParams.get('seedMood')");
    // 1..5 and integers only: a launcher, a widget and a notification all
    // call this, and none of them is this app.
    expect(source).toMatch(/mood >= 1 && mood <= 5/);
    expect(source).toMatch(/Number\.isInteger\(mood\)/);
    /* And the route is still the one the fixture pins (ADR-0028). The
       fixture itself is out of this ticket's scope; this is the check that
       the screen behind it did not move. */
    const fixture = read('src/lib/android/fixtures/launch-routes.json');
    expect(fixture).toContain('/entry/new/');
  });
});

describe('the heat map', () => {
  it('shades on one hue, in the flag, on the same steps as the week strip', () => {
    /* Single-hue intensity, never diverging (ADR-0012). The ramp is one
       stripe mixed into one ground at five strengths, so there is no second
       hue for it to diverge toward - and it is the same five strengths
       palettes.css writes for the accent ramp, which is what makes a cell
       here and a cell of Home's week comparable. */
    expect(heatMap).toContain("from '$lib/theme/roles'");
    expect(heatMap).toContain('HEAT_STEPS');
    expect(roles).toMatch(/export const HEAT_STEPS = \[0, \d+, \d+, \d+, 100\];/);
    // One stripe, one ground. A second colour in the mix would be a ramp
    // running between two hues.
    expect(roles).toMatch(/colorMixOklab\(stripe, pct, ground\)/);
  });

  it('names the metric its own endpoints, never a better and a worse one', () => {
    /* ADR-0012 and F15: neither end of binary <-> nonbinary is the better
       one. The words come from the vocabulary's own legend for whichever
       metric is active, so the calendar cannot invent a pair. */
    expect(heatMap).toContain('vocabulary.metricLegend');
    expect(heatMap).toContain('legend.low');
    expect(heatMap).toContain('legend.high');
    for (const word of ['worst', 'best', 'good', 'bad', 'better', 'worse']) {
      expect(markupOf(heatMap).toLowerCase(), word).not.toContain(`>${word}`);
    }
  });

  it('draws a day of two readings as two, rather than averaging it to one', () => {
    /* Phase 6 unprompted ticket 11, in the form Alicja asked for on
       2026-09-02: Daylio's split cell. The rule between split, stack and
       whole is statsCharts.ts's and has its own test; what is checked here
       is that this file asks for it and draws both halves from the day's
       own two steps rather than from the average twice. */
    expect(heatMap).toContain('j.stats.daySpread(');
    expect(heatMap).toContain('dayShape(');
    expect(heatMap).toMatch(/cal-half[\s\S]*?fillAt\(c\.shape\.low\)/);
    expect(heatMap).toMatch(/is-high[\s\S]*?fillAt\(c\.shape\.high\)/);
    expect(markupOf(heatMap)).toContain('data-hm-cell-split');
    expect(markupOf(heatMap)).toContain('data-hm-cell-stack');
  });

  it('keeps the date off the fill, now that a cell can carry two of them', () => {
    /* The reason the date moved out from under the swatch: the per-step ink
       (roles.ts) answers to one fill, and a split cell has two. Two steps
       far enough apart leave no ink clearing 4.5:1 on both, so the swatch
       carries no text and the number sits on the page's own ground. A later
       ticket putting it back would put the contrast floor back at risk. */
    const markup = markupOf(heatMap);
    expect(markup).toMatch(/<span class="cal-swatch"[\s\S]*?>\s*\{#if/);
    expect(markup).not.toContain('inkAt(');
    expect(heatMap).not.toContain('--on-heat-');
    expect(heatMap).toMatch(/\.cal-num \{[^}]*color: var\(--text-2\)/);
  });

  it('reads the two ends out in native units, never the drawn ones', () => {
    // ADR-0012: the drawing resolves through the heat steps and the words do
    // not. Both come from one place so the calendar and /stats cannot word a
    // day differently.
    expect(heatMap).toContain('spreadNote(');
    expect(read('src/routes/stats/+page.svelte')).toContain('spreadNote(');
    expect(read('src/lib/data/wrappedDisplay.ts')).toMatch(/spreadNote[\s\S]*?nativeValue\(metric/);
  });

  it('says nothing about a day until it has been told', () => {
    /* An empty result and a month with nothing logged are the same shape, so
       before the read lands every cell would announce "no entries" for a day
       that has six. */
    expect(heatMap).toMatch(/aria-busy=\{loading\}/);
    expect(heatMap).toMatch(/label: loading/);
    /* The shape carries the same rule and needs it stated separately: an
       unloaded month and a month of single-entry days both come back with
       no spread rows, so an unguarded cell would draw every day whole
       before the answer arrived. */
    expect(heatMap).toMatch(/loading \? null : dayShape\(/);
    expect(heatMap).toContain('spreads.loading');
  });
});

describe('the container transform, which needs both halves to exist', () => {
  const container = read('src/lib/motion/container.svelte.ts');
  const dayEntry = read('src/lib/components/kit/DayEntry.svelte');
  const app = read('src/lib/styles/app.css');

  it('has the card and the editor naming the same thing', () => {
    /* DIRECTION.md's reason this was deferred to this ticket: it is the one
       tier-2 pattern that cannot be decided by the navigation alone, because
       it needs the two surfaces to agree on a key. */
    expect(dayEntry).toContain('entryContainerName(key)');
    expect(dayEntry).toContain('openEntryContainer(key)');
    expect(editor).toContain('entryContainerName(');
    expect(container).toContain("export const ENTRY_CONTAINER = 'entry-open'");
    expect(app).toContain('::view-transition-group(entry-open)');
  });

  it('names the editor from the route rather than from the loaded entry', () => {
    /* The trap, and the reason this is a test: the browser photographs the
       new screen as soon as the navigation settles, and the entry itself is
       a worker round trip behind that. A name waiting on `existing` arrives
       after the picture is taken and the transform silently loses a half. */
    expect(editor).toMatch(/entryContainerName\(entryId != null \? String\(entryId\) : null\)/);
    expect(editor).not.toMatch(/entryContainerName\([^)]*existing/);
  });

  it('flushes the name to the DOM before the navigation can photograph it', () => {
    expect(container).toContain('flushSync');
  });

  it('degrades to the crossfade the whole screen already does', () => {
    /* Substitute, never delete. The substitute here is to name nothing: with
       no element pulled out of the screen's snapshot there is one group, and
       app.css's reduce rules already crossfade it. */
    expect(container).toMatch(/if \(isReducedMotion\(\)\) return;/);
  });

  it('clears the name on any navigation that is not the transform', () => {
    /* A named element is pulled out of the screen's snapshot, so a card left
       wearing the name would hold still while the rest of the screen slid. */
    expect(read('src/routes/+layout.svelte')).toContain(
      "if (pattern !== 'container') closeEntryContainer();"
    );
  });

  it('is chosen for an entry that exists and not for a new one', () => {
    const rule = read('src/lib/navigation/screen-transition.ts');
    expect(rule).toMatch(/function isEntryEditor/);
    expect(rule).toMatch(/\/\^\\\/entry\\\/\\d\+\$\//);
  });
});

describe('search', () => {
  const search = read(SCREENS.search);

  it('pages thirty at a time, and can be asked for the next thirty', () => {
    /* SCREENS.md says paginated thirty at a time. The screen asked for
       thirty and stopped: a query matching fifty reported fifty and showed
       thirty with nothing to tap. */
    expect(search).toMatch(/const PAGE = 30;/);
    expect(search).toContain('PAGE * pages');
    expect(markupOf(search)).toContain('data-search-more');
  });

  it('is not infinite scroll, which SCREENS.md rules out', () => {
    expect(search).not.toContain('IntersectionObserver');
    expect(search).not.toMatch(/onscroll|addEventListener\('scroll'/);
  });

  it('goes back to the first page when the question changes', () => {
    // Otherwise page four of one query silently reads 120 rows to draw the
    // first screen of the next one.
    expect(search).toMatch(/pages = 1;/);
  });

  it('still counts every match rather than the page it drew, across both reads', () => {
    /* The count used to be the entry total, which was every match there
       was. Since deepening ticket 24 the screen also searches every other
       area that holds text, so the same rule now means the sum: stating the
       entries' total alone over a screen that also found five letters would
       be the screen describing half of what it found. */
    expect(search).toContain('countSearchMatches');
    expect(search).toMatch(/foundTotal = \$derived\(total \+ elsewhereResults\.total\)/);
    expect(search).toContain('results_count({ count: foundTotal })');
  });

  it('puts no entry count on a search day bar', () => {
    /* Everywhere else a day bar can say how many entries the day holds. Here
       it could only say how many matched, and "3 that day" over three of
       five would be the filter describing itself - so the shared caller has
       no aside at all and neither screen can pass one. */
    expect(markupOf(search)).not.toContain('aside=');
    expect(read('src/lib/components/EntryDays.svelte')).not.toContain('aside');
  });

  it('keeps the filter state visible now that the panel is a sheet', () => {
    expect(markupOf(search)).toContain('<Sheet');
    expect(markupOf(search)).toContain('data-active-filter-chip');
    expect(markupOf(search)).toContain('data-filter-clear');
  });
});

describe('the handles the walkthrough grips', () => {
  /* ADR-0029. Every one of these names a capability that survived the
     rebuild, so every one of them has to survive it too - a rebuild is
     exactly when a handle goes missing, and `waitForSelector` against
     nothing fails thirty seconds later with no name for what went. */
  const ON = {
    [SCREENS.calendar]: ['data-cal-month', 'data-cal-step'],
    'src/lib/components/HeatMap.svelte': ['data-hm-cell-filled'],
    [SCREENS.day]: ['data-add'],
    [SCREENS.search]: [
      'data-filter-toggle',
      'data-filter-mood',
      'data-filter-has-note',
      'data-filter-has-photo',
      'data-filter-start',
      'data-filter-end',
      'data-active-filter-chip',
      'data-filter-clear'
    ],
    'src/lib/components/EntryEditor.svelte': ['data-save', 'data-use-template', 'id="ed-note"']
  };

  for (const [path, handles] of Object.entries(ON)) {
    for (const handle of handles) {
      it(`keeps ${handle} on ${path.split('/').slice(-2).join('/')}`, () => {
        expect(markupOf(read(path))).toContain(handle);
      });
    }
  }

  it('names every one of the six screens for data-screen-title', () => {
    /* ScreenHeader stamps `data-screen-title` from its `screen` prop; a
       screen that passes nothing is announced as an empty handle, which is
       what several of these did before ticket 18. */
    for (const [name, path] of Object.entries({
      calendar: SCREENS.calendar,
      day: SCREENS.day,
      search: SCREENS.search,
      starred: SCREENS.starred
    })) {
      expect(markupOf(read(path)), name).toMatch(/screen="[a-z-]+"/);
    }
    expect(markupOf(editor)).toContain('screen="entry"');
  });

  it('calls an entry the same thing on a day as it does on Home', () => {
    /* The day screen used to draw a hand-built time gutter beside an
       EntryCard under `data-day-entry-row`. It is the kit's day card now,
       which carries `data-entry-card` - the app's own name for the concept
       (ADR-0029) - so the walkthrough grips one handle on both screens
       rather than whichever of two the screen happened to use. */
    /* The day screen draws it one component deep since deepening ticket 21,
       the same shape search and the starred shelf already had: the route owns
       the read and the gate, DayRecords.svelte owns the composition. */
    expect(markupOf(read(SCREENS.day))).toContain('<DayRecordsView');
    expect(markupOf(read('src/lib/components/DayRecords.svelte'))).toContain('<DayEntry');
    /* Search and the starred shelf draw the same run of days through one
       journal-connected caller rather than eighteen identical lines each. */
    for (const path of [SCREENS.search, SCREENS.starred]) {
      expect(markupOf(read(path)), path).toContain('<EntryDays');
    }
    expect(markupOf(read('src/lib/components/EntryDays.svelte'))).toContain('<DayEntry');
    for (const path of [SCREENS.day, SCREENS.search, SCREENS.starred]) {
      expect(markupOf(read(path)), path).not.toContain('data-day-entry-row');
    }
    expect(read('tests/walkthrough.test.mjs')).not.toContain('data-day-entry-row');
  });
});

describe('an entry takes media it already has, not only media it makes', () => {
  /* Asked for on 2026-08-25 against the built editor: photos offered a
     gallery and the other two only offered a recorder, so a voice memo from
     last year could not be attached and a photo from last year could.

     Source-level, and that is the honest seam. The pick itself opens the
     platform's own file chooser, which no test in this repo can drive - the
     walkthrough cannot click a native dialog and a unit test has no DOM
     chooser to open. What can be held is that both controls exist and that
     the caps are applied before anything is stored. */
  const audio = read('src/lib/stores/voiceRecording.ts');
  const video = read('src/lib/stores/videoRecording.ts');

  it('offers both an add and a record for each kind', () => {
    const markup = markupOf(editor);
    for (const handle of ['data-add-recording-file', 'data-add-video-file']) {
      expect(markup).toContain(handle);
    }
    // And the ones that were already there.
    expect(markup).toContain('m.add_recording()');
    expect(markup).toContain('m.add_video()');
  });

  it('reads what a file is rather than trusting the dialog', () => {
    /* fileDialog.ts: `accept` is a hint the dialog is free to ignore. */
    expect(audio).toContain("file.type.startsWith('audio/')");
    expect(video).toContain("file.type.startsWith('video/')");
  });

  it('holds a picked video to the same caps a recorded one answers to', () => {
    /* limits.ts: the caps exist to keep the archive exportable, so where the
       file came from makes no difference to them. Over 30 seconds is refused
       rather than trimmed, and over the ceiling goes through the re-encode a
       capture uses. */
    expect(video).toContain('VIDEO_MAX_DURATION_MS');
    expect(video).toContain('VIDEO_SIZE_CEILING');
    expect(video).toContain('reencodeTarget(');
    expect(video).toContain('reencodeVideo(');
    // A re-encode this browser cannot do is a refusal, not a stored file.
    expect(video).toMatch(/if \(!smaller\) \{\s*toast\(m\.video_too_large\(\)\);\s*return null;/);
  });

  it('caps a picked recording too, rather than letting one into a backup', () => {
    expect(audio).toContain('VIDEO_SIZE_CEILING');
    expect(audio).toContain('m.recording_too_large()');
  });
});

describe('loading states, since all six read entry data', () => {
  /* Two ways to draw the same placeholder since phase 5 audit ticket 04:
     the screen draws it, or the gate the screen hands its read to draws it.
     Each screen names which read it is waiting on either way, so that a gate
     over some other list on the same screen cannot stand in for this one. */
  it.each([
    /* `everythingLogged` rather than `dayEntries` since deepening ticket 21:
       the day screen waits on everything the day holds, not on its entries
       alone, and the gate's emptiness test moved with it. The rule the name
       is here for is unchanged. */
    ['day', SCREENS.day, /<ReadGate\s+read=\{everythingLogged\}/],
    ['search', SCREENS.search, /<Skeleton/],
    ['starred', SCREENS.starred, /<Skeleton/]
  ])('%s waits with a skeleton', (_name, path, waits) => {
    expect(markupOf(read(path))).toMatch(waits);
  });

  it('the editor waits rather than filling a form under the reader', () => {
    expect(markupOf(editor)).toMatch(/\{#if loaded\.loading\}\s*<Skeleton/);
  });

  it('the calendar draws at full size and holds back only its claims', () => {
    // A month is 30 cells of known shape: there is nothing to reflow, so the
    // honest loading state is the grid itself plus aria-busy.
    expect(heatMap).toContain('aria-busy={loading}');
  });
});
