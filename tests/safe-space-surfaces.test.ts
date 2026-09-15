/* Surface and contract tests for Safe space (ticket 52, ADR-0040).

   Phase 10 redesign ticket 47 split the screen these were written against.
   `/doubt` opens on the breathing exercise and nothing else; the statistics,
   the charts, the counterevidence pool, the snapshots, the letters, the
   photos and the comfort list are each one tap down, on their own route.

   So every assertion below still asks the same question and asks it of
   whichever file now holds the answer - which is the point of keeping them
   rather than rewriting them. What this file is for is that nothing was cut
   in the move, and a test that only knew where things used to be could not
   tell a section that moved from a section that went. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIVE_TILE_ORDER } from '../src/lib/data/liveTiles.ts';
import { UNPROMPTED_ROWS } from '../src/lib/unprompted/registry.ts';
import { HUB_ROWS } from '../src/lib/data/hubRows.ts';
import { SAFE_SPACE_WAYS } from '../src/lib/data/safeSpaceWays.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

const doubt = read('src/routes/doubt/+page.svelte');
const moments = read('src/routes/doubt/moments/+page.svelte');
const comfort = read('src/routes/doubt/comfort/+page.svelte');
const evidence = read('src/routes/doubt/evidence/+page.svelte');
const readings = read('src/routes/doubt/readings/+page.svelte');
const more = read('src/routes/more/+page.svelte');

const strip = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');
const markup = strip(doubt);
const momentsMarkup = strip(moments);
const evidenceMarkup = strip(evidence);
const readingsMarkup = strip(readings);

/** Safe space as one thing, for the assertions that only care that the app
    still holds a surface somewhere behind that row. */
const safeSpace = [doubt, moments, comfort, evidence, readings].join('\n');

describe('what Safe Space is built from', () => {
  it('takes its surfaces from the kit and does not reach for pre-kit SectionTitle or EmptyState', () => {
    expect(safeSpace).not.toContain("from '$lib/components/SectionTitle.svelte'");
    expect(safeSpace).not.toContain("from '$lib/components/EmptyState.svelte'");
    expect(safeSpace).not.toMatch(/<SectionTitle/);
    expect(safeSpace).not.toMatch(/<EmptyState/);
    expect(evidence).toContain("from '$lib/components/kit/SectionHeading.svelte'");
    expect(readings).toContain("from '$lib/components/kit/TileGrid.svelte'");
    expect(readings).toContain("from '$lib/components/kit/Tile.svelte'");
    expect(safeSpace).toContain("from '$lib/components/kit/Notice.svelte'");
    expect(evidence).toContain("from '$lib/components/kit/ReadGate.svelte'");
    expect(evidence).toContain("from '$lib/components/kit/ConfirmDeleteSheet.svelte'");
    expect(doubt).toContain("from '$lib/components/BreathingExercise.svelte'");
  });

  /* Ticket 47's own contract, and the reason for the split: the screen a
     person reaches on their worst day opens on the calming tool, the same
     way every time, with nothing above it and nothing to wait for. */
  it('opens on the breath and holds nothing else that has to be scrolled past', () => {
    expect(markup).toContain('<BreathingExercise');
    /* The breath is the first thing under the header, so there is nothing
       between the field and it. */
    expect(markup).toMatch(/<ScreenHeader[\s\S]*?\/>\s*(<!--[\s\S]*?-->\s*)*<div class="breath-stage">/);
    // No section heading over it: the field says where this is.
    expect(doubt).not.toContain("from '$lib/components/kit/SectionHeading.svelte'");
  });

  it('runs no live query at all, so a cold launch paints the breath without waiting', () => {
    expect(doubt).not.toContain('liveList(');
    expect(doubt).not.toContain('liveQuery(');
    expect(doubt).not.toContain("from '$lib/data/live/journal.svelte'");
  });

  it('puts every way down one tap from the breath, in the order the module states', () => {
    expect(doubt).toContain("from '$lib/data/safeSpaceWays'");
    expect(markup).toMatch(/{#each SAFE_SPACE_WAYS as way[\s\S]*?<ListRow/);
    for (const way of SAFE_SPACE_WAYS) expect(doubt).toContain(`${way.key}:`);
  });

  it('names the More hub as where back falls back to', () => {
    /* CARPET-05: the href is the fallback rather than the destination now,
       and ScreenHeader is what turns it into a return to whichever screen
       the person actually came from. */
    expect(doubt).toContain('back="/more"');
  });

  it('renders a breathing exercise calming tool', () => {
    expect(markup).toContain('<BreathingExercise');
  });

  it('renders a statistics TileGrid with what is written and good moments, opted into the tight two-up variant', () => {
    expect(readingsMarkup).toContain('<TileGrid');
    /* Phase 8 UX ticket 01: this said "days in a row" until the streak went.
       A run is the one figure on this screen that could go down, and
       somebody arriving here after a fortnight away would have been told
       their evidence was zero. */
    expect(readingsMarkup).toContain('key="written"');
    expect(readingsMarkup).toContain('key="evidence"');
    expect(readings).toContain('j.entries.countAll()');
    expect(readings, 'no run of consecutive days').not.toContain('j.stats.streak');
    // Alicja's review: these two tiles' notes are short enough that the
    // 390px floor's default single-column stack is overcautious for them.
    expect(readingsMarkup).toMatch(/<TileGrid[^>]*data-tight[^>]*>/);
  });

  it('preserves the counterevidence pool and snapshot save/delete actions', () => {
    expect(evidence).toContain('j.entries.counterevidencePool');
    expect(evidence).toContain('j.doubtJournal.getSnapshots');
    expect(evidence).toContain('journal.doubtJournal.saveSnapshot');
    expect(evidence).toContain('journal.doubtJournal.deleteSnapshot');
    expect(evidenceMarkup).toContain("confirmAttrs={{ 'data-confirm-delete-doubt-snapshot': '' }}");
  });

  it('reads section colors from activeFlag shell roles', () => {
    for (const source of [doubt, moments, comfort, evidence, readings]) {
      expect(source).toContain("from '$lib/theme/activeFlag.svelte'");
      expect(source).toContain("from '$lib/theme/roles'");
    }
  });

  it('renders visual charts for 30-day timeline and affirming themes', () => {
    expect(readings).toContain("from '$lib/components/kit/ChartCard.svelte'");
    expect(readings).toContain("from '$lib/components/kit/AreaChart.svelte'");
    expect(readings).toContain("from '$lib/components/kit/BarRows.svelte'");
    expect(readingsMarkup).toContain('kind="timeline"');
    expect(readingsMarkup).toContain('kind="affirming-themes"');
  });
});

describe('the letters, photos and voice sources (ticket 14, widened by ticket 21)', () => {
  /* Ticket 14 showed one letter here; phase 8 features ticket 21 widened
     that to every unlocked one, capped, with the rest a tap away. What is
     pinned is the seal rule staying in letterRetrospective.ts, the cap
     existing at all, and the letters keeping their own card rather than
     being folded into the flat counterevidence list. */
  it('lists the unlocked letters through safeSpaceLetters, capped, with an overflow row to the letters screen', () => {
    expect(moments).toContain("from '$lib/data/letterRetrospective'");
    expect(moments).toContain('safeSpaceLetters(');
    expect(moments).toContain("from '$lib/components/LookBackLetterCard.svelte'");
    expect(moments).toMatch(/LETTER_LIMIT\s*=\s*\d+/);
    expect(moments).toContain('unlockedLetters.length > LETTER_LIMIT');
    expect(momentsMarkup).toContain('<LookBackLetterCard');
    // Under the card, not a last row in it: a row there wore the letters'
    // own disc and chevron and read as a fourth letter.
    expect(momentsMarkup).toMatch(/<\/ListCard>[\s\S]*?<a[^>]*data-all-letters[^>]*href="\/transition\/letters"/);
    expect(momentsMarkup).toMatch(/m\.safe_space_letters_all\(\{\s*count:\s*unlockedLetters\.length - LETTER_LIMIT\s*\}\)/);
    // Its own card, not one more row inside the counterevidence list.
    expect(momentsMarkup).toMatch(/<ListCard[\s\S]*?<LookBackLetterCard/);
  });

  it('leads a Safe Space letter row with the letter, not with its date', () => {
    expect(momentsMarkup).toMatch(/<LookBackLetterCard[^>]*lead="text"/);

    // The other two surfaces keep the retrospective's own framing, where the
    // date is why the letter is there at all.
    expect(read('src/routes/on-this-day/+page.svelte')).not.toMatch(/<LookBackLetterCard[^>]*lead=/);
    expect(read('src/lib/components/WrappedYear.svelte')).not.toMatch(/<LookBackLetterCard[^>]*lead=/);

    const kit = read('src/lib/styles/kit.css');
    expect(kit).toContain("[data-list-row='letter-preview'][data-lead='text'] .kit-row-title");
    expect(kit).toContain("[data-list-row='letter-preview'][data-lead='date'] .kit-row-sub");
  });

  it('shows a letter as a preview that links to the whole thing, and cuts that preview in code as well as in CSS', () => {
    // The tap target is the letter's own screen, and the screen itself does
    // no cutting: the card asks letterOpening for it, so what a row
    // announces is what a row draws rather than the whole letter.
    const letterBlock = momentsMarkup.match(/{#each letters[\s\S]*?{\/each}/)?.[0] ?? '';
    expect(letterBlock).toContain('<LookBackLetterCard');

    const card = read('src/lib/components/LookBackLetterCard.svelte');
    expect(card).toContain('href={`/transition/letters/${letter.id}`}');
    expect(card).toContain('letterOpening(letter.text, LETTER_OPENING_LIMIT)');
    expect(card).not.toMatch(/title=\{letter\.text\}|subtitle=\{letter\.text\}/);
  });

  it('reads starred photos and caps how many it shows', () => {
    expect(moments).toContain('j.photos.starredPhotos');
    expect(moments).toContain("from '$lib/components/PhotoThumb.svelte'");
    expect(momentsMarkup).toContain('<PhotoThumb');
    expect(moments).toMatch(/PHOTO_LIMIT\s*=\s*\d+/);
  });

  it('runs no query against voice_benchmark - ticket 15/16 have not shipped that table to read', () => {
    // The comment explaining the deferral is allowed to name the table;
    // no call or query string may reach for it.
    expect(safeSpace).not.toMatch(/\bj\.voiceBenchmark\b/);
    expect(safeSpace).not.toMatch(/FROM\s+voice_benchmark/i);
    expect(safeSpace).not.toContain('voiceBenchmarkQuery');
  });

  it('adds no click handler to the letter or photo evidence - the screen stays read-only', () => {
    const letterBlock = momentsMarkup.match(/<LookBackLetterCard[\s\S]*?\/>/)?.[0] ?? '';
    const photoBlock = momentsMarkup.match(/<div class="photo-grid"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(letterBlock).not.toContain('onclick');
    expect(photoBlock).not.toContain('onclick');
  });
});

describe('the support directory panel', () => {
  it('renders as its own ListCard/ListRow panel, not a heading action link, pointing at the existing directory', () => {
    expect(doubt).toContain("from '$lib/components/kit/ListRow.svelte'");
    expect(markup).not.toContain('kit-heading-action');
    /* Its own row in the run of ways down now (ticket 47), rather than a
       panel of its own above the rest of a dashboard - and still the first
       of them, which is where it already sat and which ticket 63 is the
       ticket that gets to move. */
    expect(SAFE_SPACE_WAYS[0]).toMatchObject({ key: 'resources', href: '/practice/resources' });
    expect(doubt).toContain('title: m.resources_title');
    /* The row's own key, shortened rather than duplicated: this screen was
       always its only caller, and at its old length it ran to a third line
       at 390px against rule 6's 60px for a two-line row. */
    expect(doubt).toContain('sub: m.resources_row_sub');
  });
});

describe('More hub row for Safe Space', () => {
  it('points to /doubt, and its title is the one the screen uses', () => {
    /* The row list moved into `hubRows.ts` with phase 8 UX ticket 02, and the
       titles with it into `vocabulary/hubLabels.ts`, so this asks the module
       for the row and the label module for the key it draws the title from. */
    expect(HUB_ROWS.find((row) => row.key === 'doubt')).toMatchObject({ href: '/doubt', icon: 'heart' });
    expect(read('src/lib/data/vocabulary/hubLabels.ts')).toContain('doubt: m.safe_space_title');
  });
});

describe('Home live tile for Safe Space nudge (ticket 50)', () => {
  /* The tile left the route with the rest of the grid (phase 8 deepening
     ticket 07). What it says, where it goes and what its dismiss does are
     `liveTiles.grid.test.ts`'s now, through `composeHomeTiles`; what is
     still a grep is which module holds the read, and that Home does not
     hold it twice. */
  it('reads the bad-moment entry from the module that owns the grid', () => {
    expect(read('src/lib/data/liveTiles.svelte.ts')).toContain('j.entries.latestBadMomentEntry');
    expect(read('src/routes/+page.svelte')).not.toContain('latestBadMomentEntry');
    expect(read('src/lib/data/liveTiles.ts')).toContain('shouldShowSafeSpaceNudge');
  });

  it('keeps the nudge in the registry both settings views read', () => {
    const row = UNPROMPTED_ROWS.find((r) => r.key === 'safe-space-nudge');
    expect(row?.surface?.prefKey).toBe('safeSpaceNudgeEnabled');
    expect(LIVE_TILE_ORDER as readonly string[]).toContain('safe-space-nudge');
  });
});
